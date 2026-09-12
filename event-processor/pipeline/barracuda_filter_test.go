package pipeline

import (
	"path/filepath"
	"testing"

	"github.com/hivearmor/sdk/plugins"
)

// Sample CEF lines are adapted from the Barracuda WAF documentation and the Cyderes
// parser knowledge base (docs.cyderes.cloud/parser-knowledge-base/barracuda_waf).

func baExecute(raw string) *plugins.Event {
	filtersDir := filepath.Join("..", "..", "filters", "barracuda")
	Init(filtersDir)
	return Execute(&plugins.Log{
		Id:         "ba-test-1",
		DataType:   "barracuda-waf",
		DataSource: "waf",
		TenantId:   "default",
		Raw:        raw,
		Timestamp:  "2026-09-12T08:00:00Z",
	})
}

// Traffic (TR) access-log CEF event: single-token fields + a spaced User-Agent value.
func TestBarracudaTrafficCEF(t *testing.T) {
	raw := `CEF:0|BarracudaNetworks|WAAS|BNWAS-1.0|WAF|WAF|4| cat=TR dvc=10.1.1.1 src=10.1.1.5 spt=52758 dhost=website.com outcome=200 requestMethod=POST request=/api/notifications requestClientApplication=Mozilla/5.0 (Windows NT 10.0) like Gecko cs2Label=Protected cs2=PROTECTED cs6Label=WFMatched cs6=VALID`
	event := baExecute(raw)
	if event == nil {
		t.Fatal("expected the Barracuda traffic event to be retained")
	}
	if event.Origin == nil || event.Origin.Ip != "10.1.1.5" {
		t.Fatalf("expected src->origin.ip, got %+v", event.Origin)
	}
	if event.Target == nil || event.Target.Host != "website.com" {
		t.Fatalf("expected dhost->target.host, got %+v", event.Target)
	}
	if got := event.Log["baLogType"].GetStringValue(); got != "TR" {
		t.Fatalf("expected cat->baLogType TR, got %q", got)
	}
	if got := event.Log["baHttpStatus"].GetStringValue(); got != "200" {
		t.Fatalf("expected outcome->baHttpStatus, got %q", got)
	}
	if got := event.Log["baRequestUrl"].GetStringValue(); got != "/api/notifications" {
		t.Fatalf("expected request->baRequestUrl, got %q", got)
	}
	// requestClientApplication has spaces and is followed by ' cs2Label=' — must be fully captured
	if got := event.Log["baUserAgent"].GetStringValue(); got != "Mozilla/5.0 (Windows NT 10.0) like Gecko" {
		t.Fatalf("expected spaced requestClientApplication fully captured, got %q", got)
	}
	if got := event.Log["cs6"].GetStringValue(); got != "VALID" {
		t.Fatalf("expected single-token cs6 via kv, got %q", got)
	}
}

// Web Firewall (WF) event with a spaced msg at end-of-line.
func TestBarracudaWebFirewallMsgEol(t *testing.T) {
	raw := `CEF:0|BarracudaNetworks|WAAS|BNWAS-1.0|WAF|WAF|4| cat=WF dvc=10.1.1.1 src=203.0.113.9 spt=34006 dst=10.1.1.2 dpt=443 requestMethod=POST outcome=403 msg=SQL Injection in URL blocked by global rule`
	event := baExecute(raw)
	if event == nil {
		t.Fatal("expected the Barracuda web-firewall event to be retained")
	}
	if event.Origin == nil || event.Origin.Ip != "203.0.113.9" {
		t.Fatalf("expected src->origin.ip, got %+v", event.Origin)
	}
	if got := event.Log["baLogType"].GetStringValue(); got != "WF" {
		t.Fatalf("expected cat->baLogType WF, got %q", got)
	}
	if got := event.Log["message"].GetStringValue(); got != "SQL Injection in URL blocked by global rule" {
		t.Fatalf("expected end-of-line spaced msg fully captured, got %q", got)
	}
	if got := event.Log["name"].GetStringValue(); got != "WAF" {
		t.Fatalf("expected CEF header name, got %q", got)
	}
}
