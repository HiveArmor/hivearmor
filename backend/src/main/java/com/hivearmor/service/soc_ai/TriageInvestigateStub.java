package com.hivearmor.service.soc_ai;

import com.hivearmor.domain.shared_types.alert.UtmAlert;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.BiFunction;

/**
 * Thin INVESTIGATE stub for the agentic triage FSM (STAGING CANDIDATE — not PRODUCTION READY).
 *
 * <p>Records structured investigate metadata on the triage ledger: a soft related-alert
 * count (0 or 1 when the alert document is resolvable in OpenSearch), an empty
 * open-hypotheses list, an optional soft link to a real investigation session
 * ({@code sessionId} + {@code sessionStatus}), and an optional soft-pinned ALERT session
 * item ({@code sessionItemId} + {@code sessionItemType}) when the linker reports a pin.
 * Always keeps {@code stub=true}. Does <strong>not</strong> query Neo4j, build attack paths,
 * auto-convert to incident, or claim investigation-product completeness.
 */
public final class TriageInvestigateStub {

    /**
     * Soft-created session identity (and optional soft pin) returned by an optional linker.
     * No PII in these fields — item refs stay in the session-item store, not the ledger error text.
     */
    public record LinkedSession(
            long sessionId,
            String status,
            boolean sessionItemPinned,
            Long sessionItemId,
            String sessionItemType,
            String sessionItemPinError) {

        /** Session link without a pin attempt (tests / callers that only create sessions). */
        public LinkedSession(long sessionId, String status) {
            this(sessionId, status, false, null, null, null);
        }
    }

    private TriageInvestigateStub() {}

    /**
     * Build structured investigate metadata for the INVESTIGATE ledger step.
     *
     * @param alert optional OpenSearch alert document (null-safe); presence yields
     *              {@code relatedAlertCount=1} as a soft resolvability signal, else {@code 0}
     * @return LinkedHashMap suitable for JSON serialization into nextSteps
     */
    public static Map<String, Object> build(UtmAlert alert) {
        return build(alert, null, null);
    }

    /**
     * Build investigate metadata with an explicit related-alert count
     * (tests / soft OpenSearch callers). No session linking.
     */
    public static Map<String, Object> build(int relatedAlertCount) {
        return base(relatedAlertCount, false, null, null, null, null);
    }

    /**
     * Build investigate metadata and optionally soft-link an investigation session.
     *
     * <p>Linking runs only when {@code alert} is non-null and {@code linker} is non-null.
     * Linker failures keep {@code stub=true} and record {@code sessionLinked=false}
     * without throwing. Pin failures reported on {@link LinkedSession} keep the session
     * link and record a sanitized {@code sessionItemPinError}. Never converts the session
     * to an incident.
     *
     * @param alert   optional OpenSearch alert document
     * @param alertId fallback title fragment when the alert name is blank (may be null)
     * @param linker  optional {@code (sessionName, description) -> LinkedSession}; null skips linking
     */
    public static Map<String, Object> build(
            UtmAlert alert,
            String alertId,
            BiFunction<String, String, LinkedSession> linker) {
        int related = alert != null ? 1 : 0;
        if (alert == null || linker == null) {
            return base(related, false, null, null, null, null);
        }

        String sessionName = sessionTitle(alert, alertId);
        String description =
            "Soft-linked from agentic INVESTIGATE stub (STAGING CANDIDATE). "
                + "No Neo4j / attack-path. Not auto-converted to incident.";
        try {
            LinkedSession linked = linker.apply(sessionName, description);
            if (linked == null || linked.sessionId() <= 0) {
                return base(related, false, null, null, "linker returned no session", null);
            }
            String status = linked.status() != null && !linked.status().isBlank()
                ? linked.status()
                : "ACTIVE";
            return base(related, true, linked.sessionId(), status, null, linked);
        } catch (Exception e) {
            // Soft-fail: keep stub honesty; never log alert/session name (may hold PII).
            return base(related, false, null, null, sanitizeError(e, "link_failed"), null);
        }
    }

