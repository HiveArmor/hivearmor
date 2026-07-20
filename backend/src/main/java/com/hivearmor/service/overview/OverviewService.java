package com.hivearmor.service.overview;

import com.hivearmor.config.Constants;
import com.hivearmor.domain.chart_builder.types.query.FilterType;
import com.hivearmor.domain.chart_builder.types.query.OperatorType;
import com.hivearmor.domain.index_pattern.enums.SystemIndexPattern;
import com.hivearmor.domain.shared_types.EventsByObjectsInTimeType;
import com.hivearmor.domain.shared_types.static_dashboard.*;
import com.hivearmor.service.elasticsearch.ElasticsearchService;
import com.hivearmor.service.elasticsearch.SearchUtil;
import com.hivearmor.util.enums.AlertStatus;
import com.hivearmor.util.exceptions.DashboardOverviewException;
import com.hivearmor.opensearch.parsers.DateHistogramAggregateParser;
import com.hivearmor.opensearch.parsers.TermAggregateParser;
import com.hivearmor.opensearch.types.BucketAggregation;
import org.opensearch.client.opensearch._types.SortOrder;
import org.opensearch.client.opensearch._types.aggregations.Aggregate;
import org.opensearch.client.opensearch._types.aggregations.Aggregation;
import org.opensearch.client.opensearch._types.aggregations.CalendarInterval;
import org.opensearch.client.opensearch._types.aggregations.RangeBucket;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;

import java.util.*;
import java.util.stream.Collectors;

@Service
public class OverviewService {
    private static final String CLASS_NAME = "OverviewService";
    private final ElasticsearchService elasticsearchService;

    public OverviewService(ElasticsearchService elasticsearchService) {
        this.elasticsearchService = elasticsearchService;
    }

    //-------------------------------------------------------------------------------------------------
    //- ALERTS
    //-------------------------------------------------------------------------------------------------

    /**
     * Show a quick info about alerts showing amount of alerts today and last week
     *
     * @return A list with amount of alerts today in first place and amount of alerts last week in second place
     */
    public List<CardType> countAlertsTodayAndLastWeek() throws DashboardOverviewException {
        final String ctx = CLASS_NAME + ".countAlertsTodayAndLastWeek";
        final String AGG_NAME = "alert_today_and_last_week";
        final String TODAY_KEY = "today";
        final String LAST_WEEK_KEY = "last_week";
        try {
            if (!elasticsearchService.indexExist(Constants.SYS_INDEX_PATTERN.get(SystemIndexPattern.ALERTS))) {
                List<CardType> result = new ArrayList<>();
                result.add(new CardType("Today", 0));
                result.add(new CardType("Last 7 days", 0));
                return result;
            }

            SearchRequest sr = SearchRequest.of(s -> s.index(Constants.SYS_INDEX_PATTERN.get(SystemIndexPattern.ALERTS))
                .query(SearchUtil.toQuery(this.getDefaultFilters(Collections.emptyList()))).aggregations(AGG_NAME, Aggregation.of(agg -> agg
                    .dateRange(dr -> dr.field(Constants.timestamp)
                        .keyed(true).timeZone("UTC")
                        .ranges(r -> r.key(TODAY_KEY).from(f -> f.expr("now/d")).to(t -> t.expr("now")))
                        .ranges(r -> r.key(LAST_WEEK_KEY).from(f -> f.expr("now-7d/d")).to(t -> t.expr("now")))))).size(0));

            SearchResponse<String> response = elasticsearchService.search(sr, String.class);
            Aggregate aggregate = response.aggregations().get(AGG_NAME);
            Map<String, RangeBucket> keys = aggregate.dateRange().buckets().keyed();

            List<CardType> result = new ArrayList<>();
            result.add(new CardType("Today", (int) keys.get(TODAY_KEY).docCount()));
            result.add(new CardType("Last 7 days", (int) keys.get(LAST_WEEK_KEY).docCount()));
            return result;
        } catch (Exception e) {
            throw new DashboardOverviewException(ctx + ": " + e.getMessage());
        }
    }

