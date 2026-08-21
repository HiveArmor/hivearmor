//go:build windows

package etw

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/hivearmor/agent/agent"
	"github.com/hivearmor/agent/config"
	"github.com/hivearmor/agent/utils"
	"github.com/hivearmor/sdk/plugins"
)

// DataType constants emitted by this collector.
const (
	DataTypeProcess    = "process"
	DataTypeNetConn    = "netconn"
	DataTypeDNS        = "dns"
	DataTypePowerShell = "powershell"
	DataTypeDriverLoad = "driver-load"
	DataTypeUSB        = "usb"
	DataTypeScheduled  = "scheduled-task"
	DataTypeWMI        = "wmi"
)

// ETW provider GUIDs for the subscribed kernel and operational providers.
// These are stable Microsoft-published GUIDs — do not change them.
const (
	guidKernelProcess = "{22fb2cd6-0e7b-422b-a0c7-2fad1fd0e716}"
	guidKernelFile    = "{edd08927-9cc4-4e65-b970-c2560fb5c289}"
	guidKernelNetwork = "{7dd42a49-5329-4832-8dfd-43d979153a88}"
	guidDNSClient     = "{1c95126e-7eea-49a9-a3fe-a378b03ddb4d}"
	guidPowerShell    = "{a0c1853b-5c40-4b15-8766-3cf1c58f985a}"
	guidTaskScheduler = "{de7b24ea-73c8-4a09-985d-5bdadcfa9017}"
	guidWMIActivity   = "{1418ef04-b0b4-4623-bf7e-d74ab47bbdaa}"
	guidKernelPnP     = "{9c205a39-1250-487d-abd7-e831c6290539}"
)

// ETWEvent is the normalised event emitted to the LogQueue.
type ETWEvent struct {
	EventType string `json:"eventType"`
	DataType  string `json:"dataType"`
	Timestamp string `json:"@timestamp"`

	// Process fields
	PID         uint32 `json:"pid,omitempty"`
	PPID        uint32 `json:"ppid,omitempty"`
	ProcessName string `json:"processName,omitempty"`
	ImageFile   string `json:"imagePath,omitempty"`
	CommandLine string `json:"commandLine,omitempty"`
	ExitCode    int32  `json:"exitCode,omitempty"`

	// Network fields
	SrcIP   string `json:"srcIp,omitempty"`
	DstIP   string `json:"dstIp,omitempty"`
	SrcPort uint16 `json:"srcPort,omitempty"`
	DstPort uint16 `json:"dstPort,omitempty"`
	Proto   string `json:"proto,omitempty"`

	// DNS fields
	Query        string `json:"query,omitempty"`
	QueryType    string `json:"queryType,omitempty"`
	ResponseCode string `json:"responseCode,omitempty"`
	Answers      string `json:"answers,omitempty"`

	// PowerShell fields
	ScriptBlock string `json:"scriptBlock,omitempty"`
	ScriptPath  string `json:"scriptPath,omitempty"`

	// File fields
	FilePath string `json:"filePath,omitempty"`

	// USB fields
	DeviceVID      string `json:"deviceVid,omitempty"`
	DevicePID      string `json:"devicePid,omitempty"`
	DeviceDesc     string `json:"deviceDesc,omitempty"`
	DeviceInstance string `json:"deviceInstance,omitempty"`

	// Task scheduler
	TaskName string `json:"taskName,omitempty"`
	TaskPath string `json:"taskPath,omitempty"`

	// Envelope
	Hostname   string `json:"hostname"`
	DataSource string `json:"dataSource"`
	Severity   string `json:"severity"`
}

// Collector implements collector.Collector using Windows ETW tracing sessions.
type Collector struct {
	cnf    *config.Config
	cancel context.CancelFunc
	queue  chan<- *plugins.Log
}

// New creates an ETW Collector. Call Start to activate it.
func New(cnf *config.Config) *Collector {
	return &Collector{cnf: cnf}
}

// Name satisfies the collector.Collector interface.
func (c *Collector) Name() string { return "etw" }

// Start opens an ETW real-time session, subscribes all providers, and forwards
// normalised events to queue. It blocks until ctx is cancelled.
func (c *Collector) Start(ctx context.Context, queue chan<- *plugins.Log) {
	c.queue = queue
	childCtx, cancel := context.WithCancel(ctx)
	c.cancel = cancel
	defer cancel()

	if err := c.run(childCtx); err != nil {
		safeLogError("etw: collector exited: %v", err)
	}
}

