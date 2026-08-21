// Package tamper implements agent self-protection mechanisms.
//
// Phase A (implemented here): Watchdog process — a lightweight goroutine that
// monitors agent health and a platform-specific service protector that hardens
// the OS service definition against tampering.
//
// Phase B (future): Privilege separation — separate collection and forwarding
// into unprivileged goroutines; response actions require a signed command token.
//
// Phase C (future): Binary immutability — chattr +i on Linux, DACL hardening
// on Windows SCM, SIP-protected path on macOS.
//
// Phase D (future): Kernel-level self-protect — PPL on Windows, kernel
// extension on macOS.
package tamper
