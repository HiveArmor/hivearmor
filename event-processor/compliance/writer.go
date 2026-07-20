package compliance

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	sdkos "github.com/threatwinds/go-sdk/os"
)

var (
	writerOnce sync.Once
	writerHTTP *http.Client
	writerURL  string
	writerUser string
	writerPass string
)

// InitWriter must be called before any WriteComplianceEvidence calls.
func InitWriter(osURL, user, pass string) {
	writerOnce.Do(func() {
		writerURL = osURL
		writerUser = user
		writerPass = pass
		writerHTTP = &http.Client{
			Timeout: 10 * time.Second,
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
			},
		}
	})
}

// WriteComplianceEvidence bulk-indexes all hits into the daily compliance evidence index.
// It is a no-op when there are no hits or the writer has not been initialised.
func WriteComplianceEvidence(hits []ComplianceHit) {
	if len(hits) == 0 || writerURL == "" {
		return
	}

	idx := sdkos.BuildCurrentDayIndex("v3-hive", "compliance-evidence")
	now := time.Now().UTC()

	// Build an NDJSON bulk request body.
	var buf bytes.Buffer
	actionLine := fmt.Sprintf("{\"index\":{\"_index\":%q}}\n", idx)
	for _, h := range hits {
		retentionDays := h.EvidenceRetentionDays
		if retentionDays <= 0 {
			retentionDays = 90
		}
		expiresAt := now.AddDate(0, 0, retentionDays).UTC().Format(time.RFC3339)

		doc := map[string]any{
			"@timestamp":            h.Timestamp,
			"mappingId":             h.MappingID,
			"controlId":             h.ControlID,
			"mappingType":           h.MappingType,
			"eventId":               h.EventID,
			"weight":                h.Weight,
			"evidenceExpiresAt":     expiresAt,
			"dataType":              h.DataType,
			"tenantId":              h.TenantID,
		}

		docJSON, err := json.Marshal(doc)
		if err != nil {
			continue
		}
		buf.WriteString(actionLine)
		buf.Write(docJSON)
		buf.WriteByte('\n')
	}

	if buf.Len() == 0 {
		return
	}

	url := fmt.Sprintf("%s/_bulk", writerURL)
	req, err := http.NewRequest("POST", url, bytes.NewReader(buf.Bytes()))
	if err != nil {
		return
	}
	req.SetBasicAuth(writerUser, writerPass)
	req.Header.Set("Content-Type", "application/x-ndjson")

	resp, err := writerHTTP.Do(req)
	if err != nil {
		return
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)
}
