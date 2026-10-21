package agent

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

// PT-4 template-section enforcement.
//
// This file adds agent-side parsing + capability negotiation for the PT-2-authored
// template sections that previously carried the "authored — not yet enforced" note:
// Event, User Log, Change, Script, Certificate. The sections live in the PT-0 schema-v1
// policyConfig (wire schema_version stays 1 — these keys are additive, NON_NULL).
//
// Design contract (PT-0 §6, "wire-contract versioning note"):
//   - Unknown / older-shape fields are IGNORED, never fatal. An agent that predates a
//     section deserializes the document, keeps the sections it understands, and drops
//     the rest. Parsing MUST NOT crash on a shape it does not recognise.
//   - The agent advertises which sections it can actually ENFORCE (capability
//     negotiation). The backend/UI reflect the real capability so PT-2's honesty notes
//     are accurate — we never pretend enforcement.
//
// SECURITY (SPEC-PT-4 §4): script content is sensitive. It is never logged; execution is
// NOT performed by this agent build (see SectionCapabilities), only parsed and audited.

// SectionInclusionList is the agent-side representation of an event-id include/exclude
// filter. The wire value is either a string ("ALL", "NONE", or a comma-separated list
// like "4624,4625") OR a JSON array of strings/integers. Both shapes normalise to a
// trimmed []string of tokens; an unrecognised shape yields an empty list rather than an
// error (ignore-unknown safety).
type SectionInclusionList []string

// UnmarshalJSON accepts string | []string | []int | []number and normalises to tokens.
// It never fails on a shape mismatch — an unexpected JSON value decodes to an empty list
// so an older/newer document shape can never crash policy apply.
func (l *SectionInclusionList) UnmarshalJSON(data []byte) error {
	trimmed := strings.TrimSpace(string(data))
	if trimmed == "" || trimmed == "null" {
		*l = nil
		return nil
	}

	// Try scalar string first ("ALL" / "NONE" / "4624,4625").
	var s string
	if err := json.Unmarshal(data, &s); err == nil {
		*l = splitInclusionTokens(s)
		return nil
	}

	// Try an array of arbitrary JSON values (strings or numbers).
	var arr []json.RawMessage
	if err := json.Unmarshal(data, &arr); err == nil {
		out := make([]string, 0, len(arr))
		for _, raw := range arr {
			out = append(out, rawTokenToString(raw)...)
		}
		*l = out
		return nil
	}

	// Unrecognised shape (object, bool, etc.) — ignore safely.
	*l = nil
	return nil
}

func rawTokenToString(raw json.RawMessage) []string {
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return splitInclusionTokens(s)
	}
	var n json.Number
	if err := json.Unmarshal(raw, &n); err == nil {
		t := strings.TrimSpace(n.String())
		if t != "" {
			return []string{t}
		}
	}
	// bool / object / null element — skip it.
	return nil
}

// splitInclusionTokens turns "ALL" / "4624, 4625" into normalised tokens.
// "ALL"/"NONE" (case-insensitive) are preserved as single upper-case keywords.
func splitInclusionTokens(s string) []string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	if strings.EqualFold(s, "ALL") {
		return []string{"ALL"}
	}
	if strings.EqualFold(s, "NONE") {
		return []string{"NONE"}
	}
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

// EventPolicySection subscribes to OS event/file logs (SPEC-PT-4 §1, event-driven).
type EventPolicySection struct {
	// FileLog toggles built-in file-log sources (iis, dhcp, …). Keys beyond iis/dhcp
	// are retained so newer sources round-trip; the agent enables only what it supports.
	FileLog   map[string]bool `json:"fileLog,omitempty"`
	EventLogs []EventLogEntry `json:"eventLogs,omitempty"`
}

// EventLogEntry is one Windows Event Log channel row. Sysmon/DNS-analytical are modelled
// as type=Other + channel per the PT-0 schema.
type EventLogEntry struct {
	Type    string               `json:"type"`
	Channel string               `json:"channel,omitempty"`
	Include SectionInclusionList `json:"include,omitempty"`
	Exclude SectionInclusionList `json:"exclude,omitempty"`
}

// UserLogTail tails an arbitrary file with an optional log prefix and multiline grouping
// (SPEC-PT-4 §2). This maps to the agent's existing file-tail collector surface.
type UserLogTail struct {
	FullFileName string            `json:"fullFileName"`
	LogPrefix    string            `json:"logPrefix,omitempty"`
	Multiline    *UserLogMultiline `json:"multiline,omitempty"`
}

// UserLogMultiline groups multi-line records (start/end markers, cap on lines).
type UserLogMultiline struct {
	Start    string `json:"start,omitempty"`
	End      string `json:"end,omitempty"`
	MaxLines int    `json:"maxLines,omitempty"`
}

