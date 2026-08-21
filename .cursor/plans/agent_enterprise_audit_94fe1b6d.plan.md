---
name: Agent Enterprise Audit
overview: Comprehensive enterprise-grade audit of the HiveArmor agent module against leading SIEM tools (Splunk UBA, CrowdStrike Falcon, SentinelOne, Exabeam, Microsoft Sentinel, LogRhythm SIEM), with a full enhancement roadmap covering dual-mode installation (Log-Only / Log+EDR), cross-platform support, eBPF telemetry, FIM, and every data capture dimension that world-class SIEMs depend on.
todos:
  - id: phase0-bugfixes
    content: "Phase 0: Fix WMIC deprecation, inotifywait shell-out, DLQ unbounded growth, and quarantine restore; add --mode flag to install command"
    status: completed
  - id: phase1-fim
    content: "Phase 1: Build FIM engine (agent/collector/fim/) for all platforms using fsnotify — hash baseline DB, policy-driven paths, fim + fim-registry dataTypes"
    status: completed
  - id: phase2-ebpf
    content: "Phase 2: Build Linux eBPF collector (agent/collector/ebpf/) using cilium/ebpf — execve, open, connect, accept, init_module tracepoints; retire /proc polling"
    status: completed
  - id: phase3-etw
    content: "Phase 3: Build Windows ETW collector (agent/collector/etw/) — Kernel-Process, Kernel-File, Kernel-Network, DNS-Client, PowerShell ScriptBlock providers"
    status: completed
  - id: phase4-esf
    content: "Phase 4: Build macOS EndpointSecurity Framework module (agent/collector/esf/) — requires Apple System Extension entitlement and notarization"
    status: completed
  - id: phase5-dns-netconn
    content: "Phase 5: Add DNS telemetry and per-process network connection collectors (agent/collector/dns/, agent/collector/netconn/) for all platforms"
    status: completed
  - id: phase6-usb-driver
    content: "Phase 6: Add USB/device events, driver/module load events, and Windows registry FIM collectors"
    status: completed
  - id: phase7-tamper
    content: "Phase 7: Agent tamper protection — watchdog process, DACL service protection on Windows, chattr+i on Linux, signed command tokens"
    status: completed
  - id: phase8-rules
    content: "Phase 8: Write 100+ detection rules for new dataTypes (fim, dns, netconn, process, driver-load, usb) in event-processor rules/endpoint/"
    status: completed
isProject: false
---

# HiveArmor Agent — Enterprise Audit & Enhancement Plan

## Executive Summary

The current agent is a **production-ready foundation** with solid cross-platform log collection, basic EDR command primitives, and a clean gRPC pipeline. Against enterprise SIEM peers (CrowdStrike Falcon, SentinelOne, Elastic Agent, Exabeam Stream), it has **critical gaps in telemetry depth, EDR fidelity, FIM, and macOS parity**. This plan closes those gaps.

---

## Part 1 — Current State Assessment

### What the Agent Does Well
- **Cross-platform log collection**: Windows (wevtapi.dll native), Linux (journalctl + auditd netlink), macOS (sidecar binary), syslog UDP/TCP, NetFlow v1/5/9/IPFIX, file tailing
- **OS service integration**: kardianos/service covers Windows SCM, systemd, launchd — install is single-binary
- **Log DLQ**: SQLite-backed retry queue with configurable retention — prevents data loss during connectivity loss
- **Response actions**: quarantine, kill, network isolation (iptables/netsh), shell execution
- **Cloud integrations**: AWS CloudWatch, Azure Event Hub, GCP Pub/Sub, O365, CrowdStrike, Sophos, Bitdefender (via plugins)
- **Config hot-reload**: fsnotify config watcher, no restart required

### Critical Gaps vs. Enterprise Peers

