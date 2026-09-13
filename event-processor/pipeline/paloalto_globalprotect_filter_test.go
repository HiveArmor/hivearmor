package pipeline

import (
	"path/filepath"
	"testing"

	"github.com/hivearmor/sdk/plugins"
)

// PAN-OS GLOBALPROTECT log in CEF. Header positions 5/6 are Type/Subtype
// (GLOBALPROTECT/...); the extension carries PanOSEventStatus, msg, and the
// client public IP (src / PanOSPublicIP).
const paGlobalProtectCEF = `Mar 1 20:48:22 host 4465 <14>1 2021-03-01T20:48:22.900Z host logforwarder - panwlogs - CEF:0|Palo Alto Networks|LF|2.0|GLOBALPROTECT|globalprotect|3|rt=Mar 01 2021 20:48:21 PanOSStage=login PanOSAuthMethod=LDAP suser=jdoe src=198.51.100.77 PanOSEventStatus=failure PanOSPortal=gp-portal.example.com msg=GlobalProtect gateway authentication failed for user jdoe`

// PAN-OS GLOBALPROTECT log in classic syslog CSV. Field order (GlobalProtect
// Log Fields): FUTURE_USE, Receive Time, Serial, Type(GLOBALPROTECT), Subtype,
// FUTURE_USE, Gen Time, Vsys, Event ID(9), Stage(10), Auth Method(11),
// Tunnel Type(12), Source User(13), Source Region(14), Machine Name(15),
// Public IP(16), Public IPv6(17), Private IP(18), Private IPv6(19), Host ID(20),
// Serial(21), Client Ver(22), Client OS(23), Client OS Ver(24), Repeat Cnt(25),
// Reason(26), Error(27), Description(28), Status(29), Location(30),
// Login Duration(31), Connect Method(32), Error Code(33), Portal(34), ...
const paGlobalProtectCSV = `1,2020-10-13T01:12:03.000000Z,007051000113358,GLOBALPROTECT,globalprotect,10.0,2020/10/13 01:12:03,vsys1,gateway-auth,login,LDAP,SSLVPN,jdoe,US,LAPTOP-01,198.51.100.77,,10.1.1.5,,hostid123,serial123,6.0.1,Windows,10,1,invalid-credentials,auth-error,GlobalProtect gateway authentication failed for user jdoe,failure,office,0,on-demand,1,gp-portal.example.com,1234567890,0x0`

func paGpExecute(raw string) *plugins.Event {
	Init(filepath.Join("..", "..", "filters", "paloalto"))
	return Execute(&plugins.Log{
		Id:         "pa-gp-1",
		DataType:   "firewall-paloalto",
		DataSource: "test",
		TenantId:   "default",
		Raw:        raw,
		Timestamp:  "2026-09-13T09:30:00Z",
	})
}

func TestPaloAltoGlobalProtectCEF(t *testing.T) {
	ev := paGpExecute(paGlobalProtectCEF)
	if ev == nil {
		t.Fatal("nil event")
	}
	if got := ev.Log["pa_type"].GetStringValue(); got != "GLOBALPROTECT" {
		t.Errorf("pa_type = %q, want GLOBALPROTECT", got)
	}
	if got := ev.Log["panOSEventStatus"].GetStringValue(); got != "failure" {
		t.Errorf("panOSEventStatus = %q, want failure", got)
	}
	if got := ev.Log["message"].GetStringValue(); got != "GlobalProtect gateway authentication failed for user jdoe" {
		t.Errorf("message = %q, want the GP auth-failed text", got)
	}
	if ev.Origin.GetIp() != "198.51.100.77" {
		t.Errorf("origin.ip = %q, want 198.51.100.77", ev.Origin.GetIp())
	}
}

func TestPaloAltoGlobalProtectCSV(t *testing.T) {
	ev := paGpExecute(paGlobalProtectCSV)
	if ev == nil {
		t.Fatal("nil event")
	}
	if got := ev.Log["pa_type"].GetStringValue(); got != "GLOBALPROTECT" {
		t.Errorf("pa_type = %q, want GLOBALPROTECT", got)
	}
	if got := ev.Log["panOSEventStatus"].GetStringValue(); got != "failure" {
		t.Errorf("panOSEventStatus = %q, want failure", got)
	}
	if got := ev.Log["message"].GetStringValue(); got != "GlobalProtect gateway authentication failed for user jdoe" {
		t.Errorf("message = %q, want the GP Description text", got)
	}
	if ev.Origin.GetIp() != "198.51.100.77" {
		t.Errorf("origin.ip (Public IP) = %q, want 198.51.100.77", ev.Origin.GetIp())
	}
}
