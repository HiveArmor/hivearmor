package agent

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/hivearmor/agent/config"
	"github.com/hivearmor/agent/database"
	"github.com/hivearmor/agent/utils"
)

// PolicyState is persisted locally in SQLite to track applied policy versions.
type PolicyState struct {
	ID             uint   `gorm:"primaryKey;autoIncrement"`
	PolicyID       int64  `gorm:"index"`
	AppliedVersion int    `gorm:"column:applied_version"`
	PolicyConfig   string `gorm:"column:policy_config;type:text"`
	AppliedAt      int64  `gorm:"column:applied_at"`
}

func initPolicyDB() error {
	db, err := database.GetDB()
	if err != nil {
		return fmt.Errorf("policy_sync: opening db: %w", err)
	}
	return db.Migrate(&PolicyState{})
}

// HandlePolicyCommand intercepts structured policy commands from the command processor.
// Returns (handled bool, result string).
func HandlePolicyCommand(cnf *config.Config, command string) (bool, string) {
	switch {
	case strings.HasPrefix(command, "APPLY_POLICY:"):
		return true, handleApplyPolicy(cnf, command)

	case command == "REPORT_POLICY_STATE" || strings.HasPrefix(command, "REPORT_POLICY_STATE:"):
		return true, handleReportPolicyState(cnf, command)

	case strings.HasPrefix(command, "SYNC_RULES:"):
		return true, handleSyncRules(cnf, command)
	}
	return false, ""
}

// handleApplyPolicy parses "APPLY_POLICY:<policyId>:<version>" and stores the config locally.
func handleApplyPolicy(cnf *config.Config, command string) string {
	// format: APPLY_POLICY:<policyId>:<version>
	parts := strings.SplitN(strings.TrimPrefix(command, "APPLY_POLICY:"), ":", 2)
	if len(parts) < 1 || parts[0] == "" {
		return "APPLY_POLICY error: missing policyId"
	}

	policyID, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return fmt.Sprintf("APPLY_POLICY error: invalid policyId %q: %v", parts[0], err)
	}

	version := 0
	if len(parts) == 2 && parts[1] != "" {
		version, _ = strconv.Atoi(parts[1])
	}

	// Fetch full policy config from backend
	policyConfig, err := fetchPolicyConfig(cnf, policyID)
	if err != nil {
		utils.Logger.ErrorF("policy_sync: failed to fetch policy %d: %v", policyID, err)
		reportPolicyStateToBackend(cnf, policyID, version, "FAILED", fmt.Sprintf("fetch error: %v", err))
		return fmt.Sprintf("APPLY_POLICY error: fetch failed: %v", err)
	}

	// Persist to local SQLite
	db, err := database.GetDB()
	if err != nil {
		utils.Logger.ErrorF("policy_sync: db error: %v", err)
		return fmt.Sprintf("APPLY_POLICY error: db: %v", err)
	}

	if err := db.Migrate(&PolicyState{}); err != nil {
		utils.Logger.ErrorF("policy_sync: migrate error: %v", err)
	}

	// Upsert: delete existing, insert new
	_ = db.Delete(&PolicyState{}, "policy_id", strconv.FormatInt(policyID, 10))

	state := &PolicyState{
		PolicyID:       policyID,
		AppliedVersion: version,
		PolicyConfig:   policyConfig,
		AppliedAt:      time.Now().Unix(),
	}
	if err := db.Create(state); err != nil {
		utils.Logger.ErrorF("policy_sync: store error: %v", err)
		reportPolicyStateToBackend(cnf, policyID, version, "FAILED", fmt.Sprintf("store error: %v", err))
		return fmt.Sprintf("APPLY_POLICY error: store: %v", err)
	}

	// Runtime apply (FIM + collector desired state + shell gate) before APPLIED ACK.
	if err := ApplyPolicyConfig(policyConfig); err != nil {
		utils.Logger.ErrorF("policy_sync: apply error: %v", err)
		reportPolicyStateToBackend(cnf, policyID, version, "FAILED", fmt.Sprintf("apply error: %v", err))
		return fmt.Sprintf("APPLY_POLICY error: apply: %v", err)
	}

	reportPolicyStateToBackend(cnf, policyID, version, "APPLIED", "")
	utils.Logger.LogF(100, "policy_sync: applied policy %d version %d", policyID, version)
	return fmt.Sprintf("APPLY_POLICY OK: policy=%d version=%d", policyID, version)
}

