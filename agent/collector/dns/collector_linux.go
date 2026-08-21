//go:build linux

package dns

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net"
	"os"
	"os/exec"
	"strings"
	"time"
	"unicode"

	"github.com/hivearmor/agent/agent"
	"github.com/hivearmor/agent/config"
	"github.com/hivearmor/agent/utils"
	"github.com/hivearmor/sdk/plugins"
)

const DataTypeDNS = "dns"

// DNSEvent is the normalised DNS query event.
type DNSEvent struct {
	Timestamp    string   `json:"@timestamp"`
	DataType     string   `json:"dataType"`
	Query        string   `json:"log.query"`
	QueryType    string   `json:"log.query_type"`
	ResponseCode string   `json:"log.response_code"`
	Answers      []string `json:"log.answers,omitempty"`
	TTL          uint32   `json:"log.ttl,omitempty"`
	QueryLength  int      `json:"log.query_length"`
	Entropy      float64  `json:"log.subdomain_entropy"`
	SrcIP        string   `json:"origin.ip,omitempty"`
	Process      string   `json:"origin.process,omitempty"`
	PID          uint32   `json:"origin.pid,omitempty"`
	Hostname     string   `json:"hostname"`
	DataSource   string   `json:"dataSource"`
	Severity     string   `json:"severity"`
}

// Collector collects DNS telemetry on Linux.
//
// Collection strategy (in priority order):
//  1. eBPF socket tracepoints — provided by the ebpf.Collector when cilium/ebpf
//     is linked.  DNS events from that path already have per-process attribution.
//  2. /proc/net/udp passive monitoring — scans open UDP sockets on port 53 every
//     500ms to detect DNS activity.  No process attribution (PID only via inode).
//  3. tcpdump subprocess (fallback) — only when both of the above are unavailable.
//
// This file implements strategy 2 as the baseline; strategy 1 is handled by the
// ebpf.Collector which emits dataType=dns events for connect() syscalls on port 53.
type Collector struct {
	cnf    *config.Config
	cancel context.CancelFunc
	queue  chan<- *plugins.Log
}

// New creates a DNS Collector.
func New(cnf *config.Config) *Collector {
	return &Collector{cnf: cnf}
}

// Name satisfies the collector.Collector interface.
func (c *Collector) Name() string { return "dns-linux" }

// Start begins DNS telemetry collection and blocks until ctx is cancelled.
func (c *Collector) Start(ctx context.Context, queue chan<- *plugins.Log) {
	c.queue = queue
	childCtx, cancel := context.WithCancel(ctx)
	c.cancel = cancel
	defer cancel()

	hostname, _ := os.Hostname()
	safeLogInfo("dns: Linux collector started")

	// Try to install a passive DNS listener via tcpdump; fall back to /proc/net.
	if err := c.runTcpdumpCapture(childCtx, hostname); err != nil {
		safeLogWarn("dns: tcpdump not available (%v); falling back to /proc/net/udp poll", err)
		c.runProcNetPoll(childCtx, hostname)
	}
}

// Stop cancels the collector.
func (c *Collector) Stop() {
	if c.cancel != nil {
		c.cancel()
	}
}

// runTcpdumpCapture captures DNS traffic via tcpdump -l -n port 53 and parses
// the output.  This works without libpcap being installed as a Go library.
func (c *Collector) runTcpdumpCapture(ctx context.Context, hostname string) error {
	tcpdump, err := exec.LookPath("tcpdump")
	if err != nil {
		return fmt.Errorf("tcpdump not in PATH: %w", err)
	}

	cmd := exec.CommandContext(ctx, tcpdump, "-l", "-n", "-q", "port", "53")
	out, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("tcpdump stdout: %w", err)
	}
	cmd.Stderr = nil

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("tcpdump start: %w", err)
	}
	defer func() { _ = cmd.Wait() }()

	safeLogInfo("dns: tcpdump capture started on port 53")

	scanner := bufio.NewScanner(out)
	for scanner.Scan() {
		line := scanner.Text()
		evt := parseTcpdumpLine(line, hostname, c.dataSource(hostname))
		if evt == nil {
			continue
		}
		c.emitEvent(evt)
	}
	return nil
}

// parseTcpdumpLine parses a single tcpdump -n -q output line for DNS.
// Example: 12:34:56.789012 IP 10.0.0.1.54321 > 8.8.8.8.53: UDP, length 40
// DNS response: 12:34:56.789 IP 8.8.8.8.53 > 10.0.0.1.54321: UDP, length 80
func parseTcpdumpLine(line, hostname, dataSource string) *DNSEvent {
	// Quick filter: must contain port 53
	if !strings.Contains(line, ".53 ") && !strings.Contains(line, ".53:") {
		return nil
	}
	// Only capture queries (src port != 53)
	if strings.Contains(line, " 53 >") {
		return nil // this is a response, skip
	}

	parts := strings.Fields(line)
	if len(parts) < 5 {
		return nil
	}

	var srcIP string
	if len(parts) > 2 {
		// IP field is parts[2]: "10.0.0.1.54321"
		addr := parts[2]
		if idx := strings.LastIndex(addr, "."); idx >= 0 {
			srcIP = addr[:idx]
		}
	}

	return &DNSEvent{
		Timestamp:   time.Now().UTC().Format(time.RFC3339Nano),
		DataType:    DataTypeDNS,
		Query:       "(DNS traffic detected — tcpdump passthrough; eBPF path provides full query names)",
		QueryType:   "UNKNOWN",
		QueryLength: 0,
		Entropy:     0,
		SrcIP:       srcIP,
		Hostname:    hostname,
		DataSource:  dataSource,
		Severity:    "INFO",
	}
}

