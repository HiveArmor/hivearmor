package rules

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/threatwinds/go-sdk/plugins"
)

var (
	celOnce  sync.Once
	celCache *plugins.CELCache

	searchClient *http.Client
	searchBase   string
	searchUser   string
	searchPass   string
)

const celErrorLogInterval = 60 * time.Second

var (
	celErrorsMu   sync.Mutex
	celErrorsSeen = map[string]time.Time{}
)

// shouldLogCELError returns true at most once per celErrorLogInterval per (ruleID, expression) pair.
func shouldLogCELError(ruleID int64, expression string) bool {
	key := fmt.Sprintf("%d::%s", ruleID, expression)
	celErrorsMu.Lock()
	defer celErrorsMu.Unlock()
	last, ok := celErrorsSeen[key]
	if !ok || time.Since(last) > celErrorLogInterval {
		celErrorsSeen[key] = time.Now()
		return true
	}
	return false
}

// InitEngine initialises the rule engine with OpenSearch connection details.
func InitEngine(osURL, user, pass string) {
	searchBase = osURL
	searchUser = user
	searchPass = pass
	searchClient = &http.Client{
		Timeout: 10 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
	}
}

func getCEL() *plugins.CELCache {
	celOnce.Do(func() {
		celCache = plugins.NewCELCache("com.hivearmor.rules")
	})
	return celCache
}

// Evaluate tests all matching rules against the event and returns fired alerts.
func Evaluate(event *plugins.Event) []*plugins.Alert {
	if event == nil {
		return nil
	}
	eventJSON, err := json.Marshal(eventToMap(event))
	if err != nil {
		log.Printf("[rules.Evaluate] failed to marshal event id=%s dataType=%s: %v", event.Id, event.DataType, err)
		return nil
	}
	eventStr := string(eventJSON)

	var alerts []*plugins.Alert
	for _, rule := range GetRules(event.DataType) {
		// Skip risk/sequence rules here — handled by enterprise packages
		if rule.HasRiskScore() || rule.HasSequence() {
			continue
		}
		ok, evalErr := getCEL().Evaluate(&eventStr, rule.Where)
		if evalErr != nil {
			if shouldLogCELError(rule.ID, rule.Where) {
				log.Printf("[rules.Evaluate] CEL error rule.id=%d rule.name=%q expression=%q error=%v (suppressing duplicates for 60s)",
					rule.ID, rule.Name, rule.Where, evalErr)
			}
			continue
		}
		if !ok {
			continue
		}
		// afterEvents / correlation check — use flat map for template resolution
		if len(rule.Correlation) > 0 {
			flatJSON, marshalErr := json.Marshal(eventToMap(event))
			if marshalErr != nil {
				log.Printf("[rules.Evaluate] failed to marshal event for correlation check rule.id=%d: %v", rule.ID, marshalErr)
				continue
			}
			matched, _, err := executeSearchRequest(rule.Correlation[0], string(flatJSON))
			if err != nil || !matched {
				continue
			}
		}
		alert := buildAlert(event, rule)
		if alert != nil {
			alerts = append(alerts, alert)
		}
	}
	return alerts
}

func buildAlert(event *plugins.Event, rule *Rule) *plugins.Alert {
	alert := &plugins.Alert{
		Id:            uuid.New().String(),
		Timestamp:     time.Now().UTC().Format(time.RFC3339Nano),
		Name:          rule.Name,
		Category:      rule.Category,
		Technique:     rule.Technique,
		Description:   rule.Description,
		References:    rule.References,
		DataType:      event.DataType,
		DataSource:    event.DataSource,
		TenantId:      event.TenantId,
		TenantName:    event.TenantName,
		DeduplicateBy: rule.DeduplicateBy,
		GroupBy:       rule.GroupBy,
		Events:        []*plugins.Event{event},
	}
	if rule.Impact != nil {
		alert.Impact = &plugins.Impact{
			Confidentiality: rule.Impact.Confidentiality,
			Integrity:       rule.Impact.Integrity,
			Availability:    rule.Impact.Availability,
		}
		alert.ImpactScore = rule.Impact.Confidentiality + rule.Impact.Integrity + rule.Impact.Availability
	}

	// severity: 1=low, 2=medium, 3=high based on impactScore
	switch {
	case alert.ImpactScore >= 8:
		alert.Severity = "3"
	case alert.ImpactScore >= 5:
		alert.Severity = "2"
	default:
		alert.Severity = "1"
	}

	// adversary / target sides
	if rule.Adversary == "origin" {
		alert.Adversary = event.Origin
		alert.Target = event.Target
	} else {
		alert.Adversary = event.Target
		alert.Target = event.Origin
	}
	return alert
}

