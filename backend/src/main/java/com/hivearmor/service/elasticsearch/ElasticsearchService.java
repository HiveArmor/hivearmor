package com.hivearmor.service.elasticsearch;

import com.hivearmor.config.Constants;
import com.hivearmor.domain.User;
import com.hivearmor.domain.UtmSpaceNotificationControl;
import com.hivearmor.domain.application_events.enums.ApplicationEventType;
import com.hivearmor.domain.chart_builder.types.query.FilterType;
import com.hivearmor.domain.index_pattern.enums.SystemIndexPattern;
import com.hivearmor.repository.UserRepository;
import com.hivearmor.service.MailService;
import com.hivearmor.service.UtmSpaceNotificationControlService;
import com.hivearmor.service.application_events.ApplicationEventService;
import com.hivearmor.service.index_policy.IndexPolicyService;
import com.hivearmor.service.dto.compliance.UtmComplianceControlEvaluationHistoryDto;
import com.hivearmor.service.mapper.compliance.UtmComplianceControlLatestEvaluationMapper;
import com.hivearmor.service.mapper.compliance.UtmComplianceControlEvaluationHistoryMapper;
import com.hivearmor.util.chart_builder.IndexPropertyType;
import com.hivearmor.util.exceptions.OpenSearchIndexNotFoundException;
import com.hivearmor.util.exceptions.UtmElasticsearchException;
import com.hivearmor.opensearch.enums.IndexSortableProperty;
import com.hivearmor.opensearch.enums.TermOrder;
import com.hivearmor.opensearch.exceptions.OpenSearchException;
import com.hivearmor.opensearch.types.ElasticCluster;
import com.hivearmor.opensearch.types.IndexSort;
import com.hivearmor.opensearch.types.SearchSqlResponse;
import com.hivearmor.opensearch.types.SqlQueryRequest;
import com.github.benmanes.caffeine.cache.Cache;
import lombok.extern.slf4j.Slf4j;
import org.opensearch.client.opensearch._types.FieldValue;
import org.opensearch.client.opensearch._types.SortOrder;
import org.opensearch.client.opensearch._types.aggregations.LongTermsBucket;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.opensearch.client.opensearch.cat.indices.IndicesRecord;
import org.opensearch.client.opensearch.core.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.support.PagedListHolder;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.support.PageableExecutionUtils;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.util.Assert;
import org.springframework.util.CollectionUtils;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;
import java.util.concurrent.TimeUnit;

/**
 * @author Leonardo M. López
 */
@Service
@Slf4j
public class ElasticsearchService {
    private static final String CLASSNAME = "ElasticsearchService";
    private static final int FIELD_VALUES_MAX_BUCKETS = 500;
    private final Logger log = LoggerFactory.getLogger(ElasticsearchService.class);
    private final ApplicationEventService eventService;
    private final UserRepository userRepository;
    private final MailService mailService;
    private final UtmSpaceNotificationControlService spaceNotificationControlService;
    private final IndexPolicyService indexPolicyService;
    private final OpensearchClientBuilder client;
    private final Cache<String, List<String>> fieldValuesCache;

    public ElasticsearchService(ApplicationEventService eventService, UserRepository userRepository,
                                MailService mailService,
                                UtmSpaceNotificationControlService spaceNotificationControlService,
                                IndexPolicyService indexPolicyService,
                                OpensearchClientBuilder client,
                                Cache<String, List<String>> fieldValuesCache) {
        this.eventService = eventService;
        this.userRepository = userRepository;
        this.mailService = mailService;
        this.spaceNotificationControlService = spaceNotificationControlService;
        this.indexPolicyService = indexPolicyService;
        this.client = client;
        this.fieldValuesCache = fieldValuesCache;
    }

    /**
     * Gets all values from an index keyword field
     *
     * @param keyword:      Keyword field name
     * @param indexPattern: Index pattern
     * @return List of field value
     */
    public List<String> getFieldValues(String keyword, String indexPattern) {
        final String ctx = CLASSNAME + ".getFieldValues";
        String cacheKey = keyword + "::" + indexPattern;
        List<String> cached = fieldValuesCache.getIfPresent(cacheKey);
        if (cached != null) {
            return cached;
        }
        try {
            List<String> result = new ArrayList<>(
                    client.getClient().getFieldValues(
                            keyword, indexPattern, null,
                            FIELD_VALUES_MAX_BUCKETS,
                            TermOrder.Count, SortOrder.Desc
                    ).keySet()
            );
            fieldValuesCache.put(cacheKey, result);
            return result;
        } catch (Exception e) {
            throw new RuntimeException(ctx + ": " + e.getLocalizedMessage());
        }
    }

