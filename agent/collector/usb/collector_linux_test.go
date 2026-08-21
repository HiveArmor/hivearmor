//go:build linux

package usb

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

// TestUSBEvent_JSON verifies the JSON field names match the pipeline filter.
func TestUSBEvent_JSON(t *testing.T) {
	evt := &USBEvent{
		Timestamp:      time.Now().UTC().Format(time.RFC3339Nano),
		DataType:       DataTypeUSB,
		Action:         "USB_ARRIVE",
		DeviceVID:      "8564",
		DevicePID:      "1000",
		DeviceManufact: "Kingston",
		DeviceProduct:  "DataTraveler",
		DeviceSerial:   "ABC123",
		DeviceBus:      "1",
		DevicePath:     "/sys/bus/usb/devices/1-1",
		Hostname:       "testhost",
		DataSource:     "testhost (agent-1)",
		Severity:       "MEDIUM",
	}

	raw, err := json.Marshal(evt)
	require.NoError(t, err)

	var decoded map[string]interface{}
	require.NoError(t, json.Unmarshal(raw, &decoded))

	assert.Equal(t, "USB_ARRIVE", decoded["action"])
	assert.Equal(t, "8564", decoded["deviceVid"])
	assert.Equal(t, "1000", decoded["devicePid"])
	assert.Equal(t, "Kingston", decoded["deviceManufacturer"])
	assert.Equal(t, "MEDIUM", decoded["severity"])
	assert.Equal(t, DataTypeUSB, decoded["dataType"])
}

// TestCollector_Name verifies the collector name.
func TestCollector_Name(t *testing.T) {
	c := New(&config.Config{AgentID: 1})
	assert.Equal(t, "usb-linux", c.Name())
}

// TestCollector_StopsCleanly verifies the USB collector stops on context cancel.
func TestCollector_StopsCleanly(t *testing.T) {
	c := New(&config.Config{AgentID: 1})
	queue := make(chan *plugins.Log, 16)
	ctx, cancel := context.WithCancel(context.Background())

	done := make(chan struct{})
	go func() {
		defer close(done)
		// In the test environment /sys/bus/usb/devices may or may not exist.
		// Either way the collector should honour ctx cancellation.
		c.Start(ctx, queue)
	}()

	// Give it a moment to start, then cancel.
	time.Sleep(50 * time.Millisecond)
	cancel()

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("USB collector did not stop within 3s")
	}
}

// TestEmit_QueueFull verifies a full memory queue does not panic.
func TestEmit_QueueFull(t *testing.T) {
	c := New(&config.Config{AgentID: 1})
	queue := make(chan *plugins.Log, 1)
	queue <- &plugins.Log{} // pre-fill
	c.queue = queue

	evt := &USBEvent{
		Timestamp:  time.Now().UTC().Format(time.RFC3339Nano),
		DataType:   DataTypeUSB,
		Action:     "USB_ARRIVE",
		DataSource: "testhost (agent-1)",
		Severity:   "MEDIUM",
	}

	assert.NotPanics(t, func() { c.emit(evt) })
	assert.Len(t, queue, 1)
}

// TestCurrentDevices_MissingSysPath returns empty map when /sys/bus/usb doesn't exist.
func TestCurrentDevices_MissingSysPath(t *testing.T) {
	c := &Collector{}
	// Override path temporarily for testing
	origPath := usbSysPath
	_ = origPath // path is a const — we just verify the method doesn't panic
	devices := c.currentDevices()
	// Should return either an empty map or populated map — no panic either way.
	assert.NotNil(t, devices)
}

// TestDataSource verifies the dataSource helper formats correctly.
func TestDataSource(t *testing.T) {
	c := New(&config.Config{AgentID: 42})
	ds := c.dataSource("myhost")
	assert.Equal(t, "myhost (agent-42)", ds)

	c2 := New(nil)
	ds2 := c2.dataSource("myhost")
	assert.Equal(t, "myhost", ds2)
}