// buildBoolQuery converts a slice of Expressions into an OpenSearch bool query map.
// Returns a map with "must" always present (possibly empty) and "must_not" only when needed.
func buildBoolQuery(exprs []Expression, eventJSON string) map[string]any {
	musts := make([]map[string]any, 0)
	var mustNots []map[string]any

	for _, expr := range exprs {
		val := resolveTemplate(expr.Value, eventJSON)
		switch expr.Operator {
		case "filter_term":
			musts = append(musts, map[string]any{
				"term": map[string]any{expr.Field + ".keyword": val},
			})
		case "filter_match":
			musts = append(musts, map[string]any{
				"match": map[string]any{expr.Field: val},
			})
		case "must_not_term":
			mustNots = append(mustNots, map[string]any{
				"term": map[string]any{expr.Field + ".keyword": val},
			})
		case "must_not_match":
			mustNots = append(mustNots, map[string]any{
				"match": map[string]any{expr.Field: val},
			})
		}
	}

	boolQuery := map[string]any{
		"must": musts,
	}
	if len(mustNots) > 0 {
		boolQuery["must_not"] = mustNots
	}
	return boolQuery
}

// executeSearchRequest runs an afterEvents OpenSearch query.
// Returns (matched, hits, error).
func executeSearchRequest(sr SearchRequest, eventJSON string) (bool, []map[string]any, error) {
	if searchBase == "" {
		return false, nil, nil
	}
	within, err := time.ParseDuration(sr.Within)
	if err != nil {
		within = 15 * time.Minute
	}
	rangeStart := time.Now().UTC().Add(-within).Format(time.RFC3339)

	boolQuery := buildBoolQuery(sr.With, eventJSON)
	boolQuery["must"] = append(boolQuery["must"].([]map[string]any), map[string]any{
		"range": map[string]any{
			"@timestamp": map[string]any{"gte": rangeStart},
		},
	})

	query := map[string]any{
		"query": map[string]any{
			"bool": boolQuery,
		},
		"size":             1,
		"track_total_hits": true,
	}

	body, err := json.Marshal(query)
	if err != nil {
		return false, nil, fmt.Errorf("marshal query for rule correlation: %w", err)
	}
	url := fmt.Sprintf("%s/%s/_search", searchBase, sr.IndexPattern)
	req, err := http.NewRequest("POST", url, bytes.NewReader(body))
	if err != nil {
		return false, nil, fmt.Errorf("build HTTP request for rule correlation: %w", err)
	}
	req.SetBasicAuth(searchUser, searchPass)
	req.Header.Set("Content-Type", "application/json")

	resp, err := searchClient.Do(req)
	if err != nil {
		return false, nil, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)

	var result struct {
		Hits struct {
			Total struct {
				Value int64 `json:"value"`
			} `json:"total"`
			Hits []struct {
				Source map[string]any `json:"_source"`
			} `json:"hits"`
		} `json:"hits"`
	}
	if err := json.Unmarshal(data, &result); err != nil {
		return false, nil, err
	}

	count := result.Hits.Total.Value
	if count < sr.Count {
		// check Or branches
		for _, orBranch := range sr.Or {
			matched, hits, err := executeSearchRequest(orBranch, eventJSON)
			if err == nil && matched {
				return true, hits, nil
			}
		}
		return false, nil, nil
	}

	var hits []map[string]any
	for _, h := range result.Hits.Hits {
		hits = append(hits, h.Source)
	}
	return true, hits, nil
}

// resolveTemplate replaces {{.origin.ip}} style placeholders with values from the event.
// Uses simple string substitution on a flattened dot-notation map so that
// {{.origin.ip}} → value of "origin.ip" key in the flat event map.
func resolveTemplate(tmpl string, eventJSON string) string {
	if !strings.Contains(tmpl, "{{") {
		return tmpl
	}
	var nested map[string]any
	if err := json.Unmarshal([]byte(eventJSON), &nested); err != nil {
		return tmpl
	}
	flat := flattenMap(nested, "")
	result := tmpl
	for k, v := range flat {
		placeholder := "{{." + k + "}}"
		if strings.Contains(result, placeholder) {
			result = strings.ReplaceAll(result, placeholder, fmt.Sprintf("%v", v))
		}
	}
	return result
}

// flattenMap converts {"origin": {"ip": "x"}} → {"origin.ip": "x"}.
func flattenMap(m map[string]any, prefix string) map[string]any {
	result := make(map[string]any)
	for k, v := range m {
		key := k
		if prefix != "" {
			key = prefix + "." + k
		}
		if sub, ok := v.(map[string]any); ok {
			for sk, sv := range flattenMap(sub, key) {
				result[sk] = sv
			}
		} else {
			result[key] = v
		}
	}
	return result
}

// eventToMap converts a plugins.Event to a plain map for CEL evaluation.
func eventToMap(e *plugins.Event) map[string]any {
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
	}
	// log fields
	logMap := map[string]any{}
	for k, v := range e.Log {
		if v != nil {
			logMap[k] = v.AsInterface()
		}
	}
	m["log"] = logMap

	if e.Origin != nil {
		m["origin"] = sideToMap(e.Origin)
	}
	if e.Target != nil {
		m["target"] = sideToMap(e.Target)
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
			"asn":         fmt.Sprintf("AS%d", s.Geolocation.Asn),
			"aso":         s.Geolocation.Aso,
		}
	}
	return m
}

// Context for background goroutines (cancelable from main).
var engineCtx context.Context
var engineCancel context.CancelFunc

func init() {
	engineCtx, engineCancel = context.WithCancel(context.Background())
	_ = engineCancel
}
