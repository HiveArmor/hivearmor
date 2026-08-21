package com.hivearmor.web.rest;

import com.hivearmor.aop.logging.AuditEvent;
import com.hivearmor.domain.application_events.enums.ApplicationEventType;
import com.hivearmor.domain.rulegen.HaAlertSignal;
import com.hivearmor.service.UtmAlertService;
import com.hivearmor.service.incident.UtmIncidentService;
import com.hivearmor.service.dto.incident.ConvertedIncidentDTO;
import com.hivearmor.service.application_events.ApplicationEventService;
import com.hivearmor.service.dto.alert.ConvertToIncidentRequestBody;
import com.hivearmor.service.dto.alert.UpdateAlertNotesRequestBody;
import com.hivearmor.service.dto.alert.UpdateAlertStatusRequestBody;
import com.hivearmor.service.dto.alert.UpdateAlertTagsRequestBody;
import com.hivearmor.service.rulegen.HaAlertSignalService;
import com.hivearmor.util.AlertUtil;
import com.hivearmor.util.ResponseUtil;
import com.hivearmor.util.enums.AlertStatus;
import com.hivearmor.web.rest.util.HeaderUtil;
import lombok.Data;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.io.IOException;
import java.util.List;

/**
 * REST controller for managing UtmAlert.
 */
@RestController
@RequestMapping("/api")
public class UtmAlertResource {

    private static final String CLASSNAME = "UtmAlertResource";
    private static final String ALERT_MUTATION_AUTH =
        "hasAuthority('ROLE_SOC_ANALYST') or hasAuthority('ROLE_SOC_MANAGER') " +
        "or hasAuthority('ROLE_ANALYST') or hasAuthority('ROLE_ADMIN')";
    private final Logger log = LoggerFactory.getLogger(UtmAlertResource.class);

    private final UtmAlertService utmAlertService;
    private final UtmIncidentService utmIncidentService;
    private final ApplicationEventService applicationEventService;
    private final AlertUtil alertUtil;
    private final HaAlertSignalService haAlertSignalService;

    public UtmAlertResource(UtmAlertService utmAlertService,
                            UtmIncidentService utmIncidentService,
                            ApplicationEventService applicationEventService,
                            AlertUtil alertUtil,
                            HaAlertSignalService haAlertSignalService) {
        this.utmAlertService = utmAlertService;
        this.utmIncidentService = utmIncidentService;
        this.applicationEventService = applicationEventService;
        this.alertUtil = alertUtil;
        this.haAlertSignalService = haAlertSignalService;
    }

    @PostMapping("/ha-alerts/status")
    @PreAuthorize(ALERT_MUTATION_AUTH)
    @AuditEvent(
            attemptType = ApplicationEventType.ALERT_UPDATE_ATTEMPT,
            attemptMessage = "Attempt to update alert status initiated",
            successType = ApplicationEventType.ALERT_UPDATE_SUCCESS,
            successMessage = "Alert status updated successfully"
    )
    public ResponseEntity<Void> updateAlertStatus(@RequestBody UpdateAlertStatusRequestBody rq) throws IOException {
        final String ctx = CLASSNAME + ".updateAlertStatus";
        if (rq.getStatus() == AlertStatus.COMPLETED.getCode() && rq.isAddFalsePositiveTag()) {
            utmAlertService.updateStatusAndTag(rq.getAlertIds(), rq.getStatus(), rq.getStatusObservation());
        }
        utmAlertService.updateStatus(rq.getAlertIds(), rq.getStatus(), rq.getStatusObservation());

        // Sprint 28: Record UEBA signals for TRUE_POSITIVE / FALSE_POSITIVE transitions.
        // Try/catch is scoped per-alert so one failing signal does not skip the remaining alerts.
        if (rq.getStatus() == AlertStatus.TRUE_POSITIVE.getCode()
            || rq.getStatus() == AlertStatus.FALSE_POSITIVE.getCode()) {

            HaAlertSignal.SignalType signalType = (rq.getStatus() == AlertStatus.TRUE_POSITIVE.getCode())
                ? HaAlertSignal.SignalType.TRUE_POSITIVE
                : HaAlertSignal.SignalType.FALSE_POSITIVE;

            for (String alertId : rq.getAlertIds()) {
                try {
                    haAlertSignalService.recordSignal(alertId, signalType);
                } catch (Exception e) {
                    // EXCEPTION ISOLATION — never bubble to the caller.
                    log.warn("signal recording failed for alert={} type={}: {}",
                        alertId, signalType, e.toString());
                }
            }
        }

        return ResponseEntity.ok().build();
    }

