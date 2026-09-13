package pipeline

import (
	"path/filepath"
	"testing"

	"github.com/hivearmor/sdk/plugins"
)

// Real Palo Alto Networks THREAT log in CEF format, taken verbatim from the
// Strata Logging Service "Threat CEF Fields" reference (network-threat-cef-fields).
// Note the real syslog wrapper: "... logforwarder - panwlogs - CEF:0|Palo Alto Networks|LF|2.0|THREAT|spyware|1|<ext>"
// src/dst filled in with routable IPs (the doc redacts them as "xxx").
const paThreatCEF = `Mar 1 20:48:22 gke-standard-cluster-2-default-pool-2c7fa720-sw0m 4465 <14>1 2021-03-01T20:48:22.900Z stream-logfwd20-587718190-03011242-xynu-harness-l80k logforwarder - panwlogs - CEF:0|Palo Alto Networks|LF|2.0|THREAT|spyware|1|rt=Mar 01 2021 20:48:21 deviceExternalId=013201000123 PanOSApplicationCategory=general-internet src=198.51.100.24 dst=203.0.113.9 dntdom=paloaltonetwork duser=jdoe PanOSSeverity=high suser=asmith cat=Adware sig cs1=deny-attackers app=sina-weibo-base proto=tcp act=drop-all request=some other fake filename PanOSThreatID=27379(27379) PanOSThreatCategory=spyware spt=13884 dpt=4228`

// Real Palo Alto Networks THREAT log in classic PAN-OS syslog CSV format.
// Field order per the PAN-OS "Threat Log Fields" reference:
// FUTURE_USE, ReceiveTime, Serial, Type(THREAT), Subtype, FUTURE_USE, GeneratedTime,
// Source Address, Destination Address, NAT Src, NAT Dst, Rule, Source User, Dest User,
// Application, Virtual System, Source Zone, Dest Zone, Inbound If, Outbound If, Log Action,
// FUTURE_USE, Session ID, Repeat Count, Source Port, Dest Port, NAT Src Port, NAT Dst Port,
// Flags, Protocol, Action, URL/Filename, ThreatID, Category, Severity, Direction, ...
const paThreatCSV = `1,2020-10-13T01:12:03.000000Z,007051000113358,THREAT,url,10.0,2020/10/13 01:12:03,198.51.100.24,203.0.113.9,0.0.0.0,0.0.0.0,allow-all,jdoe,,web-browsing,vsys1,trust,untrust,ethernet1/1,ethernet1/2,forward-all,,12345,1,54321,443,0,0,0x400000,tcp,block-url,evil.example.com/malware,(9999),malware,high,client-to-server,1234567890`

func paThreatExecute(raw string) *plugins.Event {
	Init(filepath.Join("..", "..", "filters", "paloalto"))
	return Execute(&plugins.Log{
		Id:         "pa-threat-1",
		DataType:   "firewall-paloalto",
		DataSource: "test",
		TenantId:   "default",
		Raw:        raw,
		Timestamp:  "2026-09-13T08:00:00Z",
	})
}

func TestPaloAltoThreatCEF(t *testing.T) {
	ev := paThreatExecute(paThreatCEF)
	if ev == nil {
		t.Fatal("nil event")
	}
	want := map[string]string{
		"pa_type":       "THREAT",
		"pa_subtype":    "spyware",
		"severityLabel": "high",
		"act":           "drop-all",
		"pa_threatid":   "27379(27379)",
		"category":      "spyware",
	}
	for k, v := range want {
		got := ev.Log[k].GetStringValue()
		if got != v {
			t.Errorf("log.%s = %q, want %q", k, got, v)
		}
	}
	if ev.Origin.GetIp() != "198.51.100.24" {
		t.Errorf("origin.ip = %q, want 198.51.100.24", ev.Origin.GetIp())
	}
	if ev.Target.GetIp() != "203.0.113.9" {
		t.Errorf("target.ip = %q, want 203.0.113.9", ev.Target.GetIp())
	}
}

func TestPaloAltoThreatCSV(t *testing.T) {
	ev := paThreatExecute(paThreatCSV)
	if ev == nil {
		t.Fatal("nil event")
	}
	want := map[string]string{
		"pa_type":       "THREAT",
		"pa_subtype":    "url",
		"severityLabel": "high",
		"act":           "block-url",
		"category":      "malware",
	}
	for k, v := range want {
		got := ev.Log[k].GetStringValue()
		if got != v {
			t.Errorf("log.%s = %q, want %q", k, got, v)
		}
	}
	if ev.Origin.GetIp() != "198.51.100.24" {
		t.Errorf("origin.ip = %q, want 198.51.100.24", ev.Origin.GetIp())
	}
	if ev.Target.GetIp() != "203.0.113.9" {
		t.Errorf("target.ip = %q, want 203.0.113.9", ev.Target.GetIp())
	}
}
