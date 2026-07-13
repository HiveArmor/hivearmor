package agent

import (
	"bytes"
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
func notifyRuleSyncAck(cnf *config.Config, ruleID int64) error {
	url := fmt.Sprintf("https://%s/api/alert-response-rules/push-status/%d/ack?agentId=%d",
		cnf.Server, ruleID, cnf.AgentID)
	resp, err := doBackendRequest(cnf, "POST", url, nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}

// doBackendRequest performs an authenticated HTTP request to the backend.
// Uses the agent key as a Bearer token.
func doBackendRequest(cnf *config.Config, method, url string, body []byte) (*http.Response, error) {
	var reqBody io.Reader
	if body != nil {
		reqBody = bytes.NewReader(body)
	}
	req, err := http.NewRequest(method, url, reqBody)
	if err != nil {
		return nil, fmt.Errorf("creating request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+cnf.AgentKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 15 * time.Second}
	return client.Do(req)
}