// Stop cancels the collector.
func (c *Collector) Stop() {
	if c.cancel != nil {
		c.cancel()
	}
}

// run is the inner event loop. It creates an ETW session, subscribes all
// providers, and dispatches events until ctx is cancelled.
//
// Implementation note: when github.com/0xrawsec/golang-etw is added to go.mod,
// replace the stub session below with:
//
//	session, err := etw.NewRealTimeSession("HiveArmorETW")
//	if err != nil { return fmt.Errorf("etw: new session: %w", err) }
//	defer session.Stop()
//
//	for _, guid := range []string{guidKernelProcess, guidDNSClient, ...} {
//	    if err := session.EnableProvider(etw.MustParseProvider(guid)); err != nil {
//	        safeLogError("etw: enable provider %s: %v", guid, err)
//	    }
//	}
//
//	consumer := etw.NewRealTimeConsumer(ctx).FromSessions(session)
//	defer consumer.Stop()
//
//	for evt := range consumer.Events {
//	    c.dispatch(evt)
//	}
func (c *Collector) run(ctx context.Context) error {
	hostname, _ := os.Hostname()
	safeLogInfo("etw: collector starting (stub — add github.com/0xrawsec/golang-etw@v1.6.2 to enable)")

	// Stub: emit a single synthetic "collector started" process event so the
	// rest of the pipeline can be tested end-to-end.  Real events will flow
	// once the golang-etw dependency is wired in.
	startEvt := &ETWEvent{
		EventType:   "PROCESS_CREATE",
		DataType:    DataTypeProcess,
		Timestamp:   time.Now().UTC().Format(time.RFC3339Nano),
		ProcessName: "hivearmor_agent_service",
		ImageFile:   os.Args[0],
		CommandLine: strings.Join(os.Args, " "),
		Hostname:    hostname,
		DataSource:  c.dataSource(hostname),
		Severity:    "INFO",
	}
	c.emit(startEvt)

	// Block until ctx is cancelled.
	<-ctx.Done()
	safeLogInfo("etw: collector stopped")
	return nil
}

// dispatch normalises a raw ETW event record from golang-etw and emits it.
// This method is called from the event callback goroutine. It is exported so
// that the real implementation in a separate _windows.go file can call it once
// golang-etw is integrated.
func (c *Collector) Dispatch(providerGUID string, eventID uint16, properties map[string]interface{}) {
	hostname, _ := os.Hostname()

	evt := &ETWEvent{
		Timestamp:  time.Now().UTC().Format(time.RFC3339Nano),
		Hostname:   hostname,
		DataSource: c.dataSource(hostname),
	}

	switch providerGUID {
	case guidKernelProcess:
		c.normaliseProcessEvent(eventID, properties, evt)
	case guidKernelNetwork:
		c.normaliseNetworkEvent(eventID, properties, evt)
	case guidDNSClient:
		c.normaliseDNSEvent(eventID, properties, evt)
	case guidPowerShell:
		c.normalisePowerShellEvent(eventID, properties, evt)
	case guidTaskScheduler:
		c.normaliseTaskEvent(eventID, properties, evt)
	case guidWMIActivity:
		c.normaliseWMIEvent(eventID, properties, evt)
	case guidKernelPnP:
		c.normaliseUSBEvent(eventID, properties, evt)
	default:
		return // unhandled provider
	}

	if evt.DataType == "" {
		return
	}

	c.emit(evt)
}

func (c *Collector) normaliseProcessEvent(id uint16, p map[string]interface{}, evt *ETWEvent) {
	switch id {
	case 1: // ProcessStart
		evt.EventType = "PROCESS_CREATE"
		evt.DataType = DataTypeProcess
		evt.PID = uint32Val(p, "ProcessID")
		evt.PPID = uint32Val(p, "ParentProcessID")
		evt.ImageFile = stringVal(p, "ImageFileName")
		evt.CommandLine = stringVal(p, "CommandLine")
		evt.ProcessName = baseName(evt.ImageFile)
		evt.Severity = processStartSeverity(evt.ImageFile, evt.CommandLine)
	case 2: // ProcessStop
		evt.EventType = "PROCESS_EXIT"
		evt.DataType = DataTypeProcess
		evt.PID = uint32Val(p, "ProcessID")
		evt.ExitCode = int32Val(p, "ExitCode")
		evt.Severity = "INFO"
	}
}

