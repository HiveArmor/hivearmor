//go:build !darwin

// Package esf provides a no-op stub for non-macOS platforms.
// The real ESF implementation lives in collector_darwin.go.
package esf

import (
	"context"

	"github.com/hivearmor/agent/config"
	"github.com/hivearmor/sdk/plugins"
)

// Collector is a no-op on non-Darwin platforms.
type Collector struct{}

// New returns a no-op Collector.
func New(_ *config.Config) *Collector { return &Collector{} }

// Name satisfies the collector.Collector interface.
func (c *Collector) Name() string { return "esf" }

// Start returns immediately; no events are emitted.
func (c *Collector) Start(_ context.Context, _ chan<- *plugins.Log) {}

// Stop is a no-op.
func (c *Collector) Stop() {}