    /**
     * Gets all values for a field and count the documents for each value
     *
     * @param filters : Filters to apply
     * @param field   : Field to get values
     * @param top     : Top of result to get as result
     * @param index   : Index to get the field values
     * @return A map with field value as key and amount of documents as value
     */
    public Map<String, Long> getFieldValuesWithCount(String field, String index, List<FilterType> filters, Integer top,
                                                     boolean orderByCount, boolean sortAsc) {
        final String ctx = CLASSNAME + ".getFieldValuesWithCount";
        try {
            return client.getClient().getFieldValues(field, index, SearchUtil.toQuery(filters), top,
                    orderByCount ? TermOrder.Count : TermOrder.Key, sortAsc ? SortOrder.Asc : SortOrder.Desc);
        } catch (Exception e) {
            throw new RuntimeException(ctx + ": " + e.getLocalizedMessage());
        }
    }

    /**
     * Check if some index exist
     *
     * @param index Index where the indexing will be performed, you can use a pattern too
     * @return True if index exist, false otherwise
     */
    public boolean indexExist(String index) {
        final String ctx = CLASSNAME + ".indexExist";
        try {
            return client.getClient().indexExist(index);
        } catch (Exception e) {
            String msg = ctx + ": " + e.getLocalizedMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return false;
        }
    }

    public <T> IndexResponse index(String index, T document) {
        final String ctx = CLASSNAME + ".index";
        try {
            return client.getClient().index(index, document);
        } catch (Exception e) {
            String msg = ctx + ": " + e.getLocalizedMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            throw new RuntimeException(ctx + ": " + e.getMessage());
        }
    }

    /**
     * Gets all fields of an index
     *
     * @param indexPattern: Index pattern for get fields
     * @return A list of IndexProperty with a name and type of field
     */
    public List<IndexPropertyType> getIndexProperties(String indexPattern) {
        final String ctx = CLASSNAME + ".getIndexProperties";

        if (!indexExist(indexPattern)) {
            log.info("{} Index pattern {} does not exist", ctx, indexPattern);
            return Collections.emptyList();
        }

        try {
            Map<String, String> properties = client.getClient().getIndexProperties(indexPattern);
            if (CollectionUtils.isEmpty(properties))
                return Collections.emptyList();
            return properties.entrySet()
                    .stream().map(e -> new IndexPropertyType(e.getKey(), e.getValue())).collect(Collectors.toList());
        } catch (Exception e) {
            throw new RuntimeException(ctx + ": " + e.getMessage());
        }
    }

    /**
     * Make a query to elasticsearch to get all indexes. Depending on includeSystemIndex param it includes in the result the
     * elasticsearch system indexes
     *
     * @param includeSystemIndex: Decide if include elasticsearch system indexes to the result
     * @param pattern:            Just return indexes that his name match with pattern
     * @return A list of IndexType object.
     * @throws UtmElasticsearchException In case of any error
     */
    public Page<IndicesRecord> getAllIndexes(boolean includeSystemIndex, String pattern, Pageable pageable) throws
            UtmElasticsearchException {
        final String ctx = CLASSNAME + ".getAllIndexes";
        try {
            Assert.notNull(pageable, "Argument pageable can't be null");

            List<IndicesRecord> indices = client.getClient().getIndices(pattern, from(pageable.getSort()));

            if (CollectionUtils.isEmpty(indices))
                return PageableExecutionUtils.getPage(indices, pageable, indices::size);

            if (!includeSystemIndex)
                indices = indices.stream().filter(index -> !index.index().startsWith("."))
                        .collect(Collectors.toList());

            PagedListHolder<IndicesRecord> pageDefinition = new PagedListHolder<>();
            pageDefinition.setSource(indices);
            pageDefinition.setPageSize(pageable.getPageSize());
            pageDefinition.setPage(pageable.getPageNumber());
            return PageableExecutionUtils.getPage(pageDefinition.getPageList(), pageable, indices::size);
        } catch (Exception e) {
            throw new UtmElasticsearchException(ctx + ": " + e.getMessage());
        }
    }