func (c *Collector) normaliseNetworkEvent(id uint16, p map[string]interface{}, evt *ETWEvent) {
	switch id {
	case 10: // TcpIpConnect
		evt.EventType = "NETWORK_CONNECT"
		evt.DataType = DataTypeNetConn
		evt.Proto = "TCP"
		evt.SrcIP = stringVal(p, "saddr")
		evt.DstIP = stringVal(p, "daddr")
		evt.SrcPort = uint16Val(p, "sport")
		evt.DstPort = uint16Val(p, "dport")
		evt.PID = uint32Val(p, "PID")
		evt.Severity = "INFO"
	case 11: // UdpIpSend
		evt.EventType = "NETWORK_SEND"
		evt.DataType = DataTypeNetConn
		evt.Proto = "UDP"
		evt.SrcIP = stringVal(p, "saddr")
		evt.DstIP = stringVal(p, "daddr")
		evt.SrcPort = uint16Val(p, "sport")
		evt.DstPort = uint16Val(p, "dport")
		evt.PID = uint32Val(p, "PID")
		evt.Severity = "INFO"
	}
}

func (c *Collector) normaliseDNSEvent(id uint16, p map[string]interface{}, evt *ETWEvent) {
	if id != 3008 {
		return
	}
	evt.EventType = "DNS_QUERY"
	evt.DataType = DataTypeDNS
	evt.Query = stringVal(p, "QueryName")
	evt.QueryType = dnsTypeString(uint16Val(p, "QueryType"))
	evt.ResponseCode = dnsRCodeString(uint32Val(p, "QueryStatus"))
	evt.Answers = stringVal(p, "QueryResults")
	evt.PID = uint32Val(p, "QueryPID")
	evt.Severity = dnsSeverity(evt.Query)
}

func (c *Collector) normalisePowerShellEvent(id uint16, p map[string]interface{}, evt *ETWEvent) {
	if id != 4104 {
		return
	}
	evt.EventType = "POWERSHELL_SCRIPTBLOCK"
	evt.DataType = DataTypePowerShell
	evt.ScriptBlock = stringVal(p, "ScriptBlockText")
	evt.ScriptPath = stringVal(p, "Path")
	evt.PID = uint32Val(p, "ProcessId")
	evt.Severity = psSeverity(evt.ScriptBlock)
}

func (c *Collector) normaliseTaskEvent(id uint16, p map[string]interface{}, evt *ETWEvent) {
	switch id {
	case 106:
		evt.EventType = "TASK_REGISTERED"
	case 141:
		evt.EventType = "TASK_DELETED"
	default:
		return
	}
	evt.DataType = DataTypeScheduled
	evt.TaskName = stringVal(p, "TaskName")
	evt.TaskPath = stringVal(p, "TaskPath")
	evt.PID = uint32Val(p, "ProcessID")
	evt.Severity = "MEDIUM"
}

func (c *Collector) normaliseWMIEvent(id uint16, p map[string]interface{}, evt *ETWEvent) {
	if id < 5857 || id > 5861 {
		return
	}
	evt.EventType = fmt.Sprintf("WMI_ACTIVITY_%d", id)
	evt.DataType = DataTypeWMI
	evt.Severity = "MEDIUM"
}

func (c *Collector) normaliseUSBEvent(id uint16, p map[string]interface{}, evt *ETWEvent) {
	switch id {
	case 2003:
		evt.EventType = "USB_ARRIVE"
	case 2100:
		evt.EventType = "USB_REMOVE"
	default:
		return
	}
	evt.DataType = DataTypeUSB
	evt.DeviceInstance = stringVal(p, "DeviceInstanceID")
	evt.DeviceDesc = stringVal(p, "DeviceDescription")
	evt.Severity = "MEDIUM"
}

// emit serialises an ETWEvent and pushes it to the LogQueue.
func (c *Collector) emit(evt *ETWEvent) {
	raw, err := json.Marshal(evt)
	if err != nil {
		safeLogError("etw: marshal event: %v", err)
		return
	}
	log := &plugins.Log{
		DataType:   evt.DataType,
		DataSource: evt.DataSource,
		Timestamp:  evt.Timestamp,
		Raw:        string(raw),
	}
	agent.Offer(c.queue, "etw", log)
}

