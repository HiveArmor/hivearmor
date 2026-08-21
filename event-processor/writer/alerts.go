package writer

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/hivearmor/event-processor/enrichment"
	"github.com/hivearmor/event-processor/internal/httpclient"
	sdkos "github.com/hivearmor/sdk/os"
	"github.com/hivearmor/sdk/plugins"
)

var (
	alertHTTP   *http.Client
	alertOSURL  string
	alertOSUser string
	alertOSPass string
	alertMu     sync.Mutex
)

// InitAlertWriter configures the alert writer.
func InitAlertWriter(osURL, user, pass string) {
	alertOSURL = osURL
	alertOSUser = user
	alertOSPass = pass
	client, err := httpclient.NewSecureClient(10 * time.Second)
	if err != nil {
		log.Fatalf("alert writer tls client: %v", err)
	}
	alertHTTP = client
}

// WriteAlert indexes an alert, skipping duplicates. Errors are logged; Kafka
// and socket commit paths must call WriteAlertSync instead.
func WriteAlert(alert *plugins.Alert) {
	if err := WriteAlertSync(alert, alertOSURL, alertOSUser, alertOSPass); err != nil {
		log.Printf("writer: alert write failed id=%s: %v", alertID(alert), err)
	}
}

func alertID(alert *plugins.Alert) string {
	if alert == nil {
		return ""
	}
	return alert.Id
}

// WriteAlertSync writes one alert and returns classified HTTP/transport errors.
func WriteAlertSync(alert *plugins.Alert, osURL, user, pass string) error {
	if alert == nil {
		return nil
	}
	alert.LastUpdate = time.Now().UTC().Format(time.RFC3339Nano)

	client := alertHTTP
	if client == nil {
		secure, err := httpclient.NewSecureClient(10 * time.Second)
		if err != nil {
			return fmt.Errorf("alert tls client: %w", err)
		}
		client = secure
	}

	if isDuplicate(alert) {
		return nil
	}

	parentID := findParentAlert(alert)
	if parentID != "" {
		alert.ParentId = parentID
	}

	doc := alertToDoc(alert)
	enrichment.EnrichAlertDoc(doc)
	idx := AlertIndex(alert)
	body, err := json.Marshal(doc)
	if err != nil {
		return fmt.Errorf("marshal alert: %w", err)
	}
	url := fmt.Sprintf("%s/%s/_doc/%s", osURL, idx, alert.Id)
	req, err := http.NewRequest("PUT", url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.SetBasicAuth(user, pass)
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("write alert %s: %w", alert.Id, err)
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)
	if resp.StatusCode >= 400 {
		return fmt.Errorf("write alert %s: HTTP %d", alert.Id, resp.StatusCode)
	}
	return nil
}

