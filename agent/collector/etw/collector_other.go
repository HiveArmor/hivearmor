//go:build !windows

// Package etw provides a no-op stub for non-Windows platforms.
// The real implementation (Windows ETW) lives in collector_windows.go.
package etw

import (
	"context"

	"github.com/hivearmor/agent/config"
	"github.com/hivearmor/sdk/plugins"
)

// Collector is a no-op on non-Windows platforms.
type Collector struct{}

// New returns a no-op Collector.
func New(_ *config.Config) *Collector { return &Collector{} }

// Name satisfies the collector.Collector interface.
func (c *Collector) Name() string { return "etw" }

// Start returns immediately; no events are emitted on non-Windows.
func (c *Collector) Start(_ context.Context, _ chan<- *plugins.Log) {}

// Stop is a no-op.
func (c *Collector) Stop() {}
