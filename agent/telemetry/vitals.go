package telemetry

import (
	"context"
	"runtime"
	"time"

	"github.com/hivearmor/agent/config"
	"github.com/hivearmor/agent/utils"
)

const defaultVitalsInterval = 30 * time.Second

// Metric hooks — registered from serv to avoid agent↔telemetry import cycles.
var (
	QueueDepthFn   func() int
	DroppedTotalFn func() int64
	PolicyMetaFn   func() (policyID int64, version int)
	// CapabilitiesFn returns the agent's honest per-section enforcement capability
	// advertisement (comma-separated "section=status" pairs). Wired from serv to the
	// agent package's CapabilityAdvertisement to avoid an import cycle.
	CapabilitiesFn func() string
)

// VitalsPayload is PUT to /api/ha-telemetry/vitals/{agentId} (AGT-OBS-01).
// Field names match HaTelemetryService.processVitals (+ applied policy meta).
type VitalsPayload struct {
	CPUPct               float64 `json:"cpuPct"`
	RamMb                int64   `json:"ramMb"`
	QueueDepth           int     `json:"queueDepth"`
	EventsPerSec         float64 `json:"eventsPerSec"`
	DroppedTotal         int64   `json:"droppedTotal"`
	LastError            string  `json:"lastError,omitempty"`
	AppliedPolicyID      int64   `json:"appliedPolicyId,omitempty"`
	AppliedPolicyVersion int     `json:"appliedPolicyVersion,omitempty"`
	// Capabilities is the agent's honest per-section enforcement advertisement
	// (PT-4). The backend records it so PT-2's UI honesty notes reflect real
	// capability instead of guessing. Contains no customer data — only section names
	// and enforcement levels.
	Capabilities string `json:"capabilities,omitempty"`
}

// StartVitalsLoop periodically PUTs self-metrics with device headers.
// STAGING CANDIDATE — not PRODUCTION READY.
func StartVitalsLoop(ctx context.Context, cnf *config.Config) {
	auth, err := resolveIngestAuth(cnf)
	if err != nil {
		utils.Logger.Info("agent vitals skipped: enrolled agent key is missing and HA_INTERNAL_KEY is not set")
		return
	}
	base := telemetryBaseURL(cnf.Server)
	if base == "" {
		utils.Logger.ErrorF("agent vitals skipped: empty server")
		return
	}
	agentID := auth.agentID
	if agentID == "" {
		agentID = agentIDHeader(cnf.AgentID, "")
	}
	if agentID == "" {
		utils.Logger.ErrorF("agent vitals skipped: empty agent id")
		return
	}

	_ = runVitals(cnf, auth, base, agentID)

	ticker := time.NewTicker(defaultVitalsInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			_ = runVitals(cnf, auth, base, agentID)
		}
	}
}

func runVitals(cnf *config.Config, auth ingestAuth, base, agentID string) error {
	payload := CollectVitals()
	url := base + "/api/ha-telemetry/vitals/" + agentID
	if err := putJSON(url, auth, payload, cnf.SkipCertValidation); err != nil {
		utils.Logger.ErrorF("agent vitals telemetry failed: %v", err)
		return err
	}
	return nil
}

// CollectVitals snapshots queue depth, drops, RSS, and applied policy meta.
func CollectVitals() VitalsPayload {
	var ms runtime.MemStats
	runtime.ReadMemStats(&ms)
	v := VitalsPayload{
		CPUPct: 0, // host CPU sampling deferred; RSS + queue are primary
		RamMb:  int64(ms.Sys / (1024 * 1024)),
	}
	if QueueDepthFn != nil {
		v.QueueDepth = QueueDepthFn()
	}
	if DroppedTotalFn != nil {
		v.DroppedTotal = DroppedTotalFn()
	}
	if PolicyMetaFn != nil {
		v.AppliedPolicyID, v.AppliedPolicyVersion = PolicyMetaFn()
	}
	if CapabilitiesFn != nil {
		v.Capabilities = CapabilitiesFn()
	}
	return v
}