    @PostMapping("/ha-alerts/notes")
    @PreAuthorize(ALERT_MUTATION_AUTH)
    @AuditEvent(
            attemptType = ApplicationEventType.ALERT_NOTE_UPDATE_ATTEMPT,
            attemptMessage = "Attempt to update alert notes initiated",
            successType = ApplicationEventType.ALERT_NOTE_UPDATE_SUCCESS,
            successMessage = "Alert notes updated successfully"
    )
    public ResponseEntity<Void> updateAlertNotes(
            @RequestBody(required = false) UpdateAlertNotesRequestBody body,
            @RequestParam(required = false) String alertId) throws IOException {
        final String ctx = CLASSNAME + ".updateAlertNotes";
        if (body != null && body.getAlertIds() != null && !body.getAlertIds().isEmpty()) {
            for (String id : body.getAlertIds()) {
                utmAlertService.updateNotes(id, body.getNote());
            }
            return ResponseEntity.ok().build();
        }
        if (alertId != null && !alertId.isBlank() && body != null) {
            utmAlertService.updateNotes(alertId, body.getNote());
            return ResponseEntity.ok().build();
        }
        return ResponseEntity.badRequest().build();
    }

    @PostMapping("/ha-alerts/tags")
    @PreAuthorize(ALERT_MUTATION_AUTH)
    @AuditEvent(
            attemptType = ApplicationEventType.ALERT_TAG_UPDATE_ATTEMPT,
            attemptMessage = "Attempt to update alert tags initiated",
            successType = ApplicationEventType.ALERT_TAG_UPDATE_SUCCESS,
            successMessage = "Alert tags updated successfully"
    )
    public ResponseEntity<Void> updateAlertTags(@RequestBody @Valid UpdateAlertTagsRequestBody body) {
        final String ctx = CLASSNAME + ".updateAlertTags";
        utmAlertService.updateTags(body.getAlertIds(), body.getTags(), body.getCreateRule());
        return ResponseEntity.ok().build();
    }

    @PostMapping("/ha-alerts/convert-to-incident")
    @PreAuthorize(ALERT_MUTATION_AUTH)
    @AuditEvent(
            attemptType = ApplicationEventType.ALERT_CONVERT_TO_INCIDENT_ATTEMPT,
            attemptMessage = "Attempt to convert alerts to incident initiated",
            successType = ApplicationEventType.ALERT_CONVERT_TO_INCIDENT_SUCCESS,
            successMessage = "Alerts converted to incident successfully"
    )
    public ResponseEntity<ConvertedIncidentDTO> convertToIncident(@RequestBody @Valid ConvertToIncidentRequestBody body) {
        final String ctx = CLASSNAME + ".convertToIncident";
        if (body.resolvedAlertIds() == null || body.resolvedAlertIds().isEmpty()
                || body.getIncidentName() == null || body.getIncidentName().isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        ConvertedIncidentDTO created = utmIncidentService.convertAlertsToIncident(
                body.resolvedAlertIds(),
                body.getIncidentName(),
                body.resolvedIncidentId(),
                body.resolvedIncidentSource());
        return ResponseEntity.ok(created);
    }

    @GetMapping("/ha-alerts/count-open-alerts")
    @PreAuthorize(ALERT_MUTATION_AUTH)
    public ResponseEntity<Long> countOpenAlerts() {
        final String ctx = CLASSNAME + ".countOpenAlerts";
        try {
            return ResponseEntity.ok(alertUtil.countAlertsByStatus(2));
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }
}
