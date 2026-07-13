// Package offense groups related alerts into offenses when ≥3 share the same adversary within 2h.
package offense

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/threatwinds/go-sdk/plugins"
	sdkos "github.com/threatwinds/go-sdk/os"
)

const (
	minAlerts      = 3
	windowDuration = 2 * time.Hour
)

var (
	oclient   *http.Client
	oOSURL    string
	oOSUser   string
	oOSPass   string
	ocInitOnce sync.Once
)

// Init configures the offense engine.
func Init(osURL, user, pass string) {
	ocInitOnce.Do(func() {
		oOSURL = osURL
		oOSUser = user
		oOSPass = pass
		oclient = &http.Client{
			Timeout: 10 * time.Second,
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
			},
		}
	})
}

// Process checks whether a new alert triggers or updates an offense.
func Process(alert *plugins.Alert) {
	if oOSURL == "" || alert.Adversary == nil {
		return
	}
	adversaryIP := alert.Adversary.Ip
	adversaryUser := alert.Adversary.User
	if adversaryIP == "" && adversaryUser == "" {
		return
	}

	// Query for related alerts in the last 2h
	related := findRelatedAlerts(adversaryIP, adversaryUser)
	total := len(related) + 1 // include this alert
	if total < minAlerts {
		return
	}

	// Find or create offense
	offenseID := findExistingOffense(adversaryIP, adversaryUser)
	if offenseID == "" {
		offenseID = uuid.New().String()
	}

	writeOffense(offenseID, alert, related, total)
}

func findRelatedAlerts(ip, user string) []string {
	var should []map[string]any
	if ip != "" {
		should = append(should, map[string]any{"term": map[string]any{"adversary.ip.keyword": ip}})
	}
	if user != "" {
		should = append(should, map[string]any{"term": map[string]any{"adversary.user.keyword": user}})
	}
	query := map[string]any{
		"query": map[string]any{
			"bool": map[string]any{
				"should": should,
				"must": []map[string]any{{
					"range": map[string]any{"@timestamp": map[string]any{"gte": "now-2h"}},
				}},
				"minimum_should_match": 1,
			},
		},
		"_source": []string{"id"},
		"size":    100,
	}
	body, _ := json.Marshal(query)
	req, _ := http.NewRequest("POST", oOSURL+"/_v3_hive_alert-*/_search", bytes.NewReader(body))
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
				Source struct{ ID string `json:"id"` } `json:"_source"`
			} `json:"hits"`
		} `json:"hits"`
	}
	json.NewDecoder(resp.Body).Decode(&result)
	var ids []string
	for _, h := range result.Hits.Hits {
		ids = append(ids, h.Source.ID)
	}
	return ids
}

func findExistingOffense(ip, user string) string {
	var should []map[string]any
	if ip != "" {
		should = append(should, map[string]any{"term": map[string]any{"adversary.ip.keyword": ip}})
	}
	if user != "" {
		should = append(should, map[string]any{"term": map[string]any{"adversary.user.keyword": user}})
	}
	query := map[string]any{
		"query": map[string]any{
			"bool": map[string]any{
				"should":               should,
				"minimum_should_match": 1,
				"must": []map[string]any{{
					"range": map[string]any{"lastUpdate": map[string]any{"gte": fmt.Sprintf("now-%s", windowDuration)}},
				}},
			},
		},
		"_source": []string{"id"},
		"sort":    []map[string]any{{"lastUpdate": map[string]any{"order": "desc"}}},
		"size":    1,
	}
	body, _ := json.Marshal(query)
	req, _ := http.NewRequest("POST", oOSURL+"/_v3_hive_offense-*/_search", bytes.NewReader(body))
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
				ID     string          `json:"_id"`
				Source json.RawMessage `json:"_source"`
			} `json:"hits"`
		} `json:"hits"`
	}
	json.NewDecoder(resp.Body).Decode(&result)
	if len(result.Hits.Hits) > 0 {
		return result.Hits.Hits[0].ID
	}
	return ""
}

func writeOffense(offenseID string, trigger *plugins.Alert, relatedIDs []string, total int) {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	magnitude := min(10, total*2)

	doc := map[string]any{
		"@timestamp": now,
		"lastUpdate": now,
		"id":         offenseID,
		"name":       trigger.Name,
		"magnitude":  magnitude,
		"status":     "open",
		"alertCount": total,
		"dataTypes":  []string{trigger.DataType},
		"alerts":     append(relatedIDs, trigger.Id),
	}
	if trigger.Adversary != nil {
		doc["adversary"] = map[string]any{
			"ip":   trigger.Adversary.Ip,
			"user": trigger.Adversary.User,
		}
	}
	if trigger.Target != nil {
		doc["target"] = map[string]any{
			"ip":   trigger.Target.Ip,
			"host": trigger.Target.Host,
		}
	}

	body, _ := json.Marshal(doc)
	idx := sdkos.BuildCurrentDayIndex("_v3_hive_", "offense")
	url := fmt.Sprintf("%s/%s/_doc/%s", oOSURL, idx, offenseID)
	req, _ := http.NewRequest("PUT", url, bytes.NewReader(body))
	req.SetBasicAuth(oOSUser, oOSPass)
	req.Header.Set("Content-Type", "application/json")
	resp, err := oclient.Do(req)
	if err != nil {
		return
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)

	allAlertIDs := append(relatedIDs, trigger.Id)
	// Snapshot connection params before goroutine launch to avoid data races on package globals.
	osURL, osUser, osPass, cl := oOSURL, oOSUser, oOSPass, oclient
	go setOffenseIdOnAlerts(osURL, osUser, osPass, cl, offenseID, allAlertIDs)
}

func setOffenseIdOnAlerts(osURL, osUser, osPass string, cl *http.Client, offenseID string, alertIDs []string) {
	if len(alertIDs) == 0 {
		return
	}
	query := map[string]any{
		"query": map[string]any{
			"terms": map[string]any{"id.keyword": alertIDs},
		},
		"script": map[string]any{
			"source": "ctx._source.offenseId = params.oid",
			"params": map[string]any{"oid": offenseID},
		},
	}
	body, _ := json.Marshal(query)
	url := fmt.Sprintf("%s/_v3_hive_alert-*/_update_by_query", osURL)
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

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