| Gap | Current State | Peer Standard |
|---|---|---|
| macOS EDR | Zero — `edr_unsupported.go` stubs | CrowdStrike: kernel extension + ESF; SentinelOne: full macOS agent |
| Linux EDR | `/proc` polling (1s, misses ephemeral processes) | eBPF `execve`/`open`/`connect` tracepoints at kernel speed |
| Windows EDR | WMIC (deprecated Win11) | ETW + WMI COM subscriptions |
| FIM | No dedicated FIM — inotifywait shell-out only | Wazuh FIM: inotify kernel events + SHA-256 baseline DB |
| DNS visibility | None | Splunk: pDNS; Elastic: dnscap; Sentinel: DNS Events table |
| Network connection telemetry | NetFlow only (router-pushed) | Per-process network map: conntrack/netlink sockets on Linux, TCPIP ETW on Windows |
| USB/device events | None | udev (Linux), WM_DEVICECHANGE (Windows), IOKit (macOS) |
| User session events | Partial (Windows Event Logs) | Logon session tree, screen lock/unlock, RDP/SSH session lifecycle |
| Certificate/TLS visibility | None in agent | JA3/JARM fingerprinting via eBPF or pcap hooks |
| Agent tamper protection | None | CrowdStrike Falcon: kernel sensor protection; SentinelOne: self-protect driver |
| Dual installation mode | No — always full | Splunk UF: heavy vs. universal forwarder; Elastic: integrations-only vs. full agent |
| Hardware-level attestation | None | TPM-backed agent identity; CrowdStrike: device trust |

---

## Part 2 — Dual Mode: Log-Only vs. Log+EDR

### Installation Architecture

```
hivearmor-agent install <server> <key> [--mode=log|edr] [--insecure]
```

**Log-Only mode** (replaces the current default):
- Footprint: ~8 MB binary, ~20 MB RAM
- Runs: platform log collector + syslog listener + file tailer + netflow listener
- No kernel hooks, no process scanning, no response actions
- Target: network devices, servers with compliance requirements only

**Log+EDR mode** (enhanced current behavior):
- Footprint: ~20 MB binary, ~50–80 MB RAM
- Adds: eBPF sensor (Linux), ETW sensor (Windows), ESF/EndpointSecurity (macOS), FIM engine, DNS collector, network socket telemetry, USB events, user session events
- Requires elevated privileges (CAP_BPF on Linux, Administrator on Windows, SIP-exempt entitlement on macOS)
- Target: endpoints, workstations, critical servers

**Config key**: add `mode: log | edr` to `config.yml`. Gate all EDR subsystem starts in `serv/service.go` with `if cfg.Mode == "edr"`.

Key files to modify:
- [`agent/config/config.go`](agent/config/config.go) — add `Mode string` field
- [`agent/cmd/install.go`](agent/cmd/install.go) — add `--mode` flag, persist mode
- [`agent/serv/service.go`](agent/serv/service.go) — gate EDR subsystem startup on mode
- [`agent/agent/edr_start.go`](agent/agent/edr_start.go) — restructure dispatcher

---

## Part 3 — Linux EDR: Replace /proc Polling with eBPF

### Current Problem
`edr_linux.go` polls `/proc` every 1s. This misses processes that start and exit within the poll window (a well-known Splunk and SentinelOne design requirement: zero-miss process telemetry).

### Replacement: eBPF Tracepoints via cilium/ebpf

New module: `agent/collector/ebpf/` (Linux only — build tag `linux`)

```go
// agent/collector/ebpf/process_linux.go  //go:build linux
// Attaches to:
//   tracepoint/syscalls/sys_enter_execve
//   tracepoint/syscalls/sys_enter_execveat
//   tracepoint/syscalls/sys_exit_execve  (captures return code)
// Captures: pid, ppid, uid, gid, comm, argv[], cwd, exe_path, start_ts
```

Key eBPF events to capture per platform:

