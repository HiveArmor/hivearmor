package com.hivearmor.web.rest.export.dto;

import com.hivearmor.domain.chart_builder.types.query.FilterType;
import com.hivearmor.domain.shared_types.DataColumn;

import java.util.List;

/**
 * Request body for {@code POST /api/ha-hunts/search/export} (B0-4).
 *
 * <p>Carries the committed hunt query context. The service layer translates
 * {@code query}/{@code filters}/{@code timeRange} into the {@code List<FilterType>}
 * consumed by {@code ElasticsearchService.searchStream} — the same streaming engine
 * used by {@code /api/elasticsearch/search/csv}. {@code columns} is required for CSV
 * (defines the tabular projection); it is ignored for NDJSON (raw documents).
 */
public class HuntExportRequestDTO {

    /** Raw KQL/query string (optional; recorded in the manifest). */
    private String query;

    /** Structured filters applied to the search (optional). */
    private List<FilterType> filters;

    /** Time range boundaries (optional). */
    private TimeRange timeRange;

    /** Target index pattern; if blank the tenant-resolved log pattern is used. */
    private String indexPattern;

    /** CSV column projection (required for CSV, ignored for NDJSON). */
    private DataColumn[] columns;

    /** {@code csv} | {@code ndjson}. */
    private String format;

    public String getQuery() { return query; }
    public void setQuery(String query) { this.query = query; }

    public List<FilterType> getFilters() { return filters; }
    public void setFilters(List<FilterType> filters) { this.filters = filters; }

    public TimeRange getTimeRange() { return timeRange; }
    public void setTimeRange(TimeRange timeRange) { this.timeRange = timeRange; }

    public String getIndexPattern() { return indexPattern; }
    public void setIndexPattern(String indexPattern) { this.indexPattern = indexPattern; }

    public DataColumn[] getColumns() { return columns; }
    public void setColumns(DataColumn[] columns) { this.columns = columns; }

    public String getFormat() { return format; }
    public void setFormat(String format) { this.format = format; }

    public static class TimeRange {
        private String from;
        private String to;

        public String getFrom() { return from; }
        public void setFrom(String from) { this.from = from; }
        public String getTo() { return to; }
        public void setTo(String to) { this.to = to; }
    }
}
