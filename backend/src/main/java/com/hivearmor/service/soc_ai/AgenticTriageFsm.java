package com.hivearmor.service.soc_ai;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Minimal agentic triage state machine — no LangGraph, no Neo4j / attack-path calls.
 *
 * <p>STAGING CANDIDATE — ENRICH and INVESTIGATE are honest stubs that only advance
 * the ledger so callers can observe the path.
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

        // Stub: no Neo4j / entity graph enrichment yet.
        path.add(AgenticTriageState.ENRICH);
        // Stub: no attack-path / investigation orchestration yet.
        path.add(AgenticTriageState.INVESTIGATE);
        path.add(AgenticTriageState.END);
        return Collections.unmodifiableList(path);
    }

    /** Human-readable stub detail for ledger persistence / logs. */
    public static String detailFor(AgenticTriageState state, boolean highConfidenceFp) {
        return switch (state) {
            case AUTO_TRIAGE -> "classify confidence vs auto-close threshold";
            case ENRICH -> "stub — Neo4j / entity enrichment deferred";
            case INVESTIGATE -> "stub — attack-path investigation deferred";
            case END -> highConfidenceFp
                ? "early exit — high-confidence false positive"
                : "triage path complete";
        };
    }
}
