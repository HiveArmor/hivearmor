package pipeline

import (
	"path/filepath"
	"testing"

	"github.com/hivearmor/sdk/plugins"
)

// PAN-OS SYSTEM log in CEF (Strata Logging Service wrapper). Header positions
// 5/6 are Type/Subtype (SYSTEM/general); the extension carries PanOSEventID,
// PanOSSeverity, and the human text in msg=.
const paSystemCEF = `Mar 1 20:48:22 host 4465 <14>1 2021-03-01T20:48:22.900Z host logforwarder - panwlogs - CEF:0|Palo Alto Networks|LF|2.0|SYSTEM|general|3|rt=Mar 01 2021 20:48:21 deviceExternalId=013201000123 PanOSEventID=auth-fail PanOSSeverity=high src=198.51.100.50 PanOSModule=auth msg=failed authentication for user admin via web login`

// PAN-OS SYSTEM log in classic syslog CSV. Field order (System Log Fields):
// FUTURE_USE, Receive Time, Serial, Type(SYSTEM), Subtype, FUTURE_USE, Gen Time,
// Virtual System, Event ID, Object, FUTURE_USE, FUTURE_USE, Module, Severity, Description, ...
const paSystemCSV = `1,2020-10-13T01:12:03.000000Z,007051000113358,SYSTEM,general,10.0,2020/10/13 01:12:03,vsys1,auth-fail,,,,auth,high,failed authentication for user admin from 198.51.100.50,1234567890,0x0`

func paSystemExecute(raw string) *plugins.Event {
	Init(filepath.Join("..", "..", "filters", "paloalto"))
	return Execute(&plugins.Log{
		Id:         "pa-system-1",
		DataType:   "firewall-paloalto",
		DataSource: "test",
		TenantId:   "default",
		Raw:        raw,
		Timestamp:  "2026-09-13T09:00:00Z",
	})
}

func TestPaloAltoSystemCEF(t *testing.T) {
	ev := paSystemExecute(paSystemCEF)
	if ev == nil {
		t.Fatal("nil event")
	}
	want := map[string]string{
		"pa_type":       "SYSTEM",
		"pa_subtype":    "general",
		"severityLabel": "high",
		"panOSEventID":  "auth-fail",
		"message":       "failed authentication for user admin via web login",
	}
	for k, v := range want {
		if got := ev.Log[k].GetStringValue(); got != v {
			t.Errorf("log.%s = %q, want %q", k, got, v)
		}
	}
	if ev.Origin.GetIp() != "198.51.100.50" {
		t.Errorf("origin.ip = %q, want 198.51.100.50", ev.Origin.GetIp())
	}
}

func TestPaloAltoSystemCSV(t *testing.T) {
	ev := paSystemExecute(paSystemCSV)
	if ev == nil {
		t.Fatal("nil event")
	}
	want := map[string]string{
		"pa_type":       "SYSTEM",
		"pa_subtype":    "general",
		"severityLabel": "high",
		"panOSEventID":  "auth-fail",
		"message":       "failed authentication for user admin from 198.51.100.50",
	}
	for k, v := range want {
		if got := ev.Log[k].GetStringValue(); got != v {
			t.Errorf("log.%s = %q, want %q", k, got, v)
		}
	}
}

// Regression: msg= as the FIRST token of the CEF extension must still be
// stripped cleanly (the {{.rest}} zero-width prefix case). A {{.data}} prefix
// could not match the empty string before msg= and left "msg=" in the value.
func TestPaloAltoSystemMsgAtExtensionStart(t *testing.T) {
	raw := `Mar 1 20:48:22 h 1 <14>1 2021-03-01T20:48:22.900Z h logforwarder - panwlogs - CEF:0|Palo Alto Networks|LF|2.0|SYSTEM|ha|4|msg=HA1 link down peer unreachable PanOSEventID=ha-link-down PanOSSeverity=critical`
	ev := paSystemExecute(raw)
	if ev == nil {
		t.Fatal("nil event")
	}
	if got := ev.Log["message"].GetStringValue(); got != "HA1 link down peer unreachable" {
		t.Errorf("message = %q, want %q", got, "HA1 link down peer unreachable")
	}
	if got := ev.Log["panOSEventID"].GetStringValue(); got != "ha-link-down" {
		t.Errorf("panOSEventID = %q, want %q", got, "ha-link-down")
	}
	if got := ev.Log["severityLabel"].GetStringValue(); got != "critical" {
		t.Errorf("severityLabel = %q, want %q", got, "critical")
	}
}
