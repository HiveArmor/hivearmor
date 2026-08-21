package com.hivearmor.service.incident;

import com.hivearmor.domain.incident.UtmIncidentHistory;
import com.hivearmor.domain.incident.UtmIncidentNote;
import com.hivearmor.domain.UtmEvidenceItem;
import com.hivearmor.domain.incident.UtmIncidentAlert;
import com.hivearmor.repository.incident.UtmIncidentAlertRepository;
import com.hivearmor.repository.incident.UtmIncidentHistoryRepository;
import com.hivearmor.repository.incident.UtmIncidentNoteRepository;
import com.hivearmor.repository.UtmEvidenceItemRepository;
import com.hivearmor.service.dto.IncidentTimelineEventDTO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Aggregates timeline events from multiple sources for a given incident.
 *
 * Sources (each wrapped in try/catch so one failure cannot break the whole timeline):
 *  1. hive_incident_history   → STATUS_CHANGE and assignment events
 *  2. hive_incident_note      → NOTE events
 *  3. hive_evidence_item      → EVIDENCE_ADDED events (added in S-4A)
 *  4. SOAR_EXECUTED events    → deferred to sprint S-10
 *  5. hive_incident_alert     → ALERT_ADDED events
 *
 * Returns all events sorted ascending by eventAt.
 *
 * S-4B
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class IncidentTimelineService {

    private final UtmIncidentHistoryRepository incidentHistoryRepository;
    private final UtmIncidentNoteRepository incidentNoteRepository;
    private final UtmEvidenceItemRepository evidenceItemRepository;
    private final UtmIncidentAlertRepository incidentAlertRepository;

    /**
     * Build the full timeline for an incident.
     * Never throws — each source is isolated. Returns an empty list for unknown incidents.
     *
     * @param incidentId the incident ID
     * @return list of {@link IncidentTimelineEventDTO} sorted by eventAt ascending
     */
    @Transactional(readOnly = true)
    public List<IncidentTimelineEventDTO> getTimeline(Long incidentId) {
        List<IncidentTimelineEventDTO> events = new ArrayList<>();

        // ── 1. Incident history (status changes, assignments, etc.) ──────────
        try {
            List<UtmIncidentHistory> history =
                    incidentHistoryRepository.findByIncidentIdOrderByActionDateAsc(incidentId);
            for (UtmIncidentHistory h : history) {
                String eventType = mapHistoryType(h.getActionType().name());
                String title = buildHistoryTitle(h);
                events.add(new IncidentTimelineEventDTO(
                        "STATUS_CHANGE-" + h.getId(),
                        eventType,
                        h.getActionCreatedBy(),
                        h.getActionDate(),
                        title,
                        h.getActionDetail(),
                        null
                ));
            }
        } catch (Exception e) {
            log.warn("[timeline] Could not load incident history for incident {}: {}", incidentId, e.getMessage());
        }

        // ── 2. Analyst notes ─────────────────────────────────────────────────
        try {
            List<UtmIncidentNote> notes =
                    incidentNoteRepository.findByIncidentIdOrderByNoteSendDateAsc(incidentId);
            for (UtmIncidentNote n : notes) {
                events.add(new IncidentTimelineEventDTO(
                        "NOTE-" + n.getId(),
                        "NOTE",
                        n.getNoteSendBy(),
                        n.getNoteSendDate(),
                        "Note added",
                        truncate(n.getNoteText(), 300),
                        null
                ));
            }
        } catch (Exception e) {
            log.warn("[timeline] Could not load notes for incident {}: {}", incidentId, e.getMessage());
        }

        // ── 3. Evidence items ────────────────────────────────────────────────
        try {
            List<UtmEvidenceItem> items = evidenceItemRepository.findByIncidentId(incidentId);
            for (UtmEvidenceItem item : items) {
                Instant eventAt = item.getCreatedAt() != null ? item.getCreatedAt() : Instant.now();
                events.add(new IncidentTimelineEventDTO(
                        "EVIDENCE_ADDED-" + item.getId(),
                        "EVIDENCE_ADDED",
                        item.getCreatedBy(),
                        eventAt,
                        "Evidence added: " + item.getTitle(),
                        item.getContent() != null ? truncate(item.getContent(), 200) : null,
                        item.getSeverityHint()
                ));
            }
        } catch (Exception e) {
            log.warn("[timeline] Could not load evidence items for incident {}: {}", incidentId, e.getMessage());
        }

        // ── 4. SOAR_EXECUTED events: deferred to S-10 ────────────────────────
        // SOAR audit log table does not exist yet. Implement when hive_soar_execution table is created.

        // ── 5. Alert additions ────────────────────────────────────────────────
        try {
            List<UtmIncidentAlert> alertLinks =
                    incidentAlertRepository.findAllByIncidentId(incidentId);
            for (UtmIncidentAlert link : alertLinks) {
                // hive_incident_alert has no addedAt column — use epoch as placeholder so
                // these events appear at the top of the timeline until S-10 adds the column.
                // The id of the row is used to generate a stable unique event id.
                events.add(new IncidentTimelineEventDTO(
                        "ALERT_ADDED-" + link.getId(),
                        "ALERT_ADDED",
                        null,
                        Instant.EPOCH,
                        "Alert linked: " + link.getAlertName(),
                        "Alert ID: " + link.getAlertId(),
                        link.getAlertSeverity()
                ));
            }
        } catch (Exception e) {
            log.warn("[timeline] Could not load linked alerts for incident {}: {}", incidentId, e.getMessage());
        }

        // ── Sort all events ascending by eventAt ─────────────────────────────
        events.sort(Comparator.comparing(
                IncidentTimelineEventDTO::eventAt,
                Comparator.nullsFirst(Comparator.naturalOrder())
        ));

        return events;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Map an IncidentHistoryActionEnum name to a timeline event type.
     */
    private String mapHistoryType(String actionType) {
        if (actionType == null) return "STATUS_CHANGE";
        return switch (actionType) {
            case "INCIDENT_NOTE_ADD", "INCIDENT_NOTE_CHANGE" -> "NOTE";
            case "INCIDENT_ASSIGNED_TO", "INCIDENT_ASSIGNED_CHANGE" -> "STATUS_CHANGE";
            default -> "STATUS_CHANGE";
        };
    }

    /**
     * Build a human-readable title from a history row.
     */
    private String buildHistoryTitle(UtmIncidentHistory h) {
        String action = h.getAction();
        if (action != null && !action.isBlank()) return action;
        return switch (h.getActionType()) {
            case INCIDENT_CREATED -> "Incident created";
            case INCIDENT_MERGED -> "Incident merged";
            case INCIDENT_COMPLETED -> "Incident completed";
            case INCIDENT_ALERT_ADD -> "Alert added";
            case INCIDENT_ALERT_DELETED -> "Alert removed";
            case INCIDENT_ALERT_STATUS_CHANGED -> "Alert status changed";
            case INCIDENT_ALERT_MOVED -> "Alert moved";
            case INCIDENT_ASSIGNED_TO -> "Incident assigned";
            case INCIDENT_ASSIGNED_CHANGE -> "Assignment changed";
            case INCIDENT_STATUS_CHANGE -> "Status changed";
            case INCIDENT_NOTE_ADD -> "Note added";
            case INCIDENT_NOTE_CHANGE -> "Note updated";
            case INCIDENT_COMMAND_EXECUTED -> "Command executed";
            default -> "Status changed";
        };
    }

    private String truncate(String text, int maxLen) {
        if (text == null) return null;
        return text.length() <= maxLen ? text : text.substring(0, maxLen) + "…";
    }
}
