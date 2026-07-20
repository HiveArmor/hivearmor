// Package enrichment — graph context enrichment for alerts.
// Queries OpenSearch alert history to surface recent activity and related entities.
package enrichment

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"net/http"
	"time"
)

// GraphContext holds entity-graph enrichment data for an alert.
type GraphContext struct {
	SourceIPRiskScore  float64  `json:"sourceIpRiskScore,omitempty"`
	SourceIPMalicious  bool     `json:"sourceIpMalicious,omitempty"`
	SourceIPCountry    string   `json:"sourceIpCountry,omitempty"`
	RelatedUsers       []string `json:"relatedUsers,omitempty"`
	RelatedHosts       []string `json:"relatedHosts,omitempty"`
	RecentAlertCount   int64    `json:"recentAlertCount,omitempty"`
}

var (
	graphClient *http.Client
	graphOSURL  string
	graphOSUser string
	graphOSPass string
)

// InitGraph configures the graph enricher with OpenSearch credentials.
func InitGraph(url, user, pass string) {
	graphOSURL = url
	graphOSUser = user
	graphOSPass = pass
	graphClient = &http.Client{
		Timeout: 5 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
	}
}

// EnrichAlertDoc queries OpenSearch for context about the adversary IP and merges
// the results into the alert document map in-place.
func EnrichAlertDoc(doc map[string]any) {
	if graphOSURL == "" {
		return
	}

	adversaryIP := extractAdversaryIP(doc)
	if adversaryIP == "" {
		return
	}

	ctx := queryGraphContext(adversaryIP)
	if ctx == nil {
		return
	}

	if ctx.SourceIPRiskScore > 0 {
		doc["sourceIpRiskScore"] = ctx.SourceIPRiskScore
	}
	if ctx.SourceIPMalicious {
		doc["sourceIpMalicious"] = true
	}
	if ctx.SourceIPCountry != "" {
		doc["sourceIpCountry"] = ctx.SourceIPCountry
	}
	if len(ctx.RelatedUsers) > 0 {
		doc["relatedUsers"] = ctx.RelatedUsers
	}
	if len(ctx.RelatedHosts) > 0 {
		doc["relatedHosts"] = ctx.RelatedHosts
	}
	if ctx.RecentAlertCount > 0 {
		doc["recentAlertCount"] = ctx.RecentAlertCount
	}
}

func extractAdversaryIP(doc map[string]any) string {
	if adv, ok := doc["adversary"].(map[string]any); ok {
		if ip, ok := adv["ip"].(string); ok && ip != "" {
			return ip
		}
	}
	return ""
}

func queryGraphContext(ip string) *GraphContext {
	since := time.Now().UTC().Add(-30 * 24 * time.Hour).Format(time.RFC3339)

	query := map[string]any{
		"size": 0,
		"query": map[string]any{
			"bool": map[string]any{
				"must": []map[string]any{
					{"term": map[string]any{"adversary.ip.keyword": ip}},
					{"range": map[string]any{"@timestamp": map[string]any{"gte": since}}},
				},
			},
		},
		"aggs": map[string]any{
			"total_alerts": map[string]any{
				"value_count": map[string]any{"field": "id.keyword"},
			},
			"related_users": map[string]any{
				"terms": map[string]any{"field": "adversary.user.keyword", "size": 10},
			},
			"related_hosts": map[string]any{
				"terms": map[string]any{"field": "adversary.host.keyword", "size": 10},
			},
			"max_risk": map[string]any{
				"max": map[string]any{"field": "impactScore"},
			},
			"country": map[string]any{
				"terms": map[string]any{"field": "adversary.geolocation.country.keyword", "size": 1},
			},
		},
	}

	body, _ := json.Marshal(query)
	req, err := http.NewRequest("POST", graphOSURL+"/v3-hive-alert-*/_search", bytes.NewReader(body))
	if err != nil {
		return nil
	}
	req.SetBasicAuth(graphOSUser, graphOSPass)
	req.Header.Set("Content-Type", "application/json")

	resp, err := graphClient.Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()

	var result struct {
		Hits struct {
			Total struct{ Value int64 } `json:"total"`
		} `json:"hits"`
		Aggregations struct {
			TotalAlerts struct{ Value int64 `json:"value"` } `json:"total_alerts"`
			RelatedUsers struct {
				Buckets []struct{ Key string `json:"key"` } `json:"buckets"`
			} `json:"related_users"`
			RelatedHosts struct {
				Buckets []struct{ Key string `json:"key"` } `json:"buckets"`
			} `json:"related_hosts"`
			MaxRisk struct{ Value *float64 `json:"value"` } `json:"max_risk"`
			Country struct {
				Buckets []struct{ Key string `json:"key"` } `json:"buckets"`
			} `json:"country"`
		} `json:"aggregations"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil
	}

	ctx := &GraphContext{
		RecentAlertCount: result.Aggregations.TotalAlerts.Value,
	}

	if result.Aggregations.MaxRisk.Value != nil {
		ctx.SourceIPRiskScore = *result.Aggregations.MaxRisk.Value
	}

	if len(result.Aggregations.Country.Buckets) > 0 {
		ctx.SourceIPCountry = result.Aggregations.Country.Buckets[0].Key
	}

	// Mark malicious if IP appears in threat intel cache
	ti := LookupThreatIntel(ip)
	if ti != nil {
		ctx.SourceIPMalicious = true
	}

	for _, b := range result.Aggregations.RelatedUsers.Buckets {
		if b.Key != "" {
			ctx.RelatedUsers = append(ctx.RelatedUsers, b.Key)
		}
	}
	for _, b := range result.Aggregations.RelatedHosts.Buckets {
		if b.Key != "" {
			ctx.RelatedHosts = append(ctx.RelatedHosts, b.Key)
		}
	}

	if ctx.RecentAlertCount == 0 && ctx.SourceIPRiskScore == 0 && !ctx.SourceIPMalicious {
		return nil
	}

	return ctx
}

