package com.hivearmor.service.dto.posture;

import com.hivearmor.service.dto.vuln.VulnSummaryDTO;

/**
 * The cross-fleet posture overview (SPEC-PT-6 §1): the single read a fleet dashboard
 * needs — CIS benchmark posture, vulnerability-by-severity, and coverage honesty — all
 * tenant-scoped. Composed by {@code HaPostureReportService} from the real PT-5 stores;
 * nothing here is fabricated. No Lombok.
 */
public class FleetPostureOverviewDTO {

    /** ISO-8601 instant this overview was composed. */
    private String snapshotAt;

    /** Cross-fleet CIS benchmark posture, incl. not-covered host count. */
    private FleetCisPostureDTO cis;

    /** Fleet vulnerability summary (severity counts, KEV, top CVEs) from HaVulnService. */
    private VulnSummaryDTO vuln;

    /** Fleet coverage honesty block. */
    private Coverage coverage;

    public String getSnapshotAt() { return snapshotAt; }
    public void setSnapshotAt(String snapshotAt) { this.snapshotAt = snapshotAt; }

    public FleetCisPostureDTO getCis() { return cis; }
    public void setCis(FleetCisPostureDTO cis) { this.cis = cis; }

    public VulnSummaryDTO getVuln() { return vuln; }
    public void setVuln(VulnSummaryDTO vuln) { this.vuln = vuln; }

    public Coverage getCoverage() { return coverage; }
    public void setCoverage(Coverage coverage) { this.coverage = coverage; }

    /**
     * Coverage honesty (SPEC-PT-6 §3): what fraction of the fleet has actual scan
     * data behind it. Separates "clean" from "never scanned" so an unscanned fleet is
     * never shown as compliant.
     */
    public static class Coverage {
        private int fleetHostCount;
        private int hostsWithCis;
        private int hostsWithVuln;
        /** Hosts with neither a CIS scan nor a vuln finding — zero visibility. */
        private int hostsUncovered;

        public int getFleetHostCount() { return fleetHostCount; }
        public void setFleetHostCount(int fleetHostCount) { this.fleetHostCount = fleetHostCount; }

        public int getHostsWithCis() { return hostsWithCis; }
        public void setHostsWithCis(int hostsWithCis) { this.hostsWithCis = hostsWithCis; }

        public int getHostsWithVuln() { return hostsWithVuln; }
        public void setHostsWithVuln(int hostsWithVuln) { this.hostsWithVuln = hostsWithVuln; }

        public int getHostsUncovered() { return hostsUncovered; }
        public void setHostsUncovered(int hostsUncovered) { this.hostsUncovered = hostsUncovered; }
    }
}
