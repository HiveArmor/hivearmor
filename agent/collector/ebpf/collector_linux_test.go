//go:build linux

package ebpf

import (
	"context"
	"encoding/json"
	"io"
	"testing"
	"time"

	"github.com/hivearmor/agent/config"
	"github.com/hivearmor/sdk/plugins"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// mockRingBuf streams a fixed set of pre-serialised raw event bytes and then
// returns io.EOF, simulating a drained ring buffer.
type mockRingBuf struct {
	records [][]byte
	pos     int
}

func (m *mockRingBuf) ReadWithDeadline(_ time.Time) ([]byte, error) {
	if m.pos >= len(m.records) {
		return nil, io.EOF
	}
	rec := m.records[m.pos]
	m.pos++
	return rec, nil
}

func (m *mockRingBuf) Close() error { return nil }

// mockBPFObjects satisfies BPFObjects with a no-op Close.
type mockBPFObjects struct{}

func (m *mockBPFObjects) Close() {}

// buildRawEvent constructs a minimal RawKernelEvent and serialises it to the
// wire format expected by parseKernelEvent / unmarshalRawKernelEvent.
func buildRawEvent(eventType uint32, pid uint32, comm string, exePath string, ts uint64) []byte {
	var r RawKernelEvent
	r.EventType = eventType
	r.PID = pid
	r.PPID = 1
	r.UID = 1000
	r.GID = 1000
	r.TimestampNs = ts
	copy(r.Comm[:], []byte(comm))
	copy(r.ExePath[:], []byte(exePath))

	buf := make([]byte, rawKernelEventSize)
	off := 0
	putU32 := func(v uint32) {
		buf[off] = byte(v)
		buf[off+1] = byte(v >> 8)
		buf[off+2] = byte(v >> 16)
		buf[off+3] = byte(v >> 24)
		off += 4
	}
	putI32 := func(v int32) { putU32(uint32(v)) }
	putU16 := func(v uint16) {
		buf[off] = byte(v)
		buf[off+1] = byte(v >> 8)
		off += 2
	}
	putU64 := func(v uint64) {
		for i := 0; i < 8; i++ {
			buf[off+i] = byte(v >> (8 * i))
		}
		off += 8
	}
	copyN := func(src []byte, n int) {
		copy(buf[off:off+n], src)
		off += n
	}

	putU32(r.EventType)
	putU32(r.PID)
	putU32(r.PPID)
	putU32(r.UID)
	putU32(r.GID)
	putI32(r.RetCode)
	putU32(r.Flags)
	putU32(r.ModeOrProt)
	putU32(r.SrcIP)
	putU32(r.DstIP)
	putU16(r.SrcPort)
	putU16(r.DstPort)
	putU64(r.TimestampNs)
	copyN(r.Comm[:], 16)
	copyN(r.ExePath[:], 256)
	copyN(r.Argv[:], 256)
	copyN(r.FilePath[:], 256)
	copyN(r.NewPath[:], 256)
	copyN(r.ModuleName[:], 64)

	return buf
}

// TestParseKernelEvent_Exec verifies that an exec event is parsed correctly.
func TestParseKernelEvent_Exec(t *testing.T) {
	raw := buildRawEvent(EVENT_EXEC, 1234, "bash", "/bin/bash", 1000000)
	evt, err := parseKernelEvent(raw)
	require.NoError(t, err)

	assert.Equal(t, "exec", evt.Type)
	assert.Equal(t, uint32(1234), evt.PID)
	assert.Equal(t, "bash", evt.Comm)
	assert.Equal(t, "/bin/bash", evt.ExePath)
}

// TestParseKernelEvent_InitModule verifies module-load events get the driver-load dataType.
func TestParseKernelEvent_InitModule(t *testing.T) {
	raw := buildRawEvent(EVENT_INIT_MODULE, 999, "insmod", "", 2000000)
	evt, err := parseKernelEvent(raw)
	require.NoError(t, err)
	assert.Equal(t, "init_module", evt.Type)

	log := eventToLog(evt)
	assert.Equal(t, DataTypeDriverLoad, log.DataType)
}

// TestParseKernelEvent_Short verifies that truncated data returns an error.
func TestParseKernelEvent_Short(t *testing.T) {
	_, err := parseKernelEvent([]byte{0x01, 0x02})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "short event")
}

// TestEventToLog_Process verifies the process dataType is assigned for exec events.
func TestEventToLog_Process(t *testing.T) {
	evt := &KernelEvent{
		Type:       "exec",
		PID:        42,
		Comm:       "curl",
		ExePath:    "/usr/bin/curl",
		DataSource: "myhost (agent-1)",
	}
	log := eventToLog(evt)
	assert.Equal(t, DataTypeProcess, log.DataType)
	assert.Equal(t, "myhost (agent-1)", log.DataSource)

	// Raw must be valid JSON containing the type field.
	var decoded map[string]interface{}
	require.NoError(t, json.Unmarshal([]byte(log.Raw), &decoded))
	assert.Equal(t, "exec", decoded["Type"])
}

// TestSeverity_SuspiciousPath verifies high severity for /tmp/ executables.
func TestSeverity_SuspiciousPath(t *testing.T) {
	evt := &KernelEvent{Type: "exec", ExePath: "/tmp/malware"}
	assert.Equal(t, "HIGH", evt.Severity())

	evt2 := &KernelEvent{Type: "exec", ExePath: "/usr/bin/ls"}
	assert.Equal(t, "INFO", evt2.Severity())
}

// TestCollector_StopsCleanly verifies the collector stops when ctx is cancelled.
func TestCollector_StopsCleanly(t *testing.T) {
	cnf := &config.Config{AgentID: 1}
	c := New(cnf)

	queue := make(chan *plugins.Log, 16)
	ctx, cancel := context.WithCancel(context.Background())

	done := make(chan struct{})
	go func() {
		defer close(done)
		c.Start(ctx, queue)
	}()

	// The stub loadAndAttach returns ErrBTFNotAvailable so Start should
	// return almost immediately.  Give it 500ms to be safe on slow CI.
	cancel()
	select {
	case <-done:
	case <-time.After(500 * time.Millisecond):
		t.Fatal("collector did not stop within 500ms")
	}
}

// TestNullTermString verifies the null-byte trimming helper.
func TestNullTermString(t *testing.T) {
	tests := []struct {
		name  string
		input []byte
		want  string
	}{
		{"empty", []byte{0, 0}, ""},
		{"full", []byte{'h', 'i', 0, 0}, "hi"},
		{"no null", []byte{'a', 'b', 'c'}, "abc"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, nullTermString(tt.input))
		})
	}
}

// TestUint32ToIP verifies IP address conversion.
func TestUint32ToIP(t *testing.T) {
	// 192.168.1.1 in network byte order (big-endian) = 0xC0A80101
	// But our function treats MSB first:
	assert.Equal(t, "192.168.1.1", uint32ToIP(0xC0A80101))
	assert.Equal(t, "0.0.0.0", uint32ToIP(0))
}

// EVENT_EXEC is mirrored here for the test to avoid a compile dependency on
// the C constants file.
const EVENT_EXEC = 1
const EVENT_INIT_MODULE = 16
