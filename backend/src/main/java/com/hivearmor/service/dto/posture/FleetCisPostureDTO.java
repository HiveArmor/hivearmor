package com.hivearmor.service.dto.posture;

import java.util.ArrayList;
import java.util.List;

/**
 * Cross-fleet CIS benchmark posture, aggregated over the net-new OpenSearch index
 * {@code v3-hive-cis-*} (PT-5, Option A). Built by {@code HaPostureReportService} from
 * the latest {@code docType=summary} document per host, scoped to the caller's tenant
 * via {@link com.hivearmor.multitenancy.MsspIndexResolver}.
 *
 * <p>Honesty contract (SPEC-PT-6 §3): {@link #hostsNotScanned} counts fleet hosts with
 * NO ingested CIS scan. They are NEVER folded into {@link #passCount}; a 0% / empty
 * fleet is reported as "not covered", never as "100% compliant". No Lombok.
 */
public class FleetCisPostureDTO {

    /** Total agents enrolled in the tenant's fleet (from the agent registry). */
    private int fleetHostCount;
    /** Distinct hosts that have at least one ingested CIS scan summary. */
    private int hostsScanned;
    /** fleetHostCount - hostsScanned; hosts with no CIS coverage (honest). */
    private int hostsNotScanned;

    /** Aggregate control outcomes across the latest scan of every scanned host. */
    private int total;
    private int passCount;
    private int failCount;
    private int errorCount;
    private int naCount;
    private int notCheckedCount;

    /**
     * Fleet pass rate over the DECIDABLE denominator (pass + fail) across scanned hosts.
     * Null when no host has been scanned — the UI renders "not covered", not a number.
     */
    private Double fleetScorePct;

    /** ISO-8601 instant of the most recent scan across the fleet, or null when none. */
    private String lastScannedAt;

    /** Per-host latest-scan rollups, including not-scanned hosts (scanned=false). */
    private List<HostCisPosture> hosts = new ArrayList<>();

    public int getFleetHostCount() { return fleetHostCount; }
    public void setFleetHostCount(int fleetHostCount) { this.fleetHostCount = fleetHostCount; }

    public int getHostsScanned() { return hostsScanned; }
    public void setHostsScanned(int hostsScanned) { this.hostsScanned = hostsScanned; }

    public int getHostsNotScanned() { return hostsNotScanned; }
    public void setHostsNotScanned(int hostsNotScanned) { this.hostsNotScanned = hostsNotScanned; }

    public int getTotal() { return total; }
    public void setTotal(int total) { this.total = total; }

    public int getPassCount() { return passCount; }
    public void setPassCount(int passCount) { this.passCount = passCount; }

    public int getFailCount() { return failCount; }
    public void setFailCount(int failCount) { this.failCount = failCount; }

    public int getErrorCount() { return errorCount; }
    public void setErrorCount(int errorCount) { this.errorCount = errorCount; }

    public int getNaCount() { return naCount; }
    public void setNaCount(int naCount) { this.naCount = naCount; }

    public int getNotCheckedCount() { return notCheckedCount; }
    public void setNotCheckedCount(int notCheckedCount) { this.notCheckedCount = notCheckedCount; }

    public Double getFleetScorePct() { return fleetScorePct; }
    public void setFleetScorePct(Double fleetScorePct) { this.fleetScorePct = fleetScorePct; }

    public String getLastScannedAt() { return lastScannedAt; }
    public void setLastScannedAt(String lastScannedAt) { this.lastScannedAt = lastScannedAt; }

    public List<HostCisPosture> getHosts() { return hosts; }
    public void setHosts(List<HostCisPosture> hosts) { this.hosts = hosts; }

    /**
     * One host's latest CIS posture row. {@code scanned=false} rows carry the agent
     * identity only and zeroed counts — the honest "not covered" marker.
     */
    public static class HostCisPosture {
        private String agentId;
        private String hostname;
        private String platform;
        private boolean scanned;
        private int total;
        private int passCount;
        private int failCount;
        private int errorCount;
        private int naCount;
        private int notCheckedCount;
        private Double scorePct;
        private String profile;
        private String benchmark;
        private String scannedAt;

        public String getAgentId() { return agentId; }
        public void setAgentId(String agentId) { this.agentId = agentId; }

        public String getHostname() { return hostname; }
        public void setHostname(String hostname) { this.hostname = hostname; }

        public String getPlatform() { return platform; }
        public void setPlatform(String platform) { this.platform = platform; }

        public boolean isScanned() { return scanned; }
        public void setScanned(boolean scanned) { this.scanned = scanned; }

        public int getTotal() { return total; }
        public void setTotal(int total) { this.total = total; }

        public int getPassCount() { return passCount; }
        public void setPassCount(int passCount) { this.passCount = passCount; }

        public int getFailCount() { return failCount; }
        public void setFailCount(int failCount) { this.failCount = failCount; }

        public int getErrorCount() { return errorCount; }
        public void setErrorCount(int errorCount) { this.errorCount = errorCount; }

        public int getNaCount() { return naCount; }
        public void setNaCount(int naCount) { this.naCount = naCount; }

        public int getNotCheckedCount() { return notCheckedCount; }
        public void setNotCheckedCount(int notCheckedCount) { this.notCheckedCount = notCheckedCount; }

        public Double getScorePct() { return scorePct; }
        public void setScorePct(Double scorePct) { this.scorePct = scorePct; }

        public String getProfile() { return profile; }
        public void setProfile(String profile) { this.profile = profile; }

        public String getBenchmark() { return benchmark; }
        public void setBenchmark(String benchmark) { this.benchmark = benchmark; }

        public String getScannedAt() { return scannedAt; }
        public void setScannedAt(String scannedAt) { this.scannedAt = scannedAt; }
    }
}
