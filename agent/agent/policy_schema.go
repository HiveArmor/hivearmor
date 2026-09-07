package agent

import (
	"encoding/json"
	"fmt"
	"strings"
)

// AgentPolicySchemaVersion is the policy document major version this agent understands.
// Optional telemetry interval fields are the v1.1-compatible extension (still schema_version 1).
const AgentPolicySchemaVersion = 1

// FIM rule apply modes.
const (
	FIMModeMerge   = "merge"
	FIMModeReplace = "replace"
)

// Telemetry interval clamps (hours). Backend/FE may emit any positive int; agent clamps.
const (
	DefaultTelemetryIntervalHours = 6
	MinTelemetryIntervalHours     = 1
	MaxTelemetryIntervalHours     = 168 // 7 days
)

// AgentPolicyDocument is the forward-compatible JSON schema the agent applies.
// Unknown fields are ignored. Backend contract is documented in
// agent/release/EXTERNAL_WORK.md (BE-POL-01 / telemetry schedule).
type AgentPolicyDocument struct {
	SchemaVersion int                      `json:"schema_version"`
	FIM           *FIMPolicySection        `json:"fim,omitempty"`
	Collectors    map[string]bool          `json:"collectors,omitempty"`
	Response      *ResponsePolicySection   `json:"response,omitempty"`
	Telemetry     *TelemetryPolicySection  `json:"telemetry,omitempty"`
}

// FIMPolicySection drives File Integrity Monitoring watch rules.
type FIMPolicySection struct {
	// Mode is "merge" (default) or "replace".
	Mode  string         `json:"mode,omitempty"`
	Rules []FIMWatchRule `json:"rules,omitempty"`
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

// TelemetryPolicySection schedules host SCA/SBOM posts (schema v1.1 fields on v1 docs).
// Missing / null → agent keeps DefaultTelemetryIntervalHours (6h).
type TelemetryPolicySection struct {
	SCAIntervalHours  *int `json:"sca_interval_hours,omitempty"`
	SBOMIntervalHours *int `json:"sbom_interval_hours,omitempty"`
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

	if doc.Telemetry != nil {
		if err := validateTelemetryHours("sca_interval_hours", doc.Telemetry.SCAIntervalHours); err != nil {
			return nil, err
		}
		if err := validateTelemetryHours("sbom_interval_hours", doc.Telemetry.SBOMIntervalHours); err != nil {
			return nil, err
		}
	}

	return &doc, nil
}

func validateTelemetryHours(field string, hours *int) error {
	if hours == nil {
		return nil
	}
	if *hours < 0 {
		return fmt.Errorf("telemetry.%s must be >= 0 (0 = use default)", field)
	}
	return nil
}

// ClampTelemetryIntervalHours maps a policy hour value to a safe duration hours.
// nil or 0 → default; values below Min are raised; above Max are capped.
func ClampTelemetryIntervalHours(hours *int) int {
	if hours == nil || *hours <= 0 {
		return DefaultTelemetryIntervalHours
	}
	h := *hours
	if h < MinTelemetryIntervalHours {
		return MinTelemetryIntervalHours
	}
	if h > MaxTelemetryIntervalHours {
		return MaxTelemetryIntervalHours
	}
	return h
}

// AllowShellFromPolicy reports whether the document explicitly enables shell.
func AllowShellFromPolicy(doc *AgentPolicyDocument) bool {
	return doc != nil && doc.Response != nil && doc.Response.AllowShell
}
