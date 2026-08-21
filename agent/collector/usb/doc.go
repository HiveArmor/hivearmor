// Package usb provides USB and removable media device event collection.
//
// Platform implementations:
//   collector_linux.go   — monitors /sys/bus/usb/devices/ + udev netlink
//   collector_windows.go — reads Windows Event Log Kernel-PnP EventIDs 2003/2100
//                          (these events are already collected by the platform
//                          Windows Event Log collector; this module parses them
//                          from the /sys equivalent — the ETW Kernel-PnP provider
//                          events are consumed by the ETW collector instead)
//   collector_darwin.go  — ioutil.ReadDir /sys equivalent via system_profiler
//   collector_other.go   — no-op stub
package usb
