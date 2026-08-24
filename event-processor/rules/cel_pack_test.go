package rules

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func builtinRulesDir(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("caller")
	}
	return filepath.Join(filepath.Dir(file), "..", "builtin-rules")
}

var celPackRuleNames = []string{
	// 5201–5215 (original pack)
	"CEL-WIN-ENCODED-PS",
	"CEL-WIN-SCHED-TASK",
	"CEL-WIN-SCHTASKS-CREATE",
	"CEL-WIN-CLEAR-EVENTLOG",
	"CEL-WIN-EXPLICIT-CREDS",
	"CEL-WIN-NEW-SERVICE",
	"CEL-LIN-CURL-BASH",
	"CEL-LIN-SUDOERS-CRON",
	"CEL-LIN-SSH-ROOT",
	"CEL-AWS-ROOT-CONSOLE",
	"CEL-AWS-CLOUDTRAIL-STOP",
	"CEL-AWS-IAM-ACCESS-KEY",
	"CEL-AWS-SG-OPEN-WORLD",
	"CEL-AZURE-MFA-DISABLED",
	"CEL-AZURE-CA-DISABLED",
	// 5216–5250 (expansion)
	"CEL-WIN-RDP-LOGON",
	"CEL-WIN-SPECIAL-PRIVS",
	"CEL-WIN-USER-CREATED",
	"CEL-WIN-GROUP-ADD",
	"CEL-WIN-LSASS-ACCESS",
	"CEL-WIN-MIMIKATZ",
	"CEL-WIN-CERTUTIL-DL",
	"CEL-WIN-BITSADMIN",
	"CEL-WIN-WMIC-PROCESS",
	"CEL-WIN-REGSVR32-SCROBJ",
	"CEL-WIN-MSHTA-HTTP",
	"CEL-WIN-PSEXEC",
	"CEL-WIN-VSSADMIN-DELETE",
	"CEL-WIN-PROCDUMP-LSASS",
	"CEL-WIN-RUNDLL32-JS",
	"CEL-WIN-NET-USER-ADD",
	"CEL-WIN-DISABLE-DEFENDER",
	"CEL-WIN-POWERSHELL-IEX",
	"CEL-LIN-DOCKER-PRIV",
	"CEL-LIN-CHMOD-777",
	"CEL-LIN-SSH-AUTHKEYS",
	"CEL-LIN-CRONTAB-UNUSUAL",
	"CEL-LIN-BASE64-SHELL",
	"CEL-NET-DNS-TUNNEL",
	"CEL-NET-DNS-TOR",
	"CEL-NET-DNS-SUSPICIOUS",
	"CEL-AWS-DISABLE-KEY",
	"CEL-AWS-S3-PUBLIC-BLOCK",
	"CEL-AWS-ASSUME-ROLE",
	"CEL-AWS-ATTACH-ADMIN",
	"CEL-AWS-CREATE-LOGIN",
	"CEL-AZURE-ROLE-ASSIGN",
	"CEL-AZURE-PRIV-ROLE",
	"CEL-AZURE-DIAG-DELETED",
	"CEL-AZURE-FED-IDENTITY",
}

func TestCelPack_loadsFiftyRules(t *testing.T) {
	snapshotRules(t)
	root := builtinRulesDir(t)
	dirs := []string{
		filepath.Join(root, "windows"),
		filepath.Join(root, "linux"),
		filepath.Join(root, "network"),
		filepath.Join(root, "cloud", "aws"),
		filepath.Join(root, "cloud", "azure"),
	}

	tmp, err := os.MkdirTemp("", "cel-pack-*")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(tmp) })

	for _, dir := range dirs {
		entries, err := os.ReadDir(dir)
		if err != nil {
			t.Fatalf("read %s: %v", dir, err)
		}
		for _, e := range entries {
			if e.IsDir() {
				continue
			}
			name := e.Name()
			if !strings.HasPrefix(name, "cel-") {
				continue
			}
			src := filepath.Join(dir, name)
			data, err := os.ReadFile(src)
			if err != nil {
				t.Fatalf("read %s: %v", src, err)
			}
			if err := os.WriteFile(filepath.Join(tmp, name), data, 0o644); err != nil {
				t.Fatalf("copy %s: %v", name, err)
			}
		}
	}

	report := LoadFromDir(tmp)
	if report.Loaded < 50 {
		t.Fatalf("expected at least 50 CEL rules, loaded=%d skipped=%d invalid=%v", report.Loaded, report.Skipped, report.Invalid)
	}
	if len(report.Invalid) > 0 {
		t.Fatalf("CEL pack compile errors: %v", report.Invalid)
	}

	loaded := map[string]struct{}{}
	for _, dt := range []string{
		"powershell", "process", "wineventlog", "windows", "windows-etw",
		"linux", "syslog", "aws", "cloudtrail", "azure", "azuread",
		"dns", "netconn", "netflow",
	} {
		for _, r := range GetRules(dt) {
			if r != nil {
				loaded[r.Name] = struct{}{}
			}
		}
	}
	for _, name := range celPackRuleNames {
		if _, ok := loaded[name]; !ok {
			t.Errorf("missing CEL rule %s", name)
		}
	}
	if len(celPackRuleNames) < 50 {
		t.Fatalf("celPackRuleNames must list at least 50 rules, got %d", len(celPackRuleNames))
	}
}

func TestCelPack_doesNotBreakPilotPack(t *testing.T) {
	snapshotRules(t)
	report := LoadFromDir(pilotDir(t))
	if !report.PilotPackOK {
		t.Fatalf("pilot pack missing=%v invalid=%v", report.PilotMissing, report.Invalid)
	}
	for _, name := range celPackRuleNames {
		if containsRuleName(GetRules("windows"), name) ||
			containsRuleName(GetRules("linux"), name) ||
			containsRuleName(GetRules("aws"), name) ||
			containsRuleName(GetRules("azure"), name) ||
			containsRuleName(GetRules("dns"), name) ||
			containsRuleName(GetRules("netconn"), name) {
			t.Fatalf("pilot-only load must not include CEL pack rule %s", name)
		}
	}
}

func containsRuleName(rules []*Rule, name string) bool {
	for _, r := range rules {
		if r != nil && r.Name == name {
			return true
		}
	}
	return false
}
