package processor

import (
	"github.com/threatwinds/go-sdk/plugins"

	"github.com/hivearmor/event-processor/compliance"
	"github.com/hivearmor/event-processor/enrichment"
	"github.com/hivearmor/event-processor/enterprise/lookup"
	"github.com/hivearmor/event-processor/enterprise/offense"
	rulesengine "github.com/hivearmor/event-processor/rules"
	"github.com/hivearmor/event-processor/pipeline"
	"github.com/hivearmor/event-processor/writer"
)

// ProcessLog runs a received log through the full pipeline: parse → enrich → write → correlate → compliance.
// Returns the produced Event (nil if the log was filtered/dropped).
func ProcessLog(log *plugins.Log) *plugins.Event {
	event := pipeline.Execute(log)
	if event == nil {
		return nil
	}

	lookup.Enrich(event)
	enrichment.EnrichEvent(eventDataMap(event))

	writer.WriteEvent(event)

	alerts := rulesengine.Evaluate(event)
	for _, alert := range alerts {
		writer.WriteAlert(alert)
		go offense.Process(alert)
	}

	if hits := compliance.Evaluate(event); len(hits) > 0 {
		go compliance.WriteComplianceEvidence(hits)
	}

	return event
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
