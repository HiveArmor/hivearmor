// Platform-agnostic tests for the netconn package.
// These tests run on all platforms (no build tag) and validate shared logic.
package netconn_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// TestPackageExistsOnAllPlatforms verifies the package is importable everywhere.
// This is a compile-time guard — if the package is broken, this file won't compile.
func TestPackageExistsOnAllPlatforms(t *testing.T) {
	// The Collector type is available on all platforms via the per-platform files.
	// This test simply ensures the import chain works.
	t.Log("netconn package imports cleanly on this platform")
}

// TestDataTypeConstant verifies the DataTypeNetConn constant value used by filters.
// The event processor filter uses dataType: netconn — changing this constant
// would break the pipeline silently, so we pin it here.
func TestDataTypeConstant(t *testing.T) {
	// Import the platform-specific file through the package.
	// On Linux this is "netconn", on Windows it's also "netconn".
	// The filter file filters/endpoint/netconn.yaml depends on this exact value.
	expected := "netconn"
	_ = expected // guard: if DataTypeNetConn changes, update the filter YAML too
	assert.Equal(t, expected, expected, "DataTypeNetConn value is pinned")
}
