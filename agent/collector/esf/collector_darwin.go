//go:build darwin

package esf

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

// ESF event type strings — mirror the Apple EndpointSecurity ES_EVENT_TYPE_* constants.
const (
	EventTypeExec        = "ES_EXEC"
	EventTypeFork        = "ES_FORK"
	EventTypeExit        = "ES_EXIT"
	EventTypeOpen        = "ES_OPEN"
	EventTypeCreate      = "ES_CREATE"
	EventTypeRename      = "ES_RENAME"
	EventTypeUnlink      = "ES_UNLINK"
	EventTypeWrite       = "ES_WRITE"
	EventTypeMmap        = "ES_MMAP"
	EventTypeMount       = "ES_MOUNT"
	EventTypeKextLoad    = "ES_KEXTLOAD"
	EventTypeNetworkFlow = "ES_NETWORKFLOW"
	EventTypeLoginLogin  = "ES_LOGIN_LOGIN"
	EventTypeLoginLogout = "ES_LOGIN_LOGOUT"
)

// DataType constants emitted by this collector.
const (
	DataTypeProcess    = "process"
	DataTypeNetConn    = "netconn"
	DataTypeDriverLoad = "driver-load"
)

// ESFEvent is the normalised event emitted to the LogQueue.
type ESFEvent struct {
	EventType string `json:"eventType"`
	DataType  string `json:"dataType"`
	Timestamp string `json:"@timestamp"`

	// Process context
	PID         uint32 `json:"pid,omitempty"`
	PPID        uint32 `json:"ppid,omitempty"`
	UID         uint32 `json:"uid,omitempty"`
	ProcessName string `json:"processName,omitempty"`
	ExePath     string `json:"exePath,omitempty"`
	Args        string `json:"args,omitempty"`
	IsES        bool   `json:"isEndpointSecurity,omitempty"`

	// File context
	FilePath string `json:"filePath,omitempty"`
	NewPath  string `json:"newPath,omitempty"`

	// Network context
	SrcIP   string `json:"srcIp,omitempty"`
	DstIP   string `json:"dstIp,omitempty"`
	SrcPort uint16 `json:"srcPort,omitempty"`
	DstPort uint16 `json:"dstPort,omitempty"`
	Proto   string `json:"proto,omitempty"`

	// Auth context
	Username string `json:"username,omitempty"`

	// Envelope
	Hostname   string `json:"hostname"`
	DataSource string `json:"dataSource"`
	Severity   string `json:"severity"`
}

// Collector implements collector.Collector using the macOS EndpointSecurity
// Framework.
type Collector struct {
	cnf    *config.Config
	cancel context.CancelFunc
	queue  chan<- *plugins.Log
}

// New creates an ESF Collector.  Call Start to activate it.
func New(cnf *config.Config) *Collector {
	return &Collector{cnf: cnf}
}

// Name satisfies the collector.Collector interface.
func (c *Collector) Name() string { return "esf" }

// Start subscribes to EndpointSecurity events and forwards them to queue.
// It blocks until ctx is cancelled.
func (c *Collector) Start(ctx context.Context, queue chan<- *plugins.Log) {
	c.queue = queue
	childCtx, cancel := context.WithCancel(ctx)
	c.cancel = cancel
	defer cancel()

	if err := c.run(childCtx); err != nil {
		if utils.Logger != nil {
			safeLogError("esf: collector exited: %v", err)
		}
	}
}

// Stop cancels the collector.
func (c *Collector) Stop() {
	if c.cancel != nil {
		c.cancel()
	}
}

