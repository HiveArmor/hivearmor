package processor

import (
	"context"
	"errors"
	"testing"

	"github.com/hivearmor/sdk/plugins"
)

type fakeStore struct {
	events    int
	alerts    int
	failEvent error
	failAlert error
	eventIDs  []string
	alertIDs  []string
}

func (f *fakeStore) WriteEvent(event *plugins.Event) error {
	if f.failEvent != nil {
		return f.failEvent
	}
	f.events++
	if event != nil {
		f.eventIDs = append(f.eventIDs, event.Id)
	}
	return nil
}

func (f *fakeStore) WriteAlert(alert *plugins.Alert) error {
	if f.failAlert != nil {
		return f.failAlert
	}
	f.alerts++
	if alert != nil {
		f.alertIDs = append(f.alertIDs, alert.Id)
	}
	return nil
}

func TestPersistRequired_filteredIsNoop(t *testing.T) {
	store := &fakeStore{}
	if err := PersistRequired(ProcessingOutcome{Filtered: true}, store); err != nil {
		t.Fatalf("filtered persist: %v", err)
	}
	if store.events != 0 || store.alerts != 0 {
		t.Fatalf("expected no writes, got events=%d alerts=%d", store.events, store.alerts)
	}
}

func TestPersistRequired_eventFailureDoesNotWriteAlerts(t *testing.T) {
	store := &fakeStore{failEvent: errors.New("opensearch down")}
	err := PersistRequired(ProcessingOutcome{
		Event:  &plugins.Event{Id: "evt-1"},
		Alerts: []*plugins.Alert{{Id: "alert-1"}},
	}, store)
	if err == nil {
		t.Fatal("expected event write error")
	}
	if store.events != 0 || store.alerts != 0 {
		t.Fatalf("crash-point: no durable writes on event failure, got events=%d alerts=%d", store.events, store.alerts)
	}
}

func TestPersistRequired_alertFailureAfterEventWrite(t *testing.T) {
	store := &fakeStore{failAlert: errors.New("alert index 500")}
	err := PersistRequired(ProcessingOutcome{
		Event:  &plugins.Event{Id: "evt-2"},
		Alerts: []*plugins.Alert{{Id: "alert-2"}},
	}, store)
	if err == nil {
		t.Fatal("expected alert write error so the offset is not committed")
	}
	if store.events != 1 {
		t.Fatalf("event must be written before alerts, got events=%d", store.events)
	}
	if store.alerts != 0 {
		t.Fatalf("failed alert write must not count as success, got alerts=%d", store.alerts)
	}
}

func TestPersistRequired_successWritesEventAndAlerts(t *testing.T) {
	store := &fakeStore{}
	err := PersistRequired(ProcessingOutcome{
		Event:  &plugins.Event{Id: "evt-3"},
		Alerts: []*plugins.Alert{{Id: "alert-3a"}, {Id: "alert-3b"}},
	}, store)
	if err != nil {
		t.Fatalf("persist: %v", err)
	}
	if store.events != 1 || store.alerts != 2 {
		t.Fatalf("got events=%d alerts=%d", store.events, store.alerts)
	}
}

func TestPersistRequired_nilStoreErrors(t *testing.T) {
	err := PersistRequired(ProcessingOutcome{Event: &plugins.Event{Id: "evt-4"}}, nil)
	if err == nil {
		t.Fatal("expected nil-store error")
	}
}

func TestBindTenantResolvesRegisteredPrefix(t *testing.T) {
	plugins.RegisterAgentPrefixLookup(func(_ context.Context, agentID string) (string, error) {
		if agentID == "1" {
			return "acme", nil
		}
		return "", nil
	})
	t.Cleanup(func() { plugins.RegisterAgentPrefixLookup(nil) })

	event := &plugins.Event{Id: "evt-tenant", TenantId: "1"}
	if err := BindTenant(event); err != nil {
		t.Fatalf("BindTenant: %v", err)
	}
	if event.TenantPrefix != "acme" {
		t.Fatalf("TenantPrefix = %q, want acme", event.TenantPrefix)
	}
}

func TestBindTenantEmptyTenantIdStaysUnscoped(t *testing.T) {
	event := &plugins.Event{Id: "evt-global"}
	if err := BindTenant(event); err != nil {
		t.Fatalf("BindTenant: %v", err)
	}
	if event.TenantPrefix != "" {
		t.Fatalf("empty TenantId must not invent a prefix, got %q", event.TenantPrefix)
	}
}