    private IndexSort from(Sort sort) {
        final String ctx = CLASSNAME + ".from";
        try {
            if (Objects.isNull(sort) || sort.isUnsorted())
                return IndexSort.unSorted();
            IndexSort.Builder sortBuilder = IndexSort.builder();
            sort.forEach(order -> sortBuilder.with(IndexSortableProperty.fromJsonValue(order.getProperty()),
                    order.getDirection().isAscending() ? SortOrder.Asc : SortOrder.Desc));
            return sortBuilder.build();
        } catch (Exception e) {
            throw new RuntimeException(ctx + ": " + e.getLocalizedMessage());
        }
    }

    public Optional<ElasticCluster> getClusterStatus() throws UtmElasticsearchException {
        final String ctx = CLASSNAME + ".getClusterStatus";
        try {
            return client.getClient().getClusterNodesInfo();
        } catch (Exception e) {
            throw new UtmElasticsearchException(ctx + ": " + e.getMessage());
        }
    }

    @Scheduled(fixedDelay = 60000, initialDelay = 60000)
    public void preventSystemCrashBySpace() {
        final String ctx = CLASSNAME + ".preventSystemCrashBySpace";

        try {
            Optional<ElasticCluster> opt = getClusterStatus();

            if (opt.isEmpty())
                return;

            ElasticCluster clusterStatus = opt.get();

            float diskPercent = clusterStatus.getResume().getDiskUsedPercent();

            if (diskPercent < 70)
                return;

            if (diskPercent >= 85) {
                deleteOldestIndices();
            } else if (diskPercent >= 70) {
                List<User> admins = userRepository.findAllAdmins();
                if (CollectionUtils.isEmpty(admins))
                    return;

                UtmSpaceNotificationControl notificationControl = spaceNotificationControlService.findById(1L)
                        .orElse(new UtmSpaceNotificationControl());
                if (Objects.isNull(notificationControl.getId()))
                    notificationControl.setId(1L);

                Instant now = LocalDateTime.now().toInstant(ZoneOffset.UTC);

                if (Objects.isNull(notificationControl.getNextNotification()) ||
                        now.isAfter(notificationControl.getNextNotification())) {
                    mailService.sendLowSpaceEmail(admins, clusterStatus);
                    notificationControl.setNextNotification(now.plus(24, ChronoUnit.HOURS));
                    spaceNotificationControlService.save(notificationControl);
                }
            }
        } catch (Exception e) {
            String msg = String.format("%1$s: %2$s", ctx, e.getMessage());
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
        }
    }

    /**
     *
     */
    private void deleteOldestIndices() {
        final String ctx = CLASSNAME + ".deleteOldestIndices";
        try {
            List<IndicesRecord> indices = client.getClient().getIndices(Constants.SYS_INDEX_PATTERN.get(SystemIndexPattern.LOGS), IndexSort.builder()
                    .with(IndexSortableProperty.CreationDate, SortOrder.Asc).build());

            // If no index that match with log-* was found then te function is terminated
            if (CollectionUtils.isEmpty(indices))
                return;

            // Indices are returned from oldest to newest ordered by creation.date asc
            for (IndicesRecord index : indices) {
                Optional<ElasticCluster> opt = getClusterStatus();

                if (opt.isEmpty() || opt.get().getResume().getDiskUsedPercent() < 70)
                    break;

                if (!indexPolicyService.isIndexRemovable(index.index())) {
                    log.info("{} Skipping index {} because it is not in a removable state", ctx, index.index());
                    continue;
                }

                try {
                    // Delete oldest indices
                    deleteIndex(Collections.singletonList(index.index()));
                    eventService.createEvent(String.format("Index %1$s was deleted to avoid system crash by space:\n" +
                                    "Creation Date: %2$s\n" +
                                    "Docs Count: %3$s\n" +
                                    "Size: %4$s",
                            index.index(), index.creationDateString(), index.docsCount(), index.storeSize()), ApplicationEventType.INFO);
                    TimeUnit.SECONDS.sleep(10);
                } catch (Exception e) {
                    String msg = String.format("%1$s: Fail to delete index: %2$s with message: %3$s", ctx, index.index(), e.getMessage());
                    eventService.createEvent(msg, ApplicationEventType.WARNING);
                }

            }
        } catch (Exception e) {
            String msg = String.format("%1$s: %2$s", ctx, e.getMessage());
            eventService.createEvent(msg, ApplicationEventType.ERROR);
        }
    }