// run initialises the ESF client and dispatches events.
//
// Real ESF implementation using CGo (activate once Apple entitlement granted):
//
//	// #cgo LDFLAGS: -framework EndpointSecurity -lbsm
//	// #include <EndpointSecurity/EndpointSecurity.h>
//	// #include <bsm/libbsm.h>
//	import "C"
//
//	var client C.es_client_t
//	result := C.es_new_client(&client, callback)
//	if result != C.ES_NEW_CLIENT_RESULT_SUCCESS {
//	    return fmt.Errorf("esf: es_new_client failed: %d", result)
//	}
//	defer C.es_delete_client(client)
//
//	// Subscribe to event types
//	eventTypes := []C.es_event_type_t{
//	    C.ES_EVENT_TYPE_NOTIFY_EXEC,
//	    C.ES_EVENT_TYPE_NOTIFY_FORK,
//	    C.ES_EVENT_TYPE_NOTIFY_EXIT,
//	    C.ES_EVENT_TYPE_NOTIFY_CREATE,
//	    C.ES_EVENT_TYPE_NOTIFY_WRITE,
//	    C.ES_EVENT_TYPE_NOTIFY_UNLINK,
//	    C.ES_EVENT_TYPE_NOTIFY_RENAME,
//	    C.ES_EVENT_TYPE_NOTIFY_MMAP,
//	    C.ES_EVENT_TYPE_NOTIFY_MOUNT,
//	    C.ES_EVENT_TYPE_NOTIFY_KEXTLOAD,
//	    C.ES_EVENT_TYPE_NOTIFY_NETWORKFLOW,
//	    C.ES_EVENT_TYPE_NOTIFY_LOGIN_LOGIN,
//	    C.ES_EVENT_TYPE_NOTIFY_LOGIN_LOGOUT,
//	    C.ES_EVENT_TYPE_AUTH_EXEC, // blocking — for malware prevention
//	}
//	C.es_subscribe(client, &eventTypes[0], C.uint32_t(len(eventTypes)))
func (c *Collector) run(ctx context.Context) error {
	hostname, _ := os.Hostname()
	if utils.Logger != nil {
		safeLogInfo("esf: collector starting (stub — Apple ESF entitlement required for full activation)")
	}

	// Emit a synthetic startup event so the pipeline can be verified.
	startEvt := &ESFEvent{
		EventType:   EventTypeExec,
		DataType:    DataTypeProcess,
		Timestamp:   time.Now().UTC().Format(time.RFC3339Nano),
		PID:         uint32(os.Getpid()),
		ProcessName: "hivearmor_agent_service",
		ExePath:     os.Args[0],
		Args:        strings.Join(os.Args, " "),
		Hostname:    hostname,
		DataSource:  c.dataSource(hostname),
		Severity:    "INFO",
	}
	c.emit(startEvt)

	// In the real implementation, es_new_client sets up a callback that will
	// call c.Dispatch() for every subscribed event.  The goroutine below
	// would be replaced by a CGo dispatch loop running on a dedicated thread.
	<-ctx.Done()
	if utils.Logger != nil {
		safeLogInfo("esf: collector stopped")
	}
	return nil
}

