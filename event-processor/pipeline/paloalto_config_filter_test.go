package pipeline

import (
	"path/filepath"
	"testing"

	"github.com/hivearmor/sdk/plugins"
)

// PAN-OS CONFIG log in CEF. Header pos 5 = CONFIG; extension carries the admin
// (suser), the source host (src), PanOSOpCode (the command), and the config
// path text in msg=.
const paConfigCEF = `Mar 1 20:48:22 host 4465 <14>1 2021-03-01T20:48:22.900Z host logforwarder - panwlogs - CEF:0|Palo Alto Networks|LF|2.0|CONFIG|0|3|rt=Mar 01 2021 20:48:21 src=10.0.0.9 suser=admin PanOSOpCode=set PanOSClient=Web msg=set rulebase security rules allow-any-any`

// PAN-OS CONFIG log in classic syslog CSV. Field order (Config Log Fields):
// FUTURE_USE(1), Receive Time(2), Serial(3), Type=CONFIG(4), Subtype(5),
// FUTURE_USE(6), Gen Time(7), Host(8), Vsys(9), Command(10), Admin(11),
// Client(12), Result(13), Configuration Path(14), ...
const paConfigCSV = `1,2020-10-13T01:12:03.000000Z,007051000113358,CONFIG,0,10.0,2020/10/13 01:12:03,10.0.0.9,vsys1,set,admin,Web,Succeeded,rulebase security rules allow-any-any,,,1234567890,0x0`

func paConfigExecute(raw string) *plugins.Event {
	Init(filepath.Join("..", "..", "filters", "paloalto"))
	return Execute(&plugins.Log{
		Id:         "pa-config-1",
		DataType:   "firewall-paloalto",
		DataSource: "test",
		TenantId:   "default",
		Raw:        raw,
		Timestamp:  "2026-09-13T09:55:00Z",
	})
}

func TestPaloAltoConfigCEF(t *testing.T) {
	ev := paConfigExecute(paConfigCEF)
	if ev == nil {
		t.Fatal("nil event")
	}
	if got := ev.Log["pa_type"].GetStringValue(); got != "CONFIG" {
		t.Errorf("pa_type = %q, want CONFIG", got)
	}
	if got := ev.Log["panOSOpCode"].GetStringValue(); got != "set" {
		t.Errorf("panOSOpCode = %q, want set", got)
	}
	if got := ev.Log["message"].GetStringValue(); got != "set rulebase security rules allow-any-any" {
		t.Errorf("message = %q, want the config-path text", got)
	}
	if ev.Origin.GetUser() != "admin" {
		t.Errorf("origin.user = %q, want admin", ev.Origin.GetUser())
	}
}

func TestPaloAltoConfigCSV(t *testing.T) {
	ev := paConfigExecute(paConfigCSV)
	if ev == nil {
		t.Fatal("nil event")
	}
	if got := ev.Log["pa_type"].GetStringValue(); got != "CONFIG" {
		t.Errorf("pa_type = %q, want CONFIG", got)
	}
	if got := ev.Log["panOSOpCode"].GetStringValue(); got != "set" {
		t.Errorf("panOSOpCode = %q, want set (Command field)", got)
	}
	if got := ev.Log["message"].GetStringValue(); got != "rulebase security rules allow-any-any" {
		t.Errorf("message = %q, want the Configuration Path text", got)
	}
	if ev.Origin.GetUser() != "admin" {
		t.Errorf("origin.user = %q, want admin (Admin field)", ev.Origin.GetUser())
	}
}
