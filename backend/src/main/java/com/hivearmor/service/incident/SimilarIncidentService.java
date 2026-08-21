package com.hivearmor.service.incident;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import org.opensearch.client.opensearch._types.SortOrder;
import org.opensearch.client.opensearch._types.query_dsl.BoolQuery;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.search.Hit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Service for discovering similar incidents using multi-signal scoring.
 *
 * <p>Implements INC-003: Similar incident discovery within the incident workbench.
 * Scores candidates using four weighted signals:
 * <ul>
 *   <li>shared_entity (0.4): count shared entities / max(source, candidate)</li>
 *   <li>same_rule (0.3): binary match on detection rule ID</li>
 *   <li>shared_indicator (0.2): count shared IOCs / total IOCs</li>
 *   <li>semantic_summary (0.1): OpenSearch more_like_this on title</li>
 * </ul>
 *
 * <p>Sprint 43 — Incident Workbench.
 */
@Service
public class SimilarIncidentService {

    private static final Logger log = LoggerFactory.getLogger(SimilarIncidentService.class);
    private static final String CLASSNAME = "SimilarIncidentService";

    /** Scoring signal weights. */
    private static final double WEIGHT_SHARED_ENTITY = 0.4;
    private static final double WEIGHT_SAME_RULE = 0.3;
    private static final double WEIGHT_SHARED_INDICATOR = 0.2;
    private static final double WEIGHT_SEMANTIC_SUMMARY = 0.1;

    /** Minimum score threshold — candidates below this are filtered out. */
    private static final double MIN_SCORE_THRESHOLD = 0.2;

    private final OpensearchClientBuilder osClient;
    private final MsspIndexResolver indexResolver;
    private final ObjectMapper objectMapper;

    public SimilarIncidentService(OpensearchClientBuilder osClient,
                                  MsspIndexResolver indexResolver,
                                  ObjectMapper objectMapper) {
        this.osClient = osClient;
        this.indexResolver = indexResolver;
        this.objectMapper = objectMapper;
    }

    // =========================================================================
    // Public API
    // =========================================================================