// ChangePolicySection watches registry root-keys and (optionally) installed-software
// deltas (SPEC-PT-4 §3). Registry watching reuses the existing Windows registry watcher.
type ChangePolicySection struct {
	Registry          []ChangeRegistryWatch `json:"registry,omitempty"`
	InstalledSoftware bool                  `json:"installedSoftware,omitempty"`
}

// ChangeRegistryWatch is one root-key watch with excluded subkeys.
type ChangeRegistryWatch struct {
	RootKey        string   `json:"rootKey"`
	ExcludeSubkeys []string `json:"excludeSubkeys,omitempty"`
}

// ScriptPolicySection declares WMI classes and PowerShell scripts for collection
// (SPEC-PT-4 §4). SCRIPT CONTENT IS SENSITIVE: this agent build parses and audits it but
// does NOT execute it (see SectionCapabilities). Content is never written to logs.
type ScriptPolicySection struct {
	WMI        []string `json:"wmi,omitempty"`
	PowerShell []string `json:"powershell,omitempty"`
}

// CertificateStoreWatch monitors one certificate store for lifecycle events
// (SPEC-PT-4 §5).
type CertificateStoreWatch struct {
	Store    string `json:"store"`
	Add      bool   `json:"add,omitempty"`
	Delete   bool   `json:"delete,omitempty"`
	Expiring bool   `json:"expiring,omitempty"`
	Expired  bool   `json:"expired,omitempty"`
}

// normalizeEventSection trims and drops malformed rows. An eventLog row with no "type"
// is dropped (the schema requires it) rather than failing the whole apply.
func normalizeEventSection(in *EventPolicySection) {
	if in == nil {
		return
	}
	rows := in.EventLogs[:0]
	for _, e := range in.EventLogs {
		e.Type = strings.TrimSpace(e.Type)
		e.Channel = strings.TrimSpace(e.Channel)
		if e.Type == "" {
			continue // required field missing — drop safely
		}
		rows = append(rows, e)
	}
	in.EventLogs = rows
}

// normalizeUserLog drops entries missing the required fullFileName and clamps maxLines.
func normalizeUserLog(in []UserLogTail) []UserLogTail {
	out := in[:0]
	for _, u := range in {
		u.FullFileName = strings.TrimSpace(u.FullFileName)
		u.LogPrefix = strings.TrimSpace(u.LogPrefix)
		if u.FullFileName == "" {
			continue // required field missing — drop safely
		}
		if u.Multiline != nil && u.Multiline.MaxLines < 0 {
			u.Multiline.MaxLines = 0
		}
		out = append(out, u)
	}
	return out
}

// normalizeChangeSection trims root keys and drops malformed rows.
func normalizeChangeSection(in *ChangePolicySection) {
	if in == nil {
		return
	}
	rows := in.Registry[:0]
	for _, r := range in.Registry {
		r.RootKey = strings.TrimSpace(r.RootKey)
		if r.RootKey == "" {
			continue // required field missing — drop safely
		}
		cleaned := make([]string, 0, len(r.ExcludeSubkeys))
		for _, s := range r.ExcludeSubkeys {
			if s = strings.TrimSpace(s); s != "" {
				cleaned = append(cleaned, s)
			}
		}
		r.ExcludeSubkeys = cleaned
		rows = append(rows, r)
	}
	in.Registry = rows
}

// normalizeScriptSection trims entries. Content is NOT logged or inspected beyond
// emptiness. Empty strings are dropped.
func normalizeScriptSection(in *ScriptPolicySection) {
	if in == nil {
		return
	}
	in.WMI = trimNonEmpty(in.WMI)
	in.PowerShell = trimNonEmpty(in.PowerShell)
}

// normalizeCertificate drops entries missing the required store name.
func normalizeCertificate(in []CertificateStoreWatch) []CertificateStoreWatch {
	out := in[:0]
	for _, c := range in {
		c.Store = strings.TrimSpace(c.Store)
		if c.Store == "" {
			continue // required field missing — drop safely
		}
		out = append(out, c)
	}
	return out
}

func trimNonEmpty(in []string) []string {
	out := in[:0]
	for _, s := range in {
		if t := strings.TrimSpace(s); t != "" {
			out = append(out, t)
		}
	}
	return out
}

// RegistryRootKeysFromChange converts change.registry rows into the HKLM-relative key
// strings the existing FIM registry watcher consumes. Non-HKLM roots are kept verbatim;
// the registry watcher applies its own HKLM-prefix normalisation. excludeSubkeys are
// advisory and not yet consumed by the watcher (reported as not-enforced).
func RegistryRootKeysFromChange(sec *ChangePolicySection) []string {
	if sec == nil {
		return nil
	}
	out := make([]string, 0, len(sec.Registry))
	for _, r := range sec.Registry {
		if r.RootKey != "" {
			out = append(out, r.RootKey)
		}
	}
	return out
}

