package com.hivearmor.web.rest.sse;

import com.hivearmor.service.sse.AlertSseService;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * GET /api/alerts/stream — SSE endpoint for live alert events.
 * Each event has name="alert" and data=JSON of UtmAlert.
 */
@RestController
@RequestMapping("/api")
public class AlertSseResource {

    private final AlertSseService alertSseService;

    public AlertSseResource(AlertSseService alertSseService) {
        this.alertSseService = alertSseService;
    }

    @GetMapping(value = "/alerts/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamAlerts() {
        return alertSseService.addEmitter();
    }
}
