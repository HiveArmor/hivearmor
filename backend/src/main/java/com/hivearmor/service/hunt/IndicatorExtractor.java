package com.hivearmor.service.hunt;

import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Extracts and deduplicates Indicators of Compromise (IOCs) from event documents.
 *
 * <p>Workflow:
 * <ol>
 *   <li>Scan IOC-bearing fields across all events</li>
 *   <li>Skip internal IPs (they are not IOCs in investigation context)</li>
 *   <li>Deduplicate by value, merging firstSeen/lastSeen and sources</li>
 *   <li>Enrich from threat.indicator.* fields on the source event</li>
 *   <li>Sort by confidence DESC, limit to 50</li>
 * </ol>
 */
@Service
public class IndicatorExtractor {

    private static final Set<String> IOC_FIELDS = Set.of(
        "source.ip", "destination.ip",
        "file.hash.sha256", "file.hash.sha1", "file.hash.md5",
        "dns.question.name", "url.full", "registry.path"
    );

    private static final Map<String, String> FIELD_TO_IOC_TYPE = Map.of(
        "source.ip", "ipv4",
        "destination.ip", "ipv4",
        "file.hash.sha256", "sha256",
        "file.hash.sha1", "sha1",
        "file.hash.md5", "md5",
        "dns.question.name", "domain",
        "url.full", "url",
        "registry.path", "registry_key"
    );

    private static final List<String> INTERNAL_PREFIXES = List.of(
        "10.",
        "172.16.", "172.17.", "172.18.", "172.19.",
        "172.20.", "172.21.", "172.22.", "172.23.",
        "172.24.", "172.25.", "172.26.", "172.27.",
        "172.28.", "172.29.", "172.30.", "172.31.",
        "192.168."
    );

    private static final int MAX_INDICATORS = 50;

    /**
     * Result container for indicator extraction.
     */
    public static class IndicatorResult {
        private final List<Map<String, Object>> indicators;
        private final int totalCount;
        private final String enrichmentStatus;

        public IndicatorResult(List<Map<String, Object>> indicators, int totalCount, String enrichmentStatus) {
            this.indicators = indicators;
            this.totalCount = totalCount;
            this.enrichmentStatus = enrichmentStatus;
        }

        public List<Map<String, Object>> getIndicators() { return indicators; }
        public int getTotalCount() { return totalCount; }
        public String getEnrichmentStatus() { return enrichmentStatus; }
    }

    /**
     * Extracts and deduplicates IOCs from event documents.
     *
     * @param events list of event source maps from OpenSearch
     * @return IndicatorResult containing deduplicated, enriched indicators
     */
    @SuppressWarnings("unchecked")
    public IndicatorResult extract(List<Map<String, Object>> events) {
        if (events == null || events.isEmpty()) {
            return new IndicatorResult(Collections.emptyList(), 0, "unavailable");
        }

        // Map keyed by IOC value for deduplication
        Map<String, Map<String, Object>> indicatorMap = new LinkedHashMap<>();
        int iocIndex = 0;

        for (Map<String, Object> event : events) {
            for (String field : IOC_FIELDS) {
                String value = extractNested(event, field);
                if (value == null || value.isBlank()) continue;

                String iocType = FIELD_TO_IOC_TYPE.get(field);

                // Skip internal IPs
                if ("ipv4".equals(iocType) && isInternal(value)) {
                    continue;
                }

                String timestamp = event.get("@timestamp") != null
                    ? event.get("@timestamp").toString() : null;

                if (indicatorMap.containsKey(value)) {
                    // Merge: update lastSeen, merge sources
                    Map<String, Object> existing = indicatorMap.get(value);
                    if (timestamp != null) {
                        String existingLastSeen = (String) existing.get("lastSeen");
                        if (existingLastSeen == null || timestamp.compareTo(existingLastSeen) > 0) {
                            existing.put("lastSeen", timestamp);
                        }
                        String existingFirstSeen = (String) existing.get("firstSeen");
                        if (existingFirstSeen == null || timestamp.compareTo(existingFirstSeen) < 0) {
                            existing.put("firstSeen", timestamp);
                        }
                    }
                    // Merge sources from this event's enrichment
                    mergeEnrichment(existing, event);
                } else {
                    // New indicator
                    iocIndex++;
                    Map<String, Object> indicator = new LinkedHashMap<>();
                    indicator.put("id", "ioc-" + String.format("%03d", iocIndex));
                    indicator.put("type", iocType);
                    indicator.put("value", value);
                    indicator.put("verdict", null);
                    indicator.put("confidence", 0);
                    indicator.put("firstSeen", timestamp);
                    indicator.put("lastSeen", timestamp);
                    indicator.put("sources", new ArrayList<String>());
                    indicator.put("tlp", null);
                    Map<String, Object> prevalence = new LinkedHashMap<>();
                    prevalence.put("globalHits", 0);
                    prevalence.put("tenantHits", 0);
                    prevalence.put("firstGlobalSeen", null);
                    indicator.put("prevalence", prevalence);
                    indicator.put("context", buildContext(event, iocType, field));

                    // Enrich from threat.indicator.*
                    enrichIndicator(indicator, event);

                    indicatorMap.put(value, indicator);
                }
            }
        }

        // Sort by confidence DESC
        List<Map<String, Object>> sorted = indicatorMap.values().stream()
            .sorted((a, b) -> {
                int confA = toInt(a.get("confidence"));
                int confB = toInt(b.get("confidence"));
                return Integer.compare(confB, confA);
            })
            .limit(MAX_INDICATORS)
            .collect(Collectors.toList());

        // Determine enrichment status
        String enrichmentStatus = determineEnrichmentStatus(sorted);

        return new IndicatorResult(sorted, sorted.size(), enrichmentStatus);
    }