// handleReportPolicyState sends all local policy states back to the backend.
// Command may be just "REPORT_POLICY_STATE" or "REPORT_POLICY_STATE:<policyId>".
func handleReportPolicyState(cnf *config.Config, command string) string {
	suffix := strings.TrimPrefix(command, "REPORT_POLICY_STATE")
	suffix = strings.TrimPrefix(suffix, ":")

	db, err := database.GetDB()
	if err != nil {
		return fmt.Sprintf("REPORT_POLICY_STATE error: db: %v", err)
	}

	var states []PolicyState
	if err := db.GetAll(&states); err != nil {
		return fmt.Sprintf("REPORT_POLICY_STATE error: query: %v", err)
	}

	reported := 0
	for _, s := range states {
		if suffix != "" {
			reqID, _ := strconv.ParseInt(suffix, 10, 64)
			if s.PolicyID != reqID {
				continue
			}
		}
		reportPolicyStateToBackend(cnf, s.PolicyID, s.AppliedVersion, "APPLIED", "")
		reported++
	}

	return fmt.Sprintf("REPORT_POLICY_STATE OK: reported %d states", reported)
}

// handleSyncRules handles "SYNC_RULES:<ruleId>" — acknowledges rule sync to backend.
func handleSyncRules(cnf *config.Config, command string) string {
	ruleIDStr := strings.TrimPrefix(command, "SYNC_RULES:")
	ruleID, err := strconv.ParseInt(ruleIDStr, 10, 64)
	if err != nil {
		return fmt.Sprintf("SYNC_RULES error: invalid ruleId %q: %v", ruleIDStr, err)
	}

	// Notify backend that this agent has acknowledged the rule sync
	if err := notifyRuleSyncAck(cnf, ruleID); err != nil {
		utils.Logger.ErrorF("policy_sync: rule sync ack failed for rule %d: %v", ruleID, err)
		return fmt.Sprintf("SYNC_RULES error: ack failed: %v", err)
	}

	utils.Logger.LogF(100, "policy_sync: acknowledged rule sync for rule %d", ruleID)
	return fmt.Sprintf("SYNC_RULES OK: rule=%d", ruleID)
}

// fetchPolicyConfig fetches the policy JSON config from the backend REST API.
func fetchPolicyConfig(cnf *config.Config, policyID int64) (string, error) {
	url := fmt.Sprintf("https://%s/api/agent-policies/%d", cnf.Server, policyID)
	resp, err := doBackendRequest(cnf, "GET", url, nil)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("reading response: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("backend returned %d: %s", resp.StatusCode, string(body))
	}

	// Extract policyConfig field from the DTO
	var dto map[string]interface{}
	if err := json.Unmarshal(body, &dto); err != nil {
		return string(body), nil
	}
	if cfg, ok := dto["policyConfig"].(string); ok {
		return cfg, nil
	}
	return string(body), nil
}

// reportPolicyStateToBackend POSTs policy state to /api/agent-policies/report-state.
func reportPolicyStateToBackend(cnf *config.Config, policyID int64, appliedVersion int, state, driftDetails string) {
	url := fmt.Sprintf("https://%s/api/agent-policies/report-state", cnf.Server)
	payload := map[string]interface{}{
		"agentId":        strconv.Itoa(int(cnf.AgentID)),
		"policyId":       policyID,
		"appliedVersion": appliedVersion,
		"state":          state,
		"driftDetails":   driftDetails,
	}
	body, _ := json.Marshal(payload)
	resp, err := doBackendRequest(cnf, "POST", url, body)
	if err != nil {
		utils.Logger.ErrorF("policy_sync: report state failed: %v", err)
		return
	}
	defer resp.Body.Close()
}

