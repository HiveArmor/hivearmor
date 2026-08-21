//go:build linux

package netconn

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/hivearmor/agent/agent"
	"github.com/hivearmor/agent/config"
	"github.com/hivearmor/agent/utils"
	"github.com/hivearmor/sdk/plugins"
)

const DataTypeNetConn = "netconn"

// ConnEvent is the normalised per-process network connection event.
type ConnEvent struct {
	Timestamp   string `json:"@timestamp"`
	DataType    string `json:"dataType"`
	Action      string `json:"action"` // connect | accept | bind | close | listen
	Protocol    string `json:"protocol"`
	SrcIP       string `json:"origin.ip,omitempty"`
	SrcPort     uint16 `json:"origin.port,omitempty"`
	DstIP       string `json:"target.ip,omitempty"`
	DstPort     uint16 `json:"target.port,omitempty"`
	ProcessName string `json:"origin.process,omitempty"`
	PID         uint32 `json:"origin.pid,omitempty"`
	State       string `json:"log.tcp_state,omitempty"`
	Inode       uint64 `json:"log.inode,omitempty"`
	Hostname    string `json:"hostname"`
	DataSource  string `json:"dataSource"`
	Severity    string `json:"severity"`
}

// Collector reads /proc/net/tcp, /proc/net/tcp6, and /proc/net/udp to build
// a per-process network connection table and emits delta events.
//
// Future improvement: replace the /proc poll with eBPF connect/accept/bind
// tracepoints from the ebpf.Collector, which provides real-time events with
// zero poll overhead.
type Collector struct {
	cnf    *config.Config
	cancel context.CancelFunc
	queue  chan<- *plugins.Log
}

// New creates a netconn Collector.
func New(cnf *config.Config) *Collector {
	return &Collector{cnf: cnf}
}

// Name satisfies the collector.Collector interface.
func (c *Collector) Name() string { return "netconn" }

