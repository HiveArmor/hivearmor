//go:build windows

// Package fim — Windows Registry FIM subsystem.
// Monitors selected registry keys for value changes using
// RegNotifyChangeKeyValue and emits dataType "fim-registry" events.
package fim

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/hivearmor/agent/agent"
	"github.com/hivearmor/agent/utils"
	"github.com/hivearmor/sdk/plugins"
	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

// DataTypeFIMRegistry is the log dataType for Windows registry FIM events.
const DataTypeFIMRegistry = "fim-registry"

// defaultRegistryKeys lists high-value HKLM keys to monitor for integrity.
var defaultRegistryKeys = []string{
	`SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon`,
	`SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options`,
	`SYSTEM\CurrentControlSet\Services`,
	`SOFTWARE\Microsoft\Windows\CurrentVersion\Run`,
	`SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce`,
	`SOFTWARE\Wow6432Node\Microsoft\Windows\CurrentVersion\Run`,
	`SYSTEM\CurrentControlSet\Control\Lsa`,
	`SOFTWARE\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\InstalledSDB`,
}

// RegistryFIMEvent is the JSON payload for dataType "fim-registry".
type RegistryFIMEvent struct {
	Action    string `json:"action"`
	Key       string `json:"origin.registryKey"`
	Hive      string `json:"origin.hive"`
	Hostname  string `json:"hostname"`
	Timestamp string `json:"@timestamp"`
	DataType  string `json:"dataType"`
}

// RegistryWatcher monitors a set of HKLM registry keys via
// RegNotifyChangeKeyValue (WinAPI) and emits fim-registry events.
type RegistryWatcher struct {
	keys     []string
	queue    chan<- *plugins.Log
	hostname string
}

// NewRegistryWatcher creates a watcher for the default high-value HKLM keys.
func NewRegistryWatcher(queue chan<- *plugins.Log, hostname string) *RegistryWatcher {
	return &RegistryWatcher{
		keys:     defaultRegistryKeys,
		queue:    queue,
		hostname: hostname,
	}
}

// Start begins watching registry keys. Each key gets its own goroutine.
// Blocks until ctx is cancelled.
func (rw *RegistryWatcher) Start(ctx context.Context) {
	for _, key := range rw.keys {
		go rw.watchKey(ctx, key)
	}
	<-ctx.Done()
}

// watchKey blocks waiting for changes to a single HKLM registry key.
func (rw *RegistryWatcher) watchKey(ctx context.Context, subKey string) {
	const accessMask = registry.NOTIFY | registry.QUERY_VALUE | windows.KEY_READ

	k, err := registry.OpenKey(registry.LOCAL_MACHINE, subKey, accessMask)
	if err != nil {
		utils.Logger.ErrorF("fim-registry: open key HKLM\\%s: %v", subKey, err)
		return
	}
	defer k.Close()

	// RegNotifyChangeKeyValue notifies once per registration; re-register after
	// each event.
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		// REG_NOTIFY_CHANGE_NAME | REG_NOTIFY_CHANGE_ATTRIBUTES |
		// REG_NOTIFY_CHANGE_LAST_SET | REG_NOTIFY_CHANGE_SECURITY
		const notifyFilter uint32 = 0x0001 | 0x0002 | 0x0004 | 0x0008

		evtHandle, createErr := createEventHandle()
		if createErr != nil {
			utils.Logger.ErrorF("fim-registry: create event for HKLM\\%s: %v", subKey, createErr)
			time.Sleep(5 * time.Second)
			continue
		}

		regErr := regNotifyChangeKeyValue(windows.Handle(k), true, notifyFilter, evtHandle, true)
		if regErr != nil {
			utils.Logger.ErrorF("fim-registry: RegNotifyChangeKeyValue HKLM\\%s: %v", subKey, regErr)
			_ = windows.CloseHandle(evtHandle)
			time.Sleep(5 * time.Second)
			continue
		}

		// Wait for signal or context cancel (1 s poll).
		waitResult := waitForSingleObject(evtHandle, 1000)
		_ = windows.CloseHandle(evtHandle)

		if ctx.Err() != nil {
			return
		}

		if waitResult == 0 { // WAIT_OBJECT_0 — key changed
			rw.emit(subKey)
		}
		// WAIT_TIMEOUT: loop and re-register.
	}
}

// emit sends a fim-registry event to the LogQueue.
func (rw *RegistryWatcher) emit(subKey string) {
	evt := RegistryFIMEvent{
		Action:    "MODIFY",
		Key:       `HKLM\` + subKey,
		Hive:      "HKLM",
		Hostname:  rw.hostname,
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
		DataType:  DataTypeFIMRegistry,
	}

	raw, err := json.Marshal(evt)
	if err != nil {
		return
	}

	log := &plugins.Log{
		DataType:   DataTypeFIMRegistry,
		DataSource: fmt.Sprintf("%s (registry-fim)", rw.hostname),
		Timestamp:  evt.Timestamp,
		Raw:        string(raw),
	}

	agent.Offer(rw.queue, "fim-registry", log)
}

// createEventHandle creates a manual-reset, initially non-signalled event object.
func createEventHandle() (windows.Handle, error) {
	return windows.CreateEvent(nil, 1, 0, nil)
}

// regNotifyChangeKeyValue wraps the Win32 RegNotifyChangeKeyValue API.
func regNotifyChangeKeyValue(key windows.Handle, watchSubtree bool, notifyFilter uint32, event windows.Handle, async bool) error {
	var subtree uint32
	if watchSubtree {
		subtree = 1
	}
	var asyncInt uint32
	if async {
		asyncInt = 1
	}
	r, _, err := procRegNotifyChangeKeyValue.Call(
		uintptr(key),
		uintptr(subtree),
		uintptr(notifyFilter),
		uintptr(event),
		uintptr(asyncInt),
	)
	if r != 0 {
		return err
	}
	return nil
}

// waitForSingleObject wraps WaitForSingleObject. Returns 0 on signal, 258 on timeout.
func waitForSingleObject(event windows.Handle, milliseconds uint32) uint32 {
	r, _, _ := procWaitForSingleObject.Call(uintptr(event), uintptr(milliseconds))
	return uint32(r)
}
