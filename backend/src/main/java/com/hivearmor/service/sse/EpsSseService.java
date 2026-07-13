package com.hivearmor.service.sse;

import com.hivearmor.service.UtmDataInputStatusService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicLong;

@Service
public class EpsSseService {

    private static final Logger log = LoggerFactory.getLogger(EpsSseService.class);

    private final UtmDataInputStatusService dataInputStatusService;
    private final List<SseEmitter> emitters = new CopyOnWriteArrayList<>();
    private final AtomicLong currentEps = new AtomicLong(0);

    public EpsSseService(UtmDataInputStatusService dataInputStatusService) {
        this.dataInputStatusService = dataInputStatusService;
    }

    public SseEmitter addEmitter() {
        SseEmitter emitter = new SseEmitter(Long.MAX_VALUE);
        emitters.add(emitter);
        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(() -> emitters.remove(emitter));
        emitter.onError(e -> emitters.remove(emitter));

        // Send current value immediately on connect
        try {
            emitter.send(SseEmitter.event().name("eps").data(currentEps.get()));
        } catch (IOException e) {
            emitters.remove(emitter);
        }
        return emitter;
    }

    @Scheduled(fixedDelay = 5000)
    public void broadcastEps() {
        long eps = computeEps();
        currentEps.set(eps);

        List<SseEmitter> dead = new ArrayList<>();
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event().name("eps").data(eps));
            } catch (IOException e) {
                dead.add(emitter);
            }
        }
        emitters.removeAll(dead);
    }

    private long computeEps() {
        try {
            var page = dataInputStatusService.findImportantDatasource(PageRequest.of(0, 1000));
            long nowSeconds = System.currentTimeMillis() / 1000;
            return page.getContent().stream()
                .filter(s -> s.getTimestamp() != null && s.getMedian() != null && s.getMedian() > 0)
                .filter(s -> (nowSeconds - s.getTimestamp()) < (s.getMedian() / 1000.0 * 2))
                .mapToLong(s -> Math.max(1L, Math.round(1000.0 / s.getMedian())))
                .sum();
        } catch (Exception e) {
            log.warn("Failed to compute EPS: {}", e.getMessage());
            return currentEps.get();
        }
    }
}
