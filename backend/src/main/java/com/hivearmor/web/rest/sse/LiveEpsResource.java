package com.hivearmor.web.rest.sse;

import com.hivearmor.service.sse.EpsSseService;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * GET /api/eps/stream — SSE endpoint for live EPS counter.
 * Emits event name="eps" with numeric data every 5 seconds.
 */
@RestController
@RequestMapping("/api")
public class LiveEpsResource {

    private final EpsSseService epsSseService;

    public LiveEpsResource(EpsSseService epsSseService) {
        this.epsSseService = epsSseService;
    }

    @GetMapping(value = "/eps/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamEps() {
        return epsSseService.addEmitter();
    }
}