    public TableType topAlerts(String from, String to, Integer top) throws DashboardOverviewException {
        final String ctx = CLASS_NAME + ".topAlerts";
        final String AGG_NAME = "top_alert";
        try {
            if (!elasticsearchService.indexExist(Constants.SYS_INDEX_PATTERN.get(SystemIndexPattern.ALERTS)))
                return new TableType();

            SearchRequest rq = SearchRequest.of(s -> s.size(0).query(SearchUtil.toQuery(this.getDefaultFilters(List.of(from, to))))
                .index(Constants.SYS_INDEX_PATTERN.get(SystemIndexPattern.ALERTS))
                .aggregations(AGG_NAME, agg -> agg.terms(t -> t.field(Constants.alertNameKeyword)
                    .size(top).order(List.of(Map.of("_count", SortOrder.Desc))))));

            SearchResponse<String> rs = elasticsearchService.search(rq, String.class);

            List<BucketAggregation> buckets = TermAggregateParser.parse(rs.aggregations().get(AGG_NAME));

            if (CollectionUtils.isEmpty(buckets))
                return new TableType();

            TableType result = new TableType();
            result.addColumn("Alert").addColumn("Amount");

            buckets.forEach(bucket -> result.addRow(Arrays.asList(bucket.getKey(), String.valueOf(bucket.getDocCount()))));

            return result;
        } catch (Exception e) {
            throw new DashboardOverviewException(ctx + ": " + e.getMessage());
        }
    }

    public PieType countAlertsBySeverity(String from, String to, Integer top) throws DashboardOverviewException {
        final String ctx = CLASS_NAME + ".countAlertsBySeverity";
        final String AGG_NAME = "alert_by_severity";
        try {
            if (!elasticsearchService.indexExist(Constants.SYS_INDEX_PATTERN.get(SystemIndexPattern.ALERTS)))
                return new PieType();

            SearchRequest rq = SearchRequest.of(s -> s.size(0).query(SearchUtil.toQuery(this.getDefaultFilters(List.of(from, to))))
                .index(Constants.SYS_INDEX_PATTERN.get(SystemIndexPattern.ALERTS))
                .aggregations(AGG_NAME, agg -> agg.terms(t -> t.field(Constants.alertSeverityLabel)
                    .size(top).order(List.of(Map.of("_count", SortOrder.Desc))))));

            SearchResponse<String> rs = elasticsearchService.search(rq, String.class);

            List<BucketAggregation> buckets = TermAggregateParser.parse(rs.aggregations().get(AGG_NAME));

            if (CollectionUtils.isEmpty(buckets))
                return new PieType();

            PieType result = new PieType();

            buckets.forEach(bucket -> {
                result.addData(bucket.getKey());
                result.addValue(new PieValue((int) bucket.getDocCount(), bucket.getKey()));
            });

            return result;
        } catch (Exception e) {
            throw new DashboardOverviewException(ctx + ": " + e.getMessage());
        }
    }

    public BarType topAlertsByCategory(String from, String to, Integer top) throws DashboardOverviewException {
        final String ctx = CLASS_NAME + ".topAlertsByCategory";
        final String AGG_NAME = "alert_by_category";
        try {
            if (!elasticsearchService.indexExist(Constants.SYS_INDEX_PATTERN.get(SystemIndexPattern.ALERTS)))
                return new BarType();

            SearchRequest rq = SearchRequest.of(s -> s.size(0).query(SearchUtil.toQuery(this.getDefaultFilters(List.of(from, to))))
                .index(Constants.SYS_INDEX_PATTERN.get(SystemIndexPattern.ALERTS))
                .aggregations(AGG_NAME, agg -> agg.terms(t -> t.field(Constants.alertCategoryKeyword)
                    .size(top).order(List.of(Map.of("_count", SortOrder.Desc))))));

            SearchResponse<String> rs = elasticsearchService.search(rq, String.class);

            List<BucketAggregation> buckets = TermAggregateParser.parse(rs.aggregations().get(AGG_NAME));

            if (CollectionUtils.isEmpty(buckets))
                return new BarType();

            BarType result = new BarType();
            buckets.forEach(bucket -> {
                result.addCategory(bucket.getKey());
                result.addSerie(bucket.getDocCount());
            });

            return result;
        } catch (Exception e) {
            throw new DashboardOverviewException(ctx + ": " + e.getMessage());
        }
    }