    /** Human-readable one-line detail for logs / ledger {@code details} field. */
    public static String summarize(Map<String, Object> investigate) {
        if (investigate == null) {
            return "investigate stub — no metadata";
        }
        Object count = investigate.get("relatedAlertCount");
        Object hypotheses = investigate.get("openHypotheses");
        int hypCount = hypotheses instanceof List<?> list ? list.size() : 0;
        boolean linked = Boolean.TRUE.equals(investigate.get("sessionLinked"));
        Object sessionId = investigate.get("sessionId");
        if (linked && sessionId != null) {
            boolean pinned = Boolean.TRUE.equals(investigate.get("sessionItemPinned"));
            Object pinError = investigate.get("sessionItemPinError");
            String pinPart;
            if (pinned) {
                pinPart = String.format(
                    " sessionItemId=%s sessionItemType=%s",
                    investigate.get("sessionItemId"),
                    investigate.get("sessionItemType"));
            } else if (pinError != null) {
                pinPart = " sessionItemPinned=false (" + pinError + ")";
            } else {
                pinPart = " sessionItemPinned=false";
            }
            return String.format(
                "investigate stub — relatedAlertCount=%s openHypotheses=%d "
                    + "sessionId=%s sessionStatus=%s%s (soft link; no Neo4j / attack-path)",
                count != null ? count : 0,
                hypCount,
                sessionId,
                investigate.get("sessionStatus"),
                pinPart);
        }
        Object linkError = investigate.get("sessionLinkError");
        if (linkError != null) {
            return String.format(
                "investigate stub — relatedAlertCount=%s openHypotheses=%d "
                    + "sessionLinked=false (%s; no Neo4j / attack-path)",
                count != null ? count : 0,
                hypCount,
                linkError);
        }
        return String.format(
            "investigate stub — relatedAlertCount=%s openHypotheses=%d "
                + "(session link skipped/unavailable; no Neo4j / attack-path)",
            count != null ? count : 0,
            hypCount);
    }

    static String sessionTitle(UtmAlert alert, String alertId) {
        String name = alert != null ? alert.getName() : null;
        String id = alert != null && alert.getId() != null && !alert.getId().isBlank()
            ? alert.getId()
            : alertId;
        String fragment;
        if (name != null && !name.isBlank()) {
            fragment = name.trim();
        } else if (id != null && !id.isBlank()) {
            fragment = id.trim();
        } else {
            fragment = "unresolved-alert";
        }
        String title = "SOC-AI triage: " + fragment;
        return title.length() <= 200 ? title : title.substring(0, 200);
    }

    private static Map<String, Object> base(
            int relatedAlertCount,
            boolean sessionLinked,
            Long sessionId,
            String sessionStatus,
            String sessionLinkError,
            LinkedSession pinSource) {
        int count = Math.max(0, relatedAlertCount);
        Map<String, Object> investigate = new LinkedHashMap<>(12);
        investigate.put("stub", true);
        investigate.put("relatedAlertCount", count);
        investigate.put("openHypotheses", List.of());
        investigate.put("sessionLinked", sessionLinked);
        if (sessionLinked && sessionId != null) {
            investigate.put("sessionId", sessionId);
            investigate.put("sessionStatus", sessionStatus);
            putPinFields(investigate, pinSource);
            investigate.put(
                "note",
                "thin stub — soft investigation session link + optional ALERT item pin "
                    + "(id+type); empty openHypotheses; no Neo4j / attack-path; not auto-converted");
        } else {
            if (sessionLinkError != null && !sessionLinkError.isBlank()) {
                investigate.put("sessionLinkError", sessionLinkError);
            }
            investigate.put(
                "note",
                "thin stub — relatedAlertCount soft/placeholder + empty openHypotheses; "
                    + "session link skipped, unavailable, or failed; no Neo4j / attack-path");
        }
        return investigate;
    }

    private static void putPinFields(Map<String, Object> investigate, LinkedSession pinSource) {
        if (pinSource == null) {
            investigate.put("sessionItemPinned", false);
            return;
        }
        boolean pinned = pinSource.sessionItemPinned();
        investigate.put("sessionItemPinned", pinned);
        if (pinned) {
            if (pinSource.sessionItemId() != null) {
                investigate.put("sessionItemId", pinSource.sessionItemId());
            }
            String type = pinSource.sessionItemType();
            investigate.put(
                "sessionItemType",
                type != null && !type.isBlank() ? type : "ALERT");
        } else if (pinSource.sessionItemPinError() != null
                && !pinSource.sessionItemPinError().isBlank()) {
            investigate.put("sessionItemPinError", pinSource.sessionItemPinError());
        }
    }

    /** Class-name only — never include exception messages (may contain PII). */
    static String sanitizeError(Exception e, String prefix) {
        String type = e.getClass().getSimpleName();
        String safePrefix = prefix != null && !prefix.isBlank() ? prefix : "failed";
        if (type == null || type.isBlank()) {
            return safePrefix;
        }
        return safePrefix + ":" + type;
    }
}
