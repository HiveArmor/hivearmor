// Package offense correlates alerts that share an observed adversary within a bounded window.
//
// Canonical findings are written to v3-hive-correlation-*. A legacy offense projection is
// dual-written temporarily for consumers that have not yet migrated from /api/offenses.
package offense

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/hivearmor/event-processor/internal/httpclient"
	sdkos "github.com/hivearmor/sdk/os"
	"github.com/hivearmor/sdk/plugins"
)

const (
	minAlerts      = 3
	windowDuration = 2 * time.Hour
)

type alertReference struct {
	ID        string
	Timestamp string
	EventIDs  []string
}

var (
	oclient    *http.Client
	oOSURL     string
	oOSUser    string
	oOSPass    string
	ocInitOnce sync.Once
)

// Init configures the correlation writer.
func Init(osURL, user, pass string) {
	ocInitOnce.Do(func() {
		oOSURL = osURL
		oOSUser = user
		oOSPass = pass
		client, err := httpclient.NewSecureClient(10 * time.Second)
		if err != nil {
			panic(err)
		}
		oclient = client
	})
}

// Process checks whether a new alert creates or updates a canonical finding.
func Process(alert *plugins.Alert) {
	if oOSURL == "" || alert == nil || alert.Adversary == nil {
		return
	}
	adversaryIP := strings.TrimSpace(alert.Adversary.Ip)
	adversaryUser := strings.TrimSpace(alert.Adversary.User)
	if adversaryIP == "" && adversaryUser == "" {
		return
	}

	related := findRelatedAlerts(adversaryIP, adversaryUser, alert.TenantId)
	allAlerts := uniqueAlertReferences(related, alert)
	if len(allAlerts) < minAlerts {
		return
	}

	findingID := findExistingFinding(adversaryIP, adversaryUser, alert.TenantId)
	if findingID == "" {
		findingID = uuid.New().String()
	}

	writeFinding(findingID, alert, allAlerts)
}

func findRelatedAlerts(ip, user, tenantID string) []alertReference {
	var should []map[string]any
	if ip != "" {
		should = append(should, map[string]any{"term": map[string]any{"adversary.ip.keyword": ip}})
	}
	if user != "" {
		should = append(should, map[string]any{"term": map[string]any{"adversary.user.keyword": user}})
	}
	must := []map[string]any{{
		"range": map[string]any{"@timestamp": map[string]any{"gte": "now-2h"}},
	}}
	if tenantID != "" {
		must = append(must, tenantTerm(tenantID))
	}
	query := map[string]any{
		"query": map[string]any{"bool": map[string]any{
			"should": should, "must": must, "minimum_should_match": 1,
		}},
		"_source": []string{"id", "@timestamp", "sourceEventIds", "eventIds"},
		"size":    100,
	}
	body, _ := json.Marshal(query)
	req, _ := http.NewRequest("POST", oOSURL+"/v3-hive-alert-*/_search", bytes.NewReader(body))
	req.SetBasicAuth(oOSUser, oOSPass)
	req.Header.Set("Content-Type", "application/json")
	resp, err := oclient.Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()

	var result struct {
		Hits struct {
			Hits []struct {
				ID     string `json:"_id"`
				Source struct {
					ID             string   `json:"id"`
					Timestamp      string   `json:"@timestamp"`
					SourceEventIDs []string `json:"sourceEventIds"`
					EventIDs       []string `json:"eventIds"`
				} `json:"_source"`
			} `json:"hits"`
		} `json:"hits"`
	}
	if json.NewDecoder(resp.Body).Decode(&result) != nil {
		return nil
	}
	refs := make([]alertReference, 0, len(result.Hits.Hits))
	for _, hit := range result.Hits.Hits {
		id := hit.Source.ID
		if id == "" {
			id = hit.ID
		}
		if id != "" {
			eventIDs := hit.Source.SourceEventIDs
			if len(eventIDs) == 0 {
				eventIDs = hit.Source.EventIDs
			}
			refs = append(refs, alertReference{ID: id, Timestamp: hit.Source.Timestamp, EventIDs: eventIDs})
		}
	}
	return refs
}