    //-------------------------------------------------------------------------------------------------
    //- EVENTS
    //-------------------------------------------------------------------------------------------------
    public PieType countEventsByType(String from, String to, Integer top) throws DashboardOverviewException {
        final String ctx = CLASS_NAME + ".countEventsByType";
        final String AGG_NAME = "events_by_type";
        try {
            if (!elasticsearchService.indexExist(Constants.SYS_INDEX_PATTERN.get(SystemIndexPattern.LOGS)))
                return new PieType();

            List<FilterType> filters = new ArrayList<>();
            filters.add(new FilterType(Constants.timestamp, OperatorType.IS_BETWEEN, List.of(from, to)));

            SearchRequest rq = SearchRequest.of(s -> s.size(0).query(SearchUtil.toQuery(filters))
                .index(Constants.SYS_INDEX_PATTERN.get(SystemIndexPattern.LOGS))
                .aggregations(AGG_NAME, agg -> agg.terms(t -> t.field(Constants.dataTypeKeyword)
                    .size(top).order(List.of(Map.of("_count", SortOrder.Desc))))));

            SearchResponse<String> rs = elasticsearchService.search(rq, String.class);

            List<BucketAggregation> buckets = TermAggregateParser.parse(rs.aggregations().get(AGG_NAME));

            if (CollectionUtils.isEmpty(buckets))
                return new PieType();

            PieType result = new PieType();
            buckets.forEach(bucket -> {
                result.addData(bucket.getKey());
                result.addValue(new PieValue((int) bucket.getDocCount(), bucket.getKey()));
            });
            return result;
        } catch (Exception e) {
            throw new DashboardOverviewException(ctx + ": " + e.getMessage());
        }
    }

    public EventsByObjectsInTimeType eventsInTime(String from, String to, CalendarInterval interval) {
        final String ctx = CLASS_NAME + ".eventsInTime";
        final String DATE_HISTOGRAM_AGG = "events_in_time";
        final String EVENT_TYPE_SUB_AGG = "event_by_type";
        try {
            if (!elasticsearchService.indexExist(Constants.SYS_INDEX_PATTERN.get(SystemIndexPattern.LOGS)))
                return new EventsByObjectsInTimeType();

            List<FilterType> filters = new ArrayList<>();
            filters.add(new FilterType(Constants.timestamp, OperatorType.IS_BETWEEN, List.of(from, to)));

            SearchRequest rq = SearchRequest.of(s -> s.size(0).query(SearchUtil.toQuery(filters))
                .index(Constants.SYS_INDEX_PATTERN.get(SystemIndexPattern.LOGS))
                .aggregations(DATE_HISTOGRAM_AGG, agg -> agg.dateHistogram(h -> h.calendarInterval(interval)
                        .format("yyyy-MM-dd HH:mm").field(Constants.timestamp).minDocCount(1))
                    .aggregations(EVENT_TYPE_SUB_AGG, e -> e.terms(t -> t.field(Constants.dataTypeKeyword)
                        .order(List.of(Map.of("_count", SortOrder.Desc)))))));

            SearchResponse<String> rs = elasticsearchService.search(rq, String.class);

            List<BucketAggregation> buckets = DateHistogramAggregateParser.parse(rs.aggregations().get(DATE_HISTOGRAM_AGG));

            if (CollectionUtils.isEmpty(buckets))
                return new EventsByObjectsInTimeType();

            EventsByObjectsInTimeType result = new EventsByObjectsInTimeType();

            List<String> eventTypes = elasticsearchService.getFieldValues(Constants.dataTypeKeyword,
                Constants.SYS_INDEX_PATTERN.get(SystemIndexPattern.LOGS));
            if (CollectionUtils.isEmpty(eventTypes))
                return new EventsByObjectsInTimeType();

            buckets.forEach(bucket -> {
                result.addCategory(bucket.getKey());

                List<BucketAggregation> subBuckets = TermAggregateParser.parse(bucket.getSubAggregations().get(EVENT_TYPE_SUB_AGG));

                if (CollectionUtils.isEmpty(subBuckets)) {
                    eventTypes.forEach(eventType -> result.addSeries(eventType, 0L));
                } else {
                    Map<String, Long> subBucketMap = subBuckets.stream().collect(
                        Collectors.toMap(BucketAggregation::getKey, BucketAggregation::getDocCount));
                    eventTypes.forEach(eventType -> result.addSeries(eventType, subBucketMap.getOrDefault(eventType, 0L)));
                }
            });

            return result;
        } catch (Exception e) {
            throw new RuntimeException(ctx + ": " + e.getMessage());
        }
    }

