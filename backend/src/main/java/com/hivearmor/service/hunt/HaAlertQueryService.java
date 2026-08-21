package com.hivearmor.service.hunt;

import org.opensearch.client.json.JsonData;
import org.opensearch.client.opensearch._types.query_dsl.*;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * Service responsible for alert queue filter validation, parsing, and
 * OpenSearch query construction.
 *
 * <p>Implements the filter allowlist, symbolic-to-numeric mappings, and
 * the KQL-like {@code q} parameter parsing. All queries use the OpenSearch
 * query builder API — values are never interpolated into query strings.
 */
@Service
public class HaAlertQueryService {

    // =========================================================================
    // Filter Allowlist
    // =========================================================================

    /** The complete set of permitted filter parameter names. */
    private static final Set<String> ALLOWED_FILTER_PARAMS = Set.of(
        "severity", "status", "assignee", "tenantId", "category",
        "riskMin", "sla", "threatIntel", "tags", "q", "from", "to"
    );

    /**
     * Non-filter query parameters that are always allowed (pagination, sort, projection, etc.).
     */
    private static final Set<String> ALLOWED_NON_FILTER_PARAMS = Set.of(
        "cursor", "limit", "sort", "fields", "page", "size", "order"
    );

    // =========================================================================
    // Status Mapping
    // =========================================================================

    /** Maps symbolic status names to their numeric codes in OpenSearch. */
    private static final Map<String, Integer> STATUS_CODE_MAP;
    static {
        Map<String, Integer> m = new LinkedHashMap<>();
        m.put("automatic_review", 1);
        m.put("open", 2);
        m.put("in_review", 3);
        m.put("ignored", 4);
        m.put("completed", 5);
        m.put("closed", 5);
        m.put("true_positive", 6);
        m.put("false_positive", 7);
        STATUS_CODE_MAP = Collections.unmodifiableMap(m);
    }

    /** Valid severity levels for validation. */
    private static final Set<String> VALID_SEVERITY_LEVELS = Set.of(
        "critical", "high", "medium", "low"
    );

    /** Valid SLA filter values. */
    private static final Set<String> VALID_SLA_VALUES = Set.of(
        "at_risk", "breached"
    );

    /** Valid threatIntel filter values. */
    private static final Set<String> VALID_THREAT_INTEL_VALUES = Set.of(
        "matched"
    );

    // =========================================================================
    // Public API
    // =========================================================================

    /**
     * Validates that all query parameter names in the request are in the allowlist.
     *
     * @param paramNames the set of parameter names from the HTTP request
     * @throws InvalidFilterException if any unknown parameter is found
     */
    public void validateFilterAllowlist(Set<String> paramNames) {
        for (String name : paramNames) {
            if (!ALLOWED_FILTER_PARAMS.contains(name) && !ALLOWED_NON_FILTER_PARAMS.contains(name)) {
                throw new InvalidFilterException(
                    "Unknown filter parameter: '" + name + "'. Allowed filters: " + ALLOWED_FILTER_PARAMS);
            }
        }
    }

