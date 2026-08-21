// Package netconn provides per-process network connection telemetry.
//
// Platform implementations:
//   netconn_linux.go   — reads /proc/net/tcp + /proc/net/tcp6 + netlink SOCK_DIAG
//   netconn_windows.go — uses GetExtendedTcpTable (IP Helper API)
//   netconn_darwin.go  — uses proc_pidinfo with PROC_PIDLISTFDS
//   netconn_other.go   — no-op stub
//
// All platforms emit dataType "netconn" events with per-process attribution.
package netconn