// Start begins polling /proc/net every 2 seconds and blocks until ctx is cancelled.
func (c *Collector) Start(ctx context.Context, queue chan<- *plugins.Log) {
	c.queue = queue
	childCtx, cancel := context.WithCancel(ctx)
	c.cancel = cancel
	defer cancel()

	hostname, _ := os.Hostname()
	safeLogInfo("netconn: Linux collector started (2s /proc/net poll)")

	// Build initial snapshot without emitting (avoid burst on startup).
	prev := c.snapshot()

	ticker := time.NewTicker(2 * time.Second)
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

// Stop cancels the collector.
func (c *Collector) Stop() {
	if c.cancel != nil {
		c.cancel()
	}
}

// inodeConnKey uniquely identifies a connection by local and remote endpoint + protocol.
type inodeConnKey struct {
	proto   string
	srcIP   string
	srcPort uint16
	dstIP   string
	dstPort uint16
}

type connRecord struct {
	inodeConnKey
	state string
	inode uint64
	pid   uint32
	pname string
}

// snapshot reads the current connection table from /proc/net.
func (c *Collector) snapshot() map[inodeConnKey]connRecord {
	result := map[inodeConnKey]connRecord{}

	// Build inode → pid/pname map from /proc/*/fd
	inodeToPID := c.buildInodePIDMap()

	for _, file := range []struct {
		path  string
		proto string
		isV6  bool
	}{
		{"/proc/net/tcp", "TCP", false},
		{"/proc/net/tcp6", "TCP", true},
		{"/proc/net/udp", "UDP", false},
		{"/proc/net/udp6", "UDP", true},
	} {
		c.parseNetFile(file.path, file.proto, file.isV6, inodeToPID, result)
	}

	return result
}

// buildInodePIDMap returns a map from socket inode number to (pid, processName).
func (c *Collector) buildInodePIDMap() map[uint64][2]string {
	m := map[uint64][2]string{}
	procEntries, err := os.ReadDir("/proc")
	if err != nil {
		return m
	}
	for _, e := range procEntries {
		if !e.IsDir() {
			continue
		}
		pid := e.Name()
		if !isNumericStr(pid) {
			continue
		}
		fdDir := filepath.Join("/proc", pid, "fd")
		fds, err := os.ReadDir(fdDir)
		if err != nil {
			continue
		}
		for _, fd := range fds {
			target, err := os.Readlink(filepath.Join(fdDir, fd.Name()))
			if err != nil {
				continue
			}
			// Socket links look like "socket:[12345678]"
			var inode uint64
			if _, err := fmt.Sscanf(target, "socket:[%d]", &inode); err != nil {
				continue
			}
			commBytes, _ := os.ReadFile(filepath.Join("/proc", pid, "comm"))
			pname := strings.TrimSpace(string(commBytes))
			m[inode] = [2]string{pid, pname}
		}
	}
	return m
}

// parseNetFile parses a single /proc/net/{tcp,udp}{,6} file.
func (c *Collector) parseNetFile(path, proto string, isV6 bool,
	inodeToPID map[uint64][2]string, out map[inodeConnKey]connRecord) {

	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	first := true
	for scanner.Scan() {
		if first {
			first = false
			continue // header line
		}
		fields := strings.Fields(scanner.Text())
		// Columns: sl local_address rem_address st tx_queue:rx_queue tr:tm->when retrnsmt uid timeout inode ...
		if len(fields) < 12 {
			continue
		}

		localHex := fields[1]
		remHex := fields[2]
		stateHex := fields[3]
		var inode uint64
		fmt.Sscanf(fields[9], "%d", &inode)

		localIP, localPort := parseHexAddr(localHex, isV6)
		remIP, remPort := parseHexAddr(remHex, isV6)

		state := tcpStateString(stateHex)

		key := inodeConnKey{
			proto:   proto,
			srcIP:   localIP,
			srcPort: localPort,
			dstIP:   remIP,
			dstPort: remPort,
		}

		rec := connRecord{
			inodeConnKey: key,
			state:        state,
			inode:        inode,
		}

		if pidInfo, ok := inodeToPID[inode]; ok {
			fmt.Sscanf(pidInfo[0], "%d", &rec.pid)
			rec.pname = pidInfo[1]
		}

		out[key] = rec
	}
}

// diff emits ConnEvents for new and closed connections.
func (c *Collector) diff(prev, curr map[inodeConnKey]connRecord, hostname string) {
	// New connections
	for key, rec := range curr {
		if _, existed := prev[key]; !existed {
			c.emitConnEvent("connect", rec, hostname)
		}
	}
	// Closed connections
	for key, rec := range prev {
		if _, exists := curr[key]; !exists {
			c.emitConnEvent("close", rec, hostname)
		}
	}
}

func (c *Collector) emitConnEvent(action string, rec connRecord, hostname string) {
	// Skip loopback-only connections to reduce noise.
	if rec.dstIP == "127.0.0.1" || rec.dstIP == "::1" || rec.dstPort == 0 {
		return
	}

	severity := "INFO"
	// Flag connections to non-standard ports as MEDIUM.
	if rec.dstPort > 0 && !isCommonPort(rec.dstPort) {
		severity = "MEDIUM"
	}

	evt := &ConnEvent{
		Timestamp:   time.Now().UTC().Format(time.RFC3339Nano),
		DataType:    DataTypeNetConn,
		Action:      action,
		Protocol:    rec.proto,
		SrcIP:       rec.srcIP,
		SrcPort:     rec.srcPort,
		DstIP:       rec.dstIP,
		DstPort:     rec.dstPort,
		ProcessName: rec.pname,
		PID:         rec.pid,
		State:       rec.state,
		Inode:       rec.inode,
		Hostname:    hostname,
		DataSource:  c.dataSource(hostname),
		Severity:    severity,
	}

	raw, err := json.Marshal(evt)
	if err != nil {
		return
	}
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

// parseHexAddr parses a /proc/net hex address like "0101A8C0:0050".
// For IPv6, the address is 32 hex chars.
func parseHexAddr(hexAddr string, isV6 bool) (string, uint16) {
	parts := strings.SplitN(hexAddr, ":", 2)
	if len(parts) != 2 {
		return "", 0
	}
	var port uint16
	fmt.Sscanf(parts[1], "%x", &port)

	if isV6 {
		// IPv6: 32 hex chars, big-endian groups
		if len(parts[0]) != 32 {
			return parts[0], port
		}
		b := make([]byte, 16)
		for i := 0; i < 16; i++ {
			hi := parts[0][i*2]
			lo := parts[0][i*2+1]
			b[i] = hexByteC(hi, lo)
		}
		return net.IP(b).String(), port
	}

	// IPv4: 8 hex chars, little-endian
	if len(parts[0]) != 8 {
		return parts[0], port
	}
	var b [4]byte
	for i := 0; i < 4; i++ {
		hi := parts[0][i*2]
		lo := parts[0][i*2+1]
		b[3-i] = hexByteC(hi, lo)
	}
	return net.IPv4(b[0], b[1], b[2], b[3]).String(), port
}

func hexByteC(hi, lo byte) byte {
	return hexNibbleC(hi)<<4 | hexNibbleC(lo)
}

func hexNibbleC(c byte) byte {
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

func tcpStateString(hex string) string {
	switch strings.ToUpper(hex) {
	case "01":
		return "ESTABLISHED"
	case "02":
		return "SYN_SENT"
	case "03":
		return "SYN_RECV"
	case "04":
		return "FIN_WAIT1"
	case "05":
		return "FIN_WAIT2"
	case "06":
		return "TIME_WAIT"
	case "07":
		return "CLOSE"
	case "08":
		return "CLOSE_WAIT"
	case "09":
		return "LAST_ACK"
	case "0A":
		return "LISTEN"
	case "0B":
		return "CLOSING"
	default:
		return "UNKNOWN"
	}
}

// isCommonPort returns true for well-known ports that don't warrant alerting.
func isCommonPort(port uint16) bool {
	switch port {
	case 80, 443, 22, 25, 53, 110, 143, 993, 995, 587, 465, 3389, 8080, 8443:
		return true
	}
	return false
}

func isNumericStr(s string) bool {
	for _, c := range s {
		if c < '0' || c > '9' {
			return false
		}
	}
	return len(s) > 0
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
