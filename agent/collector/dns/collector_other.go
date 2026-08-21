//go:build !linux

// Package dns provides a no-op stub for non-Linux platforms.
// On Windows, DNS telemetry is provided by the ETW collector (EventID 3008).
// On macOS, DNS telemetry is provided by the ESF collector (NETWORKFLOW events).
package dns

import (
	"context"

	"github.com/hivearmor/agent/config"
	"github.com/hivearmor/sdk/plugins"
)

// Collector is a no-op on non-Linux platforms.
type Collector struct{}

// New returns a no-op Collector.
func New(_ *config.Config) *Collector { return &Collector{} }

// Name satisfies the collector.Collector interface.
func (c *Collector) Name() string { return "dns" }

// Start returns immediately.
func (c *Collector) Start(_ context.Context, _ chan<- *plugins.Log) {}

// Stop is a no-op.
func (c *Collector) Stop() {}
