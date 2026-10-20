//go:build linux

package cis

import (
	"os"
	"path/filepath"
	"testing"
)

// A minimal but realistic XCCDF TestResult wrapper as oscap --results emits, with a
// datastream-style namespace and rule-result rows. The parser must be namespace-
// agnostic (match on local name "TestResult") and extract every rule-result.
const sampleXccdf = `<?xml version="1.0" encoding="UTF-8"?>
<arf:asset-report-collection xmlns:arf="http://scap.nist.gov/schema/asset-reporting-format/1.1"
    xmlns="http://checklists.nist.gov/xccdf/1.2">
  <reports>
    <report>
      <content>
        <TestResult id="xccdf_org.open-scap_testresult_cis">
          <rule-result idref="xccdf_org.ssgproject.content_rule_sshd_disable_root_login" severity="high">
            <result>fail</result>
          </rule-result>
          <rule-result idref="xccdf_org.ssgproject.content_rule_password_max_days" severity="medium">
            <result>pass</result>
          </rule-result>
          <rule-result idref="xccdf_org.ssgproject.content_rule_na_check" severity="low">
            <result>notapplicable</result>
          </rule-result>
          <rule-result idref="xccdf_org.ssgproject.content_rule_err_check">
            <result>error</result>
          </rule-result>
        </TestResult>
      </content>
    </report>
  </reports>
</arf:asset-report-collection>`

func TestParseXccdfResults_RealSample(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "results.xml")
	if err := os.WriteFile(path, []byte(sampleXccdf), 0o600); err != nil {
		t.Fatalf("write sample: %v", err)
	}

	report, err := parseXccdfResults(path)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(report.Results) != 4 {
		t.Fatalf("expected 4 rule-results, got %d", len(report.Results))
	}

	pass, fail, errc, na, _ := report.Tally()
	if pass != 1 || fail != 1 || errc != 1 || na != 1 {
		t.Fatalf("tally = pass %d fail %d err %d na %d", pass, fail, errc, na)
	}

	// Control id is the readable tail; severity + status map through.
	first := report.Results[0]
	if first.ControlID != "sshd_disable_root_login" {
		t.Fatalf("controlId = %q", first.ControlID)
	}
	if first.Status != StatusFail || first.Severity != "high" {
		t.Fatalf("first result = %q sev %q", first.Status, first.Severity)
	}
}

func TestParseXccdfResults_EmptyIsError(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "empty.xml")
	if err := os.WriteFile(path, []byte(`<?xml version="1.0"?><root/>`), 0o600); err != nil {
		t.Fatalf("write: %v", err)
	}
	if _, err := parseXccdfResults(path); err == nil {
		t.Fatal("expected error for results file with no rule-results")
	}
}
