package com.hivearmor.service.detection;

import com.hivearmor.domain.DetectionRule;
import com.hivearmor.domain.RuleExecution;
import com.hivearmor.repository.DetectionRuleRepository;
import com.hivearmor.repository.RuleExecutionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Service for the detection rule inventory endpoint (DET-008).
 *
 * <p>Provides paginated rule listing with computed health metrics, facets,
 * summary counts, free-text search, and cursor-based pagination.
 *
 * <p>Sprint 47 — Detection Rules.
 */
@Service
public class DetectionRuleInventoryService {

    private static final Logger log = LoggerFactory.getLogger(DetectionRuleInventoryService.class);
    private static final String CLASSNAME = "DetectionRuleInventoryService";

    /** Default page size. */
    private static final int DEFAULT_LIMIT = 100;

    /** Maximum page size. */
    private static final int MAX_LIMIT = 200;

    private final DetectionRuleRepository ruleRepository;
    private final RuleExecutionRepository executionRepository;

    public DetectionRuleInventoryService(DetectionRuleRepository ruleRepository,
                                         RuleExecutionRepository executionRepository) {
        this.ruleRepository = ruleRepository;
        this.executionRepository = executionRepository;
    }

    /**
     * Lists detection rules with filters, health computation, summary, and facets.
     *
     * @param scope    scope filter (managed/custom), null for all
     * @param status   status filter (active/disabled/draft/review/error), null for all
     * @param severity severity filter, null for all
     * @param tactics  MITRE tactics filter (comma-separated), null for all
     * @param q        free-text search query, null for no search
     * @param sort     sort field (name_asc, last_run_desc, alerts_desc, health_desc, created_desc)
     * @param cursor   Base64 encoded pagination cursor, null for first page
     * @param limit    page size
     * @param tenantId tenant ID for scoping
     * @return map containing items, cursor, total, summary, and facets
     */
    public Map<String, Object> listRules(String scope, String status, String severity,
                                          String tactics, String q, String sort,
                                          String cursor, Integer limit, Long tenantId) {
        int effectiveLimit = resolveLimit(limit);
        int offset = decodeCursor(cursor);

        // Fetch all rules for this tenant (we filter in-memory for flexibility)
        List<DetectionRule> allRules = fetchAllRulesForTenant(tenantId);

        // Apply filters
        List<DetectionRule> filtered = applyFilters(allRules, scope, status, severity, tactics, q);

        // Compute health for filtered rules
        Map<String, Map<String, Object>> healthMap = computeHealthForRules(filtered);

        // Sort
        filtered = applySort(filtered, sort, healthMap);

        // Compute total before pagination
        int total = filtered.size();

        // Apply pagination
        int endIndex = Math.min(offset + effectiveLimit, filtered.size());
        List<DetectionRule> page = offset < filtered.size()
            ? filtered.subList(offset, endIndex)
            : Collections.emptyList();

        // Build items with health
        List<Map<String, Object>> items = page.stream()
            .map(rule -> buildRulePreview(rule, healthMap.get(rule.getId())))
            .collect(Collectors.toList());

        // Build cursor for next page
        String nextCursor = endIndex < total ? encodeCursor(endIndex) : null;

        // Compute summary from all filtered rules
        Map<String, Object> summary = computeSummary(allRules, healthMap);

        // Compute facets from all rules for this tenant
        Map<String, Object> facets = computeFacets(allRules, healthMap);

        // Assemble response
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("items", items);
        response.put("cursor", nextCursor);
        response.put("total", total);
        response.put("summary", summary);
        response.put("facets", facets);

        return response;
    }

    // =========================================================================
    // Internal: Fetch rules
    // =========================================================================

    private List<DetectionRule> fetchAllRulesForTenant(Long tenantId) {
        if (tenantId == null || tenantId == 0L) {
            // Admin / non-MSSP: fetch all rules
            return ruleRepository.findAll();
        }
        return ruleRepository.findByTenantId(tenantId, Pageable.unpaged()).getContent();
    }

    // =========================================================================
    // Internal: Filtering
    // =========================================================================

    private List<DetectionRule> applyFilters(List<DetectionRule> rules, String scope,
                                             String status, String severity,
                                             String tactics, String q) {
        return rules.stream()
            .filter(rule -> scope == null || scope.isBlank() || rule.getScope().equalsIgnoreCase(scope))
            .filter(rule -> status == null || status.isBlank() || rule.getStatus().equalsIgnoreCase(status))
            .filter(rule -> severity == null || severity.isBlank() || rule.getSeverity().equalsIgnoreCase(severity))
            .filter(rule -> matchesTactics(rule, tactics))
            .filter(rule -> matchesSearch(rule, q))
            .collect(Collectors.toList());
    }

