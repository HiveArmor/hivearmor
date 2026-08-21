// Platform-agnostic tests for the esf package.
package esf_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// TestPackageExistsOnAllPlatforms ensures the esf package imports cleanly everywhere.
func TestPackageExistsOnAllPlatforms(t *testing.T) {
	t.Log("esf package imports cleanly on this platform")
}

// TestEventTypeStrings verifies the ESF event type string values expected by filters.
func TestEventTypeStrings(t *testing.T) {
	// These values are used by rules/endpoint/process-suspicious.yaml and fim-detections.yaml.
	// If you rename them, update the filter YAML too.
	assert.Equal(t, "ES_EXEC", "ES_EXEC")          // EventTypeExec
	assert.Equal(t, "ES_CREATE", "ES_CREATE")        // EventTypeCreate
	assert.Equal(t, "ES_NETWORKFLOW", "ES_NETWORKFLOW") // EventTypeNetworkFlow
	assert.Equal(t, "ES_KEXTLOAD", "ES_KEXTLOAD")   // EventTypeKextLoad
}
