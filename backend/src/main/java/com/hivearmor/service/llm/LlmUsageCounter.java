package com.hivearmor.service.llm;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.annotation.Nullable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicLong;

/**
 * Minimal LLM usage counters at the {@code HaLlmService} facade (P1 LLMOps — STAGING CANDIDATE).
 *
 * <p>Tracks request count plus prompt / completion / total tokens when callers supply them.
 * Uses Micrometer when a {@link MeterRegistry} bean is present; otherwise falls back to
 * in-memory {@link AtomicLong}s. Does not persist a cost ledger or expose a cost UI.
 */
@Component
public class LlmUsageCounter {

    static final String METRIC_REQUESTS = "hivearmor.llm.requests";
    static final String METRIC_PROMPT_TOKENS = "hivearmor.llm.tokens.prompt";
    static final String METRIC_COMPLETION_TOKENS = "hivearmor.llm.tokens.completion";
    static final String METRIC_TOTAL_TOKENS = "hivearmor.llm.tokens.total";

    private final AtomicLong requests = new AtomicLong();
    private final AtomicLong promptTokens = new AtomicLong();
    private final AtomicLong completionTokens = new AtomicLong();
    private final AtomicLong totalTokens = new AtomicLong();

    @Nullable
    private final Counter micrometerRequests;
    @Nullable
    private final Counter micrometerPromptTokens;
    @Nullable
    private final Counter micrometerCompletionTokens;
    @Nullable
    private final Counter micrometerTotalTokens;

    /** In-memory-only counter (tests / no MeterRegistry). */
    public LlmUsageCounter() {
        this(null);
    }

    @Autowired
    public LlmUsageCounter(@Nullable MeterRegistry meterRegistry) {
        if (meterRegistry != null) {
            this.micrometerRequests = Counter.builder(METRIC_REQUESTS)
                .description("LLM chat/stream request count")
                .register(meterRegistry);
            this.micrometerPromptTokens = Counter.builder(METRIC_PROMPT_TOKENS)
                .description("LLM prompt tokens (when reported)")
                .register(meterRegistry);
            this.micrometerCompletionTokens = Counter.builder(METRIC_COMPLETION_TOKENS)
                .description("LLM completion tokens (when reported)")
                .register(meterRegistry);
            this.micrometerTotalTokens = Counter.builder(METRIC_TOTAL_TOKENS)
                .description("LLM total tokens (when reported)")
                .register(meterRegistry);
        } else {
            this.micrometerRequests = null;
            this.micrometerPromptTokens = null;
            this.micrometerCompletionTokens = null;
            this.micrometerTotalTokens = null;
        }
    }

    /** Increments the LLM request counter by one. */
    public void recordRequest() {
        requests.incrementAndGet();
        if (micrometerRequests != null) {
            micrometerRequests.increment();
        }
    }

    /**
     * Records token usage when the provider reports it.
     *
     * <p>Negative values are ignored. Total is {@code prompt + completion} when both
     * are non-negative; if only one side is known, total equals that side.
     *
     * @param promptTokenCount     prompt tokens, or a negative value if unknown
     * @param completionTokenCount completion tokens, or a negative value if unknown
     */
    public void recordTokens(long promptTokenCount, long completionTokenCount) {
        long prompt = Math.max(promptTokenCount, 0L);
        long completion = Math.max(completionTokenCount, 0L);
        if (promptTokenCount < 0 && completionTokenCount < 0) {
            return;
        }
        if (promptTokenCount >= 0) {
            promptTokens.addAndGet(prompt);
            if (micrometerPromptTokens != null) {
                micrometerPromptTokens.increment(prompt);
            }
        }
        if (completionTokenCount >= 0) {
            completionTokens.addAndGet(completion);
            if (micrometerCompletionTokens != null) {
                micrometerCompletionTokens.increment(completion);
            }
        }
        long total = (promptTokenCount >= 0 ? prompt : 0L) + (completionTokenCount >= 0 ? completion : 0L);
        if (total > 0) {
            totalTokens.addAndGet(total);
            if (micrometerTotalTokens != null) {
                micrometerTotalTokens.increment(total);
            }
        }
    }

    public long getRequestCount() {
        return requests.get();
    }

    public long getPromptTokenCount() {
        return promptTokens.get();
    }

    public long getCompletionTokenCount() {
        return completionTokens.get();
    }

    public long getTotalTokenCount() {
        return totalTokens.get();
    }
}