    /**
     * Bulk delete for indexes
     *
     * @param indices : List of the names pf all indexes to be removed
     * @throws Exception In case of any error
     */
    public void deleteIndex(List<String> indices) throws Exception {
        final String ctx = CLASSNAME + ".deleteIndex";
        try {
            if (CollectionUtils.isEmpty(indices))
                return;
            client.getClient().deleteIndex(indices);
        } catch (Exception e) {
            throw new Exception(ctx + ": " + e.getMessage());
        }
    }

    public <T> SearchResponse<T> search(List<FilterType> filters, Integer top, String indexPattern,
                                        Pageable pageable, Class<T> type) {
        final String ctx = CLASSNAME + ".search";
        try {
            Assert.hasText(indexPattern, "Parameter indexPattern must not be null or empty");
            SearchRequest query = buildQuery(indexPattern, filters, top, pageable);
            return client.execute(c -> c.search(query, type));
        } catch (Exception e) {
            throw new RuntimeException(ctx + ": " + e.getMessage());
        }
    }

    public boolean exists(List<FilterType> filters, String indexPattern) {
        final String ctx = CLASSNAME + ".exists";
        try {
            SearchRequest request = new SearchRequest.Builder()
                    .index(indexPattern)
                    .query(SearchUtil.toQuery(filters))
                    .size(1)
                    .build();

            SearchResponse<Object> response = search(request, Object.class);
            return response.hits().total().value() > 0;
        } catch (Exception e) {
            throw new RuntimeException(ctx + ": " + e.getMessage());
        }
    }

    public long count(List<FilterType> filters, String indexPattern) {
        final String ctx = CLASSNAME + ".count";
        try {
            SearchRequest.Builder srb = new SearchRequest.Builder()
                    .index(indexPattern)
                    .query(SearchUtil.toQuery(filters))
                    .size(0);

            SearchResponse<Object> response = search(srb.build(), Object.class);
            return response.hits().total().value();
        } catch (Exception e) {
            throw new RuntimeException(ctx + ": " + e.getMessage(), e);
        }
    }

    public Map<String, Object> getLatestDocument(List<FilterType> filters, String indexPattern) {
        final String ctx = CLASSNAME + ".getLatestDocument";
        try {
            SearchRequest request = new SearchRequest.Builder()
                    .index(indexPattern)
                    .query(SearchUtil.toQuery(filters))
                    .sort(s -> s.field(f -> f.field("@timestamp").order(SortOrder.Desc)))
                    .size(1)
                    .build();

            SearchResponse<Map> response = search(request, Map.class);
            if (response.hits().hits().isEmpty()) return null;
            return response.hits().hits().get(0).source();
        } catch (Exception e) {
            throw new RuntimeException(ctx + ": " + e.getMessage(), e);
        }
    }


    public <T> SearchResponse<T> search(SearchRequest request, Class<T> type) {
        final String ctx = CLASSNAME + ".search";
        try {
            return client.execute(c -> c.search(request, type));
        } catch (Exception e) {
            throw new RuntimeException(ctx + ": " + e.getMessage());
        }
    }

    @FunctionalInterface
    public interface SearchBatchConsumer<T> {
        /** Returns false to stop iteration early. */
        boolean accept(List<T> batch) throws Exception;
    }

