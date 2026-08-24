package writer

import (
	"strings"
	"testing"

	"github.com/hivearmor/sdk/plugins"
	"google.golang.org/protobuf/types/known/structpb"
)

func TestEventToDocKeepsParsedFieldsUnderCanonicalLogObject(t *testing.T) {
	event := &plugins.Event{
		Id:       "event-1",
		DataType: "powershell",
		Log: map[string]*structpb.Value{
			"scriptBlock":       structpb.NewStringValue("Get-Process"),
			"pid":               structpb.NewNumberValue(4104),
			"log.explicitField": structpb.NewStringValue("explicit"),
			"asset.hostname":    structpb.NewStringValue("FIN-WKS-044"),
		},
	}

	doc := eventToDoc(event)
	logObject, ok := doc["log"].(map[string]any)
	if !ok {
		t.Fatalf("expected canonical log object, got %#v", doc["log"])
	}
	if got := logObject["scriptBlock"]; got != "Get-Process" {
		t.Fatalf("expected log.scriptBlock, got %#v", got)
	}
	if got := logObject["pid"]; got != float64(4104) {
		t.Fatalf("expected log.pid, got %#v", got)
	}
	if got := logObject["explicitField"]; got != "explicit" {
		t.Fatalf("expected explicitly prefixed log field, got %#v", got)
	}
	if got := doc["asset.hostname"]; got != "FIN-WKS-044" {
		t.Fatalf("expected dotted enrichment field to remain compatible, got %#v", got)
	}
	if _, leaked := doc["scriptBlock"]; leaked {
		t.Fatal("parsed log field leaked into the OpenSearch document root")
	}
}

func TestAlertToDocPublishesCanonicalDetectionAndEventAliases(t *testing.T) {
	alert := &plugins.Alert{
		Id:         "alert-1",
		Category:   "Execution",
		Technique:  "T1059.001 - PowerShell",
		DataSource: "FIN-WKS-044 (agent-e2e)",
		Events: []*plugins.Event{
			{Id: "event-1"},
		},
	}

	doc := alertToDoc(alert)
	if got := doc["mitreTechniqueId"]; got != "T1059.001" {
		t.Fatalf("expected canonical ATT&CK technique ID, got %#v", got)
	}
	if got := doc["mitreTechniqueName"]; got != "PowerShell" {
		t.Fatalf("expected canonical ATT&CK technique name, got %#v", got)
	}
	if got := doc["mitre.technique.id"]; got != "T1059.001" {
		t.Fatalf("expected flattened mitre.technique.id, got %#v", got)
	}
	if got := doc["mitre.technique.name"]; got != "PowerShell" {
		t.Fatalf("expected flattened mitre.technique.name, got %#v", got)
	}
	if got := doc["mitre.tactic"]; got != "Execution" {
		t.Fatalf("expected flattened mitre.tactic from category, got %#v", got)
	}
	if got := doc["dataSources"].([]string); len(got) != 1 || got[0] != alert.DataSource {
		t.Fatalf("expected canonical dataSources, got %#v", got)
	}
	if got := doc["sourceEventIds"].([]string); len(got) != 1 || got[0] != "event-1" {
		t.Fatalf("expected canonical sourceEventIds, got %#v", got)
	}
	if got := doc["eventIds"].([]string); len(got) != 1 || got[0] != "event-1" {
		t.Fatalf("expected compatibility eventIds, got %#v", got)
	}
}

func TestEventIndexUsesTenantPrefixNotDataType(t *testing.T) {
	event := &plugins.Event{DataType: "syslog", TenantPrefix: "acme"}
	idx := EventIndex(event)
	if !strings.HasPrefix(idx, "v3-hive-log-acme-") {
		t.Fatalf("tenant log index = %q, want v3-hive-log-acme-DATE", idx)
	}
	if strings.Contains(idx, "syslog") {
		t.Fatalf("dataType must stay a document field, got index %q", idx)
	}
}

func TestEventIndexEmptyPrefixFallsBackToGlobalDaily(t *testing.T) {
	idx := EventIndex(&plugins.Event{DataType: "powershell"})
	if !strings.HasPrefix(idx, "v3-hive-log-") {
		t.Fatalf("unscoped log index = %q", idx)
	}
	if strings.Contains(idx, "powershell") || strings.Contains(idx, "acme") {
		t.Fatalf("unscoped log index must be v3-hive-log-DATE, got %q", idx)
	}
}

func TestAlertIndexUsesEventTenantPrefix(t *testing.T) {
	alert := &plugins.Alert{
		Events: []*plugins.Event{{TenantPrefix: "acme"}},
	}
	idx := AlertIndex(alert)
	if !strings.HasPrefix(idx, "v3-hive-alert-acme-") {
		t.Fatalf("tenant alert index = %q", idx)
	}
}

func TestAlertToDocCoercesStringSeverity(t *testing.T) {
	doc := alertToDoc(&plugins.Alert{Severity: "2"})
	if got := doc["severity"]; got != 2 {
		t.Fatalf("severity = %#v, want int 2", got)
	}
	doc = alertToDoc(&plugins.Alert{Severity: "2", ImpactScore: 6})
	if got := doc["riskScore"]; got != uint32(6) {
		t.Fatalf("riskScore = %#v, want 6", got)
	}
}
