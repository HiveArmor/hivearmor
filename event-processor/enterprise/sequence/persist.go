package sequence

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	sdkos "github.com/threatwinds/go-sdk/os"
)

// stateIndexWildcard matches all daily sequence-state indices for cross-day queries.
const stateIndexWildcard = "v3-hive-sequence-state-*"

var (
	osClient *http.Client
	osURL    string
	osUser   string
	osPass   string
)

// InitPersistence configures the OpenSearch client for state persistence.
// Must be called before Init.
func InitPersistence(url, user, pass string) {
	osURL = url
	osUser = user
	osPass = pass
	osClient = &http.Client{
		Timeout: 10 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true}, //nolint:gosec // internal only, mirrors writer/alerts.go
		},
	}
}

// persistState upserts one in-progress sequence into OpenSearch.
// _id = adversaryKey+"_"+ruleID so repeated writes are idempotent upserts.
func persistState(key string, ips inProgressSeq, expiresAt time.Time) {
	if osClient == nil {
		return
	}

	type stepDoc struct {
		StepNumber int       `json:"stepNumber"`
		MatchedAt  time.Time `json:"matchedAt"`
	}
	var steps []stepDoc
	for i, t := range ips.stepTimes {
		steps = append(steps, stepDoc{StepNumber: i + 1, MatchedAt: t})
	}

	doc := map[string]any{
		"adversaryKey":   key,
		"ruleId":         ips.ruleID,
		"currentStep":    ips.matchedStep,
		"stepsCompleted": steps,
		"firstMatchAt":   ips.stepTimes[0],
		"expiresAt":      expiresAt,
	}
	body, err := json.Marshal(doc)
	if err != nil {
		return
	}

	idx := sdkos.BuildCurrentDayIndex("v3-hive", "sequence-state")
	docID := docID(key, ips.ruleID)
	url := fmt.Sprintf("%s/%s/_doc/%s", osURL, idx, docID)

	req, err := http.NewRequest(http.MethodPut, url, bytes.NewReader(body))
	if err != nil {
		return
	}
	req.SetBasicAuth(osUser, osPass)
	req.Header.Set("Content-Type", "application/json")

	resp, err := osClient.Do(req)
	if err != nil {
		log.Printf("[sequence.persist] write error key=%s rule=%s: %v", key, ips.ruleID, err)
		return
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)
}

// deleteStateDoc removes a persisted document when the sequence completes or is evicted.
func deleteStateDoc(key, ruleID string) {
	if osClient == nil {
		return
	}
	url := fmt.Sprintf("%s/%s/_doc/%s", osURL, stateIndexWildcard, docID(key, ruleID))
	req, err := http.NewRequest(http.MethodDelete, url, nil)
	if err != nil {
		return
	}
	req.SetBasicAuth(osUser, osPass)
	resp, err := osClient.Do(req)
	if err != nil {
		log.Printf("[sequence.persist] delete error key=%s rule=%s: %v", key, ruleID, err)
		return
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)
}

// loadPersistedStates reads all non-expired state documents from OpenSearch and
// rebuilds the in-memory state map.  Called once during Init.
func loadPersistedStates() {
	if osClient == nil {
		return
	}

	query := map[string]any{
		"query": map[string]any{
			"range": map[string]any{
				"expiresAt": map[string]any{
					"gt": time.Now().UTC().Format(time.RFC3339),
				},
			},
		},
		"size": 10000,
	}
	body, _ := json.Marshal(query)
	url := fmt.Sprintf("%s/%s/_search", osURL, stateIndexWildcard)
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return
	}
	req.SetBasicAuth(osUser, osPass)
	req.Header.Set("Content-Type", "application/json")

	resp, err := osClient.Do(req)
	if err != nil {
		log.Printf("[sequence.persist] load error: %v", err)
		return
	}
	defer resp.Body.Close()

	// Index may not exist yet on a fresh install — 404 is fine.
	if resp.StatusCode == http.StatusNotFound {
		return
	}

	var result struct {
		Hits struct {
			Hits []struct {
				Source struct {
					AdversaryKey   string    `json:"adversaryKey"`
					RuleID         string    `json:"ruleId"`
					CurrentStep    int       `json:"currentStep"`
					StepsCompleted []struct {
						MatchedAt time.Time `json:"matchedAt"`
					} `json:"stepsCompleted"`
				} `json:"_source"`
			} `json:"hits"`
		} `json:"hits"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		log.Printf("[sequence.persist] load decode error: %v", err)
		return
	}

	count := 0
	mu.Lock()
	for _, hit := range result.Hits.Hits {
		src := hit.Source
		if src.AdversaryKey == "" || src.RuleID == "" || len(src.StepsCompleted) == 0 {
			continue
		}
		var times []time.Time
		for _, s := range src.StepsCompleted {
			times = append(times, s.MatchedAt)
		}
		ips := inProgressSeq{
			ruleID:      src.RuleID,
			matchedStep: src.CurrentStep,
			stepTimes:   times,
		}
		state[src.AdversaryKey] = append(state[src.AdversaryKey], ips)
		count++
	}
	mu.Unlock()
	log.Printf("[sequence.persist] loaded %d in-progress sequence states from persistence", count)
}

// deleteExpiredDocs removes state documents whose expiresAt has passed.
func deleteExpiredDocs() {
	if osClient == nil {
		return
	}
	nowRFC := time.Now().UTC().Format(time.RFC3339)
	payload := fmt.Sprintf(`{"query":{"range":{"expiresAt":{"lt":"%s"}}}}`, nowRFC)
	url := fmt.Sprintf("%s/%s/_delete_by_query?conflicts=proceed", osURL, stateIndexWildcard)
	req, err := http.NewRequest(http.MethodPost, url, strings.NewReader(payload))
	if err != nil {
		return
	}
	req.SetBasicAuth(osUser, osPass)
	req.Header.Set("Content-Type", "application/json")
	resp, err := osClient.Do(req)
	if err != nil {
		log.Printf("[sequence.persist] delete-by-query error: %v", err)
		return
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)
}

func docID(adversaryKey, ruleID string) string {
	return adversaryKey + "_" + ruleID
}
