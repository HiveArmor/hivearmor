package com.hivearmor.service.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.Instant;

/**
 * DTO representing a single event on the incident investigation timeline.
 *
 * Event types:
 *   STATUS_CHANGE  — incident status or assignment changed
 *   NOTE           — analyst note added
 *   EVIDENCE_ADDED — evidence item added to the board
 *   SOAR_EXECUTED  — SOAR playbook executed (deferred to S-10)
 *   ALERT_ADDED    — alert linked to this incident
 *
 * S-4B
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record IncidentTimelineEventDTO(
        /** Stable unique ID combining type + DB id, e.g. "STATUS_CHANGE-42" */
        String id,

        /** One of: STATUS_CHANGE, NOTE, EVIDENCE_ADDED, SOAR_EXECUTED, ALERT_ADDED */
        String eventType,

        /** Login of the user who caused the event */
        String actor,

        /** When the event occurred */
        Instant eventAt,

        /** Short human-readable title */
        String title,

        /** Longer description; may be null */
        String detail,

        /** Severity level 1-4; may be null */
        Integer severityHint
) {
}
