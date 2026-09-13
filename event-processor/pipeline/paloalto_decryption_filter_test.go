package pipeline

import (
	"path/filepath"
	"testing"

	"github.com/hivearmor/sdk/plugins"
)

// PAN-OS DECRYPTION log in CEF. Header pos 5 = DECRYPTION; the extension
// carries src/dst, PanOSEventStatus, and the human text in msg=.
const paDecryptionCEF = `Mar 1 20:48:22 host 4465 <14>1 2021-03-01T20:48:22.900Z host logforwarder - panwlogs - CEF:0|Palo Alto Networks|LF|2.0|DECRYPTION|decryption|3|rt=Mar 01 2021 20:48:21 src=10.0.0.8 dst=203.0.113.50 proto=tcp PanOSEventStatus=error PanOSRootStatus=Untrusted msg=TLS decryption failed unsupported cipher suite`

// PAN-OS DECRYPTION log in classic syslog CSV. Field order (Decryption Syslog
// default): FUTURE_USE(1), Receive Time(2), Serial(3), FUTURE_USE(4),
// Type=DECRYPTION(5), Config Ver(6), Gen Time(7), Source Address(8),
// Destination Address(9), NAT Src(10), NAT Dst(11), Rule(12), ... note Type is
// at field 5 (field 4 is empty), unlike THREAT/SYSTEM where Type is field 4.
// error fields are far downstream; root_status(64)/chain_status(65) carry the
// decryption failure signal.
const paDecryptionCSV = `1,2020-10-13T01:11:23.000000Z,007051000113358,,DECRYPTION,10.0,2020-10-13T01:11:05.000000Z,10.0.0.8,203.0.113.50,0.0.0.0,0.0.0.0,deny-attackers,,jdoe,ssl,vsys1,trust,untrust,,,rs-logging,,999250,1,28790,443,,,tcp,allow,GRE,,,,,,,,,TLS1.3,ECDHE,AES_128_GCM,SHA256,,sect409k1,decrypt-policy,,,,,,,,,,,,,,,decrypt-policy,sect409k1,3,Untrusted,Uninspected,Broker`

func paDecExecute(raw string) *plugins.Event {
	Init(filepath.Join("..", "..", "filters", "paloalto"))
	return Execute(&plugins.Log{
		Id:         "pa-dec-1",
		DataType:   "firewall-paloalto",
		DataSource: "test",
		TenantId:   "default",
		Raw:        raw,
		Timestamp:  "2026-09-13T09:40:00Z",
	})
}

func TestPaloAltoDecryptionCEF(t *testing.T) {
	ev := paDecExecute(paDecryptionCEF)
	if ev == nil {
		t.Fatal("nil event")
	}
	if got := ev.Log["pa_type"].GetStringValue(); got != "DECRYPTION" {
		t.Errorf("pa_type = %q, want DECRYPTION", got)
	}
	if got := ev.Log["panOSEventStatus"].GetStringValue(); got != "error" {
		t.Errorf("panOSEventStatus = %q, want error", got)
	}
	if got := ev.Log["message"].GetStringValue(); got != "TLS decryption failed unsupported cipher suite" {
		t.Errorf("message = %q, want the decrypt-failed text", got)
	}
	if ev.Origin.GetIp() != "10.0.0.8" {
		t.Errorf("origin.ip = %q, want 10.0.0.8", ev.Origin.GetIp())
	}
	if ev.Target.GetIp() != "203.0.113.50" {
		t.Errorf("target.ip = %q, want 203.0.113.50", ev.Target.GetIp())
	}
}

func TestPaloAltoDecryptionCSV(t *testing.T) {
	ev := paDecExecute(paDecryptionCSV)
	if ev == nil {
		t.Fatal("nil event")
	}
	if got := ev.Log["pa_type"].GetStringValue(); got != "DECRYPTION" {
		t.Errorf("pa_type = %q, want DECRYPTION", got)
	}
	if ev.Origin.GetIp() != "10.0.0.8" {
		t.Errorf("origin.ip = %q, want 10.0.0.8", ev.Origin.GetIp())
	}
	if ev.Target.GetIp() != "203.0.113.50" {
		t.Errorf("target.ip = %q, want 203.0.113.50", ev.Target.GetIp())
	}
	// The rule keys on the decryption failure signal; root_status "Untrusted"
	// is surfaced as panOSEventStatus so the rule's regexMatch (fail|error)
	// against the status OR the message can fire on a real cert failure.
	if got := ev.Log["panOSRootStatus"].GetStringValue(); got != "Untrusted" {
		t.Errorf("panOSRootStatus = %q, want Untrusted", got)
	}
}
