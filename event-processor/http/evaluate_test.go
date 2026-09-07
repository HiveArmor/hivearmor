package http

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func evaluateRouter(key string) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/api/rules/evaluate", internalKeyAuth(key), handleRuleEvaluate)
	return r
}

func TestRuleEvaluate_requiresInternalKey(t *testing.T) {
	r := evaluateRouter("secret")
	req := httptest.NewRequest(http.MethodPost, "/api/rules/evaluate", bytes.NewBufferString(`{"ruleYaml":"name: X\nwhere: 'true'\n","event":{}}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without key, got %d", w.Code)
	}
}

func TestRuleEvaluate_sequenceDoesNotFakeCELHit(t *testing.T) {
	r := evaluateRouter("secret")
	body := `{"ruleYaml":"name: SEQ-BRUTE\nsequence:\n  - where: 'action == \"failed_auth\"'\n    within: 15m\n  - where: 'action == \"authentication_success\"'\n    within: 30m\n","event":{"action":"failed_auth"}}`
	req := httptest.NewRequest(http.MethodPost, "/api/rules/evaluate", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Key", "secret")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if payload["engine"] != "sequence" || payload["engineParity"] != "go" {
		t.Fatalf("unexpected engine metadata: %v", payload)
	}
	if payload["matched"] != false || payload["wouldAlert"] != false {
		t.Fatalf("sequence step CEL must not be reported as a hit: %v", payload)
	}
	if payload["sequenceComplete"] != false {
		t.Fatalf("sequenceComplete should be false: %v", payload)
	}
}

func TestRuleEvaluate_missingYAMLUnavailable(t *testing.T) {
	r := evaluateRouter("secret")
	req := httptest.NewRequest(http.MethodPost, "/api/rules/evaluate", bytes.NewBufferString(`{"event":{}}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Key", "secret")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
	if !bytes.Contains(w.Body.Bytes(), []byte(`"engineParity":"unavailable"`)) {
		t.Fatalf("expected unavailable parity, got %s", w.Body.String())
	}
}