// EnforcementStatus is the honest per-section enforcement level advertised to the backend.
type EnforcementStatus string

const (
	// EnforcementFull — the section is parsed and fully acted on.
	EnforcementFull EnforcementStatus = "enforced"
	// EnforcementPartial — the section is parsed and partially acted on; some sub-fields
	// are recorded as desired-state or not yet wired.
	EnforcementPartial EnforcementStatus = "partial"
	// EnforcementParsedOnly — the section is parsed/validated/ignored-safely but NOT
	// acted on by this agent build (honesty note: "delivered, not enforced").
	EnforcementParsedOnly EnforcementStatus = "parsed-only"
)

// SectionCapabilities is the agent's HONEST self-report of what it can enforce, keyed by
// the template section name. It is static per agent build and reported to the backend so
// the UI reflects real capability. We NEVER report a section as enforced that we do not
// act on.
//
// Rationale per section (SPEC-PT-4):
//   - event       parsed-only: the event section is parsed, normalized and desired-state
//     recorded, but NO collector consumes it yet — there is no runtime
//     subscription of Windows Event Log channels or fileLog paths in this
//     build. Honest posture matches script/certificate until the event
//     collector wiring lands.
//   - userLog     enforced: arbitrary file tailing is a first-class existing collector.
//   - change      partial: registry root-key watch reuses the existing registry watcher;
//     installedSoftware delta + excludeSubkeys are not yet wired.
//   - script      parsed-only: no WMI/PowerShell execution engine in this build; content
//     is sensitive and deliberately NOT executed or logged.
//   - certificate parsed-only: no certificate-store watcher in this build.
func SectionCapabilities() map[string]EnforcementStatus {
	caps := map[string]EnforcementStatus{
		"event":       EnforcementParsedOnly,
		"userLog":     EnforcementFull,
		"change":      EnforcementPartial,
		"script":      EnforcementParsedOnly,
		"certificate": EnforcementParsedOnly,
		// Sections enforced before PT-4 (reported for completeness/honesty).
		"fim":       EnforcementFull,
		"telemetry": EnforcementFull,
		"response":  EnforcementFull,
	}
	// PT-5 scans capability — reported honestly per sub-scanner:
	//   scans.vuln → scheduled: enforced (cadence drives the SHIPPED SBOM inventory
	//     loop feeding HaVulnService). realtime: partial — there is no change-trigger
	//     hook yet, so realtime vuln keeps the scheduled SBOM floor but cannot re-scan
	//     on a package-change event; we never advertise it as fully enforced.
	//   scans.cis  → runtime-determined: the OpenSCAP/OVAL engine can only enforce
	//     when SCAP content is present AND the oscap tool is available on the host.
	//     When both hold it is enforced; otherwise it is parsed-only (we schedule the
	//     intent but cannot run a scan) — never pretend enforcement on a host that
	//     cannot run it. A cron-expression cadence (vs a duration) is partial.
	caps["scans.vuln"] = vulnCadenceCapability()
	caps["scans.cis"] = cisEngineCapability()
	return caps
}

// vulnCadenceCapability reports the honest enforcement level for scans.vuln. The
// cadence knob drives the SHIPPED SBOM inventory loop, so SCHEDULED vuln is fully
// enforced. REALTIME vuln, however, has no change-trigger hook yet — the agent keeps
// the scheduled SBOM floor but cannot re-scan on a package-change event — so it is
// advertised as PARTIAL, not enforced, when the applied policy asks for realtime.
// Absent/scheduled vuln (and no policy yet) report enforced.
func vulnCadenceCapability() EnforcementStatus {
	doc := GetAppliedPolicy()
	if doc != nil && doc.Scans != nil && doc.Scans.Vuln != nil &&
		doc.Scans.Vuln.RunByAgent() && doc.Scans.Vuln.IsRealtime() {
		return EnforcementPartial
	}
	return EnforcementFull
}

// CapabilityAdvertisement is the compact capability string reported on vitals/report-state.
// Format: comma-separated "section=status" pairs, deterministic order, e.g.
// "certificate=parsed-only,change=partial,event=partial,...". No customer data, no paths.
func CapabilityAdvertisement() string {
	caps := SectionCapabilities()
	keys := make([]string, 0, len(caps))
	for k := range caps {
		keys = append(keys, k)
	}
	// deterministic order without importing sort (small fixed set)
	for i := 0; i < len(keys); i++ {
		for j := i + 1; j < len(keys); j++ {
			if keys[j] < keys[i] {
				keys[i], keys[j] = keys[j], keys[i]
			}
		}
	}
	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		parts = append(parts, fmt.Sprintf("%s=%s", k, caps[k]))
	}
	return strings.Join(parts, ",")
}

// sectionCount is a tiny helper for structured, data-free apply logging.
func sectionCount(n int) string { return strconv.Itoa(n) }
