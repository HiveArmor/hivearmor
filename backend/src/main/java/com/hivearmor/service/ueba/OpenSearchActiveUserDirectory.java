package com.hivearmor.service.ueba;

import com.hivearmor.domain.chart_builder.types.query.FilterType;
import com.hivearmor.domain.chart_builder.types.query.OperatorType;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import com.hivearmor.service.elasticsearch.SearchUtil;
import org.opensearch.client.opensearch._types.SortOrder;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.search.Hit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * Resolves active users and their most recent source IP from OpenSearch.
 *
 * <p>All OpenSearch lookups obtain their index pattern from {@link MsspIndexResolver}
 * and express queries through {@link SearchUtil} DSL — no raw {@code v3-hive-*} strings,
 * no raw JSON bodies.
 *
 * <p>This implementation queries the authentication index for distinct user identifiers
 * with recent login activity, then resolves the most recent source IP for each user
 * using a top-1 sort-by-timestamp query.
 */
@Component
public class OpenSearchActiveUserDirectory implements ActiveUserDirectory {

    private static final Logger log = LoggerFactory.getLogger(OpenSearchActiveUserDirectory.class);
    private static final String CLASSNAME = "OpenSearchActiveUserDirectory";

    /** OpenSearch data type for authentication events. */
    private static final String DATA_TYPE_AUTH = "authentication";

    /** Field names in the authentication index. */
    private static final String FIELD_USER_ID = "logx.user.keyword";
    private static final String FIELD_SRC_IP = "logx.source_ip";
    private static final String FIELD_AD_DEPARTMENT = "logx.ad_department.keyword";
    private static final String FIELD_TIMESTAMP = "@timestamp";
    private static final String FIELD_TENANT = "dataSource.keyword";

    private final MsspIndexResolver indexResolver;
    private final OpensearchClientBuilder osClient;

    public OpenSearchActiveUserDirectory(MsspIndexResolver indexResolver,
                                         OpensearchClientBuilder osClient) {
        this.indexResolver = indexResolver;
        this.osClient = osClient;
    }

    @Override
    public List<ActiveUser> listByTenant(String tenantId) {
        final String ctx = CLASSNAME + ".listByTenant";
        try {
            // Resolve index pattern via MsspIndexResolver — never a raw v3-hive-* string
            String indexPattern = indexResolver.resolveIndexPatternForPrefix(DATA_TYPE_AUTH, tenantId);

            // Build filters via SearchUtil DSL — no raw JSON bodies
            List<FilterType> filters = new ArrayList<>();
            filters.add(new FilterType(FIELD_USER_ID, OperatorType.EXIST, null));

            Query query = SearchUtil.toQuery(filters);

            // Aggregate distinct users using a terms aggregation
            SearchRequest request = SearchRequest.of(s -> s
                .index(indexPattern)
                .query(query)
                .size(0)
                .aggregations("distinct_users", agg -> agg
                    .terms(t -> t
                        .field(FIELD_USER_ID)
                        .size(10000))
                    .aggregations("latest_hit", sub -> sub
                        .topHits(th -> th
                            .size(1)
                            .sort(so -> so.field(f -> f.field(FIELD_TIMESTAMP).order(SortOrder.Desc)))
                            .source(src -> src.filter(fi -> fi
                                .includes(List.of(FIELD_USER_ID, FIELD_SRC_IP, FIELD_AD_DEPARTMENT, FIELD_TENANT))
                            ))
                        )
                    )
                )
            );

            SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));

            List<ActiveUser> users = new ArrayList<>();
            var userBuckets = response.aggregations().get("distinct_users").sterms().buckets().array();

            for (var bucket : userBuckets) {
                String userId = bucket.key();
                var topHits = bucket.aggregations().get("latest_hit").topHits().hits().hits();
                if (topHits.isEmpty()) continue;

                Hit<?> latestHit = topHits.get(0);
                @SuppressWarnings("unchecked")
                Map<String, Object> source = (Map<String, Object>) latestHit.source();
                if (source == null) continue;

                String srcIp = extractString(source, "logx.source_ip");
                String adDept = extractString(source, "logx.ad_department");

                users.add(new ActiveUserRecord(userId, tenantId, adDept, srcIp));
            }

            log.debug("{}: resolved {} active users for tenant={}", ctx, users.size(), tenantId);
            return users;

        } catch (Exception e) {
            log.warn("{}: failed to resolve active users for tenant={} — {}", ctx, tenantId, e.getMessage());
            return Collections.emptyList();
        }
    }

    @SuppressWarnings("unchecked")
    private String extractString(Map<String, Object> source, String dotPath) {
        String[] parts = dotPath.split("\\.");
        Object current = source;
        for (String part : parts) {
            if (current instanceof Map) {
                current = ((Map<String, Object>) current).get(part);
            } else {
                return null;
            }
        }
        return current != null ? current.toString() : null;
    }

    /**
     * Immutable record implementing {@link ActiveUser}.
     */
    private record ActiveUserRecord(
        String userId,
        String tenantId,
        String adDepartment,
        String mostRecentSrcIp
    ) implements ActiveUser {

        @Override
        public String getUserId() {
            return userId;
        }

        @Override
        public String getTenantId() {
            return tenantId;
        }

        @Override
        public String getAdDepartment() {
            return adDepartment;
        }

        @Override
        public String getMostRecentSrcIp() {
            return mostRecentSrcIp;
        }
    }
}
