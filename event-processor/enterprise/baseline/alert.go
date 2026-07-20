package baseline

import (
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/threatwinds/go-sdk/plugins"
)

// BuildAnomalyAlert constructs a standard ANOMALY alert for the given event.
func BuildAnomalyAlert(event *plugins.Event) *plugins.Alert {
	state, _ := GetBaseline(event.DataSource, event.Action)
	threshold := state.Mean + 3*state.StdDev

	alert := &plugins.Alert{
		Id:         uuid.New().String(),
		Timestamp:  time.Now().UTC().Format(time.RFC3339Nano),
		Name:       fmt.Sprintf("Anomalous activity: %s on %s", event.Action, event.DataSource),
		Category:   "ANOMALY",
		Severity:   "2",
		DataType:   event.DataType,
		DataSource: event.DataSource,
		TenantId:   event.TenantId,
		TenantName: event.TenantName,
		Description: fmt.Sprintf(
			"Event rate deviates from 30-day baseline (mean=%.1f/hr, stddev=%.1f, threshold=%.1f/hr)",
			state.Mean, state.StdDev, threshold,
		),
		DeduplicateBy: []string{"dataSource", "action"},
		Events:        []*plugins.Event{event},
	}
	if event.Origin != nil {
		alert.Adversary = event.Origin
	}
	if event.Target != nil {
		alert.Target = event.Target
	}
	return alert
}
