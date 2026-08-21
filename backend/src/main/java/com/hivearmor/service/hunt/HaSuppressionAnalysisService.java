package com.hivearmor.service.hunt;

import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.security.SecurityUtils;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import com.hivearmor.service.hunt.dto.*;
import org.opensearch.client.json.JsonData;
import org.opensearch.client.opensearch._types.FieldValue;
import org.opensearch.client.opensearch._types.aggregations.*;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.opensearch.client.opensearch._types.query_dsl.RangeQuery;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Service responsible for evaluating suppression and exception conditions against
 * historical alert data in OpenSearch.
 *
 * <p>Provides read-only impact analysis for two workflows:
 * <ul>
 *   <li><strong>Suppression preview</strong> — given a proposed suppression condition
 *       and a source alert, calculates how many historical alerts match, the projected
 *       volume reduction, affected tenants/data sources, and false-negative risk.</li>
 *   <li><strong>Exception preview</strong> — given a detection rule and a proposed
 *       exception condition, calculates matching alerts, affected MITRE techniques,
 *       overlap with existing exceptions, and risk assessment.</li>
 * </ul>
 *
 * <p>Neither method modifies any stored data — both are pure read-only analyses.
 *
 * <p>Sprint 37 — ALT-021 (Requirement 2).
 */
@Service
public class HaSuppressionAnalysisService {

    private static final Logger log = LoggerFactory.getLogger(HaSuppressionAnalysisService.class);

    /** Lookback window for historical alert analysis (30 days). */
    static final int LOOKBACK_DAYS = 30;

    /** Volume reduction threshold above which high-impact warning is triggered. */
    static final double HIGH_IMPACT_THRESHOLD = 50.0;

    /** Approval policy applied when high-impact warning is active. */
    static final String APPROVAL_POLICY_MANAGER = "manager_required";

    /** Default approval policy when impact is below threshold. */
    static final String APPROVAL_POLICY_NONE = "none";

    /** Default rollback instructions for suppression rules. */
    static final String DEFAULT_ROLLBACK_INSTRUCTIONS = "Delete suppression rule from Settings > Suppressions";

    private final OpensearchClientBuilder osClient;
    private final MsspIndexResolver indexResolver;

    // =========================================================================
    // Constructor (injection)
    // =========================================================================

    public HaSuppressionAnalysisService(OpensearchClientBuilder osClient,
                                        MsspIndexResolver indexResolver) {
        this.osClient = osClient;
        this.indexResolver = indexResolver;
    }

    // =========================================================================
    // Suppression Preview
    // =========================================================================

