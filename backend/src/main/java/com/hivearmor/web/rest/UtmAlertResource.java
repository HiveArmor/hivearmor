package com.hivearmor.web.rest;

import com.hivearmor.aop.logging.AuditEvent;
import com.hivearmor.domain.application_events.enums.ApplicationEventType;
import com.hivearmor.service.UtmAlertService;
import com.hivearmor.service.application_events.ApplicationEventService;
import com.hivearmor.service.dto.alert.ConvertToIncidentRequestBody;
import com.hivearmor.service.dto.alert.UpdateAlertStatusRequestBody;
import com.hivearmor.service.dto.alert.UpdateAlertTagsRequestBody;
import com.hivearmor.util.AlertUtil;
import com.hivearmor.util.ResponseUtil;
import com.hivearmor.util.enums.AlertStatus;
import com.hivearmor.web.rest.util.HeaderUtil;
import lombok.Data;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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
    private final Logger log = LoggerFactory.getLogger(UtmAlertResource.class);

    private final UtmAlertService utmAlertService;
    private final ApplicationEventService applicationEventService;
    private final AlertUtil alertUtil;

    public UtmAlertResource(UtmAlertService utmAlertService,
                            ApplicationEventService applicationEventService,
                            AlertUtil alertUtil) {
        this.utmAlertService = utmAlertService;
        this.applicationEventService = applicationEventService;
        this.alertUtil = alertUtil;
    }

    @PostMapping("/ha-alerts/status")
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

        return ResponseEntity.ok().build();
    }

    @PostMapping("/ha-alerts/notes")
    @AuditEvent(
            attemptType = ApplicationEventType.ALERT_NOTE_UPDATE_ATTEMPT,
            attemptMessage = "Attempt to update alert notes initiated",
            successType = ApplicationEventType.ALERT_NOTE_UPDATE_SUCCESS,
            successMessage = "Alert notes updated successfully"
    )
    public ResponseEntity<Void> updateAlertNotes(@RequestBody(required = false) String notes, @RequestParam String alertId) {
        final String ctx = CLASSNAME + ".updateAlertNotes";
        utmAlertService.updateNotes(alertId, notes);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/ha-alerts/tags")
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
    @AuditEvent(
            attemptType = ApplicationEventType.ALERT_CONVERT_TO_INCIDENT_ATTEMPT,
            attemptMessage = "Attempt to convert alerts to incident initiated",
            successType = ApplicationEventType.ALERT_CONVERT_TO_INCIDENT_SUCCESS,
            successMessage = "Alerts converted to incident successfully"
    )
    public ResponseEntity<Void> convertToIncident(@RequestBody @Valid ConvertToIncidentRequestBody body) {
        final String ctx = CLASSNAME + ".convertToIncident";

        utmAlertService.convertToIncident(body.getEventIds(), body.getIncidentName(),body.getIncidentId(), body.getIncidentSource());
        return ResponseEntity.ok().build();

    }

    @GetMapping("/ha-alerts/count-open-alerts")
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