    /**
     * Finds incidents similar to the specified source incident.
     *
     * @param incidentId          the source incident document ID
     * @param window              time window string (e.g., "30d", "90d") or days as string
     * @param limit               max number of results
     * @param tenantIndexPattern  the tenant-scoped index pattern
     * @return list of scored similar incidents with reasons
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    public Map<String, Object> findSimilar(String incidentId, String window, int limit,
                                           String tenantIndexPattern) {
        return findSimilarInternal(incidentId, window, limit, tenantIndexPattern);
    }

    /**
     * Finds incidents similar to the specified source incident.
     *
     * @param incidentId          the source incident document ID
     * @param windowDays          time window in days
     * @param limit               max number of results
     * @param tenantIndexPattern  the tenant-scoped index pattern
     * @return list of scored similar incidents with reasons
     */
    public Map<String, Object> findSimilar(String incidentId, int windowDays, int limit,
                                           String tenantIndexPattern) {
        return findSimilarInternal(incidentId, windowDays + "d", limit, tenantIndexPattern);
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private Map<String, Object> findSimilarInternal(String incidentId, String window, int limit,
                                                     String tenantIndexPattern) {
        final String ctx = CLASSNAME + ".findSimilar";

        try {
            // 1. Resolve index pattern
            String indexPattern = tenantIndexPattern != null
                ? tenantIndexPattern
                : indexResolver.resolveIndexPattern("incident");

            // 2. Fetch source incident
            SearchRequest sourceRequest = SearchRequest.of(r -> r
                .index(indexPattern)
                .query(Query.of(q -> q.ids(i -> i.values(List.of(incidentId)))))
                .size(1));

            SearchResponse<Map> sourceResponse = osClient.execute(os -> os.search(sourceRequest, Map.class));
            if (sourceResponse.hits() == null || sourceResponse.hits().hits().isEmpty()) {
                return Map.of("items", List.of(), "total", 0);
            }

            Map<String, Object> sourceDoc = (Map<String, Object>) sourceResponse.hits().hits().get(0).source();
            if (sourceDoc == null) {
                return Map.of("items", List.of(), "total", 0);
            }

            // 3. Extract comparison signals from source
            Set<String> sourceEntities = extractEntities(sourceDoc);
            Set<String> sourceRuleIds = extractRuleIds(sourceDoc);
            Set<String> sourceIndicators = extractIndicators(sourceDoc);
            String sourceTitle = sourceDoc.get("title") instanceof String t ? t : "";

            // 4. Calculate time window
            Instant windowStart = calculateWindowStart(window);

            // 5. Query candidates — incidents within window, excluding self
            List<Map<String, Object>> candidates = queryCandidates(
                indexPattern, incidentId, windowStart, limit * 3); // fetch extra for filtering

            // 6. Score candidates
            List<Map<String, Object>> scoredItems = new ArrayList<>();
            for (Map<String, Object> candidate : candidates) {
                String candidateId = candidate.get("id") instanceof String s ? s
                    : (candidate.get("_id") instanceof String s2 ? s2 : null);
                if (candidateId == null || candidateId.equals(incidentId)) continue;

                ScoringResult scoring = scoreCandidate(
                    candidate, sourceEntities, sourceRuleIds, sourceIndicators, sourceTitle);

                if (scoring.totalScore >= MIN_SCORE_THRESHOLD) {
                    Map<String, Object> item = buildSimilarItem(candidate, candidateId, scoring);
                    scoredItems.add(item);
                }
            }

            // 7. Sort by score descending, limit
            scoredItems.sort((a, b) -> Double.compare(
                (Double) b.get("similarity"), (Double) a.get("similarity")));
            if (scoredItems.size() > limit) {
                scoredItems = scoredItems.subList(0, limit);
            }

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("items", scoredItems);
            result.put("total", scoredItems.size());
            return result;

        } catch (Exception e) {
            log.error("{}: failed to find similar incidents for {}: {}", ctx, incidentId, e.getMessage(), e);
            throw new RuntimeException("Failed to find similar incidents: " + e.getMessage(), e);
        }
    }

    // =========================================================================
    // Signal extraction
    // =========================================================================

    /**
     * Extracts entity identifiers (IPs, hosts, users) from an incident document.
     */
    @SuppressWarnings("unchecked")
    private Set<String> extractEntities(Map<String, Object> doc) {
        Set<String> entities = new HashSet<>();

        // Check entities array field
        if (doc.get("entities") instanceof List<?> entityList) {
            for (Object entity : entityList) {
                if (entity instanceof Map<?, ?> entityMap) {
                    Object value = entityMap.get("value");
                    if (value instanceof String s && !s.isBlank()) {
                        entities.add(s.toLowerCase());
                    }
                } else if (entity instanceof String s) {
                    entities.add(s.toLowerCase());
                }
            }
        }

        // Also check linked_entities
        if (doc.get("linked_entities") instanceof List<?> linkedList) {
            for (Object entity : linkedList) {
                if (entity instanceof Map<?, ?> entityMap) {
                    Object value = entityMap.get("value");
                    if (value == null) value = entityMap.get("id");
                    if (value instanceof String s && !s.isBlank()) {
                        entities.add(s.toLowerCase());
                    }
                } else if (entity instanceof String s) {
                    entities.add(s.toLowerCase());
                }
            }
        }

        return entities;
    }

    /**
     * Extracts detection rule IDs from an incident document.
     */
    @SuppressWarnings("unchecked")
    private Set<String> extractRuleIds(Map<String, Object> doc) {
        Set<String> ruleIds = new HashSet<>();

        if (doc.get("rule_id") instanceof String ruleId) {
            ruleIds.add(ruleId);
        }
        if (doc.get("ruleId") instanceof String ruleId) {
            ruleIds.add(ruleId);
        }
        if (doc.get("detection_rule_id") instanceof String ruleId) {
            ruleIds.add(ruleId);
        }
        if (doc.get("rules") instanceof List<?> rulesList) {
            for (Object r : rulesList) {
                if (r instanceof Map<?, ?> ruleMap) {
                    Object id = ruleMap.get("id");
                    if (id instanceof String s) ruleIds.add(s);
                } else if (r instanceof String s) {
                    ruleIds.add(s);
                }
            }
        }

        return ruleIds;
    }

    /**
     * Extracts IOC (Indicator of Compromise) values from an incident document.
     */
    @SuppressWarnings("unchecked")
    private Set<String> extractIndicators(Map<String, Object> doc) {
        Set<String> indicators = new HashSet<>();

        if (doc.get("indicators") instanceof List<?> iocList) {
            for (Object ioc : iocList) {
                if (ioc instanceof Map<?, ?> iocMap) {
                    Object value = iocMap.get("value");
                    if (value instanceof String s && !s.isBlank()) {
                        indicators.add(s.toLowerCase());
                    }
                } else if (ioc instanceof String s) {
                    indicators.add(s.toLowerCase());
                }
            }
        }
        if (doc.get("iocs") instanceof List<?> iocList) {
            for (Object ioc : iocList) {
                if (ioc instanceof Map<?, ?> iocMap) {
                    Object value = iocMap.get("value");
                    if (value instanceof String s && !s.isBlank()) {
                        indicators.add(s.toLowerCase());
                    }
                } else if (ioc instanceof String s) {
                    indicators.add(s.toLowerCase());
                }
            }
        }

        return indicators;
    }

    // =========================================================================
    // Candidate querying
    // =========================================================================

    /**
     * Queries candidate incidents from OpenSearch within the time window, excluding the source.
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    private List<Map<String, Object>> queryCandidates(String indexPattern, String excludeId,
                                                      Instant windowStart, int maxCandidates) throws Exception {
        SearchRequest request = SearchRequest.of(r -> r
            .index(indexPattern)
            .query(Query.of(q -> q.bool(b -> b
                .must(m -> m.range(rng -> rng
                    .field("createdAt")
                    .gte(org.opensearch.client.json.JsonData.of(windowStart.toString()))))
                .mustNot(mn -> mn.ids(i -> i.values(List.of(excludeId)))))))
            .size(maxCandidates)
            .sort(s -> s.field(f -> f.field("createdAt").order(SortOrder.Desc))));

        SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));

        List<Map<String, Object>> candidates = new ArrayList<>();
        if (response.hits() != null && response.hits().hits() != null) {
            for (Hit<Map> hit : response.hits().hits()) {
                if (hit.source() != null) {
                    Map<String, Object> doc = new LinkedHashMap<>((Map<String, Object>) hit.source());
                    doc.put("_id", hit.id());
                    candidates.add(doc);
                }
            }
        }
        return candidates;
    }

    // =========================================================================
    // Scoring logic
    // =========================================================================

    /**
     * Result of scoring a single candidate incident.
     */
    private static class ScoringResult {
        final double totalScore;
        final double entityScore;
        final double ruleScore;
        final double indicatorScore;
        final double semanticScore;
        final List<Map<String, Object>> reasons;

        ScoringResult(double totalScore, double entityScore, double ruleScore,
                      double indicatorScore, double semanticScore,
                      List<Map<String, Object>> reasons) {
            this.totalScore = totalScore;
            this.entityScore = entityScore;
            this.ruleScore = ruleScore;
            this.indicatorScore = indicatorScore;
            this.semanticScore = semanticScore;
            this.reasons = reasons;
        }
    }

    /**
     * Scores a candidate against the source incident signals.
     */
    private ScoringResult scoreCandidate(Map<String, Object> candidate,
                                          Set<String> sourceEntities,
                                          Set<String> sourceRuleIds,
                                          Set<String> sourceIndicators,
                                          String sourceTitle) {
        List<Map<String, Object>> reasons = new ArrayList<>();

        // Signal 1: shared_entity (0.4)
        Set<String> candidateEntities = extractEntities(candidate);
        double entityScore = 0.0;
        if (!sourceEntities.isEmpty() || !candidateEntities.isEmpty()) {
            Set<String> shared = new HashSet<>(sourceEntities);
            shared.retainAll(candidateEntities);
            int maxEntities = Math.max(sourceEntities.size(), candidateEntities.size());
            if (maxEntities > 0) {
                entityScore = (double) shared.size() / maxEntities;
            }
            if (entityScore > 0) {
                Map<String, Object> reason = new LinkedHashMap<>();
                reason.put("type", "shared_entity");
                reason.put("description", shared.size() + " shared entities");
                reason.put("weight", WEIGHT_SHARED_ENTITY);
                reason.put("evidence", new ArrayList<>(shared).subList(0, Math.min(shared.size(), 5)));
                reasons.add(reason);
            }
        }

        // Signal 2: same_rule (0.3) — binary match
        Set<String> candidateRuleIds = extractRuleIds(candidate);
        double ruleScore = 0.0;
        if (!sourceRuleIds.isEmpty() && !candidateRuleIds.isEmpty()) {
            Set<String> sharedRules = new HashSet<>(sourceRuleIds);
            sharedRules.retainAll(candidateRuleIds);
            if (!sharedRules.isEmpty()) {
                ruleScore = 1.0; // binary match
                Map<String, Object> reason = new LinkedHashMap<>();
                reason.put("type", "same_rule");
                reason.put("description", "Triggered by same detection rule");
                reason.put("weight", WEIGHT_SAME_RULE);
                reason.put("evidence", new ArrayList<>(sharedRules));
                reasons.add(reason);
            }
        }

        // Signal 3: shared_indicator (0.2)
        Set<String> candidateIndicators = extractIndicators(candidate);
        double indicatorScore = 0.0;
        if (!sourceIndicators.isEmpty() || !candidateIndicators.isEmpty()) {
            Set<String> sharedIocs = new HashSet<>(sourceIndicators);
            sharedIocs.retainAll(candidateIndicators);
            int totalIocs = sourceIndicators.size() + candidateIndicators.size();
            if (totalIocs > 0) {
                indicatorScore = (double) sharedIocs.size() * 2.0 / totalIocs;
                indicatorScore = Math.min(indicatorScore, 1.0);
            }
            if (indicatorScore > 0) {
                Map<String, Object> reason = new LinkedHashMap<>();
                reason.put("type", "shared_indicator");
                reason.put("description", sharedIocs.size() + " shared IOCs");
                reason.put("weight", WEIGHT_SHARED_INDICATOR);
                reason.put("evidence", new ArrayList<>(sharedIocs).subList(0, Math.min(sharedIocs.size(), 5)));
                reasons.add(reason);
            }
        }

        // Signal 4: semantic_summary (0.1) — title similarity
        String candidateTitle = candidate.get("title") instanceof String t ? t : "";
        double semanticScore = computeTitleSimilarity(sourceTitle, candidateTitle);
        if (semanticScore > 0) {
            Map<String, Object> reason = new LinkedHashMap<>();
            reason.put("type", "semantic_summary");
            reason.put("description", "Similar attack narrative");
            reason.put("weight", WEIGHT_SEMANTIC_SUMMARY);
            reason.put("evidence", List.of(candidateTitle));
            reasons.add(reason);
        }

        // Weighted sum, normalize to 0.0-1.0
        double totalScore = (entityScore * WEIGHT_SHARED_ENTITY)
            + (ruleScore * WEIGHT_SAME_RULE)
            + (indicatorScore * WEIGHT_SHARED_INDICATOR)
            + (semanticScore * WEIGHT_SEMANTIC_SUMMARY);

        // Normalize: max possible is 0.4 + 0.3 + 0.2 + 0.1 = 1.0 (already normalized)
        totalScore = Math.min(totalScore, 1.0);

        return new ScoringResult(totalScore, entityScore, ruleScore,
            indicatorScore, semanticScore, reasons);
    }

    /**
     * Computes a simple title similarity score using word overlap (Jaccard-like).
     * This is a lightweight substitute for OpenSearch more_like_this for local scoring.
     */
    private double computeTitleSimilarity(String sourceTitle, String candidateTitle) {
        if (sourceTitle == null || sourceTitle.isBlank() ||
            candidateTitle == null || candidateTitle.isBlank()) {
            return 0.0;
        }

        Set<String> sourceWords = tokenize(sourceTitle);
        Set<String> candidateWords = tokenize(candidateTitle);

        if (sourceWords.isEmpty() || candidateWords.isEmpty()) return 0.0;

        Set<String> intersection = new HashSet<>(sourceWords);
        intersection.retainAll(candidateWords);

        Set<String> union = new HashSet<>(sourceWords);
        union.addAll(candidateWords);

        if (union.isEmpty()) return 0.0;
        return (double) intersection.size() / union.size();
    }

    /**
     * Tokenizes text into lowercased words, filtering out common stop words.
     */
    private Set<String> tokenize(String text) {
        Set<String> stopWords = Set.of("the", "a", "an", "and", "or", "in", "on", "at",
            "to", "for", "of", "with", "by", "from", "is", "was", "are", "were", "-", "—");

        return Arrays.stream(text.toLowerCase().split("[\\s\\-_/]+"))
            .filter(w -> w.length() > 2)
            .filter(w -> !stopWords.contains(w))
            .collect(Collectors.toSet());
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * Calculates the window start instant from a window string like "30d" or "90d".
     */
    private Instant calculateWindowStart(String window) {
        if (window == null || window.isBlank()) {
            return Instant.now().minus(30, ChronoUnit.DAYS);
        }

        String cleaned = window.trim().toLowerCase();
        try {
            if (cleaned.endsWith("d")) {
                int days = Integer.parseInt(cleaned.substring(0, cleaned.length() - 1));
                days = Math.min(days, 90); // cap at 90d
                return Instant.now().minus(days, ChronoUnit.DAYS);
            } else if (cleaned.endsWith("h")) {
                int hours = Integer.parseInt(cleaned.substring(0, cleaned.length() - 1));
                return Instant.now().minus(hours, ChronoUnit.HOURS);
            }
        } catch (NumberFormatException e) {
            log.warn("{}: invalid window format '{}', defaulting to 30d", CLASSNAME, window);
        }
        return Instant.now().minus(30, ChronoUnit.DAYS);
    }

    /**
     * Builds a similar incident item for the response.
     */
    private Map<String, Object> buildSimilarItem(Map<String, Object> candidate,
                                                  String candidateId,
                                                  ScoringResult scoring) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("incidentId", candidateId);
        item.put("title", candidate.getOrDefault("title", ""));
        item.put("status", candidate.getOrDefault("status", "unknown"));
        item.put("severity", candidate.getOrDefault("severity", "medium"));
        item.put("createdAt", candidate.get("createdAt"));
        item.put("closedAt", candidate.get("closedAt"));
        item.put("similarity", Math.round(scoring.totalScore * 100.0) / 100.0);
        item.put("reasons", scoring.reasons);
        return item;
    }
}