func (c *Collector) dataSource(hostname string) string {
	if c.cnf != nil {
		return fmt.Sprintf("%s (agent-%d)", hostname, c.cnf.AgentID)
	}
	return hostname
}

// ── helper value extractors ────────────────────────────────────────────

func stringVal(m map[string]interface{}, key string) string {
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
		return fmt.Sprintf("%v", v)
	}
	return ""
}

func uint32Val(m map[string]interface{}, key string) uint32 {
	if v, ok := m[key]; ok {
		switch n := v.(type) {
		case uint32:
			return n
		case uint64:
			return uint32(n)
		case int:
			if n >= 0 {
				return uint32(n)
			}
		case float64:
			return uint32(n)
		}
	}
	return 0
}

func int32Val(m map[string]interface{}, key string) int32 {
	if v, ok := m[key]; ok {
		switch n := v.(type) {
		case int32:
			return n
		case int:
			return int32(n)
		case float64:
			return int32(n)
		}
	}
	return 0
}

func uint16Val(m map[string]interface{}, key string) uint16 {
	return uint16(uint32Val(m, key))
}

func baseName(path string) string {
	path = strings.ReplaceAll(path, "\\", "/")
	parts := strings.Split(path, "/")
	if len(parts) == 0 {
		return path
	}
	return parts[len(parts)-1]
}

// ── severity helpers ──────────────────────────────────────────────────

// suspiciousCmdPatterns are partial command-line strings that indicate elevated
// risk when seen in process creation events.
var suspiciousCmdPatterns = []string{
	"powershell -enc", "powershell -e ",
	"powershell -nop", "-windowstyle hidden",
	"cmd /c ", "cmd.exe /c",
	"mshta", "regsvr32", "rundll32", "cmstp",
	"certutil -decode", "bitsadmin /transfer",
	"wscript", "cscript",
}

func processStartSeverity(imagePath, cmdline string) string {
	lower := strings.ToLower(imagePath + " " + cmdline)
	for _, p := range suspiciousCmdPatterns {
		if strings.Contains(lower, p) {
			return "HIGH"
		}
	}
	// Processes started from temp paths are suspicious.
	if strings.Contains(lower, `\temp\`) || strings.Contains(lower, `\tmp\`) ||
		strings.Contains(lower, `\appdata\local\temp`) {
		return "HIGH"
	}
	return "INFO"
}

func dnsSeverity(query string) string {
	// Very long queries suggest DNS tunneling.
	if len(query) > 60 {
		return "MEDIUM"
	}
	return "INFO"
}

// suspiciousPSPatterns are PowerShell patterns that commonly appear in malware.
var suspiciousPSPatterns = []string{
	"invoke-expression", "iex(", "iex(",
	"downloadstring", "downloadfile",
	"-encodedcommand", "frombase64string",
	"mimikatz", "sekurlsa", "invoke-mimikatz",
	"add-exfil", "bypass",
}

func psSeverity(scriptBlock string) string {
	lower := strings.ToLower(scriptBlock)
	for _, p := range suspiciousPSPatterns {
		if strings.Contains(lower, p) {
			return "HIGH"
		}
	}
	return "INFO"
}

// dnsTypeString maps a DNS QTYPE integer to its name.
func dnsTypeString(t uint16) string {
	switch t {
	case 1:
		return "A"
	case 2:
		return "NS"
	case 5:
		return "CNAME"
	case 6:
		return "SOA"
	case 12:
		return "PTR"
	case 15:
		return "MX"
	case 16:
		return "TXT"
	case 28:
		return "AAAA"
	case 255:
		return "ANY"
	default:
		return fmt.Sprintf("TYPE%d", t)
	}
}

// dnsRCodeString maps a DNS response code to its name.
func dnsRCodeString(rc uint32) string {
	switch rc {
	case 0:
		return "NOERROR"
	case 2:
		return "SERVFAIL"
	case 3:
		return "NXDOMAIN"
	case 5:
		return "REFUSED"
	default:
		return fmt.Sprintf("RCODE%d", rc)
	}
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