// isDuplicate checks if a matching alert was already indexed in the last 7 days.
func isDuplicate(alert *plugins.Alert) bool {
	if alertOSURL == "" || len(alert.DeduplicateBy) == 0 {
		return false
	}

	// Build dedup fields from adversary / target
	doc := alertToDoc(alert)
	var musts []map[string]any
	musts = append(musts, map[string]any{
		"term": map[string]any{"name.keyword": alert.Name},
	})
	for _, field := range alert.DeduplicateBy {
		val := flatGet(doc, field)
		if val == "" {
			continue
		}
		musts = append(musts, map[string]any{
			"term": map[string]any{field + ".keyword": val},
		})
	}
	musts = append(musts, map[string]any{
		"range": map[string]any{
			"@timestamp": map[string]any{
				"gte": "now-7d",
			},
		},
	})

	query := map[string]any{
		"query": map[string]any{"bool": map[string]any{"must": musts}},
		"size":  1,
	}
	body, _ := json.Marshal(query)
	req, _ := http.NewRequest("POST", alertOSURL+"/"+sdkos.BuildTenantIndexPattern("alert", tenantPrefixFromAlert(alert))+"/_search", bytes.NewReader(body))
	req.SetBasicAuth(alertOSUser, alertOSPass)
	req.Header.Set("Content-Type", "application/json")
	resp, err := alertHTTP.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()

	var result struct {
		Hits struct {
			Total struct{ Value int } `json:"total"`
		} `json:"hits"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return false
	}
	return result.Hits.Total.Value > 0
}

// findParentAlert looks for a parent alert with the same groupBy fields.
func findParentAlert(alert *plugins.Alert) string {
	if alertOSURL == "" || len(alert.GroupBy) == 0 {
		return ""
	}
	doc := alertToDoc(alert)
	var musts []map[string]any
	musts = append(musts, map[string]any{
		"term": map[string]any{"name.keyword": alert.Name},
	})
	for _, field := range alert.GroupBy {
		val := flatGet(doc, field)
		if val == "" {
			continue
		}
		musts = append(musts, map[string]any{
			"term": map[string]any{field + ".keyword": val},
		})
	}
	// must have no parent (top-level)
	musts = append(musts, map[string]any{
		"range": map[string]any{
			"@timestamp": map[string]any{"gte": "now-24h"},
		},
	})

	query := map[string]any{
		"query": map[string]any{"bool": map[string]any{
			"must":     musts,
			"must_not": []map[string]any{{"exists": map[string]any{"field": "parentId"}}},
		}},
		"sort": []map[string]any{{"@timestamp": map[string]any{"order": "asc"}}},
		"size": 1,
	}
	body, _ := json.Marshal(query)
	req, _ := http.NewRequest("POST", alertOSURL+"/"+sdkos.BuildTenantIndexPattern("alert", tenantPrefixFromAlert(alert))+"/_search", bytes.NewReader(body))
	req.SetBasicAuth(alertOSUser, alertOSPass)
	req.Header.Set("Content-Type", "application/json")
	resp, err := alertHTTP.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()

	var result struct {
		Hits struct {
			Hits []struct {
				ID string `json:"_id"`
			} `json:"hits"`
		} `json:"hits"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil || len(result.Hits.Hits) == 0 {
		return ""
	}
	return result.Hits.Hits[0].ID
}

func alertToDoc(a *plugins.Alert) map[string]any {
	doc := map[string]any{
		"@timestamp":    a.Timestamp,
		"lastUpdate":    a.LastUpdate,
		"id":            a.Id,
		"name":          a.Name,
		"dataType":      a.DataType,
		"dataSource":    a.DataSource,
		"tenantId":      a.TenantId,
		"tenantName":    a.TenantName,
		"tenantPrefix":  tenantPrefixFromAlert(a),
		"category":      a.Category,
		"technique":     a.Technique,
		"description":   a.Description,
		"references":    a.References,
		"severity":      numericSeverity(a.Severity),
		"riskScore":     a.ImpactScore,
		"impactScore":   a.ImpactScore,
		"deduplicateBy": a.DeduplicateBy,
		"groupBy":       a.GroupBy,
		"parentId":      a.ParentId,
		"isIncident":    a.ImpactScore >= 9,
		"status":        1,
	}
	if a.DataSource != "" {
		doc["dataSources"] = []string{a.DataSource}
	}
	if techniqueID, techniqueName := splitTechnique(a.Technique); techniqueID != "" {
		doc["mitreTechniqueId"] = techniqueID
		if techniqueName != "" {
			doc["mitreTechniqueName"] = techniqueName
		}
	}
	if a.Impact != nil {
		doc["impact"] = map[string]any{
			"confidentiality": a.Impact.Confidentiality,
			"integrity":       a.Impact.Integrity,
			"availability":    a.Impact.Availability,
		}
	}
	if a.Adversary != nil {
		doc["adversary"] = sideDoc(a.Adversary)
	}
	if a.Target != nil {
		doc["target"] = sideDoc(a.Target)
	}
	if len(a.Events) > 0 {
		var evIDs []string
		for _, ev := range a.Events {
			evIDs = append(evIDs, ev.Id)
		}
		// sourceEventIds is the canonical alert-to-event association consumed by
		// the API. eventIds remains during the compatibility window.
		doc["sourceEventIds"] = evIDs
		doc["eventIds"] = evIDs
	}
	return doc
}

func splitTechnique(value string) (string, string) {
	parts := strings.SplitN(strings.TrimSpace(value), " - ", 2)
	if len(parts) == 0 {
		return "", ""
	}
	id := strings.TrimSpace(parts[0])
	if !strings.HasPrefix(strings.ToUpper(id), "T") {
		return "", ""
	}
	if len(parts) == 1 {
		return id, ""
	}
	return id, strings.TrimSpace(parts[1])
}

// flatGet retrieves a value from a nested map using dot-path, returns string.
func flatGet(doc map[string]any, path string) string {
	parts := strings.SplitN(path, ".", 2)
	v, ok := doc[parts[0]]
	if !ok {
		return ""
	}
	if len(parts) == 1 {
		if s, ok := v.(string); ok {
			return s
		}
		return fmt.Sprintf("%v", v)
	}
	if sub, ok := v.(map[string]any); ok {
		return flatGet(sub, parts[1])
	}
	return ""
}

// AlertIndex is the OpenSearch write index for a detection alert.
// Tenant-scoped alerts use v3-hive-alert-<prefix>-YYYY.MM.DD to match
// MsspIndexResolver("alert").
func AlertIndex(alert *plugins.Alert) string {
	return sdkos.BuildTenantIndex("alert", tenantPrefixFromAlert(alert))
}

func tenantPrefixFromAlert(alert *plugins.Alert) string {
	if alert == nil {
		return ""
	}
	for _, event := range alert.Events {
		if event != nil && event.GetTenantPrefix() != "" {
			return event.GetTenantPrefix()
		}
	}
	return ""
}

// numericSeverity writes a long so severity-board aggregations and range
// filters can run. Engine CEL rules store "1"/"2"/"3" as strings.
func numericSeverity(raw string) int {
	trimmed := strings.TrimSpace(raw)
	if n, err := strconv.Atoi(trimmed); err == nil {
		return n
	}
	switch strings.ToLower(trimmed) {
	case "critical":
		return 9
	case "high":
		return 8
	case "medium":
		return 5
	case "low":
		return 2
	default:
		return 0
	}
}

var _ = context.Background
