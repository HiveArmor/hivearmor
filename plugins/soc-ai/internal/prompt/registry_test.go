package prompt

import (
	"testing"
)

func TestRegistryPinnedHashes(t *testing.T) {
	alert := Require(IDAlertAnalysis)
	if alert.ID != IDAlertAnalysis {
		t.Fatalf("alert id = %q", alert.ID)
	}
	if got, want := alert.SHA256, "e16e9e044beeb0e7b1ffaf2828c9fa5943ae8b11f2c7c4c76bb68cbe3ad1eaba"; got != want {
		t.Fatalf("alert hash = %s want %s", got, want)
	}
	if got := SHA256Hex(alert.Body); got != alert.SHA256 {
		t.Fatalf("SHA256Hex mismatch: %s vs %s", got, alert.SHA256)
	}

	chat := Require(IDChatSystem)
	if chat.ID != IDChatSystem {
		t.Fatalf("chat id = %q", chat.ID)
	}
	if got, want := chat.SHA256, "5c8e848482157c617dafcd752af93cb6b371442ad4ed7db73ca9deaed01a4f97"; got != want {
		t.Fatalf("chat hash = %s want %s", got, want)
	}
}

func TestFindUnknown(t *testing.T) {
	if _, ok := Find("ha.socai.missing"); ok {
		t.Fatal("expected unknown id to be missing")
	}
}

func TestHashesStableAcrossCalls(t *testing.T) {
	a1 := Require(IDAlertAnalysis)
	a2 := Require(IDAlertAnalysis)
	if a1.SHA256 != a2.SHA256 || a1.Body != a2.Body {
		t.Fatal("registry hashes/bodies must be stable")
	}
}
