//go:build windows

package netconn

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"strings"
	"time"
	"unsafe"

	"github.com/hivearmor/agent/agent"
	"github.com/hivearmor/agent/config"
	"github.com/hivearmor/agent/utils"
	"github.com/hivearmor/sdk/plugins"
	"golang.org/x/sys/windows"
)

const DataTypeNetConn = "netconn"

// ConnEvent mirrors the Linux version — same JSON schema for both platforms.
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

// Collector reads the Windows TCP/UDP extended connection tables.
type Collector struct {
	cnf    *config.Config
	cancel context.CancelFunc
	queue  chan<- *plugins.Log
}

// New creates a Windows netconn Collector.
func New(cnf *config.Config) *Collector { return &Collector{cnf: cnf} }

func (c *Collector) Name() string { return "netconn-windows" }

func (c *Collector) Start(ctx context.Context, queue chan<- *plugins.Log) {
	c.queue = queue
	childCtx, cancel := context.WithCancel(ctx)
	c.cancel = cancel
	defer cancel()

	hostname, _ := os.Hostname()
	utils.Logger.Info("netconn: Windows collector started (3s GetExtendedTcpTable poll)")

	prev := c.snapshot()
	ticker := time.NewTicker(3 * time.Second)
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

// MIB_TCPROW_OWNER_PID is the Windows IP helper struct for a TCP connection row
// with process ID attribution.  Defined in iphlpapi.h.
type MIB_TCPROW_OWNER_PID struct {
	DwState      uint32
	DwLocalAddr  uint32
	DwLocalPort  uint32
	DwRemoteAddr uint32
	DwRemotePort uint32
	DwOwningPid  uint32
}

type connKey struct {
	proto   string
	srcIP   string
	srcPort uint16
	dstIP   string
	dstPort uint16
	pid     uint32
}

func (c *Collector) snapshot() map[connKey]ConnEvent {
	out := map[connKey]ConnEvent{}
	hostname, _ := os.Hostname()
	ds := c.dataSource(hostname)

	rows, err := getExtendedTcpTable()
	if err != nil {
		utils.Logger.ErrorF("netconn: GetExtendedTcpTable: %v", err)
		return out
	}

	for _, row := range rows {
		srcIP := uint32ToIPv4(row.DwLocalAddr)
		dstIP := uint32ToIPv4(row.DwRemoteAddr)
		srcPort := ntohs(uint16(row.DwLocalPort))
		dstPort := ntohs(uint16(row.DwRemotePort))

		key := connKey{
			proto:   "TCP",
			srcIP:   srcIP,
			srcPort: srcPort,
			dstIP:   dstIP,
			dstPort: dstPort,
			pid:     row.DwOwningPid,
		}
		pname := processNameByPID(row.DwOwningPid)
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
			PID:         row.DwOwningPid,
			State:       mibTCPStateString(row.DwState),
			Hostname:    hostname,
			DataSource:  ds,
			Severity:    connSeverity(dstPort),
		}
	}
	return out
}

func (c *Collector) diff(prev, curr map[connKey]ConnEvent, hostname string) {
	for key, evt := range curr {
		if _, existed := prev[key]; !existed {
			evt.Action = "connect"
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
	if evt.DstPort == 0 || evt.DstIP == "0.0.0.0" || evt.DstIP == "127.0.0.1" {
		return
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

// getExtendedTcpTable calls GetExtendedTcpTable via syscall.
func getExtendedTcpTable() ([]MIB_TCPROW_OWNER_PID, error) {
	iphlpapi := windows.NewLazySystemDLL("iphlpapi.dll")
	proc := iphlpapi.NewProc("GetExtendedTcpTable")

	// First call: determine required buffer size.
	var size uint32
	ret, _, _ := proc.Call(0, uintptr(unsafe.Pointer(&size)), 1,
		2 /*AF_INET*/, 5 /*TCP_TABLE_OWNER_PID_ALL*/, 0)
	if ret != 0 && ret != 122 /* ERROR_INSUFFICIENT_BUFFER */ {
		return nil, fmt.Errorf("GetExtendedTcpTable size probe: %d", ret)
	}

	buf := make([]byte, size)
	ret, _, _ = proc.Call(uintptr(unsafe.Pointer(&buf[0])),
		uintptr(unsafe.Pointer(&size)), 1,
		2, 5, 0)
	if ret != 0 {
		return nil, fmt.Errorf("GetExtendedTcpTable: %d", ret)
	}

	if len(buf) < 4 {
		return nil, nil
	}
	numEntries := *(*uint32)(unsafe.Pointer(&buf[0]))
	const rowSize = int(unsafe.Sizeof(MIB_TCPROW_OWNER_PID{}))
	rows := make([]MIB_TCPROW_OWNER_PID, 0, numEntries)
	for i := uint32(0); i < numEntries; i++ {
		off := 4 + int(i)*rowSize
		if off+rowSize > len(buf) {
			break
		}
		row := *(*MIB_TCPROW_OWNER_PID)(unsafe.Pointer(&buf[off]))
		rows = append(rows, row)
	}
	return rows, nil
}

func uint32ToIPv4(n uint32) string {
	return net.IPv4(byte(n), byte(n>>8), byte(n>>16), byte(n>>24)).String()
}

func ntohs(n uint16) uint16 {
	return (n>>8 | n<<8)
}

func processNameByPID(pid uint32) string {
	handle, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
	if err != nil {
		return ""
	}
	defer windows.CloseHandle(handle)
	buf := make([]uint16, 260)
	size := uint32(len(buf))
	if err := windows.QueryFullProcessImageName(handle, 0, &buf[0], &size); err != nil {
		return ""
	}
	full := windows.UTF16ToString(buf[:size])
	parts := strings.Split(strings.ReplaceAll(full, "\\", "/"), "/")
	if len(parts) > 0 {
		return parts[len(parts)-1]
	}
	return full
}

func mibTCPStateString(state uint32) string {
	switch state {
	case 1:
		return "CLOSED"
	case 2:
		return "LISTEN"
	case 3:
		return "SYN_SENT"
	case 4:
		return "SYN_RCVD"
	case 5:
		return "ESTABLISHED"
	case 6:
		return "FIN_WAIT1"
	case 7:
		return "FIN_WAIT2"
	case 8:
		return "CLOSE_WAIT"
	case 9:
		return "CLOSING"
	case 10:
		return "LAST_ACK"
	case 11:
		return "TIME_WAIT"
	case 12:
		return "DELETE_TCB"
	default:
		return fmt.Sprintf("STATE_%d", state)
	}
}

func connSeverity(dstPort uint16) string {
	switch dstPort {
	case 80, 443, 22, 25, 53, 110, 143, 993, 995, 587, 3389, 8080, 8443:
		return "INFO"
	}
	return "MEDIUM"
}
