package cis

import "testing"

func TestNormalizeStatus(t *testing.T) {
	cases := map[string]ControlStatus{
		"pass":          StatusPass,
		"fixed":         StatusPass,
		"fail":          StatusFail,
		"error":         StatusError,
		"notapplicable": StatusNotApplicable,
		"notchecked":    StatusNotChecked,
		"notselected":   StatusNotChecked,
		"informational": StatusNotChecked,
		"unknown":       StatusNotChecked,
		"":              StatusNotChecked,
		"garbage":       StatusNotChecked,
	}
	for in, want := range cases {
		if got := normalizeStatus(in); got != want {
			t.Fatalf("normalizeStatus(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestScanReport_Tally(t *testing.T) {
	r := &ScanReport{Results: []ControlResult{
		{Status: StatusPass}, {Status: StatusPass},
		{Status: StatusFail},
		{Status: StatusError},
		{Status: StatusNotApplicable},
		{Status: StatusNotChecked},
	}}
	pass, fail, errc, na, nc := r.Tally()
	if pass != 2 || fail != 1 || errc != 1 || na != 1 || nc != 1 {
		t.Fatalf("tally = %d/%d/%d/%d/%d", pass, fail, errc, na, nc)
	}
}

func TestSanitizeProfile(t *testing.T) {
	ok := []string{"CIS_Ubuntu_22.04_L1", "cis-win-2022-l1", "profile.v2"}
	for _, p := range ok {
		if sanitizeProfile(p) == "" {
			t.Fatalf("expected %q to be accepted", p)
		}
	}
	bad := []string{"../etc/passwd", "a/b", "a\\b", ".hidden", "a b", "a;rm", ""}
	for _, p := range bad {
		if sanitizeProfile(p) != "" {
			t.Fatalf("expected %q to be rejected", p)
		}
	}
}

func TestShortControlID(t *testing.T) {
	cases := map[string]string{
		"xccdf_org.ssgproject.content_rule_sshd_disable_root_login": "sshd_disable_root_login",
		"oval:com.example:def:123":                                  "123",
		"plain-id":                                                  "plain-id",
	}
	for in, want := range cases {
		if got := shortControlID(in); got != want {
			t.Fatalf("shortControlID(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestCapability_DefaultParsedOnlyOrEnforced(t *testing.T) {
	// Capability must be exactly one of the two honest values — never fabricated.
	c := Capability()
	if c != "enforced" && c != "parsed-only" {
		t.Fatalf("capability must be enforced|parsed-only, got %q", c)
	}
}
