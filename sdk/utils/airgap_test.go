package utils_test

import (
	"testing"
	"time"

	"github.com/hivearmor/sdk/utils"
)

func TestIsPrivateHost_Localhost(t *testing.T) {
	if !utils.IsPrivateHost("localhost") {
		t.Fatal("IsPrivateHost(\"localhost\") should be true")
	}
}

func TestIsPrivateHost_LoopbackIP(t *testing.T) {
	if !utils.IsPrivateHost("127.0.0.1") {
		t.Fatal("IsPrivateHost(\"127.0.0.1\") should be true")
	}
}

func TestIsPrivateHost_WithPort(t *testing.T) {
	if !utils.IsPrivateHost("localhost:11434") {
		t.Fatal("IsPrivateHost(\"localhost:11434\") should be true (Ollama default)")
	}
}

func TestAirGapCheck_ReturnsBoolean(t *testing.T) {
	// We cannot assert the specific result (depends on network state in test env),
	// but the function must not panic and must return a bool.
	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("AirGapCheck panicked: %v", r)
		}
	}()
	_ = utils.AirGapCheck("http://example.com", 1*time.Second)
}
