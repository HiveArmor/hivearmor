//go:build windows

// Package etw provides a Windows ETW-based EDR telemetry collector.
//
// Subscribed providers:
//
//   Microsoft-Windows-Kernel-Process  (22fb2cd6-0e7b-422b-a0c7-2fad1fd0e716)
//     EventID 1  — ProcessStart: PID, PPID, ImageFileName, CommandLine, CreateTime
//     EventID 2  — ProcessStop:  PID, ExitCode
//
//   Microsoft-Windows-Kernel-File
//     EventID 10 — Create
//     EventID 12 — Close (used to detect write completion)
//
//   Microsoft-Windows-Kernel-Network
//     EventID 10 — TcpIpConnect v4
//     EventID 11 — UdpIpSend v4
//
//   Microsoft-Windows-DNS-Client
//     EventID 3008 — DNS query + response with process attribution
//
//   Microsoft-Windows-PowerShell/Operational
//     EventID 4104 — ScriptBlock logging
//
//   Microsoft-Windows-TaskScheduler/Operational
//     EventID 106 — Task registered
//     EventID 141 — Task deleted
//
//   Microsoft-Windows-WMI-Activity/Operational
//     EventID 5857–5861 — WMI consumer activity
//
//   Microsoft-Windows-Kernel-PnP/Device Configuration
//     EventID 2003 — USB device arrival
//     EventID 2100 — USB device removal
//
// Build requirements:
//   - Windows 7+ / Server 2008 R2+ (ETW tracing session API)
//   - Must run as Administrator (or with SeSystemProfilePrivilege)
//   - Depends on github.com/0xrawsec/golang-etw v1.6.2 (MIT)
//
// Usage: integrate github.com/0xrawsec/golang-etw before building:
//   go get github.com/0xrawsec/golang-etw@v1.6.2
package etw
