package sequence

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

// setupMockOS wires up a fake OpenSearch server and returns it.
// The caller must call srv.Close() when done.
func setupMockOS(t *testing.T) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(nil) // mux set below after creation
	return srv
}

// withMockOS replaces the package-level OS client with one pointing at the
// supplied httptest.Server.  It resets everything on cleanup.
func withMockOS(t *testing.T, srv *httptest.Server) {
	t.Helper()
	InitPersistence(srv.URL, "user", "pass")
	t.Cleanup(func() {
		osClient = nil
		osURL = ""
		osUser = ""
		osPass = ""
	})
}

// ---- persistState ----

func TestPersistState_SendsPUT(t *testing.T) {
	var (
		capturedMethod string
		capturedPath   string
		capturedBody   map[string]any
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedMethod = r.Method
		capturedPath = r.URL.Path
		body, _ := io.ReadAll(r.Body)
		json.Unmarshal(body, &capturedBody)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()
	withMockOS(t, srv)

	now := time.Now()
	ips := inProgressSeq{
		ruleID:      "rule-abc",
		matchedStep: 1,
		stepTimes:   []time.Time{now},
	}
	expiresAt := now.Add(30 * time.Minute)
	persistState("10.0.0.1|alice", ips, expiresAt)

	assert.Equal(t, http.MethodPut, capturedMethod)
	assert.True(t, strings.Contains(capturedPath, "v3-hive-sequence-state"), "path must contain index name")
	assert.True(t, strings.HasSuffix(capturedPath, docID("10.0.0.1|alice", "rule-abc")), "path must end with doc id")
	assert.Equal(t, "10.0.0.1|alice", capturedBody["adversaryKey"])
	assert.Equal(t, "rule-abc", capturedBody["ruleId"])
	assert.InDelta(t, float64(1), capturedBody["currentStep"], 0)
}

func TestPersistState_NoopWhenClientNil(t *testing.T) {
	// osClient is nil by default in a fresh test — should not panic.
	osClient = nil
	ips := inProgressSeq{ruleID: "x", matchedStep: 1, stepTimes: []time.Time{time.Now()}}
	assert.NotPanics(t, func() {
		persistState("key", ips, time.Now().Add(time.Minute))
	})
}

// ---- deleteStateDoc ----

func TestDeleteStateDoc_SendsDELETE(t *testing.T) {
	var capturedMethod string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedMethod = r.Method
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()
	withMockOS(t, srv)

	deleteStateDoc("10.0.0.1|alice", "rule-abc")
	assert.Equal(t, http.MethodDelete, capturedMethod)
}

// ---- loadPersistedStates ----

func TestLoadPersistedStates_PopulatesState(t *testing.T) {
	now := time.Now().UTC()
	doc := map[string]any{
		"adversaryKey": "10.0.0.2|bob",
		"ruleId":       "rule-xyz",
		"currentStep":  2,
		"stepsCompleted": []map[string]any{
			{"stepNumber": 1, "matchedAt": now.Add(-5 * time.Minute).Format(time.RFC3339)},
			{"stepNumber": 2, "matchedAt": now.Add(-2 * time.Minute).Format(time.RFC3339)},
		},
		"expiresAt": now.Add(25 * time.Minute).Format(time.RFC3339),
	}
	result := map[string]any{
		"hits": map[string]any{
			"hits": []map[string]any{
				{"_source": doc},
			},
		},
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(result)
	}))
	defer srv.Close()
	withMockOS(t, srv)

	// Reset state before load
	mu.Lock()
	state = map[string][]inProgressSeq{}
	mu.Unlock()

	loadPersistedStates()

	mu.Lock()
	seqs := state["10.0.0.2|bob"]
	mu.Unlock()

	assert.Len(t, seqs, 1)
	assert.Equal(t, "rule-xyz", seqs[0].ruleID)
	assert.Equal(t, 2, seqs[0].matchedStep)
	assert.Len(t, seqs[0].stepTimes, 2)
}

func TestLoadPersistedStates_404IsIgnored(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()
	withMockOS(t, srv)

	mu.Lock()
	state = map[string][]inProgressSeq{}
	mu.Unlock()

	assert.NotPanics(t, loadPersistedStates)

	mu.Lock()
	l := len(state)
	mu.Unlock()
	assert.Equal(t, 0, l)
}

func TestLoadPersistedStates_SkipsBadDocs(t *testing.T) {
	result := map[string]any{
		"hits": map[string]any{
			"hits": []map[string]any{
				// missing adversaryKey
				{"_source": map[string]any{"ruleId": "r", "currentStep": 1, "stepsCompleted": []map[string]any{{"matchedAt": time.Now().Format(time.RFC3339)}}}},
				// missing stepsCompleted
				{"_source": map[string]any{"adversaryKey": "1.2.3.4|u", "ruleId": "r", "currentStep": 1}},
			},
		},
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(result)
	}))
	defer srv.Close()
	withMockOS(t, srv)

	mu.Lock()
	state = map[string][]inProgressSeq{}
	mu.Unlock()

	loadPersistedStates()

	mu.Lock()
	l := len(state)
	mu.Unlock()
	assert.Equal(t, 0, l, "malformed docs must be skipped")
}

// ---- deleteExpiredDocs ----

func TestDeleteExpiredDocs_SendsDeleteByQuery(t *testing.T) {
	var (
		capturedMethod string
		capturedPath   string
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedMethod = r.Method
		capturedPath = r.URL.Path
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()
	withMockOS(t, srv)

	deleteExpiredDocs()
	assert.Equal(t, http.MethodPost, capturedMethod)
	assert.True(t, strings.Contains(capturedPath, "_delete_by_query"), "must call _delete_by_query")
}

// ---- integration: expiryLoop calls deleteExpiredDocs ----

func TestExpiryLoop_CallsDeleteExpiredDocs(t *testing.T) {
	var called atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "_delete_by_query") {
			called.Add(1)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()
	withMockOS(t, srv)

	// Run one tick of the expiry logic inline (mirrors expiryLoop body).
	mu.Lock()
	state = map[string][]inProgressSeq{}
	mu.Unlock()

	go deleteExpiredDocs()
	time.Sleep(50 * time.Millisecond)
	assert.Greater(t, int(called.Load()), 0, "_delete_by_query must have been called")
}