    /**
     * Enriches an indicator from threat.indicator.* fields on the event.
     */
    @SuppressWarnings("unchecked")
    private void enrichIndicator(Map<String, Object> indicator, Map<String, Object> event) {
        String confidence = extractNested(event, "threat.indicator.confidence");
        if (confidence != null) {
            try {
                int confVal = (int) Double.parseDouble(confidence);
                if (confVal > toInt(indicator.get("confidence"))) {
                    indicator.put("confidence", confVal);
                }
            } catch (NumberFormatException e) {
                // skip
            }
        }

        String provider = extractNested(event, "threat.indicator.provider");
        if (provider != null) {
            List<String> sources = (List<String>) indicator.get("sources");
            if (!sources.contains(provider)) {
                sources.add(provider);
            }
        }

        String tlp = extractNested(event, "threat.indicator.marking.tlp");
        if (tlp != null) {
            indicator.put("tlp", tlp.toLowerCase());
        }

        String verdict = extractNested(event, "threat.indicator.type");
        if (verdict != null && indicator.get("verdict") == null) {
            // Use confidence to derive verdict
            int conf = toInt(indicator.get("confidence"));
            if (conf >= 80) {
                indicator.put("verdict", "malicious");
            } else if (conf >= 50) {
                indicator.put("verdict", "suspicious");
            } else {
                indicator.put("verdict", "unknown");
            }
        }
    }

    /**
     * Merges enrichment data from a subsequent event into an existing indicator.
     */
    @SuppressWarnings("unchecked")
    private void mergeEnrichment(Map<String, Object> indicator, Map<String, Object> event) {
        String provider = extractNested(event, "threat.indicator.provider");
        if (provider != null) {
            List<String> sources = (List<String>) indicator.get("sources");
            if (!sources.contains(provider)) {
                sources.add(provider);
            }
        }

        String confidence = extractNested(event, "threat.indicator.confidence");
        if (confidence != null) {
            try {
                int confVal = (int) Double.parseDouble(confidence);
                if (confVal > toInt(indicator.get("confidence"))) {
                    indicator.put("confidence", confVal);
                    // Re-derive verdict based on updated confidence
                    if (confVal >= 80) {
                        indicator.put("verdict", "malicious");
                    } else if (confVal >= 50) {
                        indicator.put("verdict", "suspicious");
                    }
                }
            } catch (NumberFormatException e) {
                // skip
            }
        }

        String tlp = extractNested(event, "threat.indicator.marking.tlp");
        if (tlp != null && indicator.get("tlp") == null) {
            indicator.put("tlp", tlp.toLowerCase());
        }
    }

    /**
     * Builds a context string describing where the IOC was found.
     */
    private String buildContext(Map<String, Object> event, String iocType, String field) {
        String action = extractNested(event, "event.action");
        String processName = extractNested(event, "process.name");
        String hostName = extractNested(event, "host.name");

        StringBuilder sb = new StringBuilder();
        sb.append(iocType).append(" found in ");
        if (action != null) {
            sb.append(action).append(" event");
        } else {
            sb.append("event");
        }
        if (processName != null) {
            sb.append(" from ").append(processName);
        }
        if (hostName != null) {
            sb.append(" on ").append(hostName);
        }
        return sb.toString();
    }

    /**
     * Determines the enrichment status based on indicator confidence values.
     */
    private String determineEnrichmentStatus(List<Map<String, Object>> indicators) {
        if (indicators.isEmpty()) return "unavailable";

        boolean allEnriched = true;
        boolean anyEnriched = false;

        for (Map<String, Object> indicator : indicators) {
            int confidence = toInt(indicator.get("confidence"));
            if (confidence > 0) {
                anyEnriched = true;
            } else {
                allEnriched = false;
            }
        }

        if (allEnriched) return "complete";
        if (anyEnriched) return "partial";
        return "unavailable";
    }

    private boolean isInternal(String ip) {
        if (ip == null) return false;
        return INTERNAL_PREFIXES.stream().anyMatch(ip::startsWith);
    }

    private int toInt(Object value) {
        if (value == null) return 0;
        if (value instanceof Number) return ((Number) value).intValue();
        try {
            return Integer.parseInt(value.toString());
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    /**
     * Extracts a dot-notation nested field value as a String from a map.
     */
    @SuppressWarnings("unchecked")
    private String extractNested(Map<String, Object> src, String path) {
        Object val = extractNestedObject(src, path);
        return val != null ? val.toString() : null;
    }

    /**
     * Extracts a dot-notation nested field value as an Object from a map.
     */
    @SuppressWarnings("unchecked")
    private Object extractNestedObject(Map<String, Object> src, String path) {
        if (src == null || path == null) return null;

        String[] parts = path.split("\\.");
        Object current = src;

        for (String part : parts) {
            if (current instanceof Map) {
                current = ((Map<String, Object>) current).get(part);
            } else {
                return null;
            }
        }
        return current;
    }
}