    /**
     * Builds the complete list of OpenSearch filter queries from the provided
     * filter parameters. All values are validated before query construction.
     *
     * @return list of OpenSearch Query objects to be used in a bool filter clause
     * @throws InvalidFilterException if any filter value is invalid
     */
    public List<Query> buildFilters(String severity, String status, String from, String to,
                                    String category, String assignee, String tags,
                                    String riskMin, String sla, String threatIntel,
                                    String tenantId) {
        List<Query> filters = new ArrayList<>();

        // Time range filter
        if (from != null || to != null) {
            RangeQuery.Builder rng = new RangeQuery.Builder().field("@timestamp");
            if (from != null) rng.gte(JsonData.of(from));
            if (to != null) rng.lte(JsonData.of(to));
            filters.add(Query.of(qb -> qb.range(rng.build())));
        }

        // Severity filter (supports comma-separated levels)
        if (severity != null && !severity.isBlank()) {
            filters.addAll(buildSeverityFilter(severity));
        }

        // Status filter (symbolic names mapped to numeric codes)
        if (status != null && !status.isBlank()) {
            filters.add(buildStatusFilter(status));
        }

        // Category filter
        if (category != null && !category.isBlank()) {
            filters.add(Query.of(qb -> qb.term(t -> t.field("category").value(v -> v.stringValue(category)))));
        }

        // Assignee filter
        if (assignee != null && !assignee.isBlank()) {
            filters.add(buildAssigneeFilter(assignee));
        }

        // Tags filter (comma-separated, all must match)
        if (tags != null && !tags.isBlank()) {
            String[] tagArr = tags.split(",");
            for (String tag : tagArr) {
                String trimmed = tag.trim();
                if (!trimmed.isEmpty()) {
                    filters.add(Query.of(qb -> qb.term(
                        t -> t.field("tags").value(v -> v.stringValue(trimmed)))));
                }
            }
        }

        // riskMin filter — minimum risk score threshold
        if (riskMin != null && !riskMin.isBlank()) {
            filters.add(buildRiskMinFilter(riskMin));
        }

        // SLA filter
        if (sla != null && !sla.isBlank()) {
            filters.add(buildSlaFilter(sla));
        }

        // Threat Intel filter
        if (threatIntel != null && !threatIntel.isBlank()) {
            filters.add(buildThreatIntelFilter(threatIntel));
        }

        // Tenant ID filter (optional, for cross-tenant views)
        if (tenantId != null && !tenantId.isBlank()) {
            filters.add(Query.of(qb -> qb.term(
                t -> t.field("tenantId").value(v -> v.stringValue(tenantId)))));
        }

        return filters;
    }

    /**
     * Parses the {@code q} parameter using the KQL-like grammar and returns
     * an OpenSearch query. Validates max length and grammar correctness.
     *
     * @param q the raw query string from the request
     * @return an OpenSearch Query object, or a match-all query if {@code q} is blank
     * @throws HaAlertKqlParser.KqlParseException if the query cannot be parsed
     */
    public Query parseQueryParam(String q) {
        if (q == null || q.isBlank()) {
            return Query.of(qb -> qb.matchAll(m -> m));
        }

        // The parser validates max length internally
        HaAlertKqlParser parser = new HaAlertKqlParser(q.trim());
        HaAlertKqlParser.KqlNode ast = parser.parse();
        String queryString = HaAlertKqlParser.toQueryString(ast);

        return Query.of(qb -> qb.queryString(qs -> qs
            .query(queryString)
            .defaultField("*")
            .lenient(true)
            .analyzeWildcard(true)
        ));
    }

    // =========================================================================
    // Severity Filter
    // =========================================================================

    /**
     * Builds severity filter supporting comma-separated levels.
     * Each level maps to a numeric range:
     * <ul>
     *   <li>critical: severity ≥ 9</li>
     *   <li>high: severity 7–8</li>
     *   <li>medium: severity 4–6</li>
     *   <li>low: severity 1–3</li>
     * </ul>
     */
    private List<Query> buildSeverityFilter(String severity) {
        String[] levels = severity.split(",");
        List<Query> rangeQueries = new ArrayList<>();

        for (String level : levels) {
            String trimmed = level.trim().toLowerCase();
            if (trimmed.isEmpty()) continue;

            if (!VALID_SEVERITY_LEVELS.contains(trimmed)) {
                throw new InvalidFilterException(
                    "Invalid severity value: '" + trimmed + "'. Allowed: " + VALID_SEVERITY_LEVELS);
            }

            switch (trimmed) {
                case "critical":
                    rangeQueries.add(Query.of(qb -> qb.range(RangeQuery.of(r ->
                        r.field("severity").gte(JsonData.of(9))))));
                    break;
                case "high":
                    rangeQueries.add(Query.of(qb -> qb.range(RangeQuery.of(r ->
                        r.field("severity").gte(JsonData.of(7)).lt(JsonData.of(9))))));
                    break;
                case "medium":
                    rangeQueries.add(Query.of(qb -> qb.range(RangeQuery.of(r ->
                        r.field("severity").gte(JsonData.of(4)).lt(JsonData.of(7))))));
                    break;
                case "low":
                    rangeQueries.add(Query.of(qb -> qb.range(RangeQuery.of(r ->
                        r.field("severity").gte(JsonData.of(1)).lt(JsonData.of(4))))));
                    break;
                default:
                    // Already validated above, this branch is unreachable
                    break;
            }
        }

        if (rangeQueries.isEmpty()) {
            throw new InvalidFilterException(
                "Invalid severity value: '" + severity + "'. Allowed: " + VALID_SEVERITY_LEVELS);
        }

        // If multiple levels, combine with OR (bool should)
        if (rangeQueries.size() == 1) {
            return rangeQueries;
        }

        // Multiple severity levels: wrap in a bool should (OR semantics)
        Query combinedSeverity = Query.of(qb -> qb.bool(b -> b
            .should(rangeQueries)
            .minimumShouldMatch("1")
        ));
        return List.of(combinedSeverity);
    }

