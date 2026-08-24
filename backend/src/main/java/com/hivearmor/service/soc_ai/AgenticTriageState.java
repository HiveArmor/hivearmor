package com.hivearmor.service.soc_ai;

/**
 * Minimal agentic triage FSM states (STAGING CANDIDATE — not PRODUCTION READY).
 *
 * <pre>
 * AUTO_TRIAGE → END                 (high-confidence FP early exit + OpenSearch status/tag)
 * AUTO_TRIAGE → ENRICH → INVESTIGATE → END
 *   ENRICH: thin stub (IOC key inventory + placeholder relatedEntityCount)
 *   INVESTIGATE: thin stub (relatedAlertCount + empty openHypotheses; no attack-path)
 * </pre>
 */
public enum AgenticTriageState {
    AUTO_TRIAGE,
    ENRICH,
    INVESTIGATE,
    END
}
