// Package lookup enriches events from v3-hive-lookup-* reference data (assets, identities).
package lookup

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/threatwinds/go-sdk/plugins"
	"google.golang.org/protobuf/types/known/structpb"
)

type assetEntry struct {
	hostname     string
	criticality  string
	businessUnit string
}

type identityEntry struct {
	fullName    string
	department  string
	role        string
}

var (
	lMu        sync.RWMutex
	assets     = map[string]assetEntry{}   // keyed by IP
	identities = map[string]identityEntry{} // keyed by username
	lHTTP      *http.Client
	lOSURL     string
	lOSUser    string
	lOSPass    string
	lInitOnce  sync.Once
)

// Init configures the lookup service and starts the refresh loop.
func Init(osURL, user, pass string) {
	lInitOnce.Do(func() {
		lOSURL = osURL
		lOSUser = user
		lOSPass = pass
		lHTTP = &http.Client{
			Timeout: 5 * time.Second,
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
			},
		}
		go refreshLoop()
	})
}

func refreshLoop() {
	loadAll()
	tick := time.NewTicker(5 * time.Minute)
	defer tick.Stop()
	for range tick.C {
		loadAll()
	}
}

func loadAll() {
	loadAssets()
	loadIdentities()
}

func loadAssets() {
	if lOSURL == "" {
		return
	}
	query := map[string]any{"query": map[string]any{"match_all": map[string]any{}}, "size": 10000}
	body, _ := json.Marshal(query)
	req, _ := http.NewRequest("POST", lOSURL+"/v3-hive-lookup-assets/_search", bytes.NewReader(body))
	req.SetBasicAuth(lOSUser, lOSPass)
	req.Header.Set("Content-Type", "application/json")
	resp, err := lHTTP.Do(req)
	if err != nil {
		return
	}
	defer resp.Body.Close()

	var result struct {
		Hits struct {
			Hits []struct {
				Source struct {
					IP           string `json:"ip"`
					Hostname     string `json:"hostname"`
					Criticality  string `json:"criticality"`
					BusinessUnit string `json:"businessUnit"`
				} `json:"_source"`
			} `json:"hits"`
		} `json:"hits"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return
	}
	newAssets := map[string]assetEntry{}
	for _, h := range result.Hits.Hits {
		s := h.Source
		if s.IP != "" {
			newAssets[s.IP] = assetEntry{hostname: s.Hostname, criticality: s.Criticality, businessUnit: s.BusinessUnit}
		}
	}
	lMu.Lock()
	assets = newAssets
	lMu.Unlock()
}

func loadIdentities() {
	if lOSURL == "" {
		return
	}
	query := map[string]any{"query": map[string]any{"match_all": map[string]any{}}, "size": 10000}
	body, _ := json.Marshal(query)
	req, _ := http.NewRequest("POST", lOSURL+"/v3-hive-lookup-identities/_search", bytes.NewReader(body))
	req.SetBasicAuth(lOSUser, lOSPass)
	req.Header.Set("Content-Type", "application/json")
	resp, err := lHTTP.Do(req)
	if err != nil {
		return
	}
	defer resp.Body.Close()

	var result struct {
		Hits struct {
			Hits []struct {
				Source struct {
					Username   string `json:"username"`
					FullName   string `json:"fullName"`
					Department string `json:"department"`
					Role       string `json:"role"`
				} `json:"_source"`
			} `json:"hits"`
		} `json:"hits"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return
	}
	newIdents := map[string]identityEntry{}
	for _, h := range result.Hits.Hits {
		s := h.Source
		if s.Username != "" {
			newIdents[s.Username] = identityEntry{fullName: s.FullName, department: s.Department, role: s.Role}
		}
	}
	lMu.Lock()
	identities = newIdents
	lMu.Unlock()
}

// Enrich adds asset and identity fields to the event's Log map.
func Enrich(event *plugins.Event) {
	if event == nil {
		return
	}
	lMu.RLock()
	defer lMu.RUnlock()

	if event.Origin != nil {
		if ae, ok := assets[event.Origin.Ip]; ok {
			if event.Log == nil {
				return
			}
			setStr(event, "asset.hostname", ae.hostname)
			setStr(event, "asset.criticality", ae.criticality)
			setStr(event, "asset.businessUnit", ae.businessUnit)
		}
		if event.Origin.User != "" {
			if ie, ok := identities[event.Origin.User]; ok {
				setStr(event, "identity.fullName", ie.fullName)
				setStr(event, "identity.department", ie.department)
				setStr(event, "identity.role", ie.role)
			}
		}
	}
}

func setStr(event *plugins.Event, field, value string) {
	if event == nil || value == "" {
		return
	}
	event.Log[field] = structpb.NewStringValue(value)
}
