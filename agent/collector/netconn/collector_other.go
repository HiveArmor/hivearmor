//go:build !linux && !windows && !darwin

// Package netconn provides a no-op stub for unsupported platforms.
package netconn

import (
	"context"

	"github.com/hivearmor/agent/config"
	"github.com/hivearmor/sdk/plugins"
)

// Collector is a no-op on unsupported platforms.
type Collector struct{}

// New returns a no-op Collector.
func New(_ *config.Config) *Collector { return &Collector{} }

// Name satisfies the collector.Collector interface.
func (c *Collector) Name() string { return "netconn" }

// Start returns immediately.
func (c *Collector) Start(_ context.Context, _ chan<- *plugins.Log) {}

// Stop is a no-op.
func (c *Collector) Stop() {}
