//go:build linux

package usb

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/hivearmor/agent/agent"
	"github.com/hivearmor/agent/config"
	"github.com/hivearmor/agent/utils"
	"github.com/hivearmor/sdk/plugins"
)

const (
	DataTypeUSB = "usb"
	usbSysPath  = "/sys/bus/usb/devices"
)

// USBEvent is the normalised USB device insert/remove event.
type USBEvent struct {
	Timestamp      string `json:"@timestamp"`
	DataType       string `json:"dataType"`
	Action         string `json:"action"` // USB_ARRIVE | USB_REMOVE
	DeviceVID      string `json:"deviceVid,omitempty"`
	DevicePID      string `json:"devicePid,omitempty"`
	DeviceManufact string `json:"deviceManufacturer,omitempty"`
	DeviceProduct  string `json:"deviceProduct,omitempty"`
	DeviceSerial   string `json:"deviceSerial,omitempty"`
	DeviceBus      string `json:"deviceBus,omitempty"`
	DevicePath     string `json:"devicePath,omitempty"`
	Hostname       string `json:"hostname"`
	DataSource     string `json:"dataSource"`
	Severity       string `json:"severity"`
}

// Collector monitors /sys/bus/usb/devices via inotify for USB hotplug events.
type Collector struct {
	cnf    *config.Config
	cancel context.CancelFunc
	queue  chan<- *plugins.Log
}

// New creates a USB Collector.
func New(cnf *config.Config) *Collector { return &Collector{cnf: cnf} }

// Name satisfies the collector.Collector interface.
func (c *Collector) Name() string { return "usb-linux" }

// Start watches /sys/bus/usb/devices for create/remove events and blocks until
// ctx is cancelled.
func (c *Collector) Start(ctx context.Context, queue chan<- *plugins.Log) {
	c.queue = queue
	childCtx, cancel := context.WithCancel(ctx)
	c.cancel = cancel
	defer cancel()

	hostname, _ := os.Hostname()

	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		safeLogError("usb: fsnotify: %v", err)
		return
	}
	defer watcher.Close()

	if err := watcher.Add(usbSysPath); err != nil {
		safeLogError("usb: watch %s: %v — USB monitoring unavailable", usbSysPath, err)
		return
	}

	safeLogInfo("usb: collector started, watching %s", usbSysPath)

	// Seed initial devices (don't emit events for already-present devices).
	known := c.currentDevices()

	for {
		select {
		case <-childCtx.Done():
			return
		case event, ok := <-watcher.Events:
			if !ok {
				return
			}
			devDir := event.Name
			if !strings.Contains(filepath.Base(devDir), "-") {
				continue // skip files like "usb1", only process port entries like "1-1"
			}

			if event.Op.Has(fsnotify.Create) {
				if _, alreadyKnown := known[devDir]; alreadyKnown {
					continue
				}
				known[devDir] = struct{}{}
				// Small delay to let the kernel populate the sysfs attributes.
				time.Sleep(100 * time.Millisecond)
				info := readUSBInfo(devDir)
				evt := &USBEvent{
					Timestamp:      time.Now().UTC().Format(time.RFC3339Nano),
					DataType:       DataTypeUSB,
					Action:         "USB_ARRIVE",
					DeviceVID:      info["idVendor"],
					DevicePID:      info["idProduct"],
					DeviceManufact: info["manufacturer"],
					DeviceProduct:  info["product"],
					DeviceSerial:   info["serial"],
					DeviceBus:      info["busnum"],
					DevicePath:     devDir,
					Hostname:       hostname,
					DataSource:     c.dataSource(hostname),
					Severity:       "MEDIUM",
				}
				c.emit(evt)

			} else if event.Op.Has(fsnotify.Remove) {
				if _, exists := known[devDir]; !exists {
					continue
				}
				delete(known, devDir)
				evt := &USBEvent{
					Timestamp:  time.Now().UTC().Format(time.RFC3339Nano),
					DataType:   DataTypeUSB,
					Action:     "USB_REMOVE",
					DevicePath: devDir,
					Hostname:   hostname,
					DataSource: c.dataSource(hostname),
					Severity:   "INFO",
				}
				c.emit(evt)
			}

		case watchErr, ok := <-watcher.Errors:
			if !ok {
				return
			}
			safeLogError("usb: watcher error: %v", watchErr)
		}
	}
}

// Stop cancels the collector.
func (c *Collector) Stop() {
	if c.cancel != nil {
		c.cancel()
	}
}

// currentDevices returns a set of USB device directories currently in sysfs.
func (c *Collector) currentDevices() map[string]struct{} {
	out := map[string]struct{}{}
	entries, err := os.ReadDir(usbSysPath)
	if err != nil {
		return out
	}
	for _, e := range entries {
		if e.IsDir() && strings.Contains(e.Name(), "-") {
			out[filepath.Join(usbSysPath, e.Name())] = struct{}{}
		}
	}
	return out
}

// readUSBInfo reads key sysfs attributes for a USB device directory.
func readUSBInfo(devDir string) map[string]string {
	info := map[string]string{}
	for _, attr := range []string{"idVendor", "idProduct", "manufacturer", "product", "serial", "busnum"} {
		data, err := os.ReadFile(filepath.Join(devDir, attr))
		if err == nil {
			info[attr] = strings.TrimSpace(string(data))
		}
	}
	return info
}

func (c *Collector) emit(evt *USBEvent) {
	raw, err := json.Marshal(evt)
	if err != nil {
		return
	}
	log := &plugins.Log{
		DataType:   DataTypeUSB,
		DataSource: evt.DataSource,
		Timestamp:  evt.Timestamp,
		Raw:        string(raw),
	}
	agent.Offer(c.queue, "usb", log)
}

func (c *Collector) dataSource(hostname string) string {
	if c.cnf != nil {
		return fmt.Sprintf("%s (agent-%d)", hostname, c.cnf.AgentID)
	}
	return hostname
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
