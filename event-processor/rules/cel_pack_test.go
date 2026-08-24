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
	// 5251–5300 (pack ≥100)
	"CEL-WIN-FAILED-LOGON",
	"CEL-WIN-ACCOUNT-LOCKOUT",
	"CEL-WIN-PASSWORD-RESET",
	"CEL-WIN-KERBEROS-TGS",
	"CEL-WIN-DCSYNC",
	"CEL-WIN-WEVTUTIL-CLEAR",
	"CEL-WIN-CMSTP",
	"CEL-WIN-INSTALLUTIL",
	"CEL-WIN-MSIEXEC-REMOTE",
	"CEL-WIN-NLTEST",
	"CEL-WIN-ADFIND",
	"CEL-WIN-IMPACKET",
	"CEL-WIN-NGROK",
	"CEL-WIN-FIREWALL-ADD",
	"CEL-WIN-RUN-KEY",
	"CEL-WIN-COMSVCS-DUMP",
	"CEL-WIN-AT-JOB",
	"CEL-WIN-WHOAMI-PRIV",
	"CEL-WIN-WMIC-SHADOW",
	"CEL-WIN-BCDEDIT",
	"CEL-LIN-REVSHELL-BASH",
	"CEL-LIN-REVSHELL-PY",
	"CEL-LIN-NETCAT",
	"CEL-LIN-LD-PRELOAD",
	"CEL-LIN-SETUID",
	"CEL-LIN-USERADD",
	"CEL-LIN-IPTABLES-FLUSH",
	"CEL-LIN-HISTORY-CLEAR",
	"CEL-LIN-INSMOD",
	"CEL-LIN-TMP-ELF",
	"CEL-NET-C2-PORTS",
	"CEL-NET-HTTP-TO-IP",
	"CEL-NET-DNS-DGA",
	"CEL-NET-LDAP-ENUM",
	"CEL-NET-SMB-OUTBOUND",
	"CEL-NET-IRC",
	"CEL-NET-SUSPICIOUS-UA",
	"CEL-NET-PORT-SCAN",
	"CEL-AWS-DELETE-TRAIL",
	"CEL-AWS-S3-ACL-PUBLIC",
	"CEL-AWS-CREATE-USER",
	"CEL-AWS-UPDATE-ASSUME",
	"CEL-AWS-GET-SECRET",
	"CEL-AWS-RUN-INSTANCES",
	"CEL-AZURE-APP-ROLE",
	"CEL-AZURE-SP-CRED",
	"CEL-AZURE-GUEST-INVITE",
	"CEL-AZURE-DIR-ROLE",
	"CEL-AZURE-PURGE",
	"CEL-AZURE-KEYVAULT",
}

func TestCelPack_loadsHundredRules(t *testing.T) {
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
	if report.Loaded < 100 {
		t.Fatalf("expected at least 100 CEL rules, loaded=%d skipped=%d invalid=%v", report.Loaded, report.Skipped, report.Invalid)
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
	if len(celPackRuleNames) < 100 {
		t.Fatalf("celPackRuleNames must list at least 100 rules, got %d", len(celPackRuleNames))
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
