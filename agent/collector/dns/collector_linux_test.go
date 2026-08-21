//go:build linux

package dns

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

// TestShannonEntropy verifies the entropy calculation.
func TestShannonEntropy(t *testing.T) {
	// "a" repeated — zero entropy (all same characters)
	assert.InDelta(t, 0.0, ShannonEntropy("aaaaaaa"), 0.001)

	// "abcdefgh" — high entropy
	h := ShannonEntropy("abcdefghijklmnop")
	assert.Greater(t, h, 3.0, "random string should have high entropy")

	// Known high-entropy DGA-like domain subdomain
	dgaEntropy := ShannonEntropy("x7q2kf9mzv3p")
	assert.Greater(t, dgaEntropy, 2.5)

	// Empty string
	assert.Equal(t, 0.0, ShannonEntropy(""))
}

// TestHexToIP verifies little-endian hex IP parsing.
func TestHexToIP(t *testing.T) {
	// 0101A8C0 = 192.168.1.1 (little-endian: C0 A8 01 01)
	assert.Equal(t, "192.168.1.1", hexToIP("0101A8C0:0035"))
	assert.Equal(t, "0.0.0.0", hexToIP("00000000:0035"))
}

// TestHexToIP_Malformed verifies graceful handling of bad input.
func TestHexToIP_Malformed(t *testing.T) {
	// Should not panic
	result := hexToIP("invalid:0035")
	assert.NotEmpty(t, result)
}

// TestHexByte verifies the hex byte parsing helper.
func TestHexByte(t *testing.T) {
	assert.Equal(t, byte(0xFF), hexByte('F', 'F'))
	assert.Equal(t, byte(0x0A), hexByte('0', 'A'))
	assert.Equal(t, byte(0x10), hexByte('1', '0'))
}

// TestDNSEvent_JSON verifies the JSON schema matches filter field names.
func TestDNSEvent_JSON(t *testing.T) {
	evt := &DNSEvent{
		Timestamp:    time.Now().UTC().Format(time.RFC3339Nano),
		DataType:     DataTypeDNS,
		Query:        "evil.example.com",
		QueryType:    "A",
		ResponseCode: "NOERROR",
		Answers:      []string{"1.2.3.4"},
		TTL:          300,
		QueryLength:  16,
		Entropy:      2.5,
		SrcIP:        "10.0.0.1",
		Process:      "curl",
		PID:          1234,
		Hostname:     "testhost",
		DataSource:   "testhost (agent-1)",
		Severity:     "INFO",
	}

	raw, err := json.Marshal(evt)
	require.NoError(t, err)

	var decoded map[string]interface{}
	require.NoError(t, json.Unmarshal(raw, &decoded))

	// Verify all pipeline-normalised field names present.
	assert.Equal(t, "evil.example.com", decoded["log.query"])
	assert.Equal(t, "A", decoded["log.query_type"])
	assert.Equal(t, "NOERROR", decoded["log.response_code"])
	assert.Equal(t, float64(16), decoded["log.query_length"])
	assert.Equal(t, "10.0.0.1", decoded["origin.ip"])
	assert.Equal(t, "curl", decoded["origin.process"])
}

// TestCollector_StopsCleanly verifies the DNS collector stops on context cancel.
func TestCollector_StopsCleanly(t *testing.T) {
	c := New(&config.Config{AgentID: 1})
	queue := make(chan *plugins.Log, 16)
	ctx, cancel := context.WithCancel(context.Background())

	done := make(chan struct{})
	go func() {
		defer close(done)
		c.Start(ctx, queue)
	}()

	// The collector will try tcpdump (fails in sandbox) then /proc/net poll.
	// Both paths honour context cancellation.
	cancel()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("DNS collector did not stop within 5s")
	}
}

// TestParseTcpdumpLine_ValidDNSQuery verifies tcpdump line parsing.
func TestParseTcpdumpLine_ValidDNSQuery(t *testing.T) {
	// Sample tcpdump -n -q output line for DNS query
	line := "12:34:56.789012 IP 10.0.0.1.54321 > 8.8.8.8.53: UDP, length 40"
	evt := parseTcpdumpLine(line, "testhost", "testhost (agent-1)")
	// Should detect it as DNS traffic (contains .53)
	require.NotNil(t, evt)
	assert.Equal(t, DataTypeDNS, evt.DataType)
}

// TestParseTcpdumpLine_Response verifies DNS response lines are skipped.
func TestParseTcpdumpLine_Response(t *testing.T) {
	// Response: source port is 53 (server sending answer)
	line := "12:34:56 IP 8.8.8.8 53 > 10.0.0.1.54321: UDP, length 80"
	evt := parseTcpdumpLine(line, "testhost", "testhost (agent-1)")
	assert.Nil(t, evt, "DNS responses should be skipped")
}

// TestParseTcpdumpLine_NonDNS verifies non-DNS lines are skipped.
func TestParseTcpdumpLine_NonDNS(t *testing.T) {
	line := "12:34:56 IP 10.0.0.1.12345 > 1.2.3.4.443: tcp SYN"
	evt := parseTcpdumpLine(line, "testhost", "testhost (agent-1)")
	assert.Nil(t, evt)
}

// TestEmitEvent_QueueFull verifies graceful behaviour when the queue is full.
func TestEmitEvent_QueueFull(t *testing.T) {
	c := New(&config.Config{AgentID: 1})
	// Create a full queue (capacity 1, already occupied).
	queue := make(chan *plugins.Log, 1)
	queue <- &plugins.Log{} // fill it
	c.queue = queue

	evt := &DNSEvent{
		Timestamp:  time.Now().UTC().Format(time.RFC3339Nano),
		DataType:   DataTypeDNS,
		DataSource: "testhost (agent-1)",
		Severity:   "INFO",
	}

	// Should not block or panic when queue is full.
	assert.NotPanics(t, func() { c.emitEvent(evt) })
	// Queue should still have exactly 1 item (original one, new one dropped).
	assert.Len(t, queue, 1)
}
