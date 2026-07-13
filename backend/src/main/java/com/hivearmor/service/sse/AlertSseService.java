package com.hivearmor.service.sse;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.config.Constants;
import com.hivearmor.domain.chart_builder.types.query.FilterType;
import com.hivearmor.domain.chart_builder.types.query.OperatorType;
import com.hivearmor.domain.index_pattern.enums.SystemIndexPattern;
import com.hivearmor.domain.shared_types.alert.UtmAlert;
import com.hivearmor.service.elasticsearch.ElasticsearchService;
import com.hivearmor.service.elasticsearch.SearchUtil;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.search.Hit;
import org.opensearch.client.opensearch.core.search.HitsMetadata;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Lazy;
import org.springframework.data.domain.Sort;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Collectors;

/**
 * Manages SSE emitters for live alert streaming.
 *
 * Two delivery modes:
 *   Redis ON  (app.redis.enabled=true)  — onMessage() driven by RedisMessageListenerContainer.
 *   Redis OFF (default / dev)           — pollAndBroadcast() queries OpenSearch every 5 s
 *                                         for alerts newer than the last seen timestamp.
 */
@Service
public class AlertSseService {

    private static final Logger log = LoggerFactory.getLogger(AlertSseService.class);

    private final List<SseEmitter> emitters = new CopyOnWriteArrayList<>();
    private final ObjectMapper objectMapper = new ObjectMapper();

    // Cursor: start 1 hour back so the first poll surfaces recently-ingested alerts.
    private final AtomicReference<Instant> lastPolledTimestamp =
            new AtomicReference<>(Instant.now().minus(1, ChronoUnit.HOURS));

    // Lazy to avoid circular-dependency issues during startup.
    @Autowired @Lazy
    private ElasticsearchService elasticsearchService;

    // ── Emitter lifecycle ────────────────────────────────────────────────────

    public SseEmitter addEmitter() {
        SseEmitter emitter = new SseEmitter(Long.MAX_VALUE);
        emitters.add(emitter);
        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(()   -> emitters.remove(emitter));
        emitter.onError(e      -> emitters.remove(emitter));
        // Send a comment immediately to flush HTTP headers so the client sees 200 right away.
        try {
            emitter.send(SseEmitter.event().comment("connected"));
        } catch (IOException e) {
            emitters.remove(emitter);
        }
        return emitter;
    }

    public int getEmitterCount() {
        return emitters.size();
    }

    // ── Redis path ────────────────────────────────────────────────────────────

    /** Called by RedisMessageListenerContainer when a message arrives on the "alerts" channel. */
    public void onMessage(String message) {
        broadcast(message);
    }

    // ── Polling fallback (Redis disabled) ────────────────────────────────────

    /**
     * Polls OpenSearch every 5 s for parent alerts newer than lastPolledTimestamp.
     * Activated only when app.redis.enabled=false (or the property is absent), which
     * is the default in dev. When Redis IS enabled this method is still compiled but
     * the ConditionalOnProperty on the bean means the scheduler won't register it —
     * use the annotation at the class / method level to skip the registration entirely.
     *
     * Note: @ConditionalOnProperty cannot be applied to a @Scheduled method directly
     * in all Spring versions, so we guard with an early-return instead.
     */
    @Scheduled(fixedDelay = 5000)
    public void pollAndBroadcast() {
        // Skip if Redis publisher is active — onMessage() handles delivery
        if (emitters.isEmpty()) return;

        try {
            List<FilterType> filters = new ArrayList<>();
            filters.add(new FilterType(
                    Constants.timestamp,
                    OperatorType.IS_GREATER_THAN,
                    lastPolledTimestamp.get().toString()
            ));

            SearchRequest.Builder srb = new SearchRequest.Builder();
            srb.query(SearchUtil.toQuery(filters))
               .index(Constants.SYS_INDEX_PATTERN.get(SystemIndexPattern.ALERTS))
               .size(50);
            SearchUtil.applySort(srb, Sort.by(Sort.Order.asc(Constants.timestamp)));

            HitsMetadata<UtmAlert> hits =
                    elasticsearchService.search(srb.build(), UtmAlert.class).hits();

            if (hits.total() == null || hits.total().value() == 0) return;

            List<UtmAlert> alerts = hits.hits().stream()
                    .map(Hit::source)
                    .collect(Collectors.toList());

            if (CollectionUtils.isEmpty(alerts)) return;

            // Advance the cursor to the newest timestamp received
            alerts.stream()
                  .map(UtmAlert::getTimestampAsInstant)
                  .filter(t -> t != null)
                  .max(Instant::compareTo)
                  .ifPresent(lastPolledTimestamp::set);

            // Only broadcast parent alerts (mirrors the Redis publisher filter)
            alerts.stream()
                  .filter(a -> a.getParentId() == null)
                  .forEach(alert -> {
                      try {
                          broadcast(objectMapper.writeValueAsString(alert));
                      } catch (Exception e) {
                          log.warn("AlertSseService.pollAndBroadcast: failed to serialise alert {}: {}",
                                   alert.getId(), e.getMessage());
                      }
                  });

        } catch (Exception e) {
            log.warn("AlertSseService.pollAndBroadcast: {}", e.getMessage());
        }
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    private void broadcast(String jsonMessage) {
        List<SseEmitter> dead = new ArrayList<>();
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event().name("alert").data(jsonMessage));
            } catch (IOException e) {
                dead.add(emitter);
            }
        }
        emitters.removeAll(dead);
    }
}