    public TableType topWindowsEvents(String from, String to, Integer top) throws DashboardOverviewException {
        final String ctx = CLASS_NAME + ".topEvents";
        final String AGG_NAME = "win_events_by_id";
        try {
            if (!elasticsearchService.indexExist(Constants.SYS_INDEX_PATTERN.get(SystemIndexPattern.LOGS_WINDOWS)))
                return new TableType();

            List<FilterType> filters = new ArrayList<>();
            filters.add(new FilterType(Constants.timestamp, OperatorType.IS_BETWEEN, List.of(from, to)));
            filters.add(new FilterType(Constants.logxWineventlogLogNameKeyword, OperatorType.IS, "Security"));

            SearchRequest rq = SearchRequest.of(s -> s.size(0).query(SearchUtil.toQuery(filters))
                .index(Constants.SYS_INDEX_PATTERN.get(SystemIndexPattern.LOGS_WINDOWS))
                .aggregations(AGG_NAME, agg -> agg.terms(t -> t.field(Constants.logxWineventlogEventNameKeyword)
                    .size(top).order(List.of(Map.of("_count", SortOrder.Desc))))));

            SearchResponse<String> rs = elasticsearchService.search(rq, String.class);

            List<BucketAggregation> buckets = TermAggregateParser.parse(rs.aggregations().get(AGG_NAME));

            if (CollectionUtils.isEmpty(buckets))
                return new TableType();

            TableType result = new TableType();
            result.addColumn("Event").addColumn("Amount");

            buckets.forEach(bucket -> result.addRow(Arrays.asList(bucket.getKey(), String.valueOf(bucket.getDocCount()))));
            return result;
        } catch (Exception e) {
            throw new DashboardOverviewException(ctx + ": " + e.getMessage());
        }
    }

    // ── Alert Timeline ────────────────────────────────────────────────────────

    public record AlertTimelineBucketDTO(String hour, long low, long medium, long high) {}

    public List<AlertTimelineBucketDTO> getAlertTimeline(int days) {
        final String ctx = CLASS_NAME + ".getAlertTimeline";
        try {
            String from = java.time.Instant.now().minus(days, java.time.temporal.ChronoUnit.DAYS).toString();
            String to   = java.time.Instant.now().toString();

            List<FilterType> filters = new ArrayList<>();
            filters.add(new FilterType(Constants.timestamp, OperatorType.IS_BETWEEN, List.of(from, to)));

            SearchRequest rq = SearchRequest.of(s -> s.size(0).query(SearchUtil.toQuery(filters))
                .index(Constants.V11_ALERTS_INDEX_PATTERN)
                .aggregations("by_hour", a -> a.dateHistogram(h -> h
                    .field(Constants.timestamp)
                    .calendarInterval(CalendarInterval.Hour)
                    .minDocCount(0))
                    .aggregations("by_severity", sub -> sub.terms(t -> t
                        .field("severity")
                        .size(10)))));

            SearchResponse<String> rs = elasticsearchService.search(rq, String.class);
            List<BucketAggregation> hourBuckets = DateHistogramAggregateParser.parse(rs.aggregations().get("by_hour"));

            List<AlertTimelineBucketDTO> result = new ArrayList<>();
            if (!CollectionUtils.isEmpty(hourBuckets)) {
                hourBuckets.forEach(hourBucket -> {
                    long low = 0, medium = 0, high = 0;
                    List<BucketAggregation> sevBuckets = TermAggregateParser.parse(hourBucket.getSubAggregations().get("by_severity"));
                    if (!CollectionUtils.isEmpty(sevBuckets)) {
                        for (BucketAggregation sev : sevBuckets) {
                            long count = sev.getDocCount();
                            String key = sev.getKey();
                            if ("1".equals(key) || "low".equalsIgnoreCase(key)) low += count;
                            else if ("2".equals(key) || "medium".equalsIgnoreCase(key)) medium += count;
                            else if ("3".equals(key) || "high".equalsIgnoreCase(key)) high += count;
                        }
                    }
                    result.add(new AlertTimelineBucketDTO(hourBucket.getKey(), low, medium, high));
                });
            }
            return result;
        } catch (Exception e) {
            throw new RuntimeException(ctx + ": " + e.getMessage(), e);
        }
    }