    // =========================================================================
    // Status Filter
    // =========================================================================

    /**
     * Builds a status filter. Supports:
     * <ul>
     *   <li>"active" → status is open or in review</li>
     *   <li>"automatic_review" → status = 1</li>
     *   <li>"open" → status = 2</li>
     *   <li>"in_review" → status = 3</li>
     *   <li>"ignored" → legacy status = 4</li>
     *   <li>"closed" → status = 5</li>
     *   <li>"true_positive" → status = 6</li>
     *   <li>"false_positive" → status = 7</li>
     *   <li>Numeric value → exact match</li>
     * </ul>
     */
    private Query buildStatusFilter(String status) {
        String trimmed = status.trim().toLowerCase();

        // The analyst queue only treats Open and In review as active work.
        // Automatic-review and legacy ignored records remain available through
        // explicit filters but must not inflate human triage workload.
        if ("active".equals(trimmed)) {
            return Query.of(qb -> qb.bool(b -> b
                .should(Query.of(q -> q.term(t -> t.field("status").value(v -> v.longValue(2)))))
                .should(Query.of(q -> q.term(t -> t.field("status").value(v -> v.longValue(3)))))
                .minimumShouldMatch("1")));
        }

        // Check symbolic mapping
        Integer code = STATUS_CODE_MAP.get(trimmed);
        if (code != null) {
            return Query.of(qb -> qb.term(t -> t.field("status").value(v -> v.longValue(code))));
        }

        // Try numeric value (backward compatibility)
        try {
            long numericStatus = Long.parseLong(trimmed);
            return Query.of(qb -> qb.term(t -> t.field("status").value(v -> v.longValue(numericStatus))));
        } catch (NumberFormatException e) {
            throw new InvalidFilterException(
                "Invalid status value: '" + status + "'. Allowed: active, automatic_review, open, " +
                "in_review, ignored, completed, true_positive, false_positive, closed, or numeric code");
        }
    }

    // =========================================================================
    // Assignee Filter
    // =========================================================================

    /**
     * Builds an assignee filter:
     * <ul>
     *   <li>"unassigned" → assigneeId field does not exist</li>
     *   <li>"me" → assigneeId equals current authenticated user</li>
     *   <li>Any other value → assigneeId exact match</li>
     * </ul>
     */
    private Query buildAssigneeFilter(String assignee) {
        String trimmed = assignee.trim();

        if ("unassigned".equalsIgnoreCase(trimmed)) {
            return Query.of(qb -> qb.bool(b -> b.mustNot(
                Query.of(mn -> mn.exists(e -> e.field("assigneeId"))))));
        }

        if ("me".equalsIgnoreCase(trimmed)) {
            String currentUser = currentPrincipal();
            if (currentUser == null || currentUser.isBlank()) {
                throw new InvalidFilterException(
                    "Cannot resolve 'me' — no authenticated user in context");
            }
            return Query.of(qb -> qb.term(
                t -> t.field("assigneeId").value(v -> v.stringValue(currentUser))));
        }

        // Specific user ID
        return Query.of(qb -> qb.term(
            t -> t.field("assigneeId").value(v -> v.stringValue(trimmed))));
    }

