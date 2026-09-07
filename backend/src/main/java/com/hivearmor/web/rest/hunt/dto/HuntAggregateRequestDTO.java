package com.hivearmor.web.rest.hunt.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.util.List;

/**
 * Request DTO for POST /api/ha-hunts/search/aggregate (Metric view — full matched-set aggregation).
 *
 * <p>The query/language/timeRange/tenantScope/indexPattern fields carry the SAME meaning as
 * {@link HuntSearchRequestDTO}, so the aggregate reuses the identical query-build path — it is
 * "the same search, counted instead of listed." Only the top-N breakdown list is extra.
 *
 * <p>Matches the frontend {@code HuntAggregateRequest} interface in {@code searchHunt.types.ts}.
 */
public class HuntAggregateRequestDTO {

    @NotNull
    private String query;

    @NotNull
    private String language = "kql";

    @NotNull
    @Valid
    private HuntSearchRequestDTO.TimeRangeDTO timeRange;

    @NotNull
    private String tenantScope = "authorized";

    private String indexPattern;

    @NotNull
    @NotEmpty
    @Valid
    private List<BreakdownSpecDTO> breakdowns;

    public String getQuery() { return query; }
    public void setQuery(String query) { this.query = query; }

    public String getLanguage() { return language; }
    public void setLanguage(String language) { this.language = language; }

    public HuntSearchRequestDTO.TimeRangeDTO getTimeRange() { return timeRange; }
    public void setTimeRange(HuntSearchRequestDTO.TimeRangeDTO timeRange) { this.timeRange = timeRange; }

    public String getTenantScope() { return tenantScope; }
    public void setTenantScope(String tenantScope) { this.tenantScope = tenantScope; }

    public String getIndexPattern() { return indexPattern; }
    public void setIndexPattern(String indexPattern) { this.indexPattern = indexPattern; }

    public List<BreakdownSpecDTO> getBreakdowns() { return breakdowns; }
    public void setBreakdowns(List<BreakdownSpecDTO> breakdowns) { this.breakdowns = breakdowns; }

    /** One requested top-N terms breakdown over an aggregatable registry field. */
    public static class BreakdownSpecDTO {
        @NotNull
        private String field;

        @Min(1)
        @Max(50)
        private int size = 8;

        public String getField() { return field; }
        public void setField(String field) { this.field = field; }
        public int getSize() { return size; }
        public void setSize(int size) { this.size = size; }
    }
}
