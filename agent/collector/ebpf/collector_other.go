//go:build !linux

// Package ebpf provides a no-op stub for non-Linux platforms.
// The real implementation (Linux eBPF via cilium/ebpf) lives in
// collector_linux.go and is only compiled on Linux.
package ebpf

import (
	"context"
	"errors"

	"github.com/hivearmor/agent/config"
	"github.com/hivearmor/sdk/plugins"
)

// ErrBTFNotAvailable is a sentinel for platforms where eBPF is not supported.
var ErrBTFNotAvailable = errors.New("ebpf: not supported on this platform")

// Collector is a no-op on non-Linux platforms.
type Collector struct{}

// New returns a no-op Collector.
func New(_ *config.Config) *Collector { return &Collector{} }

// Name satisfies the collector.Collector interface.
func (c *Collector) Name() string { return "ebpf" }

// Start returns immediately; no events are emitted.
func (c *Collector) Start(_ context.Context, _ chan<- *plugins.Log) {}

// Stop is a no-op.
func (c *Collector) Stop() {}
