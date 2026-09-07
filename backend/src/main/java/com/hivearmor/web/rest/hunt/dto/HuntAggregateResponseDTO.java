package com.hivearmor.web.rest.hunt.dto;

import com.hivearmor.web.rest.hunt.dto.HuntSearchResponseDTO.PartialFailureDTO;
import java.util.List;

/**
 * Response DTO for POST /api/ha-hunts/search/aggregate.
 *
 * <p>Reports metrics over the ENTIRE matched result set (not just the loaded page), so the Metric
 * view can drop its "loaded rows only" caveat. Matches the frontend {@code HuntAggregateResponse}
 * interface in {@code searchHunt.types.ts}.
 */
public class HuntAggregateResponseDTO {

    private String searchId;
    private long totalApproximate;
    private boolean totalIsExact;
    private String snapshotAt;
    private KpisDTO kpis;
    private List<BreakdownDTO> breakdowns;
    private List<PartialFailureDTO> partialFailures;

    public String getSearchId() { return searchId; }
    public void setSearchId(String searchId) { this.searchId = searchId; }

    public long getTotalApproximate() { return totalApproximate; }
    public void setTotalApproximate(long totalApproximate) { this.totalApproximate = totalApproximate; }

    public boolean isTotalIsExact() { return totalIsExact; }
    public void setTotalIsExact(boolean totalIsExact) { this.totalIsExact = totalIsExact; }

    public String getSnapshotAt() { return snapshotAt; }
    public void setSnapshotAt(String snapshotAt) { this.snapshotAt = snapshotAt; }

    public KpisDTO getKpis() { return kpis; }
    public void setKpis(KpisDTO kpis) { this.kpis = kpis; }

    public List<BreakdownDTO> getBreakdowns() { return breakdowns; }
    public void setBreakdowns(List<BreakdownDTO> breakdowns) { this.breakdowns = breakdowns; }

    public List<PartialFailureDTO> getPartialFailures() { return partialFailures; }
    public void setPartialFailures(List<PartialFailureDTO> partialFailures) { this.partialFailures = partialFailures; }

    /** Full-matched-set KPI tiles. */
    public static class KpisDTO {
        private long events;
        private long withAlerts;
        private long distinctHosts;
        private long distinctUsers;

        public KpisDTO() { }

        public KpisDTO(long events, long withAlerts, long distinctHosts, long distinctUsers) {
            this.events = events;
            this.withAlerts = withAlerts;
            this.distinctHosts = distinctHosts;
            this.distinctUsers = distinctUsers;
        }

        public long getEvents() { return events; }
        public void setEvents(long events) { this.events = events; }
        public long getWithAlerts() { return withAlerts; }
        public void setWithAlerts(long withAlerts) { this.withAlerts = withAlerts; }
        public long getDistinctHosts() { return distinctHosts; }
        public void setDistinctHosts(long distinctHosts) { this.distinctHosts = distinctHosts; }
        public long getDistinctUsers() { return distinctUsers; }
        public void setDistinctUsers(long distinctUsers) { this.distinctUsers = distinctUsers; }
    }

    /** One requested breakdown, in the same order as the request. */
    public static class BreakdownDTO {
        private String field;
        private String state;          // available | high_cardinality | unavailable | redacted
        private long otherCount;       // matched docs not in the top-N buckets
        private List<BucketDTO> buckets;

        public BreakdownDTO() { }

        public BreakdownDTO(String field, String state, long otherCount, List<BucketDTO> buckets) {
            this.field = field;
            this.state = state;
            this.otherCount = otherCount;
            this.buckets = buckets;
        }

        public String getField() { return field; }
        public void setField(String field) { this.field = field; }
        public String getState() { return state; }
        public void setState(String state) { this.state = state; }
        public long getOtherCount() { return otherCount; }
        public void setOtherCount(long otherCount) { this.otherCount = otherCount; }
        public List<BucketDTO> getBuckets() { return buckets; }
        public void setBuckets(List<BucketDTO> buckets) { this.buckets = buckets; }
    }

    /** One term bucket with server-generated, escaped KQL include/exclude fragments. */
    public static class BucketDTO {
        private String value;
        private long count;
        private boolean countIsExact;
        private String includeQuery;
        private String excludeQuery;

        public BucketDTO() { }

        public BucketDTO(String value, long count, boolean countIsExact,
                         String includeQuery, String excludeQuery) {
            this.value = value;
            this.count = count;
            this.countIsExact = countIsExact;
            this.includeQuery = includeQuery;
            this.excludeQuery = excludeQuery;
        }

        public String getValue() { return value; }
        public void setValue(String value) { this.value = value; }
        public long getCount() { return count; }
        public void setCount(long count) { this.count = count; }
        public boolean isCountIsExact() { return countIsExact; }
        public void setCountIsExact(boolean countIsExact) { this.countIsExact = countIsExact; }
        public String getIncludeQuery() { return includeQuery; }
        public void setIncludeQuery(String includeQuery) { this.includeQuery = includeQuery; }
        public String getExcludeQuery() { return excludeQuery; }
        public void setExcludeQuery(String excludeQuery) { this.excludeQuery = excludeQuery; }
    }
}
