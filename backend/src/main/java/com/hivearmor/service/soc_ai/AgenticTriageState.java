package com.hivearmor.service.soc_ai;

/**
 * Minimal agentic triage FSM states (STAGING CANDIDATE — not PRODUCTION READY).
 *
 * <pre>
 * AUTO_TRIAGE → END                 (high-confidence FP early exit)
 * AUTO_TRIAGE → ENRICH → INVESTIGATE → END   (non-FP path; ENRICH/INVESTIGATE are stubs)
 * </pre>
 */
public enum AgenticTriageState {
    AUTO_TRIAGE,
    ENRICH,
    INVESTIGATE,
    END
}