    private boolean matchesTactics(DetectionRule rule, String tactics) {
        if (tactics == null || tactics.isBlank()) return true;
        if (rule.getMitreTactics() == null) return false;

        Set<String> requested = Arrays.stream(tactics.split(","))
            .map(String::trim)
            .map(String::toUpperCase)
            .collect(Collectors.toSet());

        String ruleTactics = rule.getMitreTactics().toUpperCase();
        return requested.stream().anyMatch(ruleTactics::contains);
    }

    /**
     * Free-text search (q): LIKE on name, description, mitre_techniques.
     */
    private boolean matchesSearch(DetectionRule rule, String q) {
        if (q == null || q.isBlank()) return true;
        String query = q.toLowerCase();

        if (rule.getName() != null && rule.getName().toLowerCase().contains(query)) return true;
        if (rule.getDescription() != null && rule.getDescription().toLowerCase().contains(query)) return true;
        if (rule.getMitreTechniques() != null && rule.getMitreTechniques().toLowerCase().contains(query)) return true;

        return false;
    }

    // =========================================================================
    // Internal: Health computation
    // =========================================================================

    /**
     * Health computation: fetch last 10 executions per rule, calculate errorRate,
     * avgDuration, determine health status (healthy/degraded/critical).
     */
    private Map<String, Map<String, Object>> computeHealthForRules(List<DetectionRule> rules) {
        Map<String, Map<String, Object>> healthMap = new HashMap<>();
        for (DetectionRule rule : rules) {
            healthMap.put(rule.getId(), computeHealth(rule));
        }
        return healthMap;
    }

    private Map<String, Object> computeHealth(DetectionRule rule) {
        Map<String, Object> health = new LinkedHashMap<>();

        List<RuleExecution> recentExecutions = executionRepository.findTop10ByRuleIdOrderByStartedAtDesc(rule.getId());

        if (recentExecutions.isEmpty()) {
            health.put("status", "disabled".equals(rule.getStatus()) ? "disabled" : "healthy");
            health.put("lastRun", null);
            health.put("avgDuration", 0L);
            health.put("errorRate", 0.0);
            health.put("alertsGenerated7d", 0);
            return health;
        }

        // Last run
        RuleExecution lastExecution = recentExecutions.get(0);
        health.put("lastRun", lastExecution.getStartedAt() != null
            ? lastExecution.getStartedAt().toString() : null);

        // Average duration
        long avgDuration = recentExecutions.stream()
            .filter(e -> e.getDuration() != null)
            .mapToLong(RuleExecution::getDuration)
            .average()
            .stream().mapToLong(d -> (long) d)
            .findFirst().orElse(0L);
        health.put("avgDuration", avgDuration);

        // Error rate
        long failedCount = recentExecutions.stream()
            .filter(e -> "failed".equals(e.getStatus()) || "timeout".equals(e.getStatus()))
            .count();
        double errorRate = (double) failedCount / recentExecutions.size();
        health.put("errorRate", Math.round(errorRate * 100.0) / 100.0);

        // Health status determination
        String healthStatus;
        if ("disabled".equals(rule.getStatus())) {
            healthStatus = "disabled";
        } else if (errorRate > 0.20) {
            healthStatus = "critical";
        } else if (errorRate >= 0.05) {
            healthStatus = "degraded";
        } else {
            healthStatus = "healthy";
        }
        health.put("status", healthStatus);

        // Alerts generated in last 7 days
        Instant sevenDaysAgo = Instant.now().minus(7, ChronoUnit.DAYS);
        List<RuleExecution> recentWeek = executionRepository.findByRuleIdAndStartedAtBetween(
            rule.getId(), sevenDaysAgo, Instant.now());
        int alertsGenerated7d = recentWeek.stream()
            .filter(e -> e.getAlertsGenerated() != null)
            .mapToInt(RuleExecution::getAlertsGenerated)
            .sum();
        health.put("alertsGenerated7d", alertsGenerated7d);

        return health;
    }

    // =========================================================================
    // Internal: Sorting
    // =========================================================================