    // =========================================================================
    // RiskMin Filter
    // =========================================================================

    /**
     * Builds a minimum risk score filter (range query: riskScore ≥ value).
     */
    private Query buildRiskMinFilter(String riskMin) {
        try {
            double minScore = Double.parseDouble(riskMin.trim());
            if (minScore < 0 || minScore > 100) {
                throw new InvalidFilterException(
                    "Invalid riskMin value: '" + riskMin + "'. Must be between 0 and 100");
            }
            return Query.of(qb -> qb.range(RangeQuery.of(r ->
                r.field("riskScore").gte(JsonData.of(minScore)))));
        } catch (NumberFormatException e) {
            throw new InvalidFilterException(
                "Invalid riskMin value: '" + riskMin + "'. Must be a numeric value");
        }
    }

    // =========================================================================
    // SLA Filter
    // =========================================================================

    /**
     * Builds an SLA filter:
     * <ul>
     *   <li>"at_risk" → slaDueAt is within 1 hour from now (and not yet breached)</li>
     *   <li>"breached" → slaDueAt is in the past</li>
     * </ul>
     */
    private Query buildSlaFilter(String sla) {
        String trimmed = sla.trim().toLowerCase();
        if (!VALID_SLA_VALUES.contains(trimmed)) {
            throw new InvalidFilterException(
                "Invalid sla value: '" + sla + "'. Allowed: " + VALID_SLA_VALUES);
        }

        Instant now = Instant.now();

        if ("at_risk".equals(trimmed)) {
            // SLA deadline is within 1 hour from now (not yet breached)
            String nowStr = now.toString();
            String oneHourLater = now.plus(1, ChronoUnit.HOURS).toString();
            return Query.of(qb -> qb.range(RangeQuery.of(r ->
                r.field("slaDueAt").gte(JsonData.of(nowStr)).lte(JsonData.of(oneHourLater)))));
        }

        if ("breached".equals(trimmed)) {
            // SLA deadline is in the past
            String nowStr = now.toString();
            return Query.of(qb -> qb.range(RangeQuery.of(r ->
                r.field("slaDueAt").lt(JsonData.of(nowStr)))));
        }

        // Unreachable due to validation above
        throw new InvalidFilterException("Invalid sla value: '" + sla + "'");
    }

    // =========================================================================
    // Threat Intel Filter
    // =========================================================================

    /**
     * Builds a threat intelligence filter:
     * <ul>
     *   <li>"matched" → threatIntelMatched = true</li>
     * </ul>
     */
    private Query buildThreatIntelFilter(String threatIntel) {
        String trimmed = threatIntel.trim().toLowerCase();
        if (!VALID_THREAT_INTEL_VALUES.contains(trimmed)) {
            throw new InvalidFilterException(
                "Invalid threatIntel value: '" + threatIntel + "'. Allowed: " + VALID_THREAT_INTEL_VALUES);
        }

        if ("matched".equals(trimmed)) {
            return Query.of(qb -> qb.term(
                t -> t.field("threatIntelMatched").value(v -> v.booleanValue(true))));
        }

        // Unreachable
        throw new InvalidFilterException("Invalid threatIntel value: '" + threatIntel + "'");
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private String currentPrincipal() {
        try {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            return auth != null ? auth.getName() : null;
        } catch (Exception e) {
            return null;
        }
    }

    // =========================================================================
    // Exception
    // =========================================================================

    /**
     * Thrown when a filter parameter name or value is invalid.
     */
    public static class InvalidFilterException extends RuntimeException {
        public InvalidFilterException(String message) {
            super(message);
        }
    }
}
