//go:build linux

package ebpf

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"strconv"
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
	DataTypeDriverLoad = "driver-load"
)

// ErrBTFNotAvailable is returned when the kernel does not expose BTF metadata
// required for CO-RE eBPF programs.  Callers should fall back to auditd.
var ErrBTFNotAvailable = errors.New("ebpf: BTF not available on this kernel")

// Collector implements collector.Collector using Linux eBPF tracepoints.
type Collector struct {
	cnf    *config.Config
	cancel context.CancelFunc
	queue  chan<- *plugins.Log
}

// New creates an eBPF Collector.  Call Start to activate it.
func New(cnf *config.Config) *Collector {
	return &Collector{cnf: cnf}
}

// Name satisfies the collector.Collector interface.
func (c *Collector) Name() string { return "ebpf" }

// Start attaches eBPF programs and forwards events to queue.
// It blocks until ctx is cancelled.
// Returns immediately (via goroutine error path) if eBPF is not available.
func (c *Collector) Start(ctx context.Context, queue chan<- *plugins.Log) {
	c.queue = queue

	childCtx, cancel := context.WithCancel(ctx)
	c.cancel = cancel
	defer cancel()

	if err := c.run(childCtx); err != nil {
		if errors.Is(err, ErrBTFNotAvailable) {
			utils.Logger.LogF(400, "ebpf: BTF not available; falling back to auditd path")
		} else {
			utils.Logger.ErrorF("ebpf: collector exited: %v", err)
		}
	}
}

// Stop cancels the collector.
func (c *Collector) Stop() {
	if c.cancel != nil {
		c.cancel()
	}
}

// run is the inner loop.  It detects BTF availability and either starts the
// full eBPF path or returns ErrBTFNotAvailable.
func (c *Collector) run(ctx context.Context) error {
	if !btfAvailable() {
		return ErrBTFNotAvailable
	}

	objs, ringbuf, err := loadAndAttach()
	if err != nil {
		return fmt.Errorf("ebpf: load and attach: %w", err)
	}
	defer objs.Close()
	defer ringbuf.Close()

	utils.Logger.Info("ebpf: collector started; attached to kernel tracepoints")

	hostname, _ := os.Hostname()

	for {
		select {
		case <-ctx.Done():
			utils.Logger.Info("ebpf: collector stopping")
			return nil
		default:
		}

		// Read one event from the ring buffer with a 100ms deadline so we
		// can honour ctx.Done() without blocking indefinitely.
		raw, err := ringbuf.ReadWithDeadline(time.Now().Add(100 * time.Millisecond))
		if err != nil {
			if isTimeout(err) {
				continue
			}
			return fmt.Errorf("ebpf: ringbuf read: %w", err)
		}

		evt, err := parseKernelEvent(raw)
		if err != nil {
			utils.Logger.ErrorF("ebpf: parse event: %v", err)
			continue
		}

		evt.Hostname = hostname
		if c.cnf != nil {
			evt.DataSource = fmt.Sprintf("%s (agent-%d)", hostname, c.cnf.AgentID)
		} else {
			evt.DataSource = hostname
		}

		log := eventToLog(evt)
		agent.Offer(c.queue, "ebpf", log)
	}
}

// btfAvailable returns true when /sys/kernel/btf/vmlinux is readable, which
// is the canonical check for CO-RE availability.
func btfAvailable() bool {
	_, err := os.Stat("/sys/kernel/btf/vmlinux")
	return err == nil
}

// KernelEvent represents a parsed event from the eBPF ring buffer.
type KernelEvent struct {
	// Type is one of: exec, exit, open, connect, accept, bind,
	// unlink, rename, chmod, chown, setuid, setgid, ptrace,
	// mmap_exec, mount, init_module
	Type string

	// Process context
	PID        uint32
	PPID       uint32
	UID        uint32
	GID        uint32
	Comm       string // task_comm_len = 16 bytes
	Argv       string // space-joined arguments
	ExePath    string
	ReturnCode int32

	// File / path context (for file-related events)
	FilePath   string
	NewPath    string // for rename
	Flags      uint32
	ModeOrProt uint32

	// Network context (for connect/accept/bind)
	SrcIP   string
	DstIP   string
	SrcPort uint16
	DstPort uint16

	// Module context (for init_module)
	ModuleName string

	// Envelope
	Hostname   string
	DataSource string
	Timestamp  string
}

// eventToLog converts a KernelEvent to a plugins.Log for the LogQueue.
func eventToLog(evt *KernelEvent) *plugins.Log {
	if evt.Timestamp == "" {
		evt.Timestamp = time.Now().UTC().Format(time.RFC3339Nano)
	}

	dataType := DataTypeProcess
	if evt.Type == "init_module" || evt.Type == "finit_module" {
		dataType = DataTypeDriverLoad
	}

	raw, _ := json.Marshal(evt)
	return &plugins.Log{
		DataType:   dataType,
		DataSource: evt.DataSource,
		Timestamp:  evt.Timestamp,
		Raw:        string(raw),
	}
}