| Platform | Mechanism | Events |
|---|---|---|
| Linux kernel ≥5.8 | `cilium/ebpf` CO-RE (BTF) | `execve`, `execveat`, `fork`, `clone`, `open`, `openat`, `connect`, `accept`, `bind`, `unlink`, `rename`, `chmod`, `chown`, `setuid`, `setgid`, `ptrace`, `mmap` with PROT_EXEC, `mount`, `umount`, `init_module`, `finit_module` |
| Linux kernel <5.8 | kprobes fallback via `ebpf.kprobe` | Same set, lower reliability |
| Linux fallback | go-libaudit (already present) | `execve`, `open` via AUDIT_SYSCALL — less overhead than /proc |

The eBPF programs produce a ring buffer of events that the Go agent reads. Each event is converted to `plugins.Log` and enqueued to `LogQueue`. **No more /proc polling.**

New Go dependency: `github.com/cilium/ebpf` (v0.17+, Apache 2.0). Add to `agent/go.mod`.

---

## Part 4 — Windows EDR: Replace WMIC with ETW

### Current Problem
`collectWindowsProcessEvents` in `edr_windows.go` runs `wmic process get` in a loop. WMIC is deprecated in Windows 11 22H2 and removed in 24H2.

### Replacement: Event Tracing for Windows (ETW)

New module: `agent/collector/etw/` (Windows only — build tag `windows`)

```go
// agent/collector/etw/process_windows.go  //go:build windows
// Subscribes to:
//   Microsoft-Windows-Kernel-Process (GUID 22fb2cd6-0e7b-422b-a0c7-2fad1fd0e716)
//     Event ID 1 (ProcessStart): PID, PPID, ImageFileName, CommandLine, CreateTime
//     Event ID 2 (ProcessStop):  PID, ExitCode
//   Microsoft-Windows-Kernel-File
//     Event ID 10 (Create), 11 (Cleanup), 12 (Close), 13 (Read), 14 (Write)
//   Microsoft-Windows-Kernel-Network
//     Event ID 10 (TCPv4 connect), 11 (UDPv4 send)
//   Microsoft-Windows-DNS-Client
//     Event ID 3008: DNS queries + responses
//   Microsoft-Windows-PowerShell/Operational
//   Microsoft-Windows-PowerShell ScriptBlock logging (EventID 4104)
```

Windows ETW Go bindings: `github.com/microsoft/go-etw` or `github.com/0xrawsec/golang-etw`. Both are MIT licensed. 

For file events use `ReadDirectoryChangesW` or kernel filter driver notification via ETW Kernel-File provider — much more efficient than directory polling.

For network telemetry use `IP_HELPER` API + `GetExtendedTcpTable`/`GetExtendedUdpTable` snapshots on change detection, backed by Kernel-Network ETW.

---

## Part 5 — macOS EDR: EndpointSecurity Framework

### Current Problem
`edr_unsupported.go` returns errors for all EDR operations on macOS. The `darwin.go` collector spawns an opaque external binary — its telemetry surface is unknown.

### Solution: Apple EndpointSecurity Framework (ESF)

ESF is available macOS 10.15+. It requires Apple **System Extension** entitlement (TEAMID.com.hivearmor.agent.systemextension) + notarization + `com.apple.developer.endpoint-security.client` entitlement in the entitlements plist.

New module: `agent/collector/esf/` (build tag `darwin`)

ESF events to subscribe to:
```
ES_EVENT_TYPE_NOTIFY_EXEC           — process execution
ES_EVENT_TYPE_NOTIFY_FORK           — fork
ES_EVENT_TYPE_NOTIFY_EXIT           — exit
ES_EVENT_TYPE_NOTIFY_OPEN           — file open
ES_EVENT_TYPE_NOTIFY_CREATE         — file create
ES_EVENT_TYPE_NOTIFY_RENAME         — file rename
ES_EVENT_TYPE_NOTIFY_UNLINK         — file delete
ES_EVENT_TYPE_NOTIFY_WRITE          — file write
ES_EVENT_TYPE_NOTIFY_MMAP           — mmap with PROT_EXEC (code injection)
ES_EVENT_TYPE_NOTIFY_MOUNT          — volume mount
ES_EVENT_TYPE_NOTIFY_KEXTLOAD       — kernel extension load
ES_EVENT_TYPE_AUTH_EXEC             — auth (blocking) — for malware prevention
ES_EVENT_TYPE_NOTIFY_NETWORKFLOW    — network connections
ES_EVENT_TYPE_NOTIFY_LOGIN_LOGIN    — user login
ES_EVENT_TYPE_NOTIFY_LOGIN_LOGOUT   — user logout
```

