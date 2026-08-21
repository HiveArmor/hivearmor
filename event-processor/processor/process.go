package processor

import (
	"context"
	"fmt"
	"log"

	"github.com/hivearmor/sdk/plugins"

	"github.com/hivearmor/event-processor/compliance"
	"github.com/hivearmor/event-processor/config"
	"github.com/hivearmor/event-processor/enrichment"
	"github.com/hivearmor/event-processor/enterprise/baseline"
	"github.com/hivearmor/event-processor/enterprise/lookup"
	"github.com/hivearmor/event-processor/enterprise/offense"
	"github.com/hivearmor/event-processor/enterprise/sequence"
	"github.com/hivearmor/event-processor/pipeline"
	rulesengine "github.com/hivearmor/event-processor/rules"
	"github.com/hivearmor/event-processor/writer"
)

// Analyze parses, enriches and evaluates detection rules. It does not write to
// OpenSearch and does not acknowledge the transport source.
func Analyze(logMsg *plugins.Log) ProcessingOutcome {
	event := pipeline.Execute(logMsg)
	if event == nil {
		return ProcessingOutcome{Filtered: true}
	}
	if err := BindTenant(event); err != nil {
		return ProcessingOutcome{Event: event, Err: err}
	}

	lookup.Enrich(event)
	enrichment.EnrichEvent(eventDataMap(event))

	alerts := rulesengine.Evaluate(event)
	return ProcessingOutcome{Event: event, Alerts: alerts}
}

// BindTenant resolves event.TenantPrefix from TenantId before detection and persist.
// Empty TenantId stays unscoped (global daily index). Lookup errors fail closed.
func BindTenant(event *plugins.Event) error {
	if event == nil {
		return nil
	}
	if err := plugins.ResolveAndSetTenantPrefix(context.Background(), event); err != nil {
		return fmt.Errorf("tenant prefix resolve failed")
	}
	return nil
}

// DefaultStore returns the OpenSearch required-output store. Nil until writers
// are initialised is still a typed failure at persist time.
func DefaultStore() RequiredStore {
	return writer.OpenSearchStore{
		URL:  config.OpenSearchURL(),
		User: config.OpenSearchUser,
		Pass: config.OpenSearchPass,
	}
}

// PersistAndOptional persists required outputs then runs non-blocking optional
// work (offense, compliance, sequence, baseline). Optional failures are
// warnings and must not affect the commit boundary.
func PersistAndOptional(outcome ProcessingOutcome, store RequiredStore) error {
	if err := PersistRequired(outcome, store); err != nil {
		return err
	}
	RunOptionalSideEffects(outcome)
	return nil
}

// RunOptionalSideEffects starts detached optional pipelines. Callers must
// invoke this only after required persist succeeded.
func RunOptionalSideEffects(outcome ProcessingOutcome) {
	if outcome.Filtered || outcome.Event == nil {
		return
	}
	for _, alert := range outcome.Alerts {
		go offense.Process(alert)
	}
	if hits := compliance.Evaluate(outcome.Event); len(hits) > 0 {
		go compliance.WriteComplianceEvidence(hits)
	}
	sequence.Process(outcome.Event)
	baseline.EvaluateEvent(outcome.Event)
}

// ProcessLog is the compatibility wrapper for non-Kafka callers. It analyzes,
// persists required outputs, then runs optional work. Prefer Analyze plus an
// explicit persist at a commit boundary.
func ProcessLog(logMsg *plugins.Log) *plugins.Event {
	outcome := Analyze(logMsg)
	if err := PersistRequired(outcome, DefaultStore()); err != nil {
		log.Printf("processor: required persist failed id=%s: %v", logID(logMsg), err)
		return outcome.Event
	}
	RunOptionalSideEffects(outcome)
	return outcome.Event
}

func logID(logMsg *plugins.Log) string {
	if logMsg == nil {
		return ""
	}
	return logMsg.Id
}

func eventDataMap(e *plugins.Event) map[string]any {
	m := map[string]any{}
	if e.Origin != nil {
		m["origin"] = map[string]any{"ip": e.Origin.Ip}
	}
	if e.Target != nil {
		m["target"] = map[string]any{"ip": e.Target.Ip}
	}
	return m
}
