package compliance

import (
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/threatwinds/go-sdk/plugins"
)

// MappingType constants mirror the values in UtmComplianceControlMapping.mappingType.
const (
	MappingTypeEvidence  = "EVIDENCE"
	MappingTypeViolation = "VIOLATION"
	MappingTypeIndicator = "INDICATOR"
)

// ControlMapping is the runtime representation of one compliance control mapping.
type ControlMapping struct {
	ID                    int64
	ControlID             int64
	MappingType           string
	DataTypes             []string // nil/empty means match all data types
	CelCondition          string
	Weight                float64
	EvidenceRetentionDays int
}

// mappingSet is what gets atomically swapped on each reload.
type mappingSet struct {
	all []ControlMapping
}

var (
	current atomic.Value // stores *mappingSet

	loaderOnce sync.Once
	celCache   *plugins.CELCache

	backendURL  string
	internalKey string

	httpClient *http.Client
)

func getCEL() *plugins.CELCache {
	loaderOnce.Do(func() {
		celCache = plugins.NewCELCache("com.hivearmor.compliance")
	})
	return celCache
}

// Init sets connection parameters and performs the initial mapping load.
// It then starts a background ticker that reloads every 30 seconds, matching
// the rules hot-reload cadence.
func Init(bURL, iKey string) {
	backendURL = bURL
	internalKey = iKey
	httpClient = &http.Client{
		Timeout: 15 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
	}
	// seed with empty set so callers never see a nil pointer
	current.Store(&mappingSet{})
	if err := reload(); err != nil {
		log.Printf("[compliance] initial mapping load failed: %v", err)
	}
	go watchLoop()
}

// GetMappings returns a snapshot of the currently loaded mapping list.
func GetMappings() []ControlMapping {
	ms, _ := current.Load().(*mappingSet)
	if ms == nil {
		return nil
	}
	return ms.all
}

// Reload triggers an immediate out-of-band mapping reload (e.g. from a webhook).
func Reload() error {
	return reload()
}

func watchLoop() {
	tick := time.NewTicker(30 * time.Second)
	defer tick.Stop()
	for range tick.C {
		if err := reload(); err != nil {
			log.Printf("[compliance] mapping reload failed: %v", err)
		}
	}
}

// mappingDTO mirrors the JSON shape returned by the backend.
type mappingDTO struct {
	ID                    int64   `json:"id"`
	ControlID             int64   `json:"controlId"`
	MappingType           string  `json:"mappingType"`
	DataTypes             string  `json:"dataTypes"` // comma-separated, may be empty
	CelCondition          string  `json:"celCondition"`
	Weight                float64 `json:"weight"`
	EvidenceRetentionDays int     `json:"evidenceRetentionDays"`
}

func reload() error {
	if backendURL == "" {
		return nil
	}

	dtos, err := fetchAllMappings()
	if err != nil {
		return err
	}

	mappings := make([]ControlMapping, 0, len(dtos))
	for _, dto := range dtos {
		if dto.CelCondition == "" {
			continue
		}
		m := ControlMapping{
			ID:                    dto.ID,
			ControlID:             dto.ControlID,
			MappingType:           dto.MappingType,
			CelCondition:          dto.CelCondition,
			Weight:                dto.Weight,
			EvidenceRetentionDays: dto.EvidenceRetentionDays,
		}
		if dto.DataTypes != "" {
			for _, dt := range strings.Split(dto.DataTypes, ",") {
				dt = strings.TrimSpace(dt)
				if dt != "" {
					m.DataTypes = append(m.DataTypes, dt)
				}
			}
		}
		mappings = append(mappings, m)
	}

	current.Store(&mappingSet{all: mappings})
	log.Printf("[compliance] loaded %d mappings", len(mappings))
	return nil
}

func fetchAllMappings() ([]mappingDTO, error) {
	url := fmt.Sprintf("%s/api/internal/compliance/mappings", backendURL)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Utm-Internal-Key", internalKey)

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch mappings: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("backend returned %d: %s", resp.StatusCode, string(body))
	}

	var dtos []mappingDTO
	if err := json.NewDecoder(resp.Body).Decode(&dtos); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}
	return dtos, nil
}