// runProcNetPoll monitors /proc/net/udp for DNS socket activity.
// It only detects the presence of DNS queries (UDP to port 53), not their content.
func (c *Collector) runProcNetPoll(ctx context.Context, hostname string) {
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	seen := map[string]time.Time{}

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			c.scanProcNetUDP(seen, hostname)
		}
	}
}

const dnsHexPort = "0035" // port 53 in hex

// scanProcNetUDP reads /proc/net/udp and emits DNS events for entries targeting port 53.
func (c *Collector) scanProcNetUDP(seen map[string]time.Time, hostname string) {
	f, err := os.Open("/proc/net/udp")
	if err != nil {
		return
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		fields := strings.Fields(line)
		// /proc/net/udp columns: sl local_address rem_address st tx_queue rx_queue tr tm->when retrnsmt uid timeout inode
		if len(fields) < 12 {
			continue
		}
		// rem_address is "REMIP:REMPORT" in hex, e.g. "08080808:0035" for 8.8.8.8:53
		remAddr := fields[2]
		parts := strings.SplitN(remAddr, ":", 2)
		if len(parts) != 2 || parts[1] != dnsHexPort {
			continue
		}

		key := fields[1] + "->" + remAddr
		if last, ok := seen[key]; ok && time.Since(last) < 5*time.Second {
			continue // deduplicate within 5s window
		}
		seen[key] = time.Now()

		srcIP := hexToIP(fields[1])
		dstIP := hexToIP(remAddr)

		evt := &DNSEvent{
			Timestamp:   time.Now().UTC().Format(time.RFC3339Nano),
			DataType:    DataTypeDNS,
			Query:       "(DNS socket detected via /proc/net/udp — eBPF path provides full query content)",
			QueryType:   "UNKNOWN",
			QueryLength: 0,
			Entropy:     0,
			SrcIP:       srcIP + " → " + dstIP,
			Hostname:    hostname,
			DataSource:  c.dataSource(hostname),
			Severity:    "INFO",
		}
		c.emitEvent(evt)
	}

	// Evict stale seen entries older than 60s.
	for k, t := range seen {
		if time.Since(t) > 60*time.Second {
			delete(seen, k)
		}
	}
}

func (c *Collector) emitEvent(evt *DNSEvent) {
	raw, err := json.Marshal(evt)
	if err != nil {
		return
	}
	log := &plugins.Log{
		DataType:   DataTypeDNS,
		DataSource: evt.DataSource,
		Timestamp:  evt.Timestamp,
		Raw:        string(raw),
	}
	agent.Offer(c.queue, "dns", log)
}

func (c *Collector) dataSource(hostname string) string {
	if c.cnf != nil {
		return fmt.Sprintf("%s (agent-%d)", hostname, c.cnf.AgentID)
	}
	return hostname
}

// hexToIP converts a /proc/net hex address (e.g. "0101A8C0:0035") to
// a human-readable "IP:port" string.  The hex IP bytes are little-endian.
func hexToIP(hexAddr string) string {
	parts := strings.SplitN(hexAddr, ":", 2)
	if len(parts) != 2 || len(parts[0]) != 8 {
		return hexAddr
	}
	// Parse little-endian hex IP
	var b [4]byte
	for i := 0; i < 4; i++ {
		hi := parts[0][i*2]
		lo := parts[0][i*2+1]
		b[3-i] = hexByte(hi, lo)
	}
	ip := net.IPv4(b[0], b[1], b[2], b[3]).String()
	return ip
}

func hexByte(hi, lo byte) byte {
	return hexNibble(hi)<<4 | hexNibble(lo)
}

func hexNibble(c byte) byte {
	switch {
	case c >= '0' && c <= '9':
		return c - '0'
	case c >= 'a' && c <= 'f':
		return c - 'a' + 10
	case c >= 'A' && c <= 'F':
		return c - 'A' + 10
	}
	return 0
}

// ShannonEntropy computes the Shannon entropy of a string.
// High entropy (> 3.5) in a subdomain is a DGA / DNS tunneling indicator.
func ShannonEntropy(s string) float64 {
	if len(s) == 0 {
		return 0
	}
	freq := map[rune]int{}
	total := 0
	for _, r := range s {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '-' {
			freq[r]++
			total++
		}
	}
	if total == 0 {
		return 0
	}
	var entropy float64
	for _, count := range freq {
		p := float64(count) / float64(total)
		entropy -= p * math.Log2(p)
	}
	return entropy
}

// safeLog wraps utils.Logger calls with a nil check so unit tests don't panic.
func safeLogInfo(format string, args ...interface{}) {
	if utils.Logger != nil {
		utils.Logger.Info(format, args...)
	}
}
func safeLogError(format string, args ...interface{}) {
	if utils.Logger != nil {
		utils.Logger.ErrorF(format, args...)
	}
}
func safeLogWarn(format string, args ...interface{}) {
	if utils.Logger != nil {
		utils.Logger.LogF(400, format, args...)
	}
}
