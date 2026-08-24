package agent

import (
	"testing"
)

func TestIsFullIsolation(t *testing.T) {
	t.Parallel()
	cases := []struct {
		in   string
		want bool
	}{
		{"FULL", true},
		{"full", true},
		{" Full ", true},
		{"PARTIAL", false},
		{"", false},
		{"inbound", false},
	}
	for _, tc := range cases {
		if got := isFullIsolation(tc.in); got != tc.want {
			t.Errorf("isFullIsolation(%q)=%v want %v", tc.in, got, tc.want)
		}
	}
}

func TestWindowsFirewallPolicy(t *testing.T) {
	t.Parallel()
	cases := []struct {
		isoType string
		want    string
	}{
		{"FULL", "blockinbound,blockoutbound"},
		{"full", "blockinbound,blockoutbound"},
		{"PARTIAL", "blockinbound,allowoutbound"},
		{"", "blockinbound,allowoutbound"},
	}
	for _, tc := range cases {
		if got := windowsFirewallPolicy(tc.isoType); got != tc.want {
			t.Errorf("windowsFirewallPolicy(%q)=%q want %q", tc.isoType, got, tc.want)
		}
	}
}

func TestMergeIsolationAllowlist_PrefersManagementIP(t *testing.T) {
	t.Parallel()
	got := mergeIsolationAllowlist("10.0.0.5", []string{"192.168.1.10", "10.0.0.5", " ", "192.168.1.10"})
	want := []string{"10.0.0.5", "192.168.1.10"}
	if len(got) != len(want) {
		t.Fatalf("len=%d want %d; got=%v", len(got), len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("got[%d]=%q want %q (full=%v)", i, got[i], want[i], got)
		}
	}
}

func TestMergeIsolationAllowlist_EmptyManagement(t *testing.T) {
	t.Parallel()
	got := mergeIsolationAllowlist("", []string{"1.2.3.4"})
	if len(got) != 1 || got[0] != "1.2.3.4" {
		t.Fatalf("got=%v want [1.2.3.4]", got)
	}
}

func TestResolveManagementAllowIPs_Literal(t *testing.T) {
	t.Parallel()
	got := resolveManagementAllowIPs(" 203.0.113.9 ")
	if len(got) != 1 || got[0] != "203.0.113.9" {
		t.Fatalf("got=%v", got)
	}
	got = resolveManagementAllowIPs("203.0.113.9:50051")
	if len(got) != 1 || got[0] != "203.0.113.9" {
		t.Fatalf("host:port got=%v", got)
	}
}

func TestResolveManagementAllowIPs_Empty(t *testing.T) {
	t.Parallel()
	if got := resolveManagementAllowIPs(""); got != nil {
		t.Fatalf("got=%v want nil", got)
	}
}
