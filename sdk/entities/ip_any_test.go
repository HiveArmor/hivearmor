package entities_test

import (
	"testing"

	"github.com/hivearmor/sdk/entities"
)

func TestValidateAnyIP_PrivateIPv4Accepted(t *testing.T) {
	cases := []string{"192.168.1.100", "10.0.0.1", "172.16.50.50", "172.31.255.255"}
	for _, ip := range cases {
		_, hash, err := entities.ValidateAnyIP(ip)
		if err != nil {
			t.Errorf("ValidateAnyIP(%q) returned error: %v — private IPs must be accepted", ip, err)
		}
		if hash == "" {
			t.Errorf("ValidateAnyIP(%q) returned empty hash", ip)
		}
	}
}

func TestValidateAnyIP_LoopbackAccepted(t *testing.T) {
	got, _, err := entities.ValidateAnyIP("127.0.0.1")
	if err != nil {
		t.Fatalf("ValidateAnyIP(\"127.0.0.1\") = error: %v — loopback must be accepted", err)
	}
	if got != "127.0.0.1" {
		t.Fatalf("ValidateAnyIP(\"127.0.0.1\") = %q, want \"127.0.0.1\"", got)
	}
}

func TestValidateAnyIP_PublicIPAccepted(t *testing.T) {
	_, _, err := entities.ValidateAnyIP("8.8.8.8")
	if err != nil {
		t.Fatalf("ValidateAnyIP(\"8.8.8.8\") should succeed: %v", err)
	}
}

func TestValidateAnyIP_InvalidRejected(t *testing.T) {
	cases := []string{"not-an-ip", "999.999.999.999", "", "abc"}
	for _, ip := range cases {
		_, _, err := entities.ValidateAnyIP(ip)
		if err == nil {
			t.Errorf("ValidateAnyIP(%q) should return error for invalid input", ip)
		}
	}
}

func TestValidateAnyIP_UnspecifiedRejected(t *testing.T) {
	_, _, err := entities.ValidateAnyIP("0.0.0.0")
	if err == nil {
		t.Fatal("ValidateAnyIP(\"0.0.0.0\") should return error for unspecified address")
	}
}

func TestValidateAnyIP_IPv6Accepted(t *testing.T) {
	_, _, err := entities.ValidateAnyIP("::1")
	if err != nil {
		t.Fatalf("ValidateAnyIP(\"::1\") should accept IPv6 loopback: %v", err)
	}
}

func TestValidateAnyIP_ReturnsHash(t *testing.T) {
	_, hash, err := entities.ValidateAnyIP("192.168.1.1")
	if err != nil {
		t.Fatalf("ValidateAnyIP error: %v", err)
	}
	if len(hash) != 64 {
		t.Fatalf("ValidateAnyIP hash should be 64-char SHA3-256 hex, got len=%d: %q", len(hash), hash)
	}
}

func TestValidateAnyIP_ExistingValidateIPStillRejectsPrivate(t *testing.T) {
	// Regression: ValidateIP must still reject private IPs (for CTI entities)
	_, _, err := entities.ValidateIP("192.168.1.100")
	if err == nil {
		t.Fatal("ValidateIP should still reject private IPs — use ValidateAnyIP for SIEM telemetry")
	}
}
