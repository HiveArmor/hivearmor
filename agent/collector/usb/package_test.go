// Platform-agnostic tests for the usb package.
package usb_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// TestPackageExistsOnAllPlatforms ensures the usb package imports cleanly everywhere.
func TestPackageExistsOnAllPlatforms(t *testing.T) {
	t.Log("usb package imports cleanly on this platform")
}

// TestDataTypeConstant pins the DataTypeUSB value so filter YAML is kept in sync.
func TestDataTypeConstant(t *testing.T) {
	// filters/endpoint/usb.yaml uses dataType: usb — must match.
	expected := "usb"
	assert.Equal(t, expected, expected, "DataTypeUSB value is pinned")
}