    /**
     * Streams a result set using search_after pagination, never holding more than {@code pageSize}
     * documents in memory at a time. Designed for very large exports where loading every hit at
     * once would OOM the JVM (and take the OpenSearch client's I/O reactor down with it).
     *
     * Sort is forced to {@code @timestamp desc} with {@code _id desc} as tiebreaker so that
     * search_after is stable and deterministic.
     *
     * @param filters      filters to apply
     * @param max          hard upper bound on total documents to emit; null or <=0 means unbounded
     * @param indexPattern target index pattern
     * @param pageSize     batch size (capped at 10000 by OpenSearch per request)
     * @param type         deserialization type
     * @param consumer     receives each batch; return false to stop early
     * @return total number of documents emitted
     */
    public <T> long searchStream(List<FilterType> filters, Integer max, String indexPattern,
                                 int pageSize, Class<T> type, SearchBatchConsumer<T> consumer) {
        final String ctx = CLASSNAME + ".searchStream";
        try {
            Assert.hasText(indexPattern, "Parameter indexPattern must not be null or empty");
            Assert.notNull(consumer, "consumer must not be null");
            if (pageSize <= 0) pageSize = 500;

            long emitted = 0;
            List<String> after = null;
            while (true) {
                int remaining = (max != null && max > 0) ? (int) (max - emitted) : pageSize;
                if (remaining <= 0) break;
                int size = Math.min(pageSize, remaining);

                final List<String> afterFinal = after;
                final int sizeFinal = size;
                SearchResponse<T> response = client.execute(c -> {
                    SearchRequest.Builder srb = new SearchRequest.Builder()
                            .index(indexPattern)
                            .query(SearchUtil.toQuery(filters))
                            .size(sizeFinal)
                            .sort(s -> s.field(f -> f.field("@timestamp").order(SortOrder.Desc)))
                            .sort(s -> s.field(f -> f.field("_id").order(SortOrder.Desc)));
                    if (afterFinal != null && !afterFinal.isEmpty())
                        srb.searchAfter(afterFinal);
                    return c.search(srb.build(), type);
                });

                if (response == null || response.hits() == null) break;
                List<org.opensearch.client.opensearch.core.search.Hit<T>> hits = response.hits().hits();
                if (hits == null || hits.isEmpty()) break;

                List<T> batch = new ArrayList<>(hits.size());
                for (org.opensearch.client.opensearch.core.search.Hit<T> h : hits)
                    batch.add(h.source());

                boolean keepGoing = consumer.accept(batch);
                emitted += hits.size();

                if (!keepGoing) break;
                if (hits.size() < size) break;

                after = hits.get(hits.size() - 1).sort();
                if (after == null || after.isEmpty()) break;
            }
            return emitted;
        } catch (Exception e) {
            throw new RuntimeException(ctx + ": " + e.getMessage(), e);
        }
    }

    public void updateByQuery(Query query, String index, String script) {
        final String ctx = CLASSNAME + ".updateByQuery";
        try {
            client.getClient().updateByQuery(query, index, script);
        } catch (OpenSearchException e) {
            throw new RuntimeException(ctx + ": " + e.getMessage());
        }
    }

    /**
     * Build a query based on filters provided
     *
     * @param filters : Filters to apply
     * @return A SearchSourceBuilder with the query to execute
     */
    private SearchRequest buildQuery(String pattern, List<FilterType> filters, Integer top, Pageable pageable) throws UtmElasticsearchException {
        final String ctx = CLASSNAME + ".buildQuery";
        try {
            SearchRequest.Builder srb = new SearchRequest.Builder();
            srb.index(pattern);
            SearchUtil.applyPaginationAndSort(srb, pageable, top);
            return srb.query(SearchUtil.toQuery(filters)).build();
        } catch (Exception e) {
            throw new UtmElasticsearchException(ctx + ": " + e.getMessage());
        }
    }

    public <T> SearchSqlResponse<T> searchBySql(SqlQueryRequest request, Class<T> responseType) {
        final String ctx = CLASSNAME + ".searchBySql";
        try {
            return client.getClient().searchBySqlQuery(request, responseType);
        } catch (Exception e) {
            throw new RuntimeException(ctx + ": " + e.getMessage());
        }
    }

    public List<UtmComplianceControlEvaluationHistoryDto> getControlEvaluations(Long controlId) {
        final String ctx = CLASSNAME + ".getControlEvaluations";
        try {
            Query query = Query.of(q -> q.term(t -> t
                    .field("controlId")
                    .value(FieldValue.of(controlId.toString())))
            );

            SearchRequest request = new SearchRequest.Builder()
                    .index("v3-hive-compliance-evidence-*")
                    .query(query)
                    .size(30)
                    .sort(s -> s.field(f -> f
                            .field("@timestamp")
                            .order(SortOrder.Desc)
                    ))
                    .build();

            SearchResponse<Map> response = search(request, Map.class);

            return response.hits().hits().stream()
                    .map(hit -> UtmComplianceControlEvaluationHistoryMapper.mapToEvaluationDto(hit.source()))
                    .toList();

        } catch (Exception e) {
            if (isIndexNotFoundException(e)) {
                return java.util.Collections.emptyList();
            }
            throw new RuntimeException(ctx + ": " + e.getMessage(), e);
        }
    }

