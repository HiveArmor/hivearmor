//go:build darwin

package netconn

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"github.com/hivearmor/agent/agent"
	"github.com/hivearmor/agent/config"
	"github.com/hivearmor/agent/utils"
	"github.com/hivearmor/sdk/plugins"
)

const DataTypeNetConn = "netconn"

// ConnEvent is the normalised per-process connection event.
type ConnEvent struct {
	Timestamp   string `json:"@timestamp"`
	DataType    string `json:"dataType"`
	Action      string `json:"action"`
	Protocol    string `json:"protocol"`
	SrcIP       string `json:"origin.ip,omitempty"`
	SrcPort     uint16 `json:"origin.port,omitempty"`
	DstIP       string `json:"target.ip,omitempty"`
	DstPort     uint16 `json:"target.port,omitempty"`
	ProcessName string `json:"origin.process,omitempty"`
	PID         uint32 `json:"origin.pid,omitempty"`
	State       string `json:"log.tcp_state,omitempty"`
	Hostname    string `json:"hostname"`
	DataSource  string `json:"dataSource"`
	Severity    string `json:"severity"`
}

// Collector uses netstat (or lsof) to snapshot per-process connections on macOS.
// The ESF NETWORKFLOW events (from esf.Collector) provide real-time events once
// the Apple entitlement is granted.  This netstat poll serves as a fallback.
type Collector struct {
	cnf    *config.Config
	cancel context.CancelFunc
	queue  chan<- *plugins.Log
}

// New creates a macOS netconn Collector.
func New(cnf *config.Config) *Collector { return &Collector{cnf: cnf} }

func (c *Collector) Name() string { return "netconn-darwin" }

func (c *Collector) Start(ctx context.Context, queue chan<- *plugins.Log) {
	c.queue = queue
	childCtx, cancel := context.WithCancel(ctx)
	c.cancel = cancel
	defer cancel()

	hostname, _ := os.Hostname()
	utils.Logger.Info("netconn: macOS collector started (5s netstat poll)")

	prev := c.snapshot()
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-childCtx.Done():
			return
		case <-ticker.C:
			curr := c.snapshot()
			c.diff(prev, curr, hostname)
			prev = curr
		}
	}
}

func (c *Collector) Stop() {
	if c.cancel != nil {
		c.cancel()
	}
}

type connKey struct {
	proto   string
	srcIP   string
	srcPort uint16
	dstIP   string
	dstPort uint16
	pid     uint32
}

// snapshot runs `lsof -i -n -P -F pcn` to get per-process connections.
// lsof -F p=pid, c=command, n=network-address (host:port), p=pid
func (c *Collector) snapshot() map[connKey]ConnEvent {
	out := map[connKey]ConnEvent{}
	hostname, _ := os.Hostname()
	ds := c.dataSource(hostname)

	// Try lsof first; fall back to netstat -anv if not available.
	lsofPath, err := exec.LookPath("lsof")
	if err != nil {
		return out
	}

	cmd := exec.Command(lsofPath, "-i", "-n", "-P", "-F", "pcn")
	data, err := cmd.Output()
	if err != nil {
		return out
	}

	// lsof -F output: lines starting with 'p' = pid, 'c' = command, 'n' = address
	var (
		pid   uint32
		pname string
	)
	for _, line := range strings.Split(string(data), "\n") {
		if len(line) < 2 {
			continue
		}
		switch line[0] {
		case 'p':
			n, _ := strconv.ParseUint(line[1:], 10, 32)
			pid = uint32(n)
		case 'c':
			pname = line[1:]
		case 'n':
			// n field looks like: "10.0.0.1:12345->8.8.8.8:53" or "*:80"
			addr := line[1:]
			if !strings.Contains(addr, "->") {
				continue
			}
			parts := strings.SplitN(addr, "->", 2)
			if len(parts) != 2 {
				continue
			}
			srcIP, srcPort := parseHostPort(parts[0])
			dstIP, dstPort := parseHostPort(parts[1])
			if dstPort == 0 {
				continue
			}

			key := connKey{
				proto:   "TCP",
				srcIP:   srcIP,
				srcPort: srcPort,
				dstIP:   dstIP,
				dstPort: dstPort,
				pid:     pid,
			}
			out[key] = ConnEvent{
				Timestamp:   time.Now().UTC().Format(time.RFC3339Nano),
				DataType:    DataTypeNetConn,
				Action:      "connect",
				Protocol:    "TCP",
				SrcIP:       srcIP,
				SrcPort:     srcPort,
				DstIP:       dstIP,
				DstPort:     dstPort,
				ProcessName: pname,
				PID:         pid,
				Hostname:    hostname,
				DataSource:  ds,
				Severity:    connSeverity(dstPort),
			}
		}
	}
	return out
}

func (c *Collector) diff(prev, curr map[connKey]ConnEvent, hostname string) {
	for key, evt := range curr {
		if _, existed := prev[key]; !existed {
			c.emitConnEvent(evt)
		}
	}
	for key, evt := range prev {
		if _, exists := curr[key]; !exists {
			evt.Action = "close"
			c.emitConnEvent(evt)
		}
	}
}

func (c *Collector) emitConnEvent(evt ConnEvent) {
	raw, _ := json.Marshal(evt)
	log := &plugins.Log{
		DataType:   DataTypeNetConn,
		DataSource: evt.DataSource,
		Timestamp:  evt.Timestamp,
		Raw:        string(raw),
	}
	agent.Offer(c.queue, "netconn", log)
}

func (c *Collector) dataSource(hostname string) string {
	if c.cnf != nil {
		return fmt.Sprintf("%s (agent-%d)", hostname, c.cnf.AgentID)
	}
	return hostname
}

func parseHostPort(s string) (string, uint16) {
	// Handle IPv6 "[::1]:80"
	if strings.HasPrefix(s, "[") {
		end := strings.LastIndex(s, "]:")
		if end < 0 {
			return s, 0
		}
		ip := s[1:end]
		var port uint16
		fmt.Sscanf(s[end+2:], "%d", &port)
		return ip, port
	}
	// IPv4 "1.2.3.4:80"
	idx := strings.LastIndex(s, ":")
	if idx < 0 {
		return s, 0
	}
	ip := s[:idx]
	var port uint16
	fmt.Sscanf(s[idx+1:], "%d", &port)
	// Validate IP
	if net.ParseIP(ip) == nil {
		return ip, port
	}
	return ip, port
}

func connSeverity(dstPort uint16) string {
	switch dstPort {
	case 80, 443, 22, 25, 53, 110, 143, 993, 995, 587, 3389, 8080, 8443:
		return "INFO"
	}
	return "MEDIUM"
}
