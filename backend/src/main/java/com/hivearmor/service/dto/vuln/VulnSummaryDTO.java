package com.hivearmor.service.dto.vuln;

import java.util.List;

/**
 * Fleet-level vulnerability summary DTO.
 * Returned by GET /api/ha-vuln/findings/summary.
 *
 * No Lombok.
 */
public class VulnSummaryDTO {

    private int critical;
    private int high;
    private int medium;
    private int low;
    private int info;
    private int kevCount;
    private int affectedAgents;
    private String snapshotAt;
    private List<TopCveDTO> topCves;

    public int getCritical() { return critical; }
    public void setCritical(int critical) { this.critical = critical; }

    public int getHigh() { return high; }
    public void setHigh(int high) { this.high = high; }

    public int getMedium() { return medium; }
    public void setMedium(int medium) { this.medium = medium; }

    public int getLow() { return low; }
    public void setLow(int low) { this.low = low; }

    public int getInfo() { return info; }
    public void setInfo(int info) { this.info = info; }

    public int getKevCount() { return kevCount; }
    public void setKevCount(int kevCount) { this.kevCount = kevCount; }

    public int getAffectedAgents() { return affectedAgents; }
    public void setAffectedAgents(int affectedAgents) { this.affectedAgents = affectedAgents; }

    public String getSnapshotAt() { return snapshotAt; }
    public void setSnapshotAt(String snapshotAt) { this.snapshotAt = snapshotAt; }

    public List<TopCveDTO> getTopCves() { return topCves; }
    public void setTopCves(List<TopCveDTO> topCves) { this.topCves = topCves; }

    /**
     * Inner DTO for top-N CVEs by affected agent count.
     */
    public static class TopCveDTO {
        private String cveId;
        private double cvssV3;
        private String severity;
        private boolean isKev;
        private int affectedAgents;

        public String getCveId() { return cveId; }
        public void setCveId(String cveId) { this.cveId = cveId; }

        public double getCvssV3() { return cvssV3; }
        public void setCvssV3(double cvssV3) { this.cvssV3 = cvssV3; }

        public String getSeverity() { return severity; }
        public void setSeverity(String severity) { this.severity = severity; }

        public boolean isKev() { return isKev; }
        public void setKev(boolean kev) { isKev = kev; }

        public int getAffectedAgents() { return affectedAgents; }
        public void setAffectedAgents(int affectedAgents) { this.affectedAgents = affectedAgents; }
    }
}
