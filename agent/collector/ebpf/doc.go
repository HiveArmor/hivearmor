// Package ebpf provides a Linux eBPF-based EDR telemetry collector.
//
// Design summary
//
// On Linux kernels ≥ 5.8 with BTF (BPF Type Format) available, the collector
// attaches CO-RE (Compile Once – Run Everywhere) eBPF programs to kernel
// tracepoints via github.com/cilium/ebpf.  Events are surfaced through a
// perf-event ring buffer and converted to plugins.Log entries for the shared
// LogQueue.
//
// Capability requirements:
//   - CAP_BPF (kernel ≥ 5.8) or CAP_SYS_ADMIN (older kernels)
//   - CAP_PERFMON for perf_event_open
//
// Fallback strategy:
//   - If BTF is missing or the kernel is < 5.8, the collector returns
//     ErrBTFNotAvailable.  The caller (serv/service.go) should then fall back
//     to the auditd-based path which is already integrated via go-libaudit.
//
// Build constraint: linux only.  Companion BPF C source lives in bpf/ and is
// compiled by "go generate" / Makefile into ebpf_bpfel.go (little-endian) or
// ebpf_bpfeb.go (big-endian) using bpf2go.  Until the generated files are
// present the package uses the stub in ebpf_stub_linux.go.
package ebpf
