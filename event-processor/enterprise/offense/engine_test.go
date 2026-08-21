package offense

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"testing"
	"time"

	"github.com/hivearmor/sdk/plugins"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// requestCapture is a mock server that sends each captured request body to a channel.
type requestCapture struct {
	ch chan []byte
}

func newCapture() *requestCapture { return &requestCapture{ch: make(chan []byte, 8)} }

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) { return f(request) }

func (c *requestCapture) transport() http.RoundTripper {
	return roundTripFunc(func(request *http.Request) (*http.Response, error) {
		body, _ := io.ReadAll(request.Body)
		c.ch <- body
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(bytes.NewBufferString(`{"result":"created"}`)),
			Header:     make(http.Header),
			Request:    request,
		}, nil
	})
}

// recv waits up to 1s for the next captured body.
func (c *requestCapture) recv(t *testing.T) []byte {
	t.Helper()
	select {
	case b := <-c.ch:
		return b
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for mock server request")
		return nil
	}
}

// setupTest wires the offense engine to a fresh mock server and returns the capture helper.
func setupTest(t *testing.T) *requestCapture {
	t.Helper()
	cap := newCapture()

	// Directly set package-level vars (test is in same package).
	oOSURL = "https://opensearch.test"
	oOSUser = ""
	oOSPass = ""
	oclient = &http.Client{
		Timeout:   5 * time.Second,
		Transport: cap.transport(),
	}
	return cap
}

func TestWriteOffense_WritesCanonicalFinding(t *testing.T) {
	cap := setupTest(t)

	alert := &plugins.Alert{Id: "test-alert-1", Adversary: &plugins.Side{Ip: "1.2.3.4"}}
	writeOffense("offense-uuid-1", alert, nil, 1)

	body := cap.recv(t) // first request = canonical correlation PUT

	var doc map[string]any
	require.NoError(t, json.Unmarshal(body, &doc))
	assert.Equal(t, "new", doc["status"])
	assert.Equal(t, "offense-uuid-1", doc["id"])
	assert.Equal(t, float64(1), doc["signalCount"])
	assert.Contains(t, doc, "stages")
	assert.Contains(t, doc, "entities")
	assert.Contains(t, doc, "correlationReasons")
	correlationEngine, ok := doc["correlationEngine"].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, "hivearmor-event-processor finding-correlator/1", correlationEngine["version"])
	assert.Contains(t, correlationEngine["ruleIds"], "shared-adversary-2h")
	assert.Equal(t, float64(1), doc["version"])
	assert.Equal(t, "complete", doc["dataCompleteness"])
}

func TestWriteOffense_AlertsFieldNotAlertIds(t *testing.T) {
	cap := setupTest(t)

	alert := &plugins.Alert{Id: "test-alert-2", Adversary: &plugins.Side{Ip: "1.2.3.4"}}
	writeOffense("offense-uuid-2", alert, []string{"related-1"}, 2)

	body := cap.recv(t) // first request = canonical correlation PUT

	var doc map[string]any
	require.NoError(t, json.Unmarshal(body, &doc))
	assert.Contains(t, doc, "alerts", "field must be 'alerts' to match index mapping")
	assert.NotContains(t, doc, "alertIds", "field 'alertIds' must not appear in written document")
}

func TestWriteOffense_AlertsContainsAllIDs(t *testing.T) {
	cap := setupTest(t)

	alert := &plugins.Alert{Id: "trigger-id", Adversary: &plugins.Side{Ip: "10.0.0.1"}}
	writeOffense("offense-uuid-3", alert, []string{"related-1", "related-2"}, 3)

	body := cap.recv(t) // first request = canonical correlation PUT

	var doc map[string]any
	require.NoError(t, json.Unmarshal(body, &doc))
	alerts, ok := doc["alerts"].([]any)
	require.True(t, ok, "alerts field must be an array")
	assert.Contains(t, alerts, "trigger-id")
	assert.Contains(t, alerts, "related-1")
	assert.Contains(t, alerts, "related-2")
}

func TestUniqueAlertReferences_DeduplicatesTrigger(t *testing.T) {
	alert := &plugins.Alert{Id: "trigger-id", Timestamp: "2026-08-13T10:00:00Z"}
	refs := uniqueAlertReferences([]alertReference{
		{ID: "related-1", Timestamp: "2026-08-13T09:58:00Z"},
		{ID: "trigger-id", Timestamp: "2026-08-13T10:00:00Z"},
	}, alert)
	require.Len(t, refs, 2)
	assert.Equal(t, "related-1", refs[0].ID)
	assert.Equal(t, "trigger-id", refs[1].ID)
}

func TestWriteOffense_LegacyProjectionIsDeprecated(t *testing.T) {
	cap := setupTest(t)
	alert := &plugins.Alert{Id: "trigger-id", Adversary: &plugins.Side{User: "shared-user"}}
	writeOffense("finding-uuid", alert, []string{"related-1", "related-2"}, 3)

	_ = cap.recv(t) // canonical correlation document
	legacyBody := cap.recv(t)
	var legacy map[string]any
	require.NoError(t, json.Unmarshal(legacyBody, &legacy))
	assert.Equal(t, true, legacy["deprecated"])
	assert.Equal(t, "v3-hive-correlation-*", legacy["successorIndex"])
}
