package writer

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	sdkos "github.com/threatwinds/go-sdk/os"
	"github.com/threatwinds/go-sdk/plugins"
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
	alertHTTP = &http.Client{
		Timeout: 10 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
	}
}

// WriteAlert indexes an alert, skipping duplicates.
func WriteAlert(alert *plugins.Alert) {
	if alert == nil {
		return
	}
	alert.LastUpdate = time.Now().UTC().Format(time.RFC3339Nano)

	if isDuplicate(alert) {
		return
	}

	// Check for parent alert via groupBy
	parentID := findParentAlert(alert)
	if parentID != "" {
		alert.ParentId = parentID
	}

	doc := alertToDoc(alert)
	idx := sdkos.BuildCurrentDayIndex("_v3_hive_", "alert")
	body, err := json.Marshal(doc)
	if err != nil {
		return
	}
	url := fmt.Sprintf("%s/%s/_doc/%s", alertOSURL, idx, alert.Id)
	req, _ := http.NewRequest("PUT", url, bytes.NewReader(body))
	req.SetBasicAuth(alertOSUser, alertOSPass)
	req.Header.Set("Content-Type", "application/json")
	resp, err := alertHTTP.Do(req)
	if err != nil {
		return
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)
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
	req, _ := http.NewRequest("POST", alertOSURL+"/_v3_hive_alert-*/_search", bytes.NewReader(body))
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
	req, _ := http.NewRequest("POST", alertOSURL+"/_v3_hive_alert-*/_search", bytes.NewReader(body))
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
		"category":      a.Category,
		"technique":     a.Technique,
		"description":   a.Description,
		"references":    a.References,
		"severity":      a.Severity,
		"impactScore":   a.ImpactScore,
		"deduplicateBy": a.DeduplicateBy,
		"groupBy":       a.GroupBy,
		"parentId":      a.ParentId,
		"isIncident":    a.ImpactScore >= 9,
		"status":        1,
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
		doc["eventIds"] = evIDs
	}
	return doc
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

var _ = context.Background
