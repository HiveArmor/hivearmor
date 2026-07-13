// Package baseline provides statistical anomaly detection based on 30-day rolling baselines.
package baseline

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"sync"
	"time"

	sdkos "github.com/threatwinds/go-sdk/os"
)

const (
	sigmaThreshold = 3.0
	windowDays     = 30
	bucketHours    = 1
)

type BaselineDoc struct {
	DataSource string    `json:"dataSource"`
	DataType   string    `json:"dataType"`
	Action     string    `json:"action"`
	Timestamp  time.Time `json:"@timestamp"`
	Mean       float64   `json:"mean"`
	StdDev     float64   `json:"stdDev"`
	P99        float64   `json:"p99"`
	SampleSize int       `json:"sampleSize"`
}

type AnomalyState struct {
	Mean   float64
	StdDev float64
}

var (
	bMu    sync.RWMutex
	bCache = map[string]AnomalyState{} // key = dataSource|dataType|action

	bHTTP   *http.Client
	bOSURL  string
	bOSUser string
	bOSPass string
	bOnce   sync.Once
)

// Init starts the baseline collector.
func Init(osURL, user, pass string) {
	bOnce.Do(func() {
		bOSURL = osURL
		bOSUser = user
		bOSPass = pass
		bHTTP = &http.Client{
			Timeout: 30 * time.Second,
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
			},
		}
		go collectLoop()
	})
}

func collectLoop() {
	// Run immediately, then every 15 minutes
	computeBaselines()
	tick := time.NewTicker(15 * time.Minute)
	defer tick.Stop()
	for range tick.C {
		computeBaselines()
	}
}

func computeBaselines() {
	if bOSURL == "" {
		return
	}

	// Aggregate hourly event counts per dataSource+action over the last 30 days
	query := map[string]any{
		"size": 0,
		"query": map[string]any{
			"range": map[string]any{
				"@timestamp": map[string]any{"gte": fmt.Sprintf("now-%dd", windowDays)},
			},
		},
		"aggs": map[string]any{
			"by_source": map[string]any{
				"terms": map[string]any{"field": "dataSource.keyword", "size": 500},
				"aggs": map[string]any{
					"by_action": map[string]any{
						"terms": map[string]any{"field": "action.keyword", "size": 100},
						"aggs": map[string]any{
							"hourly": map[string]any{
								"date_histogram": map[string]any{
									"field":             "@timestamp",
									"calendar_interval": "hour",
								},
							},
						},
					},
				},
			},
		},
	}

	body, _ := json.Marshal(query)
	req, _ := http.NewRequest("POST", bOSURL+"/_v3_hive_log-*/_search", bytes.NewReader(body))
	req.SetBasicAuth(bOSUser, bOSPass)
	req.Header.Set("Content-Type", "application/json")
	resp, err := bHTTP.Do(req)
	if err != nil {
		return
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)

	var result map[string]any
	if err := json.Unmarshal(data, &result); err != nil {
		return
	}

	newCache := map[string]AnomalyState{}
	// Parse aggregation buckets
	if aggs, ok := result["aggregations"].(map[string]any); ok {
		if bySource, ok := aggs["by_source"].(map[string]any); ok {
			if buckets, ok := bySource["buckets"].([]any); ok {
				for _, bk := range buckets {
					bkt, _ := bk.(map[string]any)
					source, _ := bkt["key"].(string)
					if byAction, ok := bkt["by_action"].(map[string]any); ok {
						if aBuckets, ok := byAction["buckets"].([]any); ok {
							for _, ab := range aBuckets {
								aBkt, _ := ab.(map[string]any)
								action, _ := aBkt["key"].(string)
								if hourly, ok := aBkt["hourly"].(map[string]any); ok {
									if hBuckets, ok := hourly["buckets"].([]any); ok {
										var counts []float64
										for _, hb := range hBuckets {
											hBkt, _ := hb.(map[string]any)
											if c, ok := hBkt["doc_count"].(float64); ok {
												counts = append(counts, c)
											}
										}
										mean, std := stats(counts)
										key := source + "|" + action
										newCache[key] = AnomalyState{Mean: mean, StdDev: std}

										// Write baseline doc
										doc := BaselineDoc{
											DataSource: source,
											Action:     action,
											Timestamp:  time.Now().UTC(),
											Mean:       mean,
											StdDev:     std,
											SampleSize: len(counts),
										}
										docBody, _ := json.Marshal(doc)
										idx := sdkos.BuildCurrentDayIndex("_v3_hive_", "baselines")
										putURL := fmt.Sprintf("%s/%s/_doc/%s", bOSURL, idx, source+"-"+action)
										req, _ := http.NewRequest("PUT", putURL, bytes.NewReader(docBody))
										req.SetBasicAuth(bOSUser, bOSPass)
										req.Header.Set("Content-Type", "application/json")
										r, err := bHTTP.Do(req)
										if err == nil {
											io.Copy(io.Discard, r.Body)
											r.Body.Close()
										}
									}
								}
							}
						}
					}
				}
			}
		}
	}

	bMu.Lock()
	bCache = newCache
	bMu.Unlock()
}

// IsAnomaly returns true when count exceeds mean + (sigma * stdDev).
func IsAnomaly(dataSource, action string, count float64) bool {
	bMu.RLock()
	state, ok := bCache[dataSource+"|"+action]
	bMu.RUnlock()
	if !ok || state.StdDev == 0 {
		return false
	}
	return count > state.Mean+sigmaThreshold*state.StdDev
}

func stats(values []float64) (mean, std float64) {
	if len(values) == 0 {
		return
	}
	var sum float64
	for _, v := range values {
		sum += v
	}
	mean = sum / float64(len(values))
	var variance float64
	for _, v := range values {
		d := v - mean
		variance += d * d
	}
	variance /= float64(len(values))
	std = math.Sqrt(variance)
	return
}
