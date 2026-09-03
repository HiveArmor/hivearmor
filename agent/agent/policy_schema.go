package agent

import (
	"encoding/json"
	"fmt"
	"strings"
)

// AgentPolicySchemaVersion is the policy document version this agent understands.
const AgentPolicySchemaVersion = 1

// FIM rule apply modes.
const (
	FIMModeMerge   = "merge"
	FIMModeReplace = "replace"
)

// AgentPolicyDocument is the forward-compatible JSON schema the agent applies.
// Unknown fields are ignored. Backend contract is documented in
// .plan/audits/AGENT_PLATFORM_EXTERNAL_WORK.md (BE-POL-01).
type AgentPolicyDocument struct {
	SchemaVersion int                    `json:"schema_version"`
	FIM           *FIMPolicySection      `json:"fim,omitempty"`
	Collectors    map[string]bool        `json:"collectors,omitempty"`
	Response      *ResponsePolicySection `json:"response,omitempty"`
}

// FIMPolicySection drives File Integrity Monitoring watch rules.
type FIMPolicySection struct {
	// Mode is "merge" (default) or "replace".
	Mode  string          `json:"mode,omitempty"`
	Rules []FIMWatchRule  `json:"rules,omitempty"`
}

// FIMWatchRule is the agent-local FIM path entry (mirrors collector/fim.WatchRule JSON).
type FIMWatchRule struct {
	Path      string   `json:"path"`
	Recursive bool     `json:"recursive"`
	Exclude   []string `json:"exclude,omitempty"`
}

// ResponsePolicySection gates high-impact remote actions.
type ResponsePolicySection struct {
	// AllowShell enables unstructured RemoteCommand shell execution.
	// Default false (deny). Structured EDR_* commands are unaffected.
	AllowShell bool `json:"allow_shell"`
}

// ParseAgentPolicyDocument unmarshals policy JSON. Empty input yields an empty
// valid document (schema_version 0) so callers keep platform defaults.
func ParseAgentPolicyDocument(raw string) (*AgentPolicyDocument, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return &AgentPolicyDocument{}, nil
	}

	var doc AgentPolicyDocument
	if err := json.Unmarshal([]byte(trimmed), &doc); err != nil {
		return nil, fmt.Errorf("policy JSON: %w", err)
	}

	if doc.SchemaVersion != 0 && doc.SchemaVersion != AgentPolicySchemaVersion {
		return nil, fmt.Errorf("unsupported policy schema_version %d (agent supports %d)",
			doc.SchemaVersion, AgentPolicySchemaVersion)
	}

	if doc.FIM != nil {
		mode := strings.ToLower(strings.TrimSpace(doc.FIM.Mode))
		if mode == "" {
			mode = FIMModeMerge
		}
		if mode != FIMModeMerge && mode != FIMModeReplace {
			return nil, fmt.Errorf("fim.mode must be %q or %q", FIMModeMerge, FIMModeReplace)
		}
		doc.FIM.Mode = mode
		for i, r := range doc.FIM.Rules {
			if strings.TrimSpace(r.Path) == "" {
				return nil, fmt.Errorf("fim.rules[%d]: path is required", i)
			}
		}
	}

	return &doc, nil
}

// AllowShellFromPolicy reports whether the document explicitly enables shell.
func AllowShellFromPolicy(doc *AgentPolicyDocument) bool {
	return doc != nil && doc.Response != nil && doc.Response.AllowShell
}
