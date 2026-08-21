//go:build windows

package fim

import (
	"context"

	"github.com/hivearmor/sdk/plugins"
)

// startRegistryFIM starts the Windows Registry FIM watcher as a goroutine.
func startRegistryFIM(ctx context.Context, queue chan<- *plugins.Log, hostname string) {
	rw := NewRegistryWatcher(queue, hostname)
	go rw.Start(ctx)
}
