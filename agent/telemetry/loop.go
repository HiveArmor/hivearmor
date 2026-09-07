package telemetry

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/hivearmor/agent/config"
	"github.com/hivearmor/agent/utils"
)

const (
	defaultScanInterval = 6 * time.Hour
	minScanInterval     = 1 * time.Hour
	maxScanInterval     = 168 * time.Hour
)

var (
	scaIntervalNs  atomic.Int64
	sbomIntervalNs atomic.Int64
	intervalWaitersMu sync.Mutex
	intervalWaiters   []chan struct{}
)

func init() {
	scaIntervalNs.Store(int64(defaultScanInterval))
	sbomIntervalNs.Store(int64(defaultScanInterval))
}

// SetScanIntervals updates SCA/SBOM loop cadences (clamped). Hot-applied from policy.
func SetScanIntervals(sca, sbom time.Duration) {
	scaIntervalNs.Store(int64(clampInterval(sca)))
	sbomIntervalNs.Store(int64(clampInterval(sbom)))
	notifyIntervalWaiters()
}

func clampInterval(d time.Duration) time.Duration {
	if d <= 0 {
		return defaultScanInterval
	}
	if d < minScanInterval {
		return minScanInterval
	}
	if d > maxScanInterval {
		return maxScanInterval
	}
	return d
}

// EffectiveSCAInterval returns the current SCA post interval.
func EffectiveSCAInterval() time.Duration {
	return time.Duration(scaIntervalNs.Load())
}

// EffectiveSBOMInterval returns the current SBOM post interval.
func EffectiveSBOMInterval() time.Duration {
	return time.Duration(sbomIntervalNs.Load())
}

func notifyIntervalWaiters() {
	intervalWaitersMu.Lock()
	defer intervalWaitersMu.Unlock()
	for _, ch := range intervalWaiters {
		select {
		case ch <- struct{}{}:
		default:
		}
	}
}

func registerIntervalWaiter() chan struct{} {
	ch := make(chan struct{}, 1)
	intervalWaitersMu.Lock()
	intervalWaiters = append(intervalWaiters, ch)
	intervalWaitersMu.Unlock()
	return ch
}

func unregisterIntervalWaiter(ch chan struct{}) {
	intervalWaitersMu.Lock()
	defer intervalWaitersMu.Unlock()
	out := intervalWaiters[:0]
	for _, w := range intervalWaiters {
		if w != ch {
			out = append(out, w)
		}
	}
	intervalWaiters = out
}

// StartLoop posts observed SCA and CycloneDX SBOM to the backend on policy-driven
// intervals (default 6h). Interval changes from APPLY_POLICY take effect without restart.
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

	changeCh := registerIntervalWaiter()
	defer unregisterIntervalWaiter(changeCh)

	nextSCA := time.Now().Add(EffectiveSCAInterval())
	nextSBOM := time.Now().Add(EffectiveSBOMInterval())
	timer := time.NewTimer(timeUntilEarliest(nextSCA, nextSBOM))
	defer timer.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-changeCh:
			// Policy updated intervals — re-arm from now using new cadence.
			now := time.Now()
			nextSCA = now.Add(EffectiveSCAInterval())
			nextSBOM = now.Add(EffectiveSBOMInterval())
			resetTimer(timer, timeUntilEarliest(nextSCA, nextSBOM))
		case <-timer.C:
			now := time.Now()
			ranSCA, ranSBOM := false, false
			if !now.Before(nextSCA) {
				_ = runSCA(cnf, auth, base)
				nextSCA = now.Add(EffectiveSCAInterval())
				ranSCA = true
			}
			if !now.Before(nextSBOM) {
				_ = runSBOM(cnf, auth, base)
				nextSBOM = now.Add(EffectiveSBOMInterval())
				ranSBOM = true
			}
			if !ranSCA && !ranSBOM {
				// Spurious wake — re-arm.
			}
			resetTimer(timer, timeUntilEarliest(nextSCA, nextSBOM))
		}
	}
}

func resetTimer(t *time.Timer, d time.Duration) {
	if !t.Stop() {
		select {
		case <-t.C:
		default:
		}
	}
	if d < time.Second {
		d = time.Second
	}
	t.Reset(d)
}

func timeUntilEarliest(a, b time.Time) time.Duration {
	target := a
	if b.Before(a) {
		target = b
	}
	d := time.Until(target)
	if d < time.Second {
		return time.Second
	}
	return d
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
	var first error
	if err := runSCA(cnf, auth, base); err != nil {
		first = err
	}
	if err := runSBOM(cnf, auth, base); err != nil && first == nil {
		first = err
	}
	return first
}

func runSCA(cnf *config.Config, auth ingestAuth, base string) error {
	hostname, agentID, tenant := telemetryIdentity(cnf, auth)
	sca := BuildObservedSCA(agentID, hostname, tenant, nil)
	if err := postJSON(base+"/api/ha-telemetry/sca", auth, sca, cnf.SkipCertValidation); err != nil {
		utils.Logger.ErrorF("agent SCA telemetry failed: %v", err)
		return err
	}
	utils.Logger.Info("agent SCA telemetry accepted")
	return nil
}

func runSBOM(cnf *config.Config, auth ingestAuth, base string) error {
	hostname, agentID, tenant := telemetryIdentity(cnf, auth)
	pkgs := ListInstalledPackages(nil, nil)
	bom := BuildCycloneDX(agentID, hostname, tenant, pkgs)
	if err := postJSON(base+"/api/ha-telemetry/sbom", auth, bom, cnf.SkipCertValidation); err != nil {
		utils.Logger.ErrorF("agent SBOM telemetry failed: %v", err)
		return err
	}
	utils.Logger.Info("agent SBOM telemetry accepted")
	return nil
}

func telemetryIdentity(cnf *config.Config, auth ingestAuth) (hostname, agentID string, tenant *int64) {
	hostname = "unknown"
	osInfo, err := utils.GetOsInfo()
	if err == nil && osInfo.Hostname != "" {
		hostname = osInfo.Hostname
	}
	agentID = auth.agentID
	if agentID == "" {
		agentID = strings.TrimSpace(os.Getenv("HA_AGENT_ID"))
	}
	if agentID == "" {
		agentID = strconv.Itoa(int(cnf.AgentID))
	}
	if raw := strings.TrimSpace(os.Getenv("HA_TENANT_ID")); raw != "" {
		if n, convErr := strconv.ParseInt(raw, 10, 64); convErr == nil {
			tenant = &n
		}
	}
	return hostname, agentID, tenant
}