    /**
     * Sort: name_asc (name), last_run_desc (lastExecution.startedAt),
     * alerts_desc (health.alertsGenerated7d), health_desc (health.status priority),
     * created_desc (createdAt).
     */
    private List<DetectionRule> applySort(List<DetectionRule> rules, String sort,
                                          Map<String, Map<String, Object>> healthMap) {
        if (sort == null || sort.isBlank()) {
            sort = "created_desc";
        }

        List<DetectionRule> sorted = new ArrayList<>(rules);

        switch (sort) {
            case "name_asc":
                sorted.sort(Comparator.comparing(
                    r -> r.getName() != null ? r.getName().toLowerCase() : "",
                    Comparator.naturalOrder()));
                break;
            case "last_run_desc":
                sorted.sort((a, b) -> {
                    Object lastRunA = healthMap.getOrDefault(a.getId(), Map.of()).get("lastRun");
                    Object lastRunB = healthMap.getOrDefault(b.getId(), Map.of()).get("lastRun");
                    return compareNullsLast(lastRunB, lastRunA);
                });
                break;
            case "alerts_desc":
                sorted.sort((a, b) -> {
                    int alertsA = getIntFromHealth(healthMap, a.getId(), "alertsGenerated7d");
                    int alertsB = getIntFromHealth(healthMap, b.getId(), "alertsGenerated7d");
                    return Integer.compare(alertsB, alertsA);
                });
                break;
            case "health_desc":
                sorted.sort((a, b) -> {
                    int priorityA = healthPriority(getStringFromHealth(healthMap, a.getId(), "status"));
                    int priorityB = healthPriority(getStringFromHealth(healthMap, b.getId(), "status"));
                    return Integer.compare(priorityB, priorityA);
                });
                break;
            case "created_desc":
            default:
                sorted.sort((a, b) -> {
                    Instant ca = a.getCreatedAt();
                    Instant cb = b.getCreatedAt();
                    if (cb == null && ca == null) return 0;
                    if (cb == null) return -1;
                    if (ca == null) return 1;
                    return cb.compareTo(ca);
                });
                break;
        }

        return sorted;
    }

    private int healthPriority(String status) {
        if (status == null) return 0;
        switch (status) {
            case "critical": return 3;
            case "degraded": return 2;
            case "healthy": return 1;
            case "disabled": return 0;
            default: return 0;
        }
    }

    private int getIntFromHealth(Map<String, Map<String, Object>> healthMap, String ruleId, String key) {
        Map<String, Object> h = healthMap.get(ruleId);
        if (h == null) return 0;
        Object val = h.get(key);
        if (val instanceof Number) return ((Number) val).intValue();
        return 0;
    }

    private String getStringFromHealth(Map<String, Map<String, Object>> healthMap, String ruleId, String key) {
        Map<String, Object> h = healthMap.get(ruleId);
        if (h == null) return null;
        Object val = h.get(key);
        return val != null ? val.toString() : null;
    }

    @SuppressWarnings("unchecked")
    private int compareNullsLast(Object a, Object b) {
        if (a == null && b == null) return 0;
        if (a == null) return 1;
        if (b == null) return -1;
        return ((Comparable<Object>) a).compareTo(b);
    }

    // =========================================================================
    // Internal: Cursor pagination
    // =========================================================================

    /**
     * Cursor: Base64 encoded offset-based pagination.
     */
    private int decodeCursor(String cursor) {
        if (cursor == null || cursor.isBlank()) return 0;
        try {
            String decoded = new String(Base64.getDecoder().decode(cursor), StandardCharsets.UTF_8);
            return Integer.parseInt(decoded);
        } catch (Exception e) {
            log.warn("{}.decodeCursor: invalid cursor '{}', defaulting to 0", CLASSNAME, cursor);
            return 0;
        }
    }

    private String encodeCursor(int offset) {
        return Base64.getEncoder().encodeToString(
            String.valueOf(offset).getBytes(StandardCharsets.UTF_8));
    }

    private int resolveLimit(Integer limit) {
        if (limit == null) return DEFAULT_LIMIT;
        if (limit < 1) return DEFAULT_LIMIT;
        return Math.min(limit, MAX_LIMIT);
    }

    // =========================================================================
    // Internal: Summary
    // =========================================================================

    /**
     * Summary: count queries for total, active, disabled, erroring, managed, custom;
     * calculate avgHealthScore.
     */
    private Map<String, Object> computeSummary(List<DetectionRule> allRules,
                                               Map<String, Map<String, Object>> healthMap) {
        Map<String, Object> summary = new LinkedHashMap<>();

        summary.put("total", allRules.size());
        summary.put("active", allRules.stream().filter(r -> "active".equals(r.getStatus())).count());
        summary.put("disabled", allRules.stream().filter(r -> "disabled".equals(r.getStatus())).count());

        // "erroring" = rules whose health status is critical
        long erroring = allRules.stream()
            .filter(r -> {
                Map<String, Object> h = healthMap.get(r.getId());
                return h != null && "critical".equals(h.get("status"));
            })
            .count();
        summary.put("erroring", erroring);

        summary.put("managed", allRules.stream().filter(r -> "managed".equals(r.getScope())).count());
        summary.put("custom", allRules.stream().filter(r -> "custom".equals(r.getScope())).count());

        // Average health score: healthy=1.0, degraded=0.5, critical=0.0, disabled=excluded
        double totalScore = 0.0;
        long scoredCount = 0;
        for (DetectionRule rule : allRules) {
            Map<String, Object> h = healthMap.get(rule.getId());
            if (h == null) continue;
            String hs = (String) h.get("status");
            if ("disabled".equals(hs)) continue;
            scoredCount++;
            switch (hs) {
                case "healthy": totalScore += 1.0; break;
                case "degraded": totalScore += 0.5; break;
                case "critical": totalScore += 0.0; break;
                default: totalScore += 1.0; break;
            }
        }
        double avgHealthScore = scoredCount > 0 ? Math.round((totalScore / scoredCount) * 100.0) / 100.0 : 0.0;
        summary.put("avgHealthScore", avgHealthScore);

        return summary;
    }

