package compliance

import (
	"encoding/json"
	"log"
	"strconv"
	"time"

	"github.com/threatwinds/go-sdk/plugins"
)

// ComplianceHit is produced when an event satisfies a ControlMapping's CEL condition.
type ComplianceHit struct {
	MappingID             int64
	ControlID             int64
	MappingType           string
	EventID               string
	Timestamp             string
	Weight                float64
	EvidenceRetentionDays int
	DataType              string
	TenantID              string
}

// Evaluate tests the event against all loaded compliance mappings and returns
// a hit for every mapping whose CEL condition evaluates to true.
func Evaluate(event *plugins.Event) []ComplianceHit {
	if event == nil {
		return nil
	}

	mappings := GetMappings()
	if len(mappings) == 0 {
		return nil
	}

	// Serialize once; the SDK CEL cache expects a JSON string pointer.
	eventMap := eventToMap(event)
	eventJSON, err := json.Marshal(eventMap)
	if err != nil {
		log.Printf("[compliance.Evaluate] marshal error event=%s: %v", event.Id, err)
		return nil
	}
	eventStr := string(eventJSON)

	cel := getCEL()
	var hits []ComplianceHit

	for _, m := range mappings {
		if !matchesDataType(m.DataTypes, event.DataType) {
			continue
		}

		ok, evalErr := cel.Evaluate(&eventStr, m.CelCondition)
		if evalErr != nil {
			// Log at most once per minute per (mapping, condition) pair to avoid flooding.
			log.Printf("[compliance.Evaluate] CEL error mappingId=%d: %v", m.ID, evalErr)
			continue
		}
		if !ok {
			continue
		}

		ts := event.Timestamp
		if ts == "" {
			ts = time.Now().UTC().Format(time.RFC3339Nano)
		}

		hits = append(hits, ComplianceHit{
			MappingID:             m.ID,
			ControlID:             m.ControlID,
			MappingType:           m.MappingType,
			EventID:               event.Id,
			Timestamp:             ts,
			Weight:                m.Weight,
			EvidenceRetentionDays: m.EvidenceRetentionDays,
			DataType:              event.DataType,
			TenantID:              event.TenantId,
		})
	}
	return hits
}

// matchesDataType returns true when the mapping has no data-type filter or the
// event's dataType appears in the filter list.
func matchesDataType(filter []string, dataType string) bool {
	if len(filter) == 0 {
		return true
	}
	for _, dt := range filter {
		if dt == dataType {
			return true
		}
	}
	return false
}

// eventToMap produces a map for CEL evaluation. It exposes fields both under the
// new pipeline format (dataType, log.*, origin.*, target.*) and under the legacy
// logx.* namespace so that compliance CEL conditions written for the old
// UTMStack format (logx.dataType, logx.winlog.event_id, etc.) work as-is.
func eventToMap(e *plugins.Event) map[string]any {
	logMap := map[string]any{}
	for k, v := range e.Log {
		if v != nil {
			logMap[k] = v.AsInterface()
		}
	}

	m := map[string]any{
		"id":           e.Id,
		"@timestamp":   e.Timestamp,
		"dataType":     e.DataType,
		"dataSource":   e.DataSource,
		"raw":          e.Raw,
		"action":       e.Action,
		"actionResult": e.ActionResult,
		"severity":     e.Severity,
		"protocol":     e.Protocol,
		"log":          logMap,
	}

	if e.Origin != nil {
		m["origin"] = sideToMap(e.Origin)
	}
	if e.Target != nil {
		m["target"] = sideToMap(e.Target)
	}

	// Legacy logx.* namespace: maps compliance CEL conditions written for the old
	// UTMStack format.  logx.dataType and logx.winlog mirror the parsed event fields.
	// event_id must be int64 because CEL conditions compare it with integer literals.
	var eventID any = logMap["eventCode"]
	if s, ok := eventID.(string); ok {
		if n, err := strconv.ParseInt(s, 10, 64); err == nil {
			eventID = n
		}
	}
	winlogMap := map[string]any{
		"event_id": eventID,
		"event_data": map[string]any{
			"CommandLine":    logMap["eventDataCommandLine"],
			"NewProcessName": logMap["eventDataNewProcessName"],
			"Status":         logMap["eventDataStatus"],
		},
	}
	// Merge all log.* fields directly into logx.winlog too, so CEL conditions that
	// reference arbitrary winlog sub-fields can still evaluate.
	for k, v := range logMap {
		if _, exists := winlogMap[k]; !exists {
			winlogMap[k] = v
		}
	}
	m["logx"] = map[string]any{
		"dataType": e.DataType,
		"winlog":   winlogMap,
	}

	return m
}

func sideToMap(s *plugins.Side) map[string]any {
	m := map[string]any{
		"ip":      s.Ip,
		"host":    s.Host,
		"user":    s.User,
		"domain":  s.Domain,
		"process": s.Process,
		"command": s.Command,
	}
	if s.Geolocation != nil {
		m["geolocation"] = map[string]any{
			"country":     s.Geolocation.Country,
			"city":        s.Geolocation.City,
			"countryCode": s.Geolocation.CountryCode,
		}
	}
	return m
}
