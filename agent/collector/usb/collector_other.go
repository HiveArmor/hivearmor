//go:build !linux

// Package usb provides a no-op stub for non-Linux platforms.
// On Windows, USB events are captured by the ETW collector via the
// Microsoft-Windows-Kernel-PnP provider (EventIDs 2003/2100).
// On macOS, USB events are captured by the ESF collector.
package usb

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
func (c *Collector) Name() string { return "usb" }

// Start returns immediately.
func (c *Collector) Start(_ context.Context, _ chan<- *plugins.Log) {}

// Stop is a no-op.
func (c *Collector) Stop() {}
