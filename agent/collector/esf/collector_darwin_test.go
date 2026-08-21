//go:build darwin

package esf

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

// TestDispatch_ExecEvent verifies ESF exec event normalisation.
func TestDispatch_ExecEvent(t *testing.T) {
	queue := make(chan *plugins.Log, 16)
	c := New(&config.Config{AgentID: 5})
	c.queue = queue

	c.Dispatch(
		1,      // ES_EVENT_TYPE_NOTIFY_EXEC
		1234,   // pid
		1,      // ppid
		501,    // uid
		"/usr/bin/curl",
		"curl https://example.com",
		"", "", // file paths empty
		"", "", // network empty
		0, 0, "", "",
	)

	require.Len(t, queue, 1)
	log := <-queue
	assert.Equal(t, DataTypeProcess, log.DataType)

	var evt ESFEvent
	require.NoError(t, json.Unmarshal([]byte(log.Raw), &evt))
	assert.Equal(t, EventTypeExec, evt.EventType)
	assert.Equal(t, "curl", evt.ProcessName)
	assert.Equal(t, uint32(1234), evt.PID)
	assert.Equal(t, "INFO", evt.Severity)
}

// TestDispatch_SuspiciousExec verifies HIGH severity for /tmp executions.
func TestDispatch_SuspiciousExec(t *testing.T) {
	queue := make(chan *plugins.Log, 16)
	c := New(&config.Config{AgentID: 5})
	c.queue = queue

	c.Dispatch(
		1, 9999, 1, 0,
		"/tmp/malware",
		"/tmp/malware", "", "",
		"", "", 0, 0, "", "",
	)

	require.Len(t, queue, 1)
	log := <-queue
	var evt ESFEvent
	require.NoError(t, json.Unmarshal([]byte(log.Raw), &evt))
	assert.Equal(t, "HIGH", evt.Severity)
}

// TestDispatch_FIMEvent verifies FIM events get the fim dataType.
func TestDispatch_FIMEvent(t *testing.T) {
	queue := make(chan *plugins.Log, 16)
	c := New(&config.Config{AgentID: 5})
	c.queue = queue

	// ES_EVENT_TYPE_NOTIFY_CREATE = 4
	c.Dispatch(4, 100, 1, 0, "nano", "", "/etc/passwd", "", "", "", 0, 0, "", "")

	require.Len(t, queue, 1)
	log := <-queue
	assert.Equal(t, "fim", log.DataType)

	var evt ESFEvent
	require.NoError(t, json.Unmarshal([]byte(log.Raw), &evt))
	assert.Equal(t, "HIGH", evt.Severity) // /etc/ path
}

// TestDispatch_NetworkFlow verifies network events get the netconn dataType.
func TestDispatch_NetworkFlow(t *testing.T) {
	queue := make(chan *plugins.Log, 16)
	c := New(&config.Config{AgentID: 5})
	c.queue = queue

	// ES_EVENT_TYPE_NOTIFY_NETWORKFLOW = 59
	c.Dispatch(59, 200, 1, 0, "curl", "", "", "",
		"10.0.0.1", "1.2.3.4", 12345, 443, "TCP", "")

	require.Len(t, queue, 1)
	log := <-queue
	assert.Equal(t, DataTypeNetConn, log.DataType)
}

// TestDispatch_KextLoad verifies kernel extension loads get driver-load dataType with HIGH severity.
func TestDispatch_KextLoad(t *testing.T) {
	queue := make(chan *plugins.Log, 16)
	c := New(&config.Config{AgentID: 5})
	c.queue = queue

	// ES_EVENT_TYPE_NOTIFY_KEXTLOAD = 23
	c.Dispatch(23, 1, 0, 0, "kextutil", "", "/Library/Extensions/malicious.kext", "", "", "", 0, 0, "", "")

	require.Len(t, queue, 1)
	log := <-queue
	assert.Equal(t, DataTypeDriverLoad, log.DataType)

	var evt ESFEvent
	require.NoError(t, json.Unmarshal([]byte(log.Raw), &evt))
	assert.Equal(t, "HIGH", evt.Severity)
}

// TestDispatch_UnknownEvent verifies unknown event types are discarded.
func TestDispatch_UnknownEvent(t *testing.T) {
	queue := make(chan *plugins.Log, 16)
	c := New(&config.Config{AgentID: 5})
	c.queue = queue

	c.Dispatch(9999, 1, 0, 0, "proc", "", "", "", "", "", 0, 0, "", "")
	assert.Empty(t, queue, "unknown event types should be discarded")
}

// TestCollector_StopsCleanly verifies the ESF collector respects context cancellation.
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
	case <-time.After(2 * time.Second):
		t.Fatal("ESF collector did not stop within 2s")
	}
}

// TestESFEvent_JSON verifies the JSON schema contains correct field names.
func TestESFEvent_JSON(t *testing.T) {
	evt := &ESFEvent{
		EventType:   EventTypeExec,
		DataType:    DataTypeProcess,
		Timestamp:   time.Now().UTC().Format(time.RFC3339Nano),
		PID:         42,
		PPID:        1,
		UID:         501,
		ProcessName: "bash",
		ExePath:     "/bin/bash",
		Args:        "/bin/bash -i",
		Hostname:    "machost",
		DataSource:  "machost (agent-1)",
		Severity:    "INFO",
	}

	raw, err := json.Marshal(evt)
	require.NoError(t, err)

	var decoded map[string]interface{}
	require.NoError(t, json.Unmarshal(raw, &decoded))

	assert.Equal(t, "ES_EXEC", decoded["eventType"])
	assert.Equal(t, DataTypeProcess, decoded["dataType"])
	assert.Equal(t, float64(42), decoded["pid"])
	assert.Equal(t, "bash", decoded["processName"])
}

// TestExecSeverity verifies severity detection for suspicious paths.
func TestExecSeverity(t *testing.T) {
	assert.Equal(t, "HIGH", execSeverity("/tmp/exploit", ""))
	assert.Equal(t, "HIGH", execSeverity("/var/tmp/loader", ""))
	assert.Equal(t, "HIGH", execSeverity("/usr/bin/curl", "curl | bash"))
	assert.Equal(t, "INFO", execSeverity("/usr/bin/ls", "ls -la"))
}

// TestFileSeverity verifies severity detection for critical paths.
func TestFileSeverity(t *testing.T) {
	assert.Equal(t, "HIGH", fileSeverity("/etc/passwd"))
	assert.Equal(t, "HIGH", fileSeverity("/usr/bin/sshd"))
	assert.Equal(t, "HIGH", fileSeverity("/Library/LaunchDaemons/evil.plist"))
	assert.Equal(t, "INFO", fileSeverity("/Users/user/Documents/file.txt"))
}

// TestBaseName verifies the path base extraction.
func TestBaseName(t *testing.T) {
	assert.Equal(t, "curl", baseName("/usr/bin/curl"))
	assert.Equal(t, "malware.exe", baseName("/tmp/malware.exe"))
	assert.Equal(t, "bash", baseName("bash"))
}
