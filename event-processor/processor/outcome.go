package processor

import (
	"fmt"

	"github.com/hivearmor/sdk/plugins"
)

// ProcessingOutcome is the typed result of analyzing a raw log. Durable writes
// are not performed during analysis; callers persist required outputs before
// acknowledging the source (Kafka offset or engine-socket ack).
type ProcessingOutcome struct {
	Event    *plugins.Event
	Alerts   []*plugins.Alert
	Filtered bool
	Warnings []string
	Err      error
}

// RequiredStore persists the event and every required alert before commit.
type RequiredStore interface {
	WriteEvent(event *plugins.Event) error
	WriteAlert(alert *plugins.Alert) error
}

// PersistRequired writes the normalized event and every required alert.
// Filtered outcomes are a successful no-op. Optional enrichments are not
// written here. Event write is idempotent by event ID; alert IDs are
// deterministic per (event, rule) so retries do not create duplicates.
func PersistRequired(outcome ProcessingOutcome, store RequiredStore) error {
	if outcome.Err != nil {
		return outcome.Err
	}
	if outcome.Filtered || outcome.Event == nil {
		return nil
	}
	if store == nil {
		return fmt.Errorf("required persist: store is nil")
	}
	if err := store.WriteEvent(outcome.Event); err != nil {
		return fmt.Errorf("required event write: %w", err)
	}
	for _, alert := range outcome.Alerts {
		if alert == nil {
			continue
		}
		if err := store.WriteAlert(alert); err != nil {
			return fmt.Errorf("required alert write: %w", err)
		}
	}
	return nil
}