// notifyRuleSyncAck tells the backend this agent has acknowledged a rule push.
// Contract (BE-POL-02): POST /api/alert-response-rules/push-status/{ruleId}/ack
// with X-HiveArmor-Agent-Id + X-Agent-Key (optional agentId query for legacy).
func notifyRuleSyncAck(cnf *config.Config, ruleID int64) error {
	url := fmt.Sprintf("https://%s/api/alert-response-rules/push-status/%d/ack?agentId=%d",
		cnf.Server, ruleID, cnf.AgentID)
	payload, _ := json.Marshal(map[string]interface{}{
		"agentId": strconv.Itoa(int(cnf.AgentID)),
		"ruleId":  ruleID,
		"state":   "ACKNOWLEDGED",
	})
	resp, err := doBackendRequest(cnf, "POST", url, payload)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("backend returned %d: %s", resp.StatusCode, string(body))
	}
	return nil
}

// SyncOnConnectResponse is the documented contract for POST /api/agent-policies/sync-on-connect.
// Backend Next may return policies to apply locally and/or push APPLY_POLICY via gRPC.
type SyncOnConnectResponse struct {
	Policies []SyncOnConnectPolicy `json:"policies"`
}

// SyncOnConnectPolicy is one desired policy document from sync-on-connect.
type SyncOnConnectPolicy struct {
	PolicyID     int64  `json:"policyId"`
	Version      int    `json:"version"`
	PolicyConfig string `json:"policyConfig"`
}

// SyncPoliciesOnConnect calls backend sync-on-connect after AgentStream is up.
// If the endpoint is missing (404) or not ready, falls back to re-applying the
// latest local PolicyState and REPORT_POLICY_STATE (STAGING CANDIDATE).
func SyncPoliciesOnConnect(cnf *config.Config) {
	if cnf == nil || cnf.AgentID == 0 || strings.TrimSpace(cnf.AgentKey) == "" {
		return
	}
	if err := syncPoliciesOnConnect(cnf); err != nil {
		utils.Logger.ErrorF("policy_sync: sync-on-connect: %v", err)
	}
}