    /**
     * Analyzes the impact of a proposed suppression condition against historical alerts.
     *
     * <p>Queries the last 30 days of alerts in the tenant-scoped index to determine:
     * <ul>
     *   <li>How many historical alerts match the proposed condition</li>
     *   <li>The projected volume reduction (percentage)</li>
     *   <li>Which tenants and data sources are affected</li>
     *   <li>Whether critical or threat-intel-matched alerts overlap (risk prompts)</li>
     *   <li>Whether the suppression qualifies as high-impact (>50% reduction)</li>
     * </ul>
     *
     * <p>This method is <strong>read-only</strong> — it does not create, update, or
     * delete any stored data.
     *
     * @param alertId    the source alert ID that triggered the suppression dialog
     * @param conditions the proposed suppression condition tuples (field/operator/value)
     * @return a read-only preview of the suppression impact
     * @throws Exception if the OpenSearch query fails
     */
    public SuppressionPreviewResponse analyzeImpact(String alertId,
                                                    List<ConditionTuple> conditions) throws Exception {
        String indexPattern = indexResolver.resolveAlertIndexPattern();
        log.debug("analyzeImpact: alertId={}, conditions={}, index={}",
            alertId, conditions.size(), indexPattern);

        // =====================================================================
        // Task 3.2 — Query last 30 days of alerts
        // =====================================================================

        Instant now = Instant.now();
        Instant lookbackStart = now.minus(Duration.ofDays(LOOKBACK_DAYS));
        Instant recentThreshold = now.minus(Duration.ofDays(7));

        // Base time range filter for the 30-day window
        Query timeRangeFilter = Query.of(q -> q.range(RangeQuery.of(r -> r
            .field("@timestamp")
            .gte(JsonData.of(lookbackStart.toString()))
            .lte(JsonData.of(now.toString())))));

        // =====================================================================
        // Task 3.3 & 3.4 — Build bool query from condition tuples
        // =====================================================================

        Query conditionQuery = buildConditionQuery(conditions);

        // =====================================================================
        // Task 3.5 — Count total alerts in 30-day window (denominator)
        // =====================================================================

        // Single query with all the aggregations we need:
        // - Total count comes from the overall hits count (with time range only)
        // - Matching count from a filter aggregation applying the condition
        // - Sub-aggregations on the matching set for tenants, data sources, critical, threat-intel
        SearchRequest request = SearchRequest.of(r -> r
            .index(indexPattern)
            .query(Query.of(qr -> qr.bool(b -> b.filter(List.of(timeRangeFilter)))))
            .size(0)
            .trackTotalHits(t -> t.enabled(true))

            // Filter aggregation: alerts matching the proposed condition
            .aggregations("matching", a -> a
                .filter(conditionQuery)
                // Task 3.8 — Terms agg on tenantId for affectedTenants
                .aggregations("affected_tenants", sub -> sub
                    .terms(t -> t.field("tenantId.keyword").size(100)))
                // Task 3.9 — Terms agg on dataSource for affectedDataSources
                .aggregations("affected_data_sources", sub -> sub
                    .terms(t -> t.field("dataSource.keyword").size(100)))
                // Task 3.10 — Filter agg for critical alerts (severity >= 9)
                .aggregations("critical_overlap", sub -> sub
                    .filter(f -> f.range(RangeQuery.of(rq -> rq
                        .field("severity")
                        .gte(JsonData.of(9))))))
                // Task 3.11 — Filter agg for threat-intel-matched alerts
                .aggregations("threat_intel_overlap", sub -> sub
                    .filter(f -> f.term(t -> t
                        .field("threatIntelMatched")
                        .value(v -> v.booleanValue(true)))))
                // Task 3.14 — Filter agg for recent alerts (last 7 days) to suggest expiry
                .aggregations("recent_alerts", sub -> sub
                    .filter(f -> f.range(RangeQuery.of(rq -> rq
                        .field("@timestamp")
                        .gte(JsonData.of(recentThreshold.toString())))))))
        );

        @SuppressWarnings("rawtypes")
        SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));

        // =====================================================================
        // Task 3.5 — Total alert count (denominator)
        // =====================================================================

        long totalAlerts = response.hits().total() != null
            ? response.hits().total().value() : 0;

        // =====================================================================
        // Task 3.6 — Matching alert count (numerator)
        // =====================================================================

        Aggregate matchingAgg = response.aggregations().get("matching");
        long matchingAlerts = 0;
        long criticalOverlapCount = 0;
        long threatIntelOverlapCount = 0;
        long recentMatchingCount = 0;
        List<String> affectedTenants = new ArrayList<>();
        List<String> affectedDataSources = new ArrayList<>();

        if (matchingAgg != null && matchingAgg.isFilter()) {
            FilterAggregate matchingFilter = matchingAgg.filter();
            matchingAlerts = matchingFilter.docCount();

            // Task 3.8 — Extract affected tenants
            Aggregate tenantsAgg = matchingFilter.aggregations().get("affected_tenants");
            if (tenantsAgg != null && tenantsAgg.isSterms()) {
                for (StringTermsBucket bucket : tenantsAgg.sterms().buckets().array()) {
                    affectedTenants.add(bucket.key());
                }
            }

            // Task 3.9 — Extract affected data sources
            Aggregate dataSourcesAgg = matchingFilter.aggregations().get("affected_data_sources");
            if (dataSourcesAgg != null && dataSourcesAgg.isSterms()) {
                for (StringTermsBucket bucket : dataSourcesAgg.sterms().buckets().array()) {
                    affectedDataSources.add(bucket.key());
                }
            }

            // Task 3.10 — Critical alert overlap count
            Aggregate criticalAgg = matchingFilter.aggregations().get("critical_overlap");
            if (criticalAgg != null && criticalAgg.isFilter()) {
                criticalOverlapCount = criticalAgg.filter().docCount();
            }

            // Task 3.11 — Threat-intel overlap count
            Aggregate threatIntelAgg = matchingFilter.aggregations().get("threat_intel_overlap");
            if (threatIntelAgg != null && threatIntelAgg.isFilter()) {
                threatIntelOverlapCount = threatIntelAgg.filter().docCount();
            }

            // Task 3.14 — Recent alerts count for expiry suggestion
            Aggregate recentAgg = matchingFilter.aggregations().get("recent_alerts");
            if (recentAgg != null && recentAgg.isFilter()) {
                recentMatchingCount = recentAgg.filter().docCount();
            }
        }

        // =====================================================================
        // Task 3.7 — Calculate projectedVolumeReduction
        // =====================================================================

        double projectedVolumeReduction = 0.0;
        if (totalAlerts > 0) {
            projectedVolumeReduction = ((double) matchingAlerts / (double) totalAlerts) * 100.0;
        }

        // =====================================================================
        // Task 3.10 & 3.11 — Generate falseNegativeRiskPrompts
        // =====================================================================

        List<String> falseNegativeRiskPrompts = new ArrayList<>();

        if (criticalOverlapCount > 0) {
            falseNegativeRiskPrompts.add(criticalOverlapCount
                + " critical alerts in the last 7 days match this condition"
                + " \u2014 suppression may hide real threats");
        }

        if (threatIntelOverlapCount > 0) {
            falseNegativeRiskPrompts.add(threatIntelOverlapCount
                + " alerts matched threat intelligence indicators");
        }

        // =====================================================================
        // Task 3.12 — Set highImpactWarning
        // =====================================================================

        boolean highImpactWarning = projectedVolumeReduction > HIGH_IMPACT_THRESHOLD;

        // =====================================================================
        // Task 3.13 — Set approvalPolicy
        // =====================================================================

        String approvalPolicy = highImpactWarning ? APPROVAL_POLICY_MANAGER : APPROVAL_POLICY_NONE;

        // =====================================================================
        // Task 3.14 — Suggest expiry based on alert recency
        // =====================================================================

        // If more than half of matching alerts are from the last 7 days, it's a recent
        // pattern → suggest short expiry (P7D). Otherwise suggest longer (P30D).
        String expiry;
        if (matchingAlerts > 0 && recentMatchingCount > (matchingAlerts / 2)) {
            expiry = "P7D";
        } else {
            expiry = "P30D";
        }

        // =====================================================================
        // Build and return the SuppressionPreviewResponse
        // =====================================================================

        String owner = SecurityUtils.getCurrentUserLogin().orElse("admin");

        log.debug("analyzeImpact complete: total={}, matching={}, reduction={}%, highImpact={}",
            totalAlerts, matchingAlerts, String.format("%.1f", projectedVolumeReduction), highImpactWarning);

        return new SuppressionPreviewResponse(
            conditions,
            matchingAlerts,
            projectedVolumeReduction,
            affectedTenants,
            affectedDataSources,
            falseNegativeRiskPrompts,
            highImpactWarning,
            expiry,
            owner,
            approvalPolicy,
            DEFAULT_ROLLBACK_INSTRUCTIONS
        );
    }

    // =========================================================================
    // Exception Preview
    // =========================================================================

    /**
     * Analyzes the impact of a proposed detection exception against historical alerts
     * generated by a specific rule.
     *
     * <p>Queries alerts filtered by the given rule ID in the last 30 days, applies
     * the proposed exception condition, and determines:
     * <ul>
     *   <li>How many historical alerts match the proposed exception</li>
     *   <li>The projected volume reduction for this rule</li>
     *   <li>Which MITRE ATT&CK techniques would be affected</li>
     *   <li>Overlap with existing exceptions</li>
     *   <li>Whether the exception qualifies as high-impact or requires approval</li>
     * </ul>
     *
     * <p>This method is <strong>read-only</strong> — it does not create, update, or
     * delete any stored data.
     *
     * @param ruleId     the detection rule ID for which the exception is proposed
     * @param conditions the proposed exception condition tuples (field/operator/value)
     * @return a read-only preview of the exception impact
     * @throws Exception if the OpenSearch query fails
     */
    public ExceptionPreviewResponse analyzeExceptionImpact(String ruleId,
                                                           List<ConditionTuple> conditions) throws Exception {
        String indexPattern = indexResolver.resolveAlertIndexPattern();
        log.debug("analyzeExceptionImpact: ruleId={}, conditions={}, index={}",
            ruleId, conditions.size(), indexPattern);

        // =====================================================================
        // Task 4.2 — Base query: filter by ruleId in last 30 days
        // =====================================================================

        Instant now = Instant.now();
        Instant lookbackStart = now.minus(Duration.ofDays(LOOKBACK_DAYS));
        Instant truePositiveThreshold = now.minus(Duration.ofDays(14));

        // Time range filter for the 30-day window
        Query timeRangeFilter = Query.of(q -> q.range(RangeQuery.of(r -> r
            .field("@timestamp")
            .gte(JsonData.of(lookbackStart.toString()))
            .lte(JsonData.of(now.toString())))));

        // Rule filter: match alerts generated by this specific detection rule
        Query ruleFilter = Query.of(q -> q.bool(b -> b
            .should(List.of(
                Query.of(sq -> sq.term(t -> t
                    .field("ruleId.keyword")
                    .value(v -> v.stringValue(ruleId)))),
                Query.of(sq -> sq.term(t -> t
                    .field("ruleName.keyword")
                    .value(v -> v.stringValue(ruleId))))
            ))
            .minimumShouldMatch("1")));

        // =====================================================================
        // Task 4.3 — Build condition query from proposed exception tuples
        // =====================================================================

        Query conditionQuery = buildConditionQuery(conditions);

        // Pre-build the true-positive filter query for use inside the lambda
        String tpThresholdStr = truePositiveThreshold.toString();
        Query truePositiveFilter = Query.of(tpq -> tpq.bool(tpb -> tpb
            .must(List.of(
                buildTruePositiveStatusFilter(),
                Query.of(sq -> sq.range(RangeQuery.of(rq -> rq
                    .field("@timestamp")
                    .gte(JsonData.of(tpThresholdStr)))))))));

        // =====================================================================
        // Task 4.4, 4.5, 4.6, 4.7 — Single query with nested aggregations
        // =====================================================================

        SearchRequest request = SearchRequest.of(r -> r
            .index(indexPattern)
            .query(Query.of(qr -> qr.bool(b -> b
                .filter(List.of(timeRangeFilter, ruleFilter)))))
            .size(0)
            .trackTotalHits(t -> t.enabled(true))

            // Filter aggregation: alerts matching the proposed exception condition
            .aggregations("matching", a -> a
                .filter(conditionQuery)

                // Task 4.5 — Terms agg on MITRE technique fields
                .aggregations("mitre_techniques", sub -> sub
                    .terms(t -> t.field("mitreTechniqueId.keyword").size(50))
                    .aggregations("technique_details", inner -> inner
                        .topHits(th -> th
                            .size(1)
                            .source(s -> s.filter(sf -> sf
                                .includes(List.of(
                                    "mitreTechniqueId",
                                    "mitreTechniqueName",
                                    "mitreTacticName")))))))

                // Task 4.6 — Check overlap with existing exceptions
                .aggregations("existing_exceptions", sub -> sub
                    .filter(f -> f.exists(e -> e.field("exceptionId")))
                    .aggregations("exception_ids", inner -> inner
                        .terms(t -> t.field("exceptionId.keyword").size(20))
                        .aggregations("exception_condition", innerSub -> innerSub
                            .topHits(th -> th
                                .size(1)
                                .source(s -> s.filter(sf -> sf
                                    .includes(List.of("exceptionId", "exceptionCondition"))))))))

                // Task 4.7 — Filter for confirmed true-positives in last 14 days
                .aggregations("true_positive_overlap", sub -> sub
                    .filter(truePositiveFilter)))
        );

        @SuppressWarnings("rawtypes")
        SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));

        // =====================================================================
        // Task 4.4 — Total alert count for this rule (denominator)
        // =====================================================================

        long totalAlerts = response.hits().total() != null
            ? response.hits().total().value() : 0;

        // =====================================================================
        // Task 4.4 — Matching alert count (numerator) & volume reduction
        // =====================================================================

        Aggregate matchingAgg = response.aggregations().get("matching");
        long matchingAlerts = 0;
        List<AffectedTechnique> affectedTechniques = new ArrayList<>();
        List<ExceptionOverlap> exceptionOverlaps = new ArrayList<>();
        long truePositiveCount = 0;

        if (matchingAgg != null && matchingAgg.isFilter()) {
            FilterAggregate matchingFilter = matchingAgg.filter();
            matchingAlerts = matchingFilter.docCount();

            // =================================================================
            // Task 4.5 — Extract affected MITRE techniques
            // =================================================================

            Aggregate mitreAgg = matchingFilter.aggregations().get("mitre_techniques");
            if (mitreAgg != null && mitreAgg.isSterms()) {
                for (StringTermsBucket bucket : mitreAgg.sterms().buckets().array()) {
                    String techniqueId = bucket.key();
                    String techniqueName = techniqueId;
                    String tacticName = "";

                    // Extract name and tactic from top_hits
                    Aggregate detailsAgg = bucket.aggregations().get("technique_details");
                    if (detailsAgg != null && detailsAgg.isTopHits()) {
                        var hits = detailsAgg.topHits().hits().hits();
                        if (!hits.isEmpty()) {
                            var source = hits.get(0).source();
                            if (source != null) {
                                @SuppressWarnings("unchecked")
                                Map<String, Object> sourceMap = (Map<String, Object>) source.to(Map.class);
                                if (sourceMap.get("mitreTechniqueName") != null) {
                                    techniqueName = sourceMap.get("mitreTechniqueName").toString();
                                }
                                if (sourceMap.get("mitreTacticName") != null) {
                                    tacticName = sourceMap.get("mitreTacticName").toString();
                                }
                            }
                        }
                    }

                    affectedTechniques.add(new AffectedTechnique(techniqueId, techniqueName, tacticName));
                }
            }

            // =================================================================
            // Task 4.6 — Check overlap with existing exceptions
            // =================================================================

            Aggregate existingExcAgg = matchingFilter.aggregations().get("existing_exceptions");
            if (existingExcAgg != null && existingExcAgg.isFilter()) {
                FilterAggregate excFilter = existingExcAgg.filter();

                Aggregate excIdsAgg = excFilter.aggregations().get("exception_ids");
                if (excIdsAgg != null && excIdsAgg.isSterms()) {
                    for (StringTermsBucket bucket : excIdsAgg.sterms().buckets().array()) {
                        String exceptionId = bucket.key();
                        String conditionStr = "";

                        // Extract the exception condition from top_hits
                        Aggregate condAgg = bucket.aggregations().get("exception_condition");
                        if (condAgg != null && condAgg.isTopHits()) {
                            var hits = condAgg.topHits().hits().hits();
                            if (!hits.isEmpty()) {
                                var source = hits.get(0).source();
                                if (source != null) {
                                    @SuppressWarnings("unchecked")
                                    Map<String, Object> sourceMap = (Map<String, Object>) source.to(Map.class);
                                    if (sourceMap.get("exceptionCondition") != null) {
                                        conditionStr = sourceMap.get("exceptionCondition").toString();
                                    }
                                }
                            }
                        }

                        // Calculate overlap percentage: docs matching both this exception
                        // and the proposed condition, relative to proposed condition matches
                        double overlapPercentage = 0.0;
                        if (matchingAlerts > 0) {
                            overlapPercentage = ((double) bucket.docCount() / (double) matchingAlerts) * 100.0;
                        }

                        exceptionOverlaps.add(new ExceptionOverlap(exceptionId, conditionStr, overlapPercentage));
                    }
                }
            }

            // =================================================================
            // Task 4.7 — True-positive overlap count
            // =================================================================

            Aggregate tpAgg = matchingFilter.aggregations().get("true_positive_overlap");
            if (tpAgg != null && tpAgg.isFilter()) {
                truePositiveCount = tpAgg.filter().docCount();
            }
        }

        // =====================================================================
        // Task 4.4 — Calculate projectedVolumeReduction
        // =====================================================================

        double projectedVolumeReduction = 0.0;
        if (totalAlerts > 0) {
            projectedVolumeReduction = ((double) matchingAlerts / (double) totalAlerts) * 100.0;
        }

        // =====================================================================
        // Task 4.7 — Generate falseNegativeRiskPrompts
        // =====================================================================

        List<String> falseNegativeRiskPrompts = new ArrayList<>();

        if (truePositiveCount > 0) {
            falseNegativeRiskPrompts.add("This condition triggered " + truePositiveCount
                + " confirmed true-positive alerts in the last 14 days");
        }

        // =====================================================================
        // Task 4.8 — Set highImpactWarning and approvalRequired
        // =====================================================================

        boolean highImpactWarning = projectedVolumeReduction > HIGH_IMPACT_THRESHOLD;
        boolean approvalRequired = highImpactWarning;

        // =====================================================================
        // Resolve rule name (use ruleId as fallback)
        // =====================================================================

        String ruleName = ruleId;

        log.debug("analyzeExceptionImpact complete: total={}, matching={}, reduction={}%, "
                + "techniques={}, overlaps={}, highImpact={}",
            totalAlerts, matchingAlerts, String.format("%.1f", projectedVolumeReduction),
            affectedTechniques.size(), exceptionOverlaps.size(), highImpactWarning);

        return new ExceptionPreviewResponse(
            conditions,
            ruleId,
            ruleName,
            matchingAlerts,
            projectedVolumeReduction,
            affectedTechniques,
            exceptionOverlaps,
            falseNegativeRiskPrompts,
            highImpactWarning,
            approvalRequired
        );
    }

    // =========================================================================
    // Private Helpers
    // =========================================================================

    /**
     * Builds an OpenSearch terms query matching alerts with a confirmed true-positive status.
     *
     * <p>Matches status values: "confirmed", "resolved", "true_positive".
     *
     * @return a terms query for true-positive statuses
     */
    private Query buildTruePositiveStatusFilter() {
        List<FieldValue> statusValues = List.of(
            FieldValue.of("confirmed"),
            FieldValue.of("resolved"),
            FieldValue.of("true_positive")
        );
        return Query.of(q -> q.terms(t -> t
            .field("status.keyword")
            .terms(tv -> tv.value(statusValues))));
    }

    /**
     * Builds an OpenSearch bool query from a list of condition tuples.
     *
     * <p>Translates each field/operator/value tuple into the appropriate OpenSearch
     * query clause. Supports: is, is_not, contains, starts_with, ends_with, gt, lt,
     * gte, lte, exists, not_exists.
     *
     * <p>Used by both {@link #analyzeImpact} and {@link #analyzeExceptionImpact}.
     *
     * @param conditions the condition tuples to translate
     * @return a bool query combining all conditions
     */
    private Query buildConditionQuery(List<ConditionTuple> conditions) {
        List<Query> mustClauses = new ArrayList<>();
        List<Query> mustNotClauses = new ArrayList<>();

        for (ConditionTuple condition : conditions) {
            String field = condition.field();
            String operator = condition.operator();
            String value = condition.value();

            switch (operator) {
                case "is" -> mustClauses.add(Query.of(q -> q.term(t -> t
                    .field(field + ".keyword")
                    .value(v -> v.stringValue(value)))));

                case "is_not" -> mustNotClauses.add(Query.of(q -> q.term(t -> t
                    .field(field + ".keyword")
                    .value(v -> v.stringValue(value)))));

                case "contains" -> mustClauses.add(Query.of(q -> q.wildcard(w -> w
                    .field(field + ".keyword")
                    .value("*" + value + "*"))));

                case "starts_with" -> mustClauses.add(Query.of(q -> q.prefix(p -> p
                    .field(field + ".keyword")
                    .value(value))));

                case "ends_with" -> mustClauses.add(Query.of(q -> q.wildcard(w -> w
                    .field(field + ".keyword")
                    .value("*" + value))));

                case "gt" -> mustClauses.add(Query.of(q -> q.range(RangeQuery.of(r -> r
                    .field(field)
                    .gt(JsonData.of(value))))));

                case "lt" -> mustClauses.add(Query.of(q -> q.range(RangeQuery.of(r -> r
                    .field(field)
                    .lt(JsonData.of(value))))));

                case "gte" -> mustClauses.add(Query.of(q -> q.range(RangeQuery.of(r -> r
                    .field(field)
                    .gte(JsonData.of(value))))));

                case "lte" -> mustClauses.add(Query.of(q -> q.range(RangeQuery.of(r -> r
                    .field(field)
                    .lte(JsonData.of(value))))));

                case "exists" -> mustClauses.add(Query.of(q -> q.exists(e -> e
                    .field(field))));

                case "not_exists" -> mustNotClauses.add(Query.of(q -> q.exists(e -> e
                    .field(field))));

                default -> log.warn("Unknown operator '{}' in condition for field '{}'", operator, field);
            }
        }

        return Query.of(q -> q.bool(b -> {
            if (!mustClauses.isEmpty()) {
                b.must(mustClauses);
            }
            if (!mustNotClauses.isEmpty()) {
                b.mustNot(mustNotClauses);
            }
            return b;
        }));
    }
}