func findExistingFinding(ip, user, tenantID string) string {
	var should []map[string]any
	if ip != "" {
		should = append(should, map[string]any{"term": map[string]any{"adversary.ip.keyword": ip}})
	}
	if user != "" {
		should = append(should, map[string]any{"term": map[string]any{"adversary.user.keyword": user}})
	}
	must := []map[string]any{{
		"range": map[string]any{"updatedAt": map[string]any{"gte": fmt.Sprintf("now-%s", windowDuration)}},
	}}
	if tenantID != "" {
		must = append(must, tenantTerm(tenantID))
	}
	query := map[string]any{
		"query": map[string]any{"bool": map[string]any{
			"should": should, "minimum_should_match": 1, "must": must,
		}},
		"_source": []string{"id"},
		"sort":    []map[string]any{{"updatedAt": map[string]any{"order": "desc"}}},
		"size":    1,
	}
	body, _ := json.Marshal(query)
	req, _ := http.NewRequest("POST", oOSURL+"/v3-hive-correlation-*/_search", bytes.NewReader(body))
	req.SetBasicAuth(oOSUser, oOSPass)
	req.Header.Set("Content-Type", "application/json")
	resp, err := oclient.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()

	var result struct {
		Hits struct {
			Hits []struct {
				ID     string `json:"_id"`
				Source struct {
					ID string `json:"id"`
				} `json:"_source"`
			} `json:"hits"`
		} `json:"hits"`
	}
	if json.NewDecoder(resp.Body).Decode(&result) != nil || len(result.Hits.Hits) == 0 {
		return ""
	}
	if result.Hits.Hits[0].Source.ID != "" {
		return result.Hits.Hits[0].Source.ID
	}
	return result.Hits.Hits[0].ID
}

func uniqueAlertReferences(related []alertReference, trigger *plugins.Alert) []alertReference {
	byID := make(map[string]alertReference, len(related)+1)
	for _, ref := range related {
		if ref.ID != "" {
			byID[ref.ID] = ref
		}
	}
	if trigger != nil && trigger.Id != "" {
		byID[trigger.Id] = alertReference{ID: trigger.Id, Timestamp: alertEvidenceTimestamp(trigger), EventIDs: alertEventIDs(trigger)}
	}
	refs := make([]alertReference, 0, len(byID))
	for _, ref := range byID {
		refs = append(refs, ref)
	}
	sort.Slice(refs, func(i, j int) bool {
		if refs[i].Timestamp == refs[j].Timestamp {
			return refs[i].ID < refs[j].ID
		}
		return refs[i].Timestamp < refs[j].Timestamp
	})
	return refs
}

func alertEvidenceTimestamp(alert *plugins.Alert) string {
	if alert == nil {
		return ""
	}
	if len(alert.Events) > 0 && alert.Events[0] != nil && alert.Events[0].Timestamp != "" {
		return alert.Events[0].Timestamp
	}
	return alert.Timestamp
}

func alertEventIDs(alert *plugins.Alert) []string {
	if alert == nil {
		return nil
	}
	ids := make([]string, 0, len(alert.Events))
	for _, event := range alert.Events {
		if event != nil && event.Id != "" {
			ids = append(ids, event.Id)
		}
	}
	return ids
}

