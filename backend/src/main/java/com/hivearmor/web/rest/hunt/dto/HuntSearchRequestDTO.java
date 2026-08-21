package com.hivearmor.web.rest.hunt.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.List;

/**
 * Request DTO for POST /api/ha-hunts/search.
 *
 * <p>Matches the frontend {@code HuntSearchRequest} interface from
 * {@code searchHunt.types.ts}. The query uses KQL syntax and is parsed/escaped
 * server-side before execution against OpenSearch.
 */
public class HuntSearchRequestDTO {

    @NotNull
    private String query;

    @NotNull
    private String language = "kql";

    @NotNull
    @Valid
    private TimeRangeDTO timeRange;

    @NotNull
    private String tenantScope = "authorized";

    private List<String> fields;

    private String cursor;

    private String indexPattern;

    @Min(1)
    @Max(200)
    private int limit = 100;

    private List<SortFieldDTO> sort;

    private boolean includeHistogram = true;

    // Getters and setters

    public String getQuery() { return query; }
    public void setQuery(String query) { this.query = query; }

    public String getLanguage() { return language; }
    public void setLanguage(String language) { this.language = language; }

    public TimeRangeDTO getTimeRange() { return timeRange; }
    public void setTimeRange(TimeRangeDTO timeRange) { this.timeRange = timeRange; }

    public String getTenantScope() { return tenantScope; }
    public void setTenantScope(String tenantScope) { this.tenantScope = tenantScope; }

    public List<String> getFields() { return fields; }
    public void setFields(List<String> fields) { this.fields = fields; }

    public String getCursor() { return cursor; }
    public void setCursor(String cursor) { this.cursor = cursor; }

    public String getIndexPattern() { return indexPattern; }
    public void setIndexPattern(String indexPattern) { this.indexPattern = indexPattern; }

    public int getLimit() { return limit; }
    public void setLimit(int limit) { this.limit = limit; }

    public List<SortFieldDTO> getSort() { return sort; }
    public void setSort(List<SortFieldDTO> sort) { this.sort = sort; }

    public boolean isIncludeHistogram() { return includeHistogram; }
    public void setIncludeHistogram(boolean includeHistogram) { this.includeHistogram = includeHistogram; }

    /**
     * Time range with ISO-8601 from/to boundaries.
     */
    public static class TimeRangeDTO {
        @NotNull
        private String from;

        @NotNull
        private String to;

        public String getFrom() { return from; }
        public void setFrom(String from) { this.from = from; }
        public String getTo() { return to; }
        public void setTo(String to) { this.to = to; }
    }

    /**
     * Sort field with direction.
     */
    public static class SortFieldDTO {
        private String field;
        private String direction = "desc";

        public String getField() { return field; }
        public void setField(String field) { this.field = field; }
        public String getDirection() { return direction; }
        public void setDirection(String direction) { this.direction = direction; }
    }
}
