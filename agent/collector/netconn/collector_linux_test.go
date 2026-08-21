//go:build linux

package netconn

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/hivearmor/agent/config"
	"github.com/hivearmor/sdk/plugins"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestParseHexAddr_IPv4 verifies little-endian IPv4 hex address parsing.
func TestParseHexAddr_IPv4(t *testing.T) {
	tests := []struct {
		hex      string
		wantIP   string
		wantPort uint16
	}{
		{"0101A8C0:0050", "192.168.1.1", 80},
		{"00000000:0035", "0.0.0.0", 53},
		{"0F02000A:1F90", "10.0.2.15", 8080},
	}
	for _, tt := range tests {
		ip, port := parseHexAddr(tt.hex, false)
		assert.Equal(t, tt.wantIP, ip, "IP mismatch for %s", tt.hex)
		assert.Equal(t, tt.wantPort, port, "port mismatch for %s", tt.hex)
	}
}

// TestParseHexAddr_Short verifies graceful handling of malformed input.
func TestParseHexAddr_Short(t *testing.T) {
	ip, port := parseHexAddr("nocolon", false)
	assert.Equal(t, "", ip)
	assert.Equal(t, uint16(0), port)
}

// TestTCPStateString verifies state code to string mapping.
func TestTCPStateString(t *testing.T) {
	assert.Equal(t, "ESTABLISHED", tcpStateString("01"))
	assert.Equal(t, "LISTEN", tcpStateString("0A"))
	assert.Equal(t, "UNKNOWN", tcpStateString("FF"))
}

// TestIsCommonPort verifies well-known port detection.
func TestIsCommonPort(t *testing.T) {
	assert.True(t, isCommonPort(443))
	assert.True(t, isCommonPort(22))
	assert.False(t, isCommonPort(4444))
	assert.False(t, isCommonPort(1337))
}

// TestConnEvent_JSON verifies the JSON schema matches the pipeline filter fields.
func TestConnEvent_JSON(t *testing.T) {
	evt := &ConnEvent{
		Timestamp:   time.Now().UTC().Format(time.RFC3339Nano),
		DataType:    DataTypeNetConn,
		Action:      "connect",
		Protocol:    "TCP",
		SrcIP:       "10.0.0.1",
		SrcPort:     54321,
		DstIP:       "8.8.8.8",
		DstPort:     53,
		ProcessName: "curl",
		PID:         1234,
		State:       "SYN_SENT",
		Hostname:    "testhost",
		DataSource:  "testhost (agent-1)",
		Severity:    "INFO",
	}

	raw, err := json.Marshal(evt)
	require.NoError(t, err)

	var decoded map[string]interface{}
	require.NoError(t, json.Unmarshal(raw, &decoded))

	// Verify all pipeline-normalised field names are present in JSON.
	assert.Equal(t, "10.0.0.1", decoded["origin.ip"])
	assert.Equal(t, float64(54321), decoded["origin.port"])
	assert.Equal(t, "8.8.8.8", decoded["target.ip"])
	assert.Equal(t, float64(53), decoded["target.port"])
	assert.Equal(t, "TCP", decoded["protocol"])
	assert.Equal(t, "curl", decoded["origin.process"])
	assert.Equal(t, float64(1234), decoded["origin.pid"])
	assert.Equal(t, "connect", decoded["action"])
}

// TestCollector_StopsCleanly verifies the Linux netconn collector stops.
func TestCollector_StopsCleanly(t *testing.T) {
	c := New(&config.Config{AgentID: 1})
	queue := make(chan *plugins.Log, 16)
	ctx, cancel := context.WithCancel(context.Background())

	done := make(chan struct{})
	go func() {
		defer close(done)
		c.Start(ctx, queue)
	}()

	cancel()
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("netconn collector did not stop within 3s")
	}
}

// TestDiff_NewConnection verifies that new connections generate events.
func TestDiff_NewConnection(t *testing.T) {
	c := New(&config.Config{AgentID: 1})

	queue := make(chan *plugins.Log, 32)
	c.queue = queue

	prev := map[inodeConnKey]connRecord{}
	curr := map[inodeConnKey]connRecord{
		{proto: "TCP", srcIP: "10.0.0.1", srcPort: 12345, dstIP: "1.2.3.4", dstPort: 4444}: {
			inodeConnKey: inodeConnKey{
				proto: "TCP", srcIP: "10.0.0.1", srcPort: 12345,
				dstIP: "1.2.3.4", dstPort: 4444,
			},
			state: "ESTABLISHED",
			pname: "nc",
			pid:   9999,
		},
	}

	c.diff(prev, curr, "testhost")

	require.Len(t, queue, 1)
	log := <-queue

	var evt ConnEvent
	require.NoError(t, json.Unmarshal([]byte(log.Raw), &evt))
	assert.Equal(t, "connect", evt.Action)
	assert.Equal(t, "1.2.3.4", evt.DstIP)
	assert.Equal(t, uint16(4444), evt.DstPort)
	assert.Equal(t, "MEDIUM", evt.Severity) // non-standard port
}

// TestDiff_ClosedConnection verifies that closed connections generate close events.
func TestDiff_ClosedConnection(t *testing.T) {
	c := New(&config.Config{AgentID: 1})
	queue := make(chan *plugins.Log, 32)
	c.queue = queue

	key := inodeConnKey{proto: "TCP", srcIP: "10.0.0.1", srcPort: 12345, dstIP: "1.2.3.4", dstPort: 443}
	prev := map[inodeConnKey]connRecord{
		key: {inodeConnKey: key, state: "ESTABLISHED", pname: "curl", pid: 5555},
	}
	curr := map[inodeConnKey]connRecord{} // connection disappeared

	c.diff(prev, curr, "testhost")

	require.Len(t, queue, 1)
	log := <-queue
	var evt ConnEvent
	require.NoError(t, json.Unmarshal([]byte(log.Raw), &evt))
	assert.Equal(t, "close", evt.Action)
}

// TestDiff_LoopbackFiltered verifies loopback connections are dropped.
func TestDiff_LoopbackFiltered(t *testing.T) {
	c := New(&config.Config{AgentID: 1})
	queue := make(chan *plugins.Log, 32)
	c.queue = queue

	key := inodeConnKey{proto: "TCP", srcIP: "127.0.0.1", srcPort: 12345, dstIP: "127.0.0.1", dstPort: 8080}
	prev := map[inodeConnKey]connRecord{}
	curr := map[inodeConnKey]connRecord{
		key: {inodeConnKey: key, state: "ESTABLISHED"},
	}

	c.diff(prev, curr, "testhost")
	assert.Empty(t, queue, "loopback connections should be filtered")
}

// TestIsNumericStr verifies the numeric string helper.
func TestIsNumericStr(t *testing.T) {
	assert.True(t, isNumericStr("1234"))
	assert.False(t, isNumericStr("abc"))
	assert.False(t, isNumericStr(""))
}