func writeFinding(findingID string, trigger *plugins.Alert, refs []alertReference) {
	if trigger == nil || findingID == "" || len(refs) == 0 {
		return
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	createdAt := refs[0].Timestamp
	if createdAt == "" {
		createdAt = trigger.Timestamp
	}
	if createdAt == "" {
		createdAt = now
	}
	alertIDs := make([]string, 0, len(refs))
	eventIDSet := make(map[string]struct{})
	for _, ref := range refs {
		alertIDs = append(alertIDs, ref.ID)
		for _, eventID := range ref.EventIDs {
			if eventID != "" {
				eventIDSet[eventID] = struct{}{}
			}
		}
	}
	eventIDs := make([]string, 0, len(eventIDSet))
	for eventID := range eventIDSet {
		eventIDs = append(eventIDs, eventID)
	}
	sort.Strings(eventIDs)
	techniqueID, techniqueName := splitTechnique(trigger.Technique)
	techniqueLabel := techniqueID
	if techniqueName != "" {
		techniqueLabel += " — " + techniqueName
	}
	entities, relationships, leadEntity := buildFindingEntities(trigger, alertIDs, createdAt, now)
	adversaryLabel := observedAdversaryLabel(trigger.Adversary)
	title := fmt.Sprintf("Repeated %s from %s", fallback(trigger.Name, "security activity"), adversaryLabel)
	narrative := fmt.Sprintf(
		"HiveArmor correlated %d independently generated alerts because they share the normalized adversary %s within a %s observation window. This finding records the observed relationship only; analyst validation is still required.",
		len(alertIDs), adversaryLabel, windowDuration,
	)
	stage := map[string]any{
		"order": 1, "name": fallback(trigger.Category, "Detection"),
		"mitreTactic": "", "mitreTechnique": techniqueLabel,
		"description": trigger.Description, "signalIds": alertIDs,
		"timestamp": createdAt, "status": "observed", "eventIds": eventIDs,
	}
	doc := map[string]any{
		"@timestamp":       now,
		"lastUpdate":       now,
		"id":               findingID,
		"title":            title,
		"narrative":        narrative,
		"description":      trigger.Description,
		"severity":         symbolicSeverity(trigger.Severity),
		"status":           "new",
		"assignee":         nil,
		"createdAt":        createdAt,
		"updatedAt":        now,
		"firstSeen":        createdAt,
		"lastSeen":         now,
		"confidence":       1.0,
		"signalCount":      len(alertIDs),
		"eventCount":       len(eventIDs),
		"attackStageCount": 1,
		"entityCount":      len(entities),
		"leadEntity":       leadEntity,
		"stages":           []any{stage},
		"entities":         entities,
		"relationships":    relationships,
		"correlationReasons": []any{
			map[string]any{
				"type":        "shared_entity",
				"description": fmt.Sprintf("All %d alerts contain the same normalized adversary %s.", len(alertIDs), adversaryLabel),
				"confidence":  1.0, "evidence": strings.Join(alertIDs, ","),
			},
			map[string]any{
				"type":        "temporal_proximity",
				"description": fmt.Sprintf("The alerts were observed inside the configured %s correlation window.", windowDuration),
				"confidence":  1.0, "evidence": strings.Join(alertIDs, ","),
			},
		},
		"mitreTactics":    []string{},
		"mitreTechniques": nonEmptyStrings(techniqueID),
		"alerts":          alertIDs,
		"eventIds":        eventIDs,
		"tenantId":        trigger.TenantId,
		"visibleBy":       nonEmptyStrings(trigger.TenantId),
		"dataTypes":       nonEmptyStrings(trigger.DataType),
		"adversary":       sideSummary(trigger.Adversary),
		"target":          sideSummary(trigger.Target),
		"producer": map[string]any{
			"name": "hivearmor-event-processor", "contract": "COR-001/COR-002", "version": 1,
		},
		// Canonical provenance consumed by the finding investigation UI. Keep the
		// producer object above for index-level operational provenance, while this
		// envelope describes the specific correlation evaluation.
		"correlationEngine": map[string]any{
			"version":     "hivearmor-event-processor finding-correlator/1",
			"ruleIds":     []string{"shared-adversary-2h"},
			"evaluatedAt": now,
		},
		"sourceDetectionNames": nonEmptyStrings(trigger.Name),
		"version":              1,
		"dataCompleteness":     "complete",
	}
	if !putDocument(sdkos.BuildCurrentDayIndex("correlation"), findingID, doc) {
		return
	}

	// Deprecated compatibility projection. New readers must use v3-hive-correlation-*.
	legacy := map[string]any{
		"@timestamp": now, "lastUpdate": now, "id": findingID,
		"name": trigger.Name, "magnitude": min(10, len(alertIDs)*2),
		"status": "open", "alertCount": len(alertIDs), "dataTypes": nonEmptyStrings(trigger.DataType),
		"alerts": alertIDs, "adversary": sideSummary(trigger.Adversary), "target": sideSummary(trigger.Target),
		"deprecated": true, "successorIndex": "v3-hive-correlation-*",
	}
	putDocument(sdkos.BuildCurrentDayIndex("offense"), findingID, legacy)

	osURL, osUser, osPass, cl := oOSURL, oOSUser, oOSPass, oclient
	go linkAlertsWithRetry(osURL, osUser, osPass, cl, findingID, alertIDs)
}

// writeOffense remains for package-level compatibility while callers migrate to canonical naming.
func writeOffense(offenseID string, trigger *plugins.Alert, relatedIDs []string, _ int) {
	refs := make([]alertReference, 0, len(relatedIDs)+1)
	for _, id := range relatedIDs {
		refs = append(refs, alertReference{ID: id, Timestamp: trigger.Timestamp})
	}
	writeFinding(offenseID, trigger, uniqueAlertReferences(refs, trigger))
}

func putDocument(index, id string, doc map[string]any) bool {
	body, err := json.Marshal(doc)
	if err != nil {
		return false
	}
	url := fmt.Sprintf("%s/%s/_doc/%s", oOSURL, index, id)
	req, _ := http.NewRequest("PUT", url, bytes.NewReader(body))
	req.SetBasicAuth(oOSUser, oOSPass)
	req.Header.Set("Content-Type", "application/json")
	resp, err := oclient.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)
	return resp.StatusCode < http.StatusBadRequest
}

