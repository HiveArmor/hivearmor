//go:build !windows

package fim

import (
	"context"

	"github.com/hivearmor/sdk/plugins"
)

// DataTypeFIMRegistry is defined here so non-Windows code can reference it.
const DataTypeFIMRegistry = "fim-registry"

// RegistryWatcher is a no-op on non-Windows platforms.
type RegistryWatcher struct{}

// NewRegistryWatcher returns a no-op watcher on non-Windows platforms.
func NewRegistryWatcher(_ chan<- *plugins.Log, _ string) *RegistryWatcher {
	return &RegistryWatcher{}
}

// Start is a no-op on non-Windows platforms.
func (rw *RegistryWatcher) Start(_ context.Context) {}
