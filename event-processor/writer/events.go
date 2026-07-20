package writer

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	sdkos "github.com/threatwinds/go-sdk/os"
	"github.com/threatwinds/go-sdk/plugins"
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
	idx := sdkos.BuildCurrentDayIndex("v3-hive", "log", event.DataType)
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
	idx := sdkos.BuildCurrentDayIndex("v3-hive", "log", event.DataType)
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

// eventToDoc converts a plugins.Event to a flat map suitable for OpenSearch.
func eventToDoc(e *plugins.Event) map[string]any {
	doc := map[string]any{
		"@timestamp":   e.Timestamp,
		"id":           e.Id,
		"dataType":     e.DataType,
		"dataSource":   e.DataSource,
		"tenantId":     e.TenantId,
		"tenantName":   e.TenantName,
		"raw":          e.Raw,
		"action":       e.Action,
		"actionResult": e.ActionResult,
		"severity":     e.Severity,
		"protocol":     e.Protocol,
	}

	// Fields starting with "log." go into a nested log object (matches seeded data schema).
	// All other fields (e.g. asset.hostname, identity.*) stay at the top level.
	logObj := map[string]any{}
	for k, v := range e.Log {
		if v == nil {
			continue
		}
		if strings.HasPrefix(k, "log.") {
			logObj[k[4:]] = v.AsInterface()
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

var syncTransportOnce sync.Once
var syncTransportVal *http.Transport

func sharedTransport() *http.Transport {
	syncTransportOnce.Do(func() {
		syncTransportVal = &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		}
	})
	return syncTransportVal
}

// dummy to keep context importable
var _ = func() { _ = context.Background(); _ = json.Marshal }
