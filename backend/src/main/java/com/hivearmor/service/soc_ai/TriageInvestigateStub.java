package com.hivearmor.service.soc_ai;

import com.hivearmor.domain.shared_types.alert.UtmAlert;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Thin INVESTIGATE stub for the agentic triage FSM (STAGING CANDIDATE — not PRODUCTION READY).
 *
 * <p>Records structured investigate metadata on the triage ledger: a soft related-alert
 * count (0 or 1 when the alert document is resolvable in OpenSearch) and an empty
 * open-hypotheses list. Does <strong>not</strong> open investigation sessions, query
 * Neo4j, build attack paths, or claim investigation-product capabilities.
 */
public final class TriageInvestigateStub {

    private TriageInvestigateStub() {}

    /**
     * Build structured investigate metadata for the INVESTIGATE ledger step.
     *
     * @param alert optional OpenSearch alert document (null-safe); presence yields
     *              {@code relatedAlertCount=1} as a soft resolvability signal, else {@code 0}
     * @return LinkedHashMap suitable for JSON serialization into nextSteps
     */
    public static Map<String, Object> build(UtmAlert alert) {
        return build(alert != null ? 1 : 0);
    }

    /**
     * Build investigate metadata with an explicit related-alert count
     * (tests / soft OpenSearch callers).
     */
    public static Map<String, Object> build(int relatedAlertCount) {
        int count = Math.max(0, relatedAlertCount);
        Map<String, Object> investigate = new LinkedHashMap<>(5);
        investigate.put("stub", true);
        investigate.put("relatedAlertCount", count);
        investigate.put("openHypotheses", List.of());
        investigate.put(
            "note",
            "thin stub — relatedAlertCount soft/placeholder + empty openHypotheses; "
                + "full investigation session linking deferred; no Neo4j / attack-path");
        return investigate;
    }

    /** Human-readable one-line detail for logs / ledger {@code details} field. */
    public static String summarize(Map<String, Object> investigate) {
        if (investigate == null) {
            return "investigate stub — no metadata";
        }
        Object count = investigate.get("relatedAlertCount");
        Object hypotheses = investigate.get("openHypotheses");
        int hypCount = hypotheses instanceof List<?> list ? list.size() : 0;
        return String.format(
            "investigate stub — relatedAlertCount=%s openHypotheses=%d "
                + "(session linking deferred; no Neo4j / attack-path)",
            count != null ? count : 0,
            hypCount);
    }
}