func setFindingIDOnAlerts(osURL, osUser, osPass string, cl *http.Client, findingID string, alertIDs []string) {
	if len(alertIDs) == 0 {
		return
	}
	query := map[string]any{
		"query": map[string]any{"bool": map[string]any{"should": []any{
			map[string]any{"terms": map[string]any{"id": alertIDs}},
			map[string]any{"terms": map[string]any{"id.keyword": alertIDs}},
		}, "minimum_should_match": 1}},
		"script": map[string]any{
			"source": "ctx._source.findingId = params.id; ctx._source.offenseId = params.id",
			"params": map[string]any{"id": findingID},
		},
	}
	body, _ := json.Marshal(query)
	url := fmt.Sprintf("%s/v3-hive-alert-*/_update_by_query?conflicts=proceed&refresh=true", osURL)
	req, _ := http.NewRequest("POST", url, bytes.NewReader(body))
	req.SetBasicAuth(osUser, osPass)
	req.Header.Set("Content-Type", "application/json")
	resp, err := cl.Do(req)
	if err != nil {
		return
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)
}

func linkAlertsWithRetry(osURL, osUser, osPass string, cl *http.Client, findingID string, alertIDs []string) {
	// Alert indexing and correlation are independent asynchronous paths. Retry the
	// idempotent linkage briefly so the triggering alert is not missed when its
	// refresh becomes visible after the finding is created.
	for attempt := 0; attempt < 4; attempt++ {
		setFindingIDOnAlerts(osURL, osUser, osPass, cl, findingID, alertIDs)
		if attempt < 3 {
			time.Sleep(time.Duration(attempt+1) * 500 * time.Millisecond)
		}
	}
}

