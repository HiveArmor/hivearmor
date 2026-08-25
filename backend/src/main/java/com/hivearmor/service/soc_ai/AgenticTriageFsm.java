package com.hivearmor.service.soc_ai;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Minimal agentic triage state machine — no LangGraph, no Neo4j / attack-path calls.
 *
 * <p>STAGING CANDIDATE — ENRICH runs a thin IOC-key inventory stub; INVESTIGATE runs a
 * thin related-alert / empty-hypotheses stub with an optional soft investigation-session
 * link (id+status). Not PRODUCTION READY.
 */
public final class AgenticTriageFsm {

    private AgenticTriageFsm() {}

    /**
     * Run the triage FSM.
     *
     * @param highConfidenceFp when true, early-exit {@code AUTO_TRIAGE → END}
     * @return ordered state path (never empty; always starts with {@link AgenticTriageState#AUTO_TRIAGE}
     *         and ends with {@link AgenticTriageState#END})
     */
    public static List<AgenticTriageState> run(boolean highConfidenceFp) {
        List<AgenticTriageState> path = new ArrayList<>(4);
        path.add(AgenticTriageState.AUTO_TRIAGE);

        if (highConfidenceFp) {
            path.add(AgenticTriageState.END);
            return Collections.unmodifiableList(path);
        }

        // Thin stub: IOC key inventory + placeholder entity count (see TriageEnrichmentStub).
        path.add(AgenticTriageState.ENRICH);
        // Thin stub: relatedAlertCount + empty openHypotheses + optional session soft-link
        // (see TriageInvestigateStub).
        path.add(AgenticTriageState.INVESTIGATE);
        path.add(AgenticTriageState.END);
        return Collections.unmodifiableList(path);
    }

    /** Human-readable stub detail for ledger persistence / logs. */
    public static String detailFor(AgenticTriageState state, boolean highConfidenceFp) {
        return switch (state) {
            case AUTO_TRIAGE -> "classify confidence vs auto-close threshold";
            case ENRICH -> "thin stub — IOC key inventory + placeholder relatedEntityCount; no Neo4j";
            case INVESTIGATE ->
                "thin stub — relatedAlertCount + empty openHypotheses; "
                    + "optional soft investigation session link; no Neo4j / attack-path";
            case END -> highConfidenceFp
                ? "early exit — high-confidence false positive"
                : "triage path complete";
        };
    }
}
