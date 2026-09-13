package pipeline

import (
	"path/filepath"
	"testing"

	"github.com/hivearmor/sdk/plugins"
)

// PAN-OS CORRELATION log in CEF. Header pos 5 = CORRELATION; extension carries
// src, PanOSThreatCategory, and the correlation verdict text in msg=.
const paCorrelationCEF = `Mar 1 20:48:22 host 4465 <14>1 2021-03-01T20:48:22.900Z host logforwarder - panwlogs - CEF:0|Palo Alto Networks|LF|2.0|CORRELATION|correlation|4|rt=Mar 01 2021 20:48:21 src=10.0.0.44 PanOSThreatCategory=compromised-host PanOSObjectName=compromised-host msg=Compromised host detected beaconing to known command and control`

// PAN-OS CORRELATION log in classic syslog CSV. Field order (Correlated Events
// Log Fields): FUTURE_USE(1), Receive Time(2), Serial(3), Type=CORRELATION(4),
// Subtype(5), FUTURE_USE(6), Gen Time(7), Source Address(8), Source User(9),
// Vsys(10), Category(11), Severity(12), dg1-4(13-16), Vsys Name(17),
// Device Name(18), Vsys ID(19), Object Name(20), Object ID(21), Evidence(22).
const paCorrelationCSV = `1,2020-10-13T01:12:03.000000Z,007051000113358,CORRELATION,correlation,10.0,2020/10/13 01:12:03,10.0.0.44,jdoe,vsys1,compromised-host,critical,0,0,0,0,vsys1,fw01,1,compromised-host,6001,Host visited known malware URL (19 times)`

func paCorrExecute(raw string) *plugins.Event {
	Init(filepath.Join("..", "..", "filters", "paloalto"))
	return Execute(&plugins.Log{
		Id:         "pa-corr-1",
		DataType:   "firewall-paloalto",
		DataSource: "test",
		TenantId:   "default",
		Raw:        raw,
		Timestamp:  "2026-09-13T09:50:00Z",
	})
}

func TestPaloAltoCorrelationCEF(t *testing.T) {
	ev := paCorrExecute(paCorrelationCEF)
	if ev == nil {
		t.Fatal("nil event")
	}
	if got := ev.Log["pa_type"].GetStringValue(); got != "CORRELATION" {
		t.Errorf("pa_type = %q, want CORRELATION", got)
	}
	if got := ev.Log["panOSThreatCategory"].GetStringValue(); got != "compromised-host" {
		t.Errorf("panOSThreatCategory = %q, want compromised-host", got)
	}
	if got := ev.Log["message"].GetStringValue(); got != "Compromised host detected beaconing to known command and control" {
		t.Errorf("message = %q, want the correlation verdict text", got)
	}
	if ev.Origin.GetIp() != "10.0.0.44" {
		t.Errorf("origin.ip = %q, want 10.0.0.44", ev.Origin.GetIp())
	}
}

func TestPaloAltoCorrelationCSV(t *testing.T) {
	ev := paCorrExecute(paCorrelationCSV)
	if ev == nil {
		t.Fatal("nil event")
	}
	if got := ev.Log["pa_type"].GetStringValue(); got != "CORRELATION" {
		t.Errorf("pa_type = %q, want CORRELATION", got)
	}
	if got := ev.Log["panOSThreatCategory"].GetStringValue(); got != "compromised-host" {
		t.Errorf("panOSThreatCategory = %q, want compromised-host (CSV Category field)", got)
	}
	// Evidence (field 22) is the correlation verdict text -> message.
	if got := ev.Log["message"].GetStringValue(); got != "Host visited known malware URL (19 times)" {
		t.Errorf("message = %q, want the Evidence text", got)
	}
	if ev.Origin.GetIp() != "10.0.0.44" {
		t.Errorf("origin.ip = %q, want 10.0.0.44", ev.Origin.GetIp())
	}
}