    // =========================================================================
    // Internal: Facets
    // =========================================================================

    /**
     * Facets: group-by queries on scope, status, severity, mitre_tactics, health_status.
     */
    private Map<String, Object> computeFacets(List<DetectionRule> allRules,
                                              Map<String, Map<String, Object>> healthMap) {
        Map<String, Object> facets = new LinkedHashMap<>();

        // By scope
        Map<String, Long> byScope = allRules.stream()
            .collect(Collectors.groupingBy(DetectionRule::getScope, Collectors.counting()));
        facets.put("byScope", byScope);

        // By status
        Map<String, Long> byStatus = allRules.stream()
            .collect(Collectors.groupingBy(DetectionRule::getStatus, Collectors.counting()));
        facets.put("byStatus", byStatus);

        // By severity
        Map<String, Long> bySeverity = allRules.stream()
            .collect(Collectors.groupingBy(DetectionRule::getSeverity, Collectors.counting()));
        facets.put("bySeverity", bySeverity);

        // By tactic
        Map<String, Long> byTactic = new LinkedHashMap<>();
        for (DetectionRule rule : allRules) {
            if (rule.getMitreTactics() != null && !rule.getMitreTactics().isBlank()) {
                String[] tactics = rule.getMitreTactics().split(",");
                for (String tactic : tactics) {
                    String t = tactic.trim();
                    if (!t.isEmpty()) {
                        byTactic.merge(t, 1L, Long::sum);
                    }
                }
            }
        }
        facets.put("byTactic", byTactic);

        // By health status
        Map<String, Long> byHealth = new LinkedHashMap<>();
        for (DetectionRule rule : allRules) {
            Map<String, Object> h = healthMap.get(rule.getId());
            String hs = h != null ? (String) h.get("status") : "healthy";
            byHealth.merge(hs, 1L, Long::sum);
        }
        facets.put("byHealth", byHealth);

        return facets;
    }

    // =========================================================================
    // Internal: Build rule preview
    // =========================================================================

    private Map<String, Object> buildRulePreview(DetectionRule rule, Map<String, Object> health) {
        Map<String, Object> preview = new LinkedHashMap<>();
        preview.put("id", rule.getId());
        preview.put("name", rule.getName());
        preview.put("description", rule.getDescription());
        preview.put("scope", rule.getScope());
        preview.put("status", rule.getStatus());
        preview.put("severity", rule.getSeverity());
        preview.put("mitreTactics", parseCsv(rule.getMitreTactics()));
        preview.put("mitreTechniques", parseCsv(rule.getMitreTechniques()));

        // Last execution
        Map<String, Object> lastExecution = buildLastExecution(rule.getId());
        preview.put("lastExecution", lastExecution);

        // Health
        preview.put("health", health);

        preview.put("schedule", rule.getSchedule());
        preview.put("tags", parseCsv(rule.getTags()));
        preview.put("author", rule.getAuthor());
        preview.put("createdAt", rule.getCreatedAt() != null ? rule.getCreatedAt().toString() : null);
        preview.put("updatedAt", rule.getUpdatedAt() != null ? rule.getUpdatedAt().toString() : null);
        preview.put("version", rule.getVersion());

        return preview;
    }

    private Map<String, Object> buildLastExecution(String ruleId) {
        List<RuleExecution> recent = executionRepository.findTop10ByRuleIdOrderByStartedAtDesc(ruleId);
        if (recent.isEmpty()) return null;

        RuleExecution last = recent.get(0);
        Map<String, Object> exec = new LinkedHashMap<>();
        exec.put("timestamp", last.getStartedAt() != null ? last.getStartedAt().toString() : null);
        exec.put("duration", last.getDuration());
        exec.put("alertsGenerated", last.getAlertsGenerated());
        return exec;
    }

    private List<String> parseCsv(String csv) {
        if (csv == null || csv.isBlank()) return Collections.emptyList();
        return Arrays.stream(csv.split(","))
            .map(String::trim)
            .filter(s -> !s.isEmpty())
            .collect(Collectors.toList());
    }
}