ESF uses CGO with `libbsm`. The macOS collector sidecar binary should be refactored to be the ESF module, not a black-box binary. Build with CGO using the EndpointSecurity.framework.

---

## Part 6 — File Integrity Monitoring (FIM) Engine

### Current State
No dedicated FIM. `edr_linux.go` shells out to `inotifywait` on 5 hardcoded dirs. No hash computation, no baseline, no policy.

### Required FIM Architecture

New module: `agent/collector/fim/` (all platforms)

```
FIM Engine
├── Baseline DB (SQLite) — SHA-256 hash + mtime + owner + permissions per file
├── Watch Rules (from server-pushed policy) — paths, exclusions, recursive flag
├── Platform watchers:
│   ├── Linux: inotify via fsnotify (already a dep) — no external binary
│   ├── Windows: ReadDirectoryChangesW via fsnotify
│   └── macOS: FSEvents via fsnotify (kqueue fallback)
├── Event types: CREATE, MODIFY, DELETE, RENAME, PERMISSION_CHANGE, OWNER_CHANGE
└── On change: compute new SHA-256, diff against baseline, emit FIM event to LogQueue
```

**FIM Event schema additions** to `plugins.Log` (new `dataType: "fim"`):

| Field | Description |
|---|---|
| `origin.file` | Full file path |
| `origin.filename` | Base filename |
| `origin.path` | Directory path |
| `origin.sha256` | SHA-256 of new content |
| `origin.md5` | MD5 of new content |
| `origin.sizeInBytes` | File size |
| `origin.mimeType` | File MIME type |
| `origin.process` | Process that made the change (from eBPF/ETW correlation) |
| `origin.user` | UID/username that owns the operation |
| `action` | `CREATE` / `MODIFY` / `DELETE` / `RENAME` / `PERMISSION_CHANGE` |
| `log.old_hash` | Previous SHA-256 |
| `log.old_permissions` | Previous octal permissions |
| `log.new_permissions` | New octal permissions |
| `log.old_owner` | Previous owner |
| `log.new_owner` | New owner |

**Default monitored paths** (configurable from server policy):
```
Linux:   /etc/, /bin/, /sbin/, /usr/bin/, /usr/sbin/, /lib/, /boot/, /root/.ssh/, /etc/sudoers, /etc/passwd, /etc/shadow, /etc/cron*
Windows: %SYSTEMROOT%\System32\, %SYSTEMROOT%\SysWOW64\, HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon (registry FIM)
macOS:   /etc/, /bin/, /sbin/, /usr/bin/, /Library/LaunchDaemons/, /System/Library/LaunchDaemons/
```

