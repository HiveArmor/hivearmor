// Package enrichment — threat intel lookup from _v3_hive_lookup-threat-intel index.
package enrichment

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

type tiEntry struct {
	Malicious bool   `json:"malicious"`
	Source    string `json:"source"`
	Category  string `json:"category"`
}

var (
	tiMu    sync.RWMutex
	tiCache = map[string]tiEntry{}
	tiOnce  sync.Once
	tiClient *http.Client
	osURL, osUser, osPass string
)

// InitFeeds configures the threat intel enrichment.
func InitFeeds(url, user, pass string) {
	osURL, osUser, osPass = url, user, pass
	tiClient = &http.Client{
		Timeout: 5 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
	}
	go tiRefreshLoop()
}

func tiRefreshLoop() {
	loadThreatIntel()
	tick := time.NewTicker(15 * time.Minute)
	defer tick.Stop()
	for range tick.C {
		loadThreatIntel()
	}
}

func loadThreatIntel() {
	if osURL == "" {
		return
	}
	query := map[string]any{
		"query": map[string]any{
			"term": map[string]any{"type": "threat-intel"},
		},
		"size": 10000,
		"_source": []string{"ip", "malicious", "source", "tags"},
	}
	body, _ := json.Marshal(query)
	req, _ := http.NewRequest("POST", osURL+"/_v3_hive_lookup-threat-intel/_search", bytes.NewReader(body))
	req.SetBasicAuth(osUser, osPass)
	req.Header.Set("Content-Type", "application/json")

	resp, err := tiClient.Do(req)
	if err != nil {
		return
	}
	defer resp.Body.Close()

	var result struct {
		Hits struct {
			Hits []struct {
				Source struct {
					IP       string `json:"ip"`
					Malicious bool   `json:"malicious"`
					Source   string `json:"source"`
					Tags     []string `json:"tags"`
				} `json:"_source"`
			} `json:"hits"`
		} `json:"hits"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return
	}

	newCache := map[string]tiEntry{}
	for _, h := range result.Hits.Hits {
		s := h.Source
		cat := ""
		if len(s.Tags) > 0 {
			cat = s.Tags[0]
		}
		newCache[s.IP] = tiEntry{Malicious: s.Malicious, Source: s.Source, Category: cat}
	}
	tiMu.Lock()
	tiCache = newCache
	tiMu.Unlock()
}

// LookupThreatIntel returns threat intel enrichment for an IP, or nil.
func LookupThreatIntel(ip string) map[string]any {
	tiMu.RLock()
	entry, ok := tiCache[ip]
	tiMu.RUnlock()
	if !ok || !entry.Malicious {
		return nil
	}
	return map[string]any{
		"matched":  true,
		"source":   entry.Source,
		"severity": "high",
		"category": entry.Category,
	}
}

var _ = fmt.Sprintf