// isTimeout checks whether an error from the ring buffer reader is a deadline
// exceeded / timeout — meaning no event was available in the window.
func isTimeout(err error) bool {
	if err == nil {
		return false
	}
	s := err.Error()
	return strings.Contains(s, "timeout") ||
		strings.Contains(s, "deadline") ||
		os.IsTimeout(err)
}

// maxArgvBytes is the maximum number of bytes we accumulate for argv to avoid
// runaway allocations on processes with very long argument lists.
const maxArgvBytes = 4096

// parseKernelEvent deserialises the flat byte array written by the BPF program
// into a KernelEvent.  The wire format is defined in bpf/events.h and mirrored
// in RawKernelEvent below.
func parseKernelEvent(data []byte) (*KernelEvent, error) {
	if len(data) < rawKernelEventSize {
		return nil, fmt.Errorf("short event: got %d bytes, want %d", len(data), rawKernelEventSize)
	}

	raw := unmarshalRawKernelEvent(data)

	evt := &KernelEvent{
		Type:       eventTypeString(raw.EventType),
		PID:        raw.PID,
		PPID:       raw.PPID,
		UID:        raw.UID,
		GID:        raw.GID,
		Comm:       nullTermString(raw.Comm[:]),
		Argv:       nullTermString(raw.Argv[:]),
		ExePath:    nullTermString(raw.ExePath[:]),
		FilePath:   nullTermString(raw.FilePath[:]),
		NewPath:    nullTermString(raw.NewPath[:]),
		Flags:      raw.Flags,
		ModeOrProt: raw.ModeOrProt,
		ReturnCode: raw.RetCode,
		SrcPort:    raw.SrcPort,
		DstPort:    raw.DstPort,
		ModuleName: nullTermString(raw.ModuleName[:]),
		Timestamp:  time.Unix(0, int64(raw.TimestampNs)).UTC().Format(time.RFC3339Nano),
	}

	if raw.SrcIP != 0 {
		evt.SrcIP = uint32ToIP(raw.SrcIP)
	}
	if raw.DstIP != 0 {
		evt.DstIP = uint32ToIP(raw.DstIP)
	}

	return evt, nil
}

// uint32ToIP converts a network-byte-order uint32 to a dotted-decimal string.
func uint32ToIP(n uint32) string {
	return fmt.Sprintf("%d.%d.%d.%d",
		(n>>24)&0xFF,
		(n>>16)&0xFF,
		(n>>8)&0xFF,
		n&0xFF,
	)
}

// nullTermString converts a byte slice to a string stopping at the first null byte.
func nullTermString(b []byte) string {
	for i, c := range b {
		if c == 0 {
			return string(b[:i])
		}
	}
	return string(b)
}

// eventTypeString maps a BPF event type integer to its human-readable name.
func eventTypeString(t uint32) string {
	switch t {
	case 1:
		return "exec"
	case 2:
		return "exit"
	case 3:
		return "open"
	case 4:
		return "connect"
	case 5:
		return "accept"
	case 6:
		return "bind"
	case 7:
		return "unlink"
	case 8:
		return "rename"
	case 9:
		return "chmod"
	case 10:
		return "chown"
	case 11:
		return "setuid"
	case 12:
		return "setgid"
	case 13:
		return "ptrace"
	case 14:
		return "mmap_exec"
	case 15:
		return "mount"
	case 16:
		return "init_module"
	case 17:
		return "finit_module"
	default:
		return "unknown_" + strconv.FormatUint(uint64(t), 10)
	}
}

// Severity returns a severity string for an event suitable for the SIEM.
func (evt *KernelEvent) Severity() string {
	switch evt.Type {
	case "init_module", "finit_module", "ptrace", "setuid", "setgid", "mmap_exec":
		return "HIGH"
	case "exec":
		// Processes started from tmp or world-writable paths are suspicious.
		if strings.HasPrefix(evt.ExePath, "/tmp/") ||
			strings.HasPrefix(evt.ExePath, "/dev/shm/") ||
			strings.HasPrefix(evt.ExePath, "/var/tmp/") {
			return "HIGH"
		}
		return "INFO"
	case "connect", "accept":
		return "INFO"
	case "unlink", "rename", "chmod", "chown":
		if strings.HasPrefix(evt.FilePath, "/etc/") ||
			strings.HasPrefix(evt.FilePath, "/usr/bin/") ||
			strings.HasPrefix(evt.FilePath, "/usr/sbin/") {
			return "HIGH"
		}
		return "INFO"
	default:
		return "INFO"
	}
}

// _ ensures math import is used (used by maxUint32 constant).
var _ = math.MaxUint32