    // ── Geo Threats ───────────────────────────────────────────────────────────

    public record GeoThreatPointDTO(String ip, double lat, double lon, String country, long alertCount, int maxSeverity) {}

    public List<GeoThreatPointDTO> getGeoThreats(int hours) {
        final String ctx = CLASS_NAME + ".getGeoThreats";
        try {
            String from = java.time.Instant.now().minus(hours, java.time.temporal.ChronoUnit.HOURS).toString();
            String to   = java.time.Instant.now().toString();

            List<FilterType> filters = new ArrayList<>();
            filters.add(new FilterType(Constants.timestamp, OperatorType.IS_BETWEEN, List.of(from, to)));
            filters.add(new FilterType("origin.geolocation.latitude", OperatorType.EXIST, null));

            SearchRequest rq = SearchRequest.of(s -> s.size(0).query(SearchUtil.toQuery(filters))
                .index(Constants.V11_ALERTS_INDEX_PATTERN)
                .aggregations("by_ip", a -> a.terms(t -> t
                    .field("origin.ip.keyword")
                    .size(200))
                    .aggregations("top_hit", sub -> sub.topHits(h -> h.size(1)))));

            SearchResponse<String> rs = elasticsearchService.search(rq, String.class);
            List<BucketAggregation> ipBuckets = TermAggregateParser.parse(rs.aggregations().get("by_ip"));

            List<GeoThreatPointDTO> result = new ArrayList<>();
            if (!CollectionUtils.isEmpty(ipBuckets)) {
                for (BucketAggregation ipBucket : ipBuckets) {
                    try {
                        Aggregate topHitAgg = ipBucket.getSubAggregations().get("top_hit");
                        if (topHitAgg == null || topHitAgg.topHits().hits().hits().isEmpty()) continue;
                        String source = topHitAgg.topHits().hits().hits().get(0).source().to(String.class);
                        if (source == null) continue;
                        com.fasterxml.jackson.databind.ObjectMapper om = new com.fasterxml.jackson.databind.ObjectMapper();
                        Map<?, ?> doc = om.readValue(source, Map.class);
                        Map<?, ?> origin = doc.get("origin") instanceof Map ? (Map<?, ?>) doc.get("origin") : null;
                        Map<?, ?> geo = (origin != null && origin.get("geolocation") instanceof Map) ? (Map<?, ?>) origin.get("geolocation") : null;
                        if (geo == null) continue;
                        Object latObj = geo.get("latitude");
                        Object lonObj = geo.get("longitude");
                        if (latObj == null || lonObj == null) continue;
                        double lat = ((Number) latObj).doubleValue();
                        double lon = ((Number) lonObj).doubleValue();
                        String country = geo.get("country") instanceof String ? (String) geo.get("country") : "";
                        Object sevObj = doc.get("severity");
                        int sev = sevObj instanceof Number ? ((Number) sevObj).intValue() : 0;
                        result.add(new GeoThreatPointDTO(ipBucket.getKey(), lat, lon, country, ipBucket.getDocCount(), sev));
                    } catch (Exception parseEx) {
                        // skip this IP if parsing fails
                    }
                }
            }
            return result;
        } catch (Exception e) {
            throw new RuntimeException(ctx + ": " + e.getMessage(), e);
        }
    }

    private List<FilterType> getDefaultFilters(List<String> dateRange){
        List<FilterType> filters = new ArrayList<>();
        filters.add(new FilterType(Constants.alertStatus, OperatorType.IS_NOT, AlertStatus.AUTOMATIC_REVIEW.getCode()));
        filters.add(new FilterType(Constants.alertTags, OperatorType.IS_NOT, Constants.FALSE_POSITIVE_TAG));
        filters.add(new FilterType(Constants.alertParentIdKeyword, OperatorType.DOES_NOT_EXIST, null));

        if(!CollectionUtils.isEmpty(dateRange)){
            filters.add(new FilterType(Constants.timestamp, OperatorType.IS_BETWEEN, dateRange));
        }

        return  filters;
    }
}
