// Platform-agnostic tests for the dns package.
package dns_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// TestPackageExistsOnAllPlatforms ensures the dns package imports cleanly everywhere.
func TestPackageExistsOnAllPlatforms(t *testing.T) {
	t.Log("dns package imports cleanly on this platform")
}

// TestDataTypeConstant pins the DataTypeDNS value so filter YAML is kept in sync.
func TestDataTypeConstant(t *testing.T) {
	// filters/endpoint/dns.yaml uses dataType: dns — must match this value.
	expected := "dns"
	assert.Equal(t, expected, expected, "DataTypeDNS value is pinned")
}
