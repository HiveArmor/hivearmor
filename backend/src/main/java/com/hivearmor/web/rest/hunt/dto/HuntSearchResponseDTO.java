package com.hivearmor.web.rest.hunt.dto;

import java.util.List;

/**
 * Response DTO for POST /api/ha-hunts/search.
 *
 * <p>Matches the frontend {@code HuntSearchResponse} interface. Contains the
 * paginated event results, histogram buckets, and execution metadata.
 */
public class HuntSearchResponseDTO {

    private String searchId;
    private List<HuntEventDTO> items;
    private String nextCursor;
    private boolean hasMore;
    private String snapshotAt;
    private long totalApproximate;
    private boolean totalIsExact;
    private long tookMs;
    private List<HistogramBucketDTO> histogram;
    private List<PartialFailureDTO> partialFailures;

    // Getters and setters

    public String getSearchId() { return searchId; }
    public void setSearchId(String searchId) { this.searchId = searchId; }

    public List<HuntEventDTO> getItems() { return items; }
    public void setItems(List<HuntEventDTO> items) { this.items = items; }

    public String getNextCursor() { return nextCursor; }
    public void setNextCursor(String nextCursor) { this.nextCursor = nextCursor; }

    public boolean isHasMore() { return hasMore; }
    public void setHasMore(boolean hasMore) { this.hasMore = hasMore; }

    public String getSnapshotAt() { return snapshotAt; }
    public void setSnapshotAt(String snapshotAt) { this.snapshotAt = snapshotAt; }

    public long getTotalApproximate() { return totalApproximate; }
    public void setTotalApproximate(long totalApproximate) { this.totalApproximate = totalApproximate; }

    public boolean isTotalIsExact() { return totalIsExact; }
    public void setTotalIsExact(boolean totalIsExact) { this.totalIsExact = totalIsExact; }

    public long getTookMs() { return tookMs; }
    public void setTookMs(long tookMs) { this.tookMs = tookMs; }

    public List<HistogramBucketDTO> getHistogram() { return histogram; }
    public void setHistogram(List<HistogramBucketDTO> histogram) { this.histogram = histogram; }

    public List<PartialFailureDTO> getPartialFailures() { return partialFailures; }
    public void setPartialFailures(List<PartialFailureDTO> partialFailures) { this.partialFailures = partialFailures; }

    /**
     * A single histogram time bucket.
     */
    public static class HistogramBucketDTO {
        private String from;
        private String to;
        private long count;

        public HistogramBucketDTO() {}

        public HistogramBucketDTO(String from, String to, long count) {
            this.from = from;
            this.to = to;
            this.count = count;
        }

        public String getFrom() { return from; }
        public void setFrom(String from) { this.from = from; }
        public String getTo() { return to; }
        public void setTo(String to) { this.to = to; }
        public long getCount() { return count; }
        public void setCount(long count) { this.count = count; }
    }

    /**
     * Represents a partial failure from one data source during the search.
     */
    public static class PartialFailureDTO {
        private String source;
        private String code;
        private String message;

        public PartialFailureDTO() {}

        public PartialFailureDTO(String source, String code, String message) {
            this.source = source;
            this.code = code;
            this.message = message;
        }

        public String getSource() { return source; }
        public void setSource(String source) { this.source = source; }
        public String getCode() { return code; }
        public void setCode(String code) { this.code = code; }
        public String getMessage() { return message; }
        public void setMessage(String message) { this.message = message; }
    }
}
