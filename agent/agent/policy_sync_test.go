package agent

import (
	"net/http"
	"testing"

	"github.com/hivearmor/agent/config"
)

func TestSetAgentAuthHeaders_MatchesTelemetryPattern(t *testing.T) {
	req, err := http.NewRequest(http.MethodPost, "https://example.test/api/agent-policies/report-state", nil)
	if err != nil {
		t.Fatal(err)
	}
	cnf := &config.Config{AgentID: 42, AgentKey: "test-agent-key"}
	setAgentAuthHeaders(req, cnf)

	if got := req.Header.Get(HeaderAgentID); got != "42" {
		t.Fatalf("X-HiveArmor-Agent-Id=%q want 42", got)
	}
	if got := req.Header.Get(HeaderAgentKey); got != "test-agent-key" {
		t.Fatalf("X-Agent-Key=%q", got)
	}
	if auth := req.Header.Get("Authorization"); auth != "" {
		t.Fatalf("must not send Bearer agent key; got %q", auth)
	}
}

func TestSetAgentAuthHeaders_SkipsWhenIncomplete(t *testing.T) {
	req, _ := http.NewRequest(http.MethodGet, "https://example.test/x", nil)
	setAgentAuthHeaders(req, &config.Config{AgentID: 0, AgentKey: "k"})
	if req.Header.Get(HeaderAgentID) != "" || req.Header.Get(HeaderAgentKey) != "" {
		t.Fatal("expected no headers when AgentID is 0")
	}
	setAgentAuthHeaders(req, &config.Config{AgentID: 1, AgentKey: ""})
	if req.Header.Get(HeaderAgentID) != "" || req.Header.Get(HeaderAgentKey) != "" {
		t.Fatal("expected no headers when AgentKey empty")
	}
	setAgentAuthHeaders(req, nil)
}
