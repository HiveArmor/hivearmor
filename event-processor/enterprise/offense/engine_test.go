package offense

import (
	"crypto/tls"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/threatwinds/go-sdk/plugins"
)

// requestCapture is a mock server that sends each captured request body to a channel.
type requestCapture struct {
	ch chan []byte
}

func newCapture() *requestCapture { return &requestCapture{ch: make(chan []byte, 8)} }

func (c *requestCapture) handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		c.ch <- b
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"result":"created"}`))
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
	srv := httptest.NewServer(cap.handler())
	t.Cleanup(srv.Close)

	// Directly set package-level vars (test is in same package).
	oOSURL = srv.URL
	oOSUser = ""
	oOSPass = ""
	oclient = &http.Client{
		Timeout:   5 * time.Second,
		Transport: &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}},
	}
	return cap
}

func TestWriteOffense_StatusIsString(t *testing.T) {
	cap := setupTest(t)

	alert := &plugins.Alert{Id: "test-alert-1", Adversary: &plugins.Side{Ip: "1.2.3.4"}}
	writeOffense("offense-uuid-1", alert, nil, 1)

	body := cap.recv(t) // first request = offense PUT

	var doc map[string]any
	require.NoError(t, json.Unmarshal(body, &doc))
	assert.Equal(t, "open", doc["status"], "status must be string 'open', not integer 1")
}

func TestWriteOffense_AlertsFieldNotAlertIds(t *testing.T) {
	cap := setupTest(t)

	alert := &plugins.Alert{Id: "test-alert-2", Adversary: &plugins.Side{Ip: "1.2.3.4"}}
	writeOffense("offense-uuid-2", alert, []string{"related-1"}, 2)

	body := cap.recv(t) // first request = offense PUT

	var doc map[string]any
	require.NoError(t, json.Unmarshal(body, &doc))
	assert.Contains(t, doc, "alerts", "field must be 'alerts' to match index mapping")
	assert.NotContains(t, doc, "alertIds", "field 'alertIds' must not appear in written document")
}

func TestWriteOffense_AlertsContainsAllIDs(t *testing.T) {
	cap := setupTest(t)

	alert := &plugins.Alert{Id: "trigger-id", Adversary: &plugins.Side{Ip: "10.0.0.1"}}
	writeOffense("offense-uuid-3", alert, []string{"related-1", "related-2"}, 3)

	body := cap.recv(t) // first request = offense PUT

	var doc map[string]any
	require.NoError(t, json.Unmarshal(body, &doc))
	alerts, ok := doc["alerts"].([]any)
	require.True(t, ok, "alerts field must be an array")
	assert.Contains(t, alerts, "trigger-id")
	assert.Contains(t, alerts, "related-1")
	assert.Contains(t, alerts, "related-2")
}
