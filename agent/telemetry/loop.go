package telemetry

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/hivearmor/agent/config"
	"github.com/hivearmor/agent/utils"
)

const scanInterval = 6 * time.Hour

// StartLoop posts observed SCA and CycloneDX SBOM to the backend on an interval.
// Prefers enrolled AgentID/AgentKey. HA_INTERNAL_KEY is legacy-only.
func StartLoop(ctx context.Context, cnf *config.Config) {
	auth, err := resolveIngestAuth(cnf)
	if err != nil {
		utils.Logger.Info("agent telemetry skipped: enrolled agent key is missing and HA_INTERNAL_KEY is not set")
		return
	}
	base := telemetryBaseURL(cnf.Server)
	if base == "" {
		utils.Logger.ErrorF("agent telemetry skipped: empty server")
		return
	}

	_ = runOnce(cnf, auth, base)
	ticker := time.NewTicker(scanInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			_ = runOnce(cnf, auth, base)
		}
	}
}

// PostOnce sends one observed SCA payload and one CycloneDX SBOM.
func PostOnce(cnf *config.Config) error {
	auth, err := resolveIngestAuth(cnf)
	if err != nil {
		return err
	}
	base := telemetryBaseURL(cnf.Server)
	if base == "" {
		return fmt.Errorf("empty server")
	}
	return runOnce(cnf, auth, base)
}

func resolveIngestAuth(cnf *config.Config) (ingestAuth, error) {
	if stored, err := config.GetCurrentConfig(); err == nil && stored != nil {
		if cnf.AgentID == 0 {
			cnf.AgentID = stored.AgentID
		}
		if strings.TrimSpace(cnf.AgentKey) == "" {
			cnf.AgentKey = stored.AgentKey
		}
		if strings.TrimSpace(cnf.Server) == "" {
			cnf.Server = stored.Server
		}
	}
	envID := strings.TrimSpace(os.Getenv("HA_AGENT_ID"))
	agentID := agentIDHeader(cnf.AgentID, envID)
	agentKey := strings.TrimSpace(cnf.AgentKey)
	internal := strings.TrimSpace(os.Getenv("HA_INTERNAL_KEY"))
	if agentID != "" && agentKey != "" {
		return ingestAuth{agentID: agentID, agentKey: agentKey}, nil
	}
	if internal != "" {
		return ingestAuth{internalKey: internal, agentID: agentID}, nil
	}
	return ingestAuth{}, fmt.Errorf("agent telemetry skipped: enrolled agent key is missing and HA_INTERNAL_KEY is not set")
}

func runOnce(cnf *config.Config, auth ingestAuth, base string) error {
	hostname := "unknown"
	osInfo, err := utils.GetOsInfo()
	if err == nil && osInfo.Hostname != "" {
		hostname = osInfo.Hostname
	}
	agentID := auth.agentID
	if agentID == "" {
		agentID = strings.TrimSpace(os.Getenv("HA_AGENT_ID"))
	}
	if agentID == "" {
		agentID = strconv.Itoa(int(cnf.AgentID))
	}
	var tenant *int64
	if raw := strings.TrimSpace(os.Getenv("HA_TENANT_ID")); raw != "" {
		if n, convErr := strconv.ParseInt(raw, 10, 64); convErr == nil {
			tenant = &n
		}
	}

	var first error
	sca := BuildObservedSCA(agentID, hostname, tenant, nil)
	if err := postJSON(base+"/api/ha-telemetry/sca", auth, sca, cnf.SkipCertValidation); err != nil {
		utils.Logger.ErrorF("agent SCA telemetry failed: %v", err)
		first = err
	} else {
		utils.Logger.Info("agent SCA telemetry accepted")
	}

	pkgs := ListInstalledPackages(nil, nil)
	bom := BuildCycloneDX(agentID, hostname, tenant, pkgs)
	if err := postJSON(base+"/api/ha-telemetry/sbom", auth, bom, cnf.SkipCertValidation); err != nil {
		utils.Logger.ErrorF("agent SBOM telemetry failed: %v", err)
		if first == nil {
			first = err
		}
	} else {
		utils.Logger.Info("agent SBOM telemetry accepted")
	}
	return first
}