func syncPoliciesOnConnect(cnf *config.Config) error {
	url := fmt.Sprintf("https://%s/api/agent-policies/sync-on-connect", cnf.Server)
	payload, _ := json.Marshal(map[string]interface{}{
		"agentId": strconv.Itoa(int(cnf.AgentID)),
	})
	resp, err := doBackendRequest(cnf, "POST", url, payload)
	if err != nil {
		// Network failure — still report local state so drift jobs see us.
		_ = reportAllLocalPolicyStates(cnf)
		return fmt.Errorf("request: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))

	switch {
	case resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusMethodNotAllowed:
		utils.Logger.LogF(100, "policy_sync: sync-on-connect not available (%d); fallback local apply+report", resp.StatusCode)
		return fallbackSyncOnConnect(cnf)
	case resp.StatusCode == http.StatusNoContent || resp.StatusCode == http.StatusAccepted:
		// Backend will push APPLY_POLICY via AgentStream; still ACK local state.
		return reportAllLocalPolicyStates(cnf)
	case resp.StatusCode >= 200 && resp.StatusCode < 300:
		if len(bytes.TrimSpace(body)) == 0 {
			return reportAllLocalPolicyStates(cnf)
		}
		var dto SyncOnConnectResponse
		if err := json.Unmarshal(body, &dto); err != nil {
			// Some backends may return a bare list.
			var list []SyncOnConnectPolicy
			if err2 := json.Unmarshal(body, &list); err2 != nil {
				utils.Logger.ErrorF("policy_sync: sync-on-connect decode: %v", err)
				return fallbackSyncOnConnect(cnf)
			}
			dto.Policies = list
		}
		for _, p := range dto.Policies {
			if err := applyFetchedPolicy(cnf, p.PolicyID, p.Version, p.PolicyConfig); err != nil {
				utils.Logger.ErrorF("policy_sync: sync-on-connect apply policy %d: %v", p.PolicyID, err)
			}
		}
		return reportAllLocalPolicyStates(cnf)
	default:
		utils.Logger.ErrorF("policy_sync: sync-on-connect status %d: %s", resp.StatusCode, string(body))
		return fallbackSyncOnConnect(cnf)
	}
}

func fallbackSyncOnConnect(cnf *config.Config) error {
	if err := LoadAndApplyLatestPolicy(); err != nil {
		utils.Logger.ErrorF("policy_sync: fallback apply: %v", err)
	}
	return reportAllLocalPolicyStates(cnf)
}

func reportAllLocalPolicyStates(cnf *config.Config) error {
	db, err := database.GetDB()
	if err != nil {
		return err
	}
	if err := db.Migrate(&PolicyState{}); err != nil {
		return err
	}
	var states []PolicyState
	if err := db.GetAll(&states); err != nil {
		return err
	}
	for _, s := range states {
		reportPolicyStateToBackend(cnf, s.PolicyID, s.AppliedVersion, "APPLIED", "")
	}
	utils.Logger.LogF(100, "policy_sync: reported %d local policy states", len(states))
	return nil
}

func applyFetchedPolicy(cnf *config.Config, policyID int64, version int, policyConfig string) error {
	cfg := strings.TrimSpace(policyConfig)
	if cfg == "" && policyID > 0 {
		var err error
		cfg, err = fetchPolicyConfig(cnf, policyID)
		if err != nil {
			reportPolicyStateToBackend(cnf, policyID, version, "FAILED", fmt.Sprintf("fetch error: %v", err))
			return err
		}
	}
	if cfg == "" {
		return fmt.Errorf("empty policyConfig for policy %d", policyID)
	}
	db, err := database.GetDB()
	if err != nil {
		return err
	}
	_ = db.Migrate(&PolicyState{})
	_ = db.Delete(&PolicyState{}, "policy_id", strconv.FormatInt(policyID, 10))
	state := &PolicyState{
		PolicyID:       policyID,
		AppliedVersion: version,
		PolicyConfig:   cfg,
		AppliedAt:      time.Now().Unix(),
	}
	if err := db.Create(state); err != nil {
		reportPolicyStateToBackend(cnf, policyID, version, "FAILED", fmt.Sprintf("store error: %v", err))
		return err
	}
	if err := ApplyPolicyConfig(cfg); err != nil {
		reportPolicyStateToBackend(cnf, policyID, version, "FAILED", fmt.Sprintf("apply error: %v", err))
		return err
	}
	reportPolicyStateToBackend(cnf, policyID, version, "APPLIED", "")
	return nil
}

// Agent auth header names — must match telemetry ingest (TelemetryAgentIdentityFilter).
const (
	HeaderAgentID  = "X-HiveArmor-Agent-Id"
	HeaderAgentKey = "X-Agent-Key"
)

// setAgentAuthHeaders attaches device identity headers used by agent→backend calls.
// Matches agent/telemetry/client.go: X-HiveArmor-Agent-Id + X-Agent-Key (not Bearer).
// Backend must accept these on GET /api/agent-policies/{id}, POST report-state,
// POST sync-on-connect, and POST rule push-status ack (BE-POL-02).
func setAgentAuthHeaders(req *http.Request, cnf *config.Config) {
	if req == nil || cnf == nil {
		return
	}
	if cnf.AgentID == 0 || strings.TrimSpace(cnf.AgentKey) == "" {
		return
	}
	req.Header.Set(HeaderAgentID, strconv.Itoa(int(cnf.AgentID)))
	req.Header.Set(HeaderAgentKey, cnf.AgentKey)
}

// doBackendRequest performs an authenticated HTTP request to the backend.
// Auth: X-HiveArmor-Agent-Id + X-Agent-Key (same as telemetry), not Bearer agent key.
func doBackendRequest(cnf *config.Config, method, url string, body []byte) (*http.Response, error) {
	var reqBody io.Reader
	if body != nil {
		reqBody = bytes.NewReader(body)
	}
	req, err := http.NewRequest(method, url, reqBody)
	if err != nil {
		return nil, fmt.Errorf("creating request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	setAgentAuthHeaders(req, cnf)

	skipTLS := cnf != nil && cnf.SkipCertValidation
	client := &http.Client{
		Timeout: 15 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: skipTLS}, //nolint:gosec
		},
	}
	return client.Do(req)
}
