//go:build !windows

package fim

import (
	"context"

	"github.com/hivearmor/sdk/plugins"
)

// startRegistryFIM is a no-op on non-Windows platforms.
func startRegistryFIM(_ context.Context, _ chan<- *plugins.Log, _ string) {}