**Registry FIM (Windows only)**: Monitor registry keys for changes using `RegNotifyChangeKeyValue` (already available via `golang.org/x/sys/windows`). Emit `dataType: "fim-registry"` events for `HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Run`, `HKLM\SYSTEM\CurrentControlSet\Services\`, etc.

---

## Part 7 — DNS Telemetry

### Why It Matters
DNS is a primary C2 exfiltration, data exfiltration, and malware communication channel. Splunk DNS Analytics, Elastic Security (dns.question.name), Microsoft Sentinel DNS Tables — all tier-1 SIEM data sources.

### Collection Method per Platform

| Platform | Method | Implementation |
|---|---|---|
| Linux | eBPF socket tracepoints on `getaddrinfo`/`res_query` + `libpcap` on port 53 | New `agent/collector/dns/dns_linux.go` |
| Windows | ETW `Microsoft-Windows-DNS-Client` EventID 3008 | Part of ETW module above |
| macOS | ESF `ES_EVENT_TYPE_NOTIFY_NETWORKFLOW` + raw socket on port 53 | Part of ESF module |

DNS event fields (`dataType: "dns"`):

| Field | Value |
|---|---|
| `origin.process` | Process that made the query |
| `origin.ip` | Source IP |
| `log.query` | DNS question (e.g. `evil.domain.com`) |
| `log.query_type` | A / AAAA / MX / TXT / CNAME / NS / PTR |
| `log.response_code` | NOERROR / NXDOMAIN / SERVFAIL |
| `log.answers[]` | Resolved IPs or values |
| `log.ttl` | TTL |
| `log.query_length` | Character count (DNS tunneling detection) |
| `log.subdomain_entropy` | Shannon entropy of subdomain (DGA detection) |

---

## Part 8 — Network Socket Telemetry (Per-Process)

Current NetFlow only captures router-level flows — no per-process attribution.

New module: `agent/collector/netconn/` — per-process connection table

| Platform | Method |
|---|---|
| Linux | `/proc/net/tcp`, `/proc/net/tcp6`, `/proc/net/udp` + `netlink SOCK_DIAG` for real-time; eBPF `connect`/`accept`/`bind` syscalls |
| Windows | `GetExtendedTcpTable` + ETW Kernel-Network provider |
| macOS | `proc_pidinfo` with `PROC_PIDLISTFDS` + ESF NETWORKFLOW events |

Fields emitted (`dataType: "netconn"`):

| Field | Description |
|---|---|
| `origin.process` | Process name |
| `origin.pid` | PID |
| `origin.ip` | Local IP |
| `origin.port` | Local port |
| `target.ip` | Remote IP |
| `target.port` | Remote port |
| `target.domain` | Reverse-DNS (best effort) |
| `protocol` | TCP / UDP |
| `action` | `connect` / `accept` / `bind` / `close` |
| `log.bytes_sent` | Bytes sent in session |
| `log.bytes_received` | Bytes received |
| `log.duration_ms` | Session duration |

---

## Part 9 — USB / Removable Media Events

New module: `agent/collector/usb/`

| Platform | Method |
|---|---|
| Linux | `udev` monitor via libudev or `/sys/bus/usb/devices/` polling + `udev_monitor_new_from_netlink()` |
| Windows | `WM_DEVICECHANGE` via `RegisterDeviceNotification` or ETW `Microsoft-Windows-Kernel-PnP` |
| macOS | IOKit `IOServiceAddMatchingNotification` for `IOUSBDevice` and `IOMedia` |

Fields: device VID/PID, manufacturer, product name, serial number, mount point, user who inserted.

---

## Part 10 — User Session & Authentication Events

Augment beyond raw Windows Event Log 4624/4625.

New collection targets:

| Event | Linux | Windows | macOS |
|---|---|---|---|
| Logon/Logoff | PAM module (`pam_exec`) or auditd USER_LOGIN | WinEvt 4624/4634/4647 (already collected) | ESF LOGIN/LOGOUT events |
| Screen lock | Not collected | WinEvt 4802/4803 | ESF screensaver events |
| RDP sessions | Not collected | WinEvt 4778/4779, RDS ETW | Not applicable |
| SSH sessions | auditd USER_AUTH + sshd log | Not applicable | auditd or sshd log |
| sudo/runas | auditd USER_CMD (already via auditd) | Not collected | ESF + auditd |
| Kerberos TGT/TGS | Not collected | WinEvt 4768/4769/4771 (already collected) | Not applicable |
| LDAP bind | Not collected | WinEvt 2889 | Not applicable |

---

## Part 11 — Telemetry Data Completeness Matrix

Below is the full "what to capture" matrix compared to Splunk, CrowdStrike, SentinelOne, and Sentinel.

### Tier 1 — Must Have (gaps to close)

| Data Category | Missing Today | Target `dataType` |
|---|---|---|
| Process creation (zero-miss) | eBPF/ETW (not /proc poll) | `process` |
| Process termination + exit code | Partial | `process` |
| Process parent-child tree | Partial | `process` |
| File create/write/delete (kernel-speed) | eBPF/ETW (not inotifywait) | `file` |
| FIM with hash + delta | New FIM engine | `fim` |
| Registry changes | New Windows-only | `fim-registry` |
| Per-process network connections | New | `netconn` |
| DNS queries per process | New | `dns` |
| Loaded DLLs/shared libraries | New | `module-load` |
| Driver/kernel module load | New (eBPF `init_module`) | `driver-load` |
| USB/device insertion | New | `usb` |
| Scheduled task create/modify | New (auditd + WinEvt) | `scheduled-task` |
| Service install/start/stop | Partial (WinEvt) | `service` |
| User account creation/modification | Partial | `user-account` |
| Group membership changes | Not collected | `user-account` |
| PowerShell ScriptBlock logging | WinEvt 4104 (needs explicit channel) | `powershell` |
| WMI consumer registration | WinEvt 5857–5861 | `wmi` |
| Named pipe creation/connection | Not collected | `ipc` |
| Memory protection changes (VirtualProtect) | ETW Kernel-Memory | `memory` |
| Image/DLL injection indicators | ETW or eBPF `mmap PROT_EXEC` | `memory` |

### Tier 2 — High Value

| Data Category | Source |
|---|---|
| Certificate store changes | WinEvt 5376/5377; macOS Keychain events |
| Clipboard access | ETW UIAutomation (optional) |
| Screen capture API calls | ETW + eBPF (privacy-sensitive, opt-in) |
| Browser history / credential access | Optional module |
| Container escape indicators | eBPF namespace events |
| Kubernetes admission events | kube-apiserver audit log (existing syslog) |
| SSH host key changes | FIM on `/etc/ssh/ssh_host_*` |
| Cron / at job changes | FIM + auditd `cron` facility |

---

## Part 12 — Agent Self-Protection (Tamper Resistance)

Current state: none. Any process can kill `hivearmor_agent_service` and delete its files.

Enhancements (phased):
- **Phase A** — Watchdog process: separate `hivearmor-watchdog` binary installs as a separate service that monitors and restarts the agent. Cross-monitors each other.
- **Phase B** — Privilege separation: agent runs core collection as root, log forwarding as a less-privileged user. Response actions require a signed command token.
- **Phase C** — Linux: lock agent binary with `chattr +i` after install. Windows: protect service via DACL (deny DELETE/WRITE_DAC for all except SYSTEM). macOS: SIP-protected path + signed system extension.
- **Phase D** (future): Kernel-level self-protect (PPL on Windows, kernel extension on macOS).

---

## Part 13 — Agent Architecture Refactor

### Module Registration Pattern

Replace the current monolithic `edr_start.go` dispatcher with a pluggable **collector registry**:

```go
// agent/collector/registry.go
type Collector interface {
    Name()    string
    Mode()    []AgentMode     // [ModeLog, ModeEDR]
    Platform() []string      // ["linux", "windows", "darwin"]
    Start(ctx context.Context, queue chan<- *plugins.Log) error
    Stop() error
}
```

All collectors (platform logs, eBPF, ETW, ESF, FIM, DNS, netconn, USB) self-register. The service runner iterates the registry and starts only those matching current mode + platform.

### New Collector Modules to Create

| Module path | Platform | Mode | Replaces |
|---|---|---|---|
| `agent/collector/ebpf/` | linux | EDR | `agent/agent/edr_linux.go` |
| `agent/collector/etw/` | windows | EDR | `agent/agent/edr_windows.go` |
| `agent/collector/esf/` | darwin | EDR | `agent/agent/edr_unsupported.go` |
| `agent/collector/fim/` | all | EDR | inotifywait shell-out |
| `agent/collector/dns/` | all | EDR | (new) |
| `agent/collector/netconn/` | all | EDR | (new) |
| `agent/collector/usb/` | all | EDR | (new) |
| `agent/collector/session/` | all | Log+EDR | (augments platform collector) |

### Event Processor: New `dataType` Registrations

Add filter + rule stubs for each new `dataType`:
- `filters/endpoint/process.yaml`
- `filters/endpoint/fim.yaml`
- `filters/endpoint/fim-registry.yaml`
- `filters/endpoint/dns.yaml`
- `filters/endpoint/netconn.yaml`
- `filters/endpoint/driver-load.yaml`
- `filters/endpoint/module-load.yaml`
- `filters/endpoint/usb.yaml`

---

## Part 14 — Immediate Bug Fixes (Pre-Feature)

These must be fixed before the feature work:

1. **WMIC deprecation** — [`agent/agent/edr_windows.go`](agent/agent/edr_windows.go): replace `wmic process get` with `Get-WmiObject Win32_Process` PowerShell or WMI COM via `golang.org/x/sys/windows/svc/mgr`
2. **inotifywait dependency** — [`agent/agent/edr_linux.go`](agent/agent/edr_linux.go): replace `inotifywait` shell-out with `fsnotify` (already in go.mod)
3. **DLQ unbounded growth** — [`agent/agent/logprocessor.go`](agent/agent/logprocessor.go): add size cap + rotation to `dlq/dropped-logs.jsonl`
4. **EDR restore incomplete** — [`agent/agent/edr_response_actions.go`](agent/agent/edr_response_actions.go): fetch original path from backend before moving file to quarantine

---

## Part 15 — Phased Roadmap

| Phase | Duration | Deliverables |
|---|---|---|
| **Phase 0** | 1 week | Bug fixes (#1–4 above); add `--mode` flag; gate EDR on mode |
| **Phase 1** | 3 weeks | FIM engine (all platforms); replace inotifywait with fsnotify; replace WMIC with WMI COM |
| **Phase 2** | 4 weeks | Linux eBPF collector (process + file + socket events); replace /proc polling |
| **Phase 3** | 3 weeks | Windows ETW collector (process + file + network + DNS + PowerShell ScriptBlock) |
| **Phase 4** | 3 weeks | macOS ESF module (process + file + network + user session) — requires Apple entitlement |
| **Phase 5** | 2 weeks | DNS telemetry (all platforms); netconn per-process table (all platforms) |
| **Phase 6** | 2 weeks | USB events; driver/module load events; registry FIM (Windows) |
| **Phase 7** | 2 weeks | Agent tamper protection Phase A+B (watchdog + DACL) |
| **Phase 8** | 3 weeks | 100+ new detection rules for new `dataType`s (fim, dns, netconn, process, driver-load) |
| **Total** | ~23 weeks | Full enterprise parity |

---

## Key Files Touched

- [`agent/config/config.go`](agent/config/config.go) — add `Mode`, `FIMPaths`, `EDRConfig` fields
- [`agent/cmd/install.go`](agent/cmd/install.go) — `--mode` flag
- [`agent/serv/service.go`](agent/serv/service.go) — collector registry iteration
- [`agent/agent/edr_linux.go`](agent/agent/edr_linux.go) — remove /proc polling; delegate to eBPF collector
- [`agent/agent/edr_windows.go`](agent/agent/edr_windows.go) — remove WMIC; delegate to ETW collector
- [`agent/agent/edr_unsupported.go`](agent/agent/edr_unsupported.go) — delegate to ESF collector
- [`agent/agent/edr_response_actions.go`](agent/agent/edr_response_actions.go) — fix quarantine restore
- [`agent/agent/logprocessor.go`](agent/agent/logprocessor.go) — DLQ size cap
- [`agent/go.mod`](agent/go.mod) — add `cilium/ebpf`, `microsoft/go-etw`
- New: `agent/collector/ebpf/`, `agent/collector/etw/`, `agent/collector/esf/`, `agent/collector/fim/`, `agent/collector/dns/`, `agent/collector/netconn/`, `agent/collector/usb/`
- New: `filters/endpoint/*.yaml`, `rules/endpoint/*.yaml`
