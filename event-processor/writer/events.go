package writer

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/hivearmor/event-processor/internal/httpclient"
	sdkos "github.com/hivearmor/sdk/os"
	"github.com/hivearmor/sdk/plugins"
)

var (
	eventQueueOnce sync.Once
	eventQueue     *sdkos.BulkQueue
)

// InitEventWriter must be called after sdkos.Connect().
func InitEventWriter() {
	eventQueueOnce.Do(func() {
		eventQueue = sdkos.NewBulkQueue("hivearmor-events", sdkos.BulkQueueConfig{
			FlushInterval:  1 * time.Second,
			FlushThreshold: 500,
			MaxRetries:     3,
			RetryDelay:     time.Second,
		})
	})
}

// WriteEvent indexes an event into the daily log index.
func WriteEvent(event *plugins.Event) {
	if event == nil || eventQueue == nil {
		return
	}
	doc := eventToDoc(event)
	idx := EventIndex(event)
	eventQueue.AddWithID(idx, event.Id, doc)
}

// WriteEventSync writes a single event directly to OpenSearch without going
// through the BulkQueue. Use this from the Kafka consumer path so that the
// Kafka offset is only committed after the write succeeds (at-least-once
// durability: a restart causes re-delivery/duplicate, never silent loss).
func WriteEventSync(event *plugins.Event, osURL, osUser, osPass string) error {
	if event == nil {
		return nil
	}
	doc := eventToDoc(event)
	idx := EventIndex(event)
	body, err := json.Marshal(doc)
	if err != nil {
		return fmt.Errorf("marshal event: %w", err)
	}
	url := fmt.Sprintf("%s/%s/_doc/%s", osURL, idx, event.Id)
	req, err := http.NewRequest("PUT", url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.SetBasicAuth(osUser, osPass)
	req.Header.Set("Content-Type", "application/json")

	cl := &http.Client{Timeout: 10 * time.Second, Transport: sharedTransport()}
	resp, err := cl.Do(req)
	if err != nil {
		return fmt.Errorf("write event %s: %w", event.Id, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("write event %s: HTTP %d", event.Id, resp.StatusCode)
	}
	return nil
}

// eventToDoc converts a plugins.Event to the normalized OpenSearch shape.
func eventToDoc(e *plugins.Event) map[string]any {
	doc := map[string]any{
		"@timestamp":   e.Timestamp,
		"id":           e.Id,
		"dataType":     e.DataType,
		"dataSource":   e.DataSource,
		"tenantId":     e.TenantId,
		"tenantName":   e.TenantName,
		"tenantPrefix": e.TenantPrefix,
		"raw":          e.Raw,
		"action":       e.Action,
		"actionResult": e.ActionResult,
		"severity":     e.Severity,
		"protocol":     e.Protocol,
	}

	// Pipeline parsers store source-specific fields as bare Event.Log keys. Keep
	// those fields under the canonical `log` object used by detection rules and
	// investigation views. Explicit dotted enrichment keys retain their existing
	// top-level representation for backward compatibility.
	logObj := map[string]any{}
	for k, v := range e.Log {
		if v == nil {
			continue
		}
		if strings.HasPrefix(k, "log.") {
			logObj[k[4:]] = v.AsInterface()
		} else if !strings.Contains(k, ".") {
			logObj[k] = v.AsInterface()
		} else {
			doc[k] = v.AsInterface()
		}
	}
	if len(logObj) > 0 {
		doc["log"] = logObj
	}

	// Store origin/target as both nested object (for CEL) and flat dot-notation (for OpenSearch term queries)
	if e.Origin != nil {
		doc["origin"] = sideDoc(e.Origin)
		doc["origin.ip"] = e.Origin.Ip
		doc["origin.user"] = e.Origin.User
		doc["origin.host"] = e.Origin.Host
	}
	if e.Target != nil {
		doc["target"] = sideDoc(e.Target)
		doc["target.ip"] = e.Target.Ip
		doc["target.user"] = e.Target.User
		doc["target.host"] = e.Target.Host
	}
	return doc
}

func sideDoc(s *plugins.Side) map[string]any {
	m := map[string]any{
		"ip":      s.Ip,
		"host":    s.Host,
		"user":    s.User,
		"domain":  s.Domain,
		"process": s.Process,
		"command": s.Command,
	}
	if s.Geolocation != nil {
		g := s.Geolocation
		m["geolocation"] = map[string]any{
			"country":     g.Country,
			"city":        g.City,
			"countryCode": g.CountryCode,
			"asn":         g.Asn,
			"aso":         g.Aso,
			"coordinates": map[string]any{
				"lat": g.Latitude,
				"lon": g.Longitude,
			},
		}
	}
	return m
}

// EventIndex is the OpenSearch write index for a normalized log event.
// Tenant-scoped events use v3-hive-log-<prefix>-YYYY.MM.DD to match
// MsspIndexResolver("log"). DataType stays a document field, not an index segment.
func EventIndex(event *plugins.Event) string {
	prefix := ""
	if event != nil {
		prefix = event.GetTenantPrefix()
	}
	return sdkos.BuildTenantIndex("log", prefix)
}

var syncTransportOnce sync.Once
var syncTransportVal http.RoundTripper

// OpenSearchStore persists required processing outputs with verified TLS.
type OpenSearchStore struct {
	URL  string
	User string
	Pass string
}

func (s OpenSearchStore) WriteEvent(event *plugins.Event) error {
	return WriteEventSync(event, s.URL, s.User, s.Pass)
}

func (s OpenSearchStore) WriteAlert(alert *plugins.Alert) error {
	return WriteAlertSync(alert, s.URL, s.User, s.Pass)
}

func sharedTransport() http.RoundTripper {
	syncTransportOnce.Do(func() {
		client, err := httpclient.NewSecureClient(10 * time.Second)
		if err != nil {
			log.Fatalf("opensearch tls client: %v", err)
		}
		syncTransportVal = client.Transport
	})
	return syncTransportVal
}

// dummy to keep context importable
var _ = func() { _ = context.Background(); _ = json.Marshal }
