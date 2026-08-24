package agent

import (
	"strings"
	"testing"
)

func TestIsEdrFirewallRuleName(t *testing.T) {
	t.Parallel()
	cases := []struct {
		in   string
		want bool
	}{
		{"EDR_ALLOW_LOOPBACK", true},
		{"EDR_ALLOWED_172.31.17.117", true},
		{"EDR_ALLOWED_OUT_10.0.0.5", true},
		{" EDR_ALLOWED_1.2.3.4 ", true},
		{"BLOCK_ALL", false},
		{"", false},
		{"edr_allowed_1.2.3.4", false},
	}
	for _, tc := range cases {
		if got := isEdrFirewallRuleName(tc.in); got != tc.want {
			t.Errorf("isEdrFirewallRuleName(%q)=%v want %v", tc.in, got, tc.want)
		}
	}
}

func TestExtractEdrFirewallRuleNames(t *testing.T) {
	t.Parallel()
	// Representative netsh advfirewall firewall show rule name=all snippet.
	// The old findstr|for path fed the whole "Rule Name: ..." line into delete.
	show := "" +
		"\r\n" +
		"Rule Name:                            EDR_ALLOW_LOOPBACK\r\n" +
		"----------------------------------------------------------------------\r\n" +
		"Enabled:                              Yes\r\n" +
		"Direction:                            In\r\n" +
		"Profiles:                             Domain,Private,Public\r\n" +
		"Grouping:                             \r\n" +
		"LocalIP:                              127.0.0.1\r\n" +
		"RemoteIP:                             Any\r\n" +
		"Protocol:                             Any\r\n" +
		"Edge traversal:                       No\r\n" +
		"Action:                               Allow\r\n" +
		"\r\n" +
		"Rule Name:                            EDR_ALLOWED_172.31.17.117\r\n" +
		"----------------------------------------------------------------------\r\n" +
		"Enabled:                              Yes\r\n" +
		"Direction:                            In\r\n" +
		"RemoteIP:                             172.31.17.117\r\n" +
		"Action:                               Allow\r\n" +
		"\r\n" +
		"Rule Name:                            EDR_ALLOWED_OUT_172.31.17.117\r\n" +
		"----------------------------------------------------------------------\r\n" +
		"Enabled:                              Yes\r\n" +
		"Direction:                            Out\r\n" +
		"RemoteIP:                             172.31.17.117\r\n" +
		"Action:                               Allow\r\n" +
		"\r\n" +
		"Rule Name:                            Core Networking - Destination Unreachable (ICMPv6-In)\r\n" +
		"----------------------------------------------------------------------\r\n" +
		"Enabled:                              Yes\r\n" +
		"Direction:                            In\r\n" +
		"Action:                               Allow\r\n" +
		"\r\n" +
		// Duplicate Rule Name line (netsh may list the same name twice for multi-profile).
		"Rule Name:                            EDR_ALLOWED_172.31.17.117\r\n"

	got := extractEdrFirewallRuleNames(show)
	want := []string{
		"EDR_ALLOW_LOOPBACK",
		"EDR_ALLOWED_172.31.17.117",
		"EDR_ALLOWED_OUT_172.31.17.117",
	}
	if len(got) != len(want) {
		t.Fatalf("len=%d want %d; got=%v", len(got), len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("got[%d]=%q want %q (full=%v)", i, got[i], want[i], got)
		}
	}
}

func TestExtractEdrFirewallRuleNames_IgnoresFindstrStyleLines(t *testing.T) {
	t.Parallel()
	// Lines that findstr "EDR_ALLOWED" would match but are not bare rule names.
	poison := strings.Join([]string{
		`Rule Name:                            EDR_ALLOWED_10.0.0.1`,
		`RemoteIP:                             10.0.0.1`,
		`Some noise mentioning EDR_ALLOWED_should_not_match`,
	}, "\n")
	got := extractEdrFirewallRuleNames(poison)
	if len(got) != 1 || got[0] != "EDR_ALLOWED_10.0.0.1" {
		t.Fatalf("got=%v want [EDR_ALLOWED_10.0.0.1]", got)
	}
}

func TestExtractEdrFirewallRuleNames_Empty(t *testing.T) {
	t.Parallel()
	if got := extractEdrFirewallRuleNames(""); len(got) != 0 {
		t.Fatalf("got=%v want empty", got)
	}
	if got := extractEdrFirewallRuleNames("Rule Name:                            Allow Me\n"); len(got) != 0 {
		t.Fatalf("got=%v want empty", got)
	}
}

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