func buildFindingEntities(trigger *plugins.Alert, alertIDs []string, firstSeen, lastSeen string) ([]any, []any, map[string]any) {
	entities := make([]any, 0, 6)
	relationships := make([]any, 0, 4)
	ids := map[string]string{}
	add := func(entityType, value, role string) {
		value = strings.TrimSpace(value)
		if value == "" {
			return
		}
		key := entityType + ":" + value
		if _, exists := ids[key]; exists {
			return
		}
		id := key
		ids[key] = id
		entities = append(entities, map[string]any{
			"id": id, "type": entityType, "value": value, "role": role,
			"firstSeen": firstSeen, "lastSeen": lastSeen, "signalCount": len(alertIDs),
		})
	}
	if trigger.Adversary != nil {
		add("user", trigger.Adversary.User, "infrastructure")
		add("ip", trigger.Adversary.Ip, "infrastructure")
		add("host", trigger.Adversary.Host, "infrastructure")
		add("process", trigger.Adversary.Process, "infrastructure")
	}
	if trigger.Target != nil {
		add("user", trigger.Target.User, "victim")
		add("ip", trigger.Target.Ip, "victim")
		add("host", trigger.Target.Host, "compromised")
		add("process", trigger.Target.Process, "compromised")
	}
	addRelationship := func(sourceType, sourceValue, targetType, targetValue, relationshipType string) {
		source := ids[sourceType+":"+strings.TrimSpace(sourceValue)]
		target := ids[targetType+":"+strings.TrimSpace(targetValue)]
		if source == "" || target == "" || source == target {
			return
		}
		relationships = append(relationships, map[string]any{
			"id": source + "->" + target, "source": source, "target": target,
			"sourceEntity": source, "targetEntity": target, "type": relationshipType,
			"evidence": alertIDs, "confidence": 1.0, "firstSeen": firstSeen, "lastSeen": lastSeen,
		})
	}
	if trigger.Adversary != nil {
		addRelationship("user", trigger.Adversary.User, "process", trigger.Adversary.Process, "executed_on")
		addRelationship("process", trigger.Adversary.Process, "host", trigger.Adversary.Host, "executed_on")
	}
	if trigger.Adversary != nil && trigger.Target != nil {
		addRelationship("ip", trigger.Adversary.Ip, "ip", trigger.Target.Ip, "communicated_with")
	}
	lead := map[string]any{"type": "user", "value": "unknown"}
	if trigger.Adversary != nil {
		switch {
		case trigger.Adversary.User != "":
			lead = map[string]any{"type": "user", "value": trigger.Adversary.User}
		case trigger.Adversary.Ip != "":
			lead = map[string]any{"type": "ip", "value": trigger.Adversary.Ip}
		case trigger.Adversary.Host != "":
			lead = map[string]any{"type": "host", "value": trigger.Adversary.Host}
		}
	}
	return entities, relationships, lead
}

func sideSummary(side *plugins.Side) map[string]any {
	if side == nil {
		return map[string]any{}
	}
	return map[string]any{"ip": side.Ip, "user": side.User, "host": side.Host, "process": side.Process}
}

func observedAdversaryLabel(side *plugins.Side) string {
	if side == nil {
		return "an unavailable entity"
	}
	if side.User != "" {
		return "user " + side.User
	}
	if side.Ip != "" {
		return "IP " + side.Ip
	}
	return "an observed entity"
}

func symbolicSeverity(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "5", "4", "critical":
		return "critical"
	case "3", "high":
		return "high"
	case "2", "medium":
		return "medium"
	default:
		return "low"
	}
}

func splitTechnique(value string) (string, string) {
	parts := strings.SplitN(strings.TrimSpace(value), " - ", 2)
	if len(parts) == 0 || !strings.HasPrefix(strings.ToUpper(parts[0]), "T") {
		return "", ""
	}
	if len(parts) == 1 {
		return strings.TrimSpace(parts[0]), ""
	}
	return strings.TrimSpace(parts[0]), strings.TrimSpace(parts[1])
}

func nonEmptyStrings(values ...string) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			result = append(result, value)
		}
	}
	return result
}

func tenantTerm(tenantID string) map[string]any {
	return map[string]any{"bool": map[string]any{
		"should": []any{
			map[string]any{"term": map[string]any{"tenantId": tenantID}},
			map[string]any{"term": map[string]any{"tenantId.keyword": tenantID}},
		},
		"minimum_should_match": 1,
	}}
}

func fallback(value, defaultValue string) string {
	if strings.TrimSpace(value) == "" {
		return defaultValue
	}
	return value
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