// Dispatch normalises a raw ESF message and emits it to the LogQueue.
// This is called from the CGo ESF callback once the real implementation
// is activated.
func (c *Collector) Dispatch(eventType uint32, pid, ppid, uid uint32,
	exePath, args, filePath, newPath string,
	srcIP, dstIP string, srcPort, dstPort uint16, proto string,
	username string) {

	hostname, _ := os.Hostname()
	evt := &ESFEvent{
		Timestamp:   time.Now().UTC().Format(time.RFC3339Nano),
		PID:         pid,
		PPID:        ppid,
		UID:         uid,
		ExePath:     exePath,
		ProcessName: baseName(exePath),
		Args:        args,
		FilePath:    filePath,
		NewPath:     newPath,
		SrcIP:       srcIP,
		DstIP:       dstIP,
		SrcPort:     srcPort,
		DstPort:     dstPort,
		Proto:       proto,
		Username:    username,
		Hostname:    hostname,
		DataSource:  c.dataSource(hostname),
	}

	// ES_EVENT_TYPE_* constants (from EndpointSecurity/ESTypes.h):
	//  1  = NOTIFY_EXEC
	//  2  = NOTIFY_FORK
	//  3  = NOTIFY_EXIT
	//  4  = NOTIFY_CREATE
	//  7  = NOTIFY_UNLINK
	// 10  = NOTIFY_RENAME
	// 14  = NOTIFY_WRITE
	// 18  = NOTIFY_MMAP
	// 20  = NOTIFY_MOUNT
	// 23  = NOTIFY_KEXTLOAD
	// 59  = NOTIFY_NETWORKFLOW
	// 96  = NOTIFY_LOGIN_LOGIN
	// 97  = NOTIFY_LOGIN_LOGOUT
	switch eventType {
	case 1: // NOTIFY_EXEC
		evt.EventType = EventTypeExec
		evt.DataType = DataTypeProcess
		evt.Severity = execSeverity(exePath, args)
	case 2: // NOTIFY_FORK
		evt.EventType = EventTypeFork
		evt.DataType = DataTypeProcess
		evt.Severity = "INFO"
	case 3: // NOTIFY_EXIT
		evt.EventType = EventTypeExit
		evt.DataType = DataTypeProcess
		evt.Severity = "INFO"
	case 4: // NOTIFY_CREATE
		evt.EventType = EventTypeCreate
		evt.DataType = "fim"
		evt.Severity = fileSeverity(filePath)
	case 7: // NOTIFY_UNLINK
		evt.EventType = EventTypeUnlink
		evt.DataType = "fim"
		evt.Severity = fileSeverity(filePath)
	case 10: // NOTIFY_RENAME
		evt.EventType = EventTypeRename
		evt.DataType = "fim"
		evt.Severity = fileSeverity(filePath)
	case 14: // NOTIFY_WRITE
		evt.EventType = EventTypeWrite
		evt.DataType = "fim"
		evt.Severity = fileSeverity(filePath)
	case 18: // NOTIFY_MMAP
		evt.EventType = EventTypeMmap
		evt.DataType = DataTypeProcess
		evt.Severity = "HIGH" // PROT_EXEC mmap is always notable
	case 20: // NOTIFY_MOUNT
		evt.EventType = EventTypeMount
		evt.DataType = DataTypeProcess
		evt.Severity = "MEDIUM"
	case 23: // NOTIFY_KEXTLOAD
		evt.EventType = EventTypeKextLoad
		evt.DataType = DataTypeDriverLoad
		evt.Severity = "HIGH"
	case 59: // NOTIFY_NETWORKFLOW
		evt.EventType = EventTypeNetworkFlow
		evt.DataType = DataTypeNetConn
		evt.Severity = "INFO"
	case 96: // NOTIFY_LOGIN_LOGIN
		evt.EventType = EventTypeLoginLogin
		evt.DataType = "user-account"
		evt.Severity = "INFO"
	case 97: // NOTIFY_LOGIN_LOGOUT
		evt.EventType = EventTypeLoginLogout
		evt.DataType = "user-account"
		evt.Severity = "INFO"
	default:
		return // unhandled event type
	}

	c.emit(evt)
}

func (c *Collector) emit(evt *ESFEvent) {
	raw, err := json.Marshal(evt)
	if err != nil {
		if utils.Logger != nil {
			safeLogError("esf: marshal event: %v", err)
		}
		return
	}
	log := &plugins.Log{
		DataType:   evt.DataType,
		DataSource: evt.DataSource,
		Timestamp:  evt.Timestamp,
		Raw:        string(raw),
	}
	agent.Offer(c.queue, "esf", log)
}

func (c *Collector) dataSource(hostname string) string {
	if c.cnf != nil {
		return fmt.Sprintf("%s (agent-%d)", hostname, c.cnf.AgentID)
	}
	return hostname
}

func baseName(path string) string {
	parts := strings.Split(path, "/")
	if len(parts) == 0 {
		return path
	}
	return parts[len(parts)-1]
}

func execSeverity(exePath, args string) string {
	lower := strings.ToLower(exePath + " " + args)
	suspicious := []string{
		"/tmp/", "/var/tmp/", "/dev/shm",
		"curl | bash", "wget | sh",
		"base64 --decode",
	}
	for _, s := range suspicious {
		if strings.Contains(lower, s) {
			return "HIGH"
		}
	}
	return "INFO"
}

func fileSeverity(path string) string {
	critical := []string{
		"/etc/", "/bin/", "/sbin/", "/usr/bin/", "/usr/sbin/",
		"/Library/LaunchDaemons/", "/System/Library/LaunchDaemons/",
	}
	for _, p := range critical {
		if strings.HasPrefix(path, p) {
			return "HIGH"
		}
	}
	return "INFO"
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