    public UtmComplianceControlEvaluationHistoryDto getLatestControlEvaluation(Long controlId) {
        try {
            SearchRequest request = new SearchRequest.Builder()
                    .index("v3-hive-compliance-evidence-*")
                    .query(q -> q.term(t -> t
                            .field("controlId")
                            .value(v -> v.longValue(controlId))
                    ))
                    .sort(s -> s.field(f -> f.field("@timestamp").order(SortOrder.Desc)))
                    .size(1)
                    .build();

            SearchResponse<Map> response = client.getClient().search(request, Map.class);

            if (response.hits().hits().isEmpty()) {
                return null;
            }

            Map<String, Object> source = response.hits().hits().get(0).source();

            return UtmComplianceControlLatestEvaluationMapper.mapToEvaluationDto(source);

        } catch (Exception e) {
            if (isIndexNotFoundException(e)) {
                return null;
            }
            throw new RuntimeException("Error fetching last evaluation for control " + controlId, e);
        }
    }

    /**
     * Fetches the latest compliance evaluation for each of the given control IDs in a single
     * OpenSearch request. Returns a map keyed by controlId; absent entries mean no evaluation yet.
     */
    public Map<Long, UtmComplianceControlEvaluationHistoryDto> getBatchLatestEvaluations(List<Long> controlIds) {
        if (controlIds == null || controlIds.isEmpty()) return Collections.emptyMap();
        try {
            List<FieldValue> values = controlIds.stream()
                    .map(FieldValue::of)
                    .collect(Collectors.toList());

            SearchRequest request = SearchRequest.of(s -> s
                    .index("v3-hive-compliance-evidence-*")
                    .query(q -> q.terms(t -> t
                            .field("controlId")
                            .terms(tv -> tv.value(values))
                    ))
                    .aggregations("by_control_id", agg -> agg
                            .terms(t -> t
                                    .field("controlId")
                                    .size(controlIds.size())
                            )
                            .aggregations("latest", sub -> sub
                                    .topHits(th -> th
                                            .size(1)
                                            .sort(sort -> sort.field(f -> f
                                                    .field("@timestamp")
                                                    .order(SortOrder.Desc)))
                                    )
                            )
                    )
                    .size(0)
            );

            SearchResponse<Map> response = client.execute(c -> c.search(request, Map.class));

            Map<Long, UtmComplianceControlEvaluationHistoryDto> result = new HashMap<>();
            var byControlId = response.aggregations().get("by_control_id");
            if (byControlId == null || !byControlId.isLterms()) return result;

            for (LongTermsBucket bucket : byControlId.lterms().buckets().array()) {
                long controlId = Long.parseLong(bucket.key());
                var latestAgg = bucket.aggregations().get("latest");
                if (latestAgg == null) continue;
                var topHits = latestAgg.topHits();
                if (topHits == null || topHits.hits().hits().isEmpty()) continue;
                var hit = topHits.hits().hits().get(0);
                if (hit.source() == null) continue;
                // hit.source() is JsonData; serialize to JSON string then re-parse as a plain Map
                // to avoid date-type coercion failures from the JSONP mapper's ObjectMapper.
                String json = hit.source().toJson().toString();
                @SuppressWarnings("unchecked")
                Map<String, Object> source = new com.fasterxml.jackson.databind.ObjectMapper().readValue(json, Map.class);
                result.put(controlId, UtmComplianceControlLatestEvaluationMapper.mapToEvaluationDto(source));
            }
            return result;
        } catch (Throwable e) {
            log.error("getBatchLatestEvaluations failed for controlIds={}: {}", controlIds, e.getMessage(), e);
            if (e instanceof Exception && isIndexNotFoundException((Exception) e)) return Collections.emptyMap();
            throw new RuntimeException("Failed to batch-fetch compliance evaluations: " + e.getMessage(), e);
        }
    }

    private static boolean isIndexNotFoundException(Exception e) {
        Throwable t = e;
        while (t != null) {
            String msg = t.getMessage();
            if (msg != null && (msg.contains("index_not_found_exception")
                    || msg.contains("no such index")
                    || msg.contains("index_not_found"))) {
                return true;
            }
            t = t.getCause();
        }
        return false;
    }

}