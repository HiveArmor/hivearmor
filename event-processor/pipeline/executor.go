package pipeline

import (
	"time"

	"github.com/hivearmor/event-processor/pipeline/operators"
	"github.com/threatwinds/go-sdk/plugins"
	"google.golang.org/protobuf/types/known/structpb"
)

// Execute runs the filter pipeline for the log's dataType and returns a
// normalized Event. Returns nil if a drop step fires.
func Execute(log *plugins.Log) *plugins.Event {
	data := map[string]any{
		"raw":        log.Raw,
		"dataType":   log.DataType,
		"dataSource": log.DataSource,
	}

	blocks := GetBlocks(log.DataType)
	for _, block := range blocks {
		for _, step := range block.Steps {
			// Check top-level where
			where := step.Where
			if where != "" && !EvalWhere(where, data) {
				continue
			}

			switch {
			case step.JSON != nil:
				if step.JSON.Where == "" || EvalWhere(step.JSON.Where, data) {
					operators.JSONOp(step.JSON.Source, data)
				}

			case step.Grok != nil:
				g := step.Grok
				if g.Where == "" || EvalWhere(g.Where, data) {
					defs := make([]operators.GrokPatternDef, len(g.Patterns))
					for i, p := range g.Patterns {
						defs[i] = operators.GrokPatternDef{FieldName: p.FieldName, Pattern: p.Pattern}
					}
					operators.GrokOp(defs, g.Source, data)
				}

			case step.Rename != nil:
				r := step.Rename
				if r.Where == "" || EvalWhere(r.Where, data) {
					operators.RenameOp(r.From, r.To, data)
				}

			case step.Add != nil:
				a := step.Add
				if a.Where == "" || EvalWhere(a.Where, data) {
					operators.AddOp(a.Params.Key, a.Params.Value, data)
				}

			case step.Cast != nil:
				c := step.Cast
				if c.Where == "" || EvalWhere(c.Where, data) {
					operators.CastOp(c.Fields, c.To, data)
				}

			case step.Trim != nil:
				t := step.Trim
				if t.Where == "" || EvalWhere(t.Where, data) {
					operators.TrimOp(t.Function, t.Substring, t.Fields, data)
				}

			case step.Drop != nil:
				// Where may be set at step level (already checked above) or inside the drop block.
				if step.Drop.Where == "" || EvalWhere(step.Drop.Where, data) {
					return nil
				}

			case step.Delete != nil:
				d := step.Delete
				if d.Where == "" || EvalWhere(d.Where, data) {
					operators.DeleteOp(d.Fields, data)
				}

			case step.KV != nil:
				operators.KVOp(step.KV.FieldSplit, step.KV.ValueSplit, data)

			case step.Dynamic != nil:
				dyn := step.Dynamic
				if dyn.Where == "" || EvalWhere(dyn.Where, data) {
					operators.DynamicOp(dyn.Plugin, dyn.Params, data)
				}
			}
		}
	}

	return buildEvent(log, data)
}

func buildEvent(log *plugins.Log, data map[string]any) *plugins.Event {
	event := &plugins.Event{
		Id:         log.Id,
		Timestamp:  log.Timestamp,
		DeviceTime: log.Timestamp,
		DataType:   log.DataType,
		DataSource: log.DataSource,
		TenantId:   log.TenantId,
		TenantName: log.TenantId,
		Raw:        log.Raw,
	}
	if event.Timestamp == "" {
		event.Timestamp = time.Now().UTC().Format(time.RFC3339Nano)
	}

	// Promote standard schema fields
	logMap, _ := data["log"].(map[string]any)
	if logMap == nil {
		logMap = map[string]any{}
	}

	// Convert log map to structpb
	event.Log = make(map[string]*structpb.Value)
	for k, v := range logMap {
		if sv, err := structpb.NewValue(v); err == nil {
			event.Log[k] = sv
		}
	}

	// Promote origin/target
	event.Origin = buildSide(data, "origin")
	event.Target = buildSide(data, "target")

	// Scalar fields
	event.Action = getString(data, "action")
	event.ActionResult = getString(data, "actionResult")
	event.Severity = getString(data, "severity")
	event.Protocol = getString(data, "protocol")
	event.ConnectionStatus = getString(data, "connectionStatus")

	return event
}

func buildSide(data map[string]any, key string) *plugins.Side {
	m, ok := data[key].(map[string]any)
	if !ok {
		return nil
	}
	side := &plugins.Side{}
	if v, ok := m["ip"].(string); ok {
		side.Ip = v
	}
	if v, ok := m["host"].(string); ok {
		side.Host = v
	}
	if v, ok := m["user"].(string); ok {
		side.User = v
	}
	if v, ok := m["domain"].(string); ok {
		side.Domain = v
	}
	if v, ok := m["process"].(string); ok {
		side.Process = v
	}
	if v, ok := m["command"].(string); ok {
		side.Command = v
	}
	// geolocation
	if geo, ok := m["geolocation"].(map[string]any); ok {
		side.Geolocation = &plugins.Geolocation{}
		if v, ok := geo["country"].(string); ok {
			side.Geolocation.Country = v
		}
		if v, ok := geo["city"].(string); ok {
			side.Geolocation.City = v
		}
		if v, ok := geo["countryCode"].(string); ok {
			side.Geolocation.CountryCode = v
		}
		if v, ok := geo["asn"].(uint64); ok {
			side.Geolocation.Asn = v
		} else if v, ok := geo["asn"].(float64); ok {
			side.Geolocation.Asn = uint64(v)
		}
		if v, ok := geo["aso"].(string); ok {
			side.Geolocation.Aso = v
		}
	}
	return side
}

func getString(data map[string]any, key string) string {
	v, ok := data[key]
	if !ok {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}
