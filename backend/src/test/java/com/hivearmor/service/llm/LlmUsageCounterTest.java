package com.hivearmor.service.llm;

import com.hivearmor.ai.ChatMessage;
import com.hivearmor.ai.HaLlmService;
import com.hivearmor.repository.UtmConfigurationParameterRepository;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import net.jqwik.api.ForAll;
import net.jqwik.api.Label;
import net.jqwik.api.Property;
import net.jqwik.api.constraints.IntRange;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Flux;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Unit + property tests for {@link LlmUsageCounter} and facade wiring (P1 LLMOps).
 */
@Label("Feature: p1-llmops, LlmUsageCounter increments")
class LlmUsageCounterTest {

    @Test
    void recordRequestIncrementsInMemoryCounter() {
        LlmUsageCounter counter = new LlmUsageCounter();
        assertThat(counter.getRequestCount()).isZero();
        counter.recordRequest();
        counter.recordRequest();
        assertThat(counter.getRequestCount()).isEqualTo(2L);
    }

    @Test
    void recordTokensIncrementsPromptCompletionAndTotal() {
        LlmUsageCounter counter = new LlmUsageCounter();
        counter.recordTokens(10, 5);
        counter.recordTokens(3, 2);
        assertThat(counter.getPromptTokenCount()).isEqualTo(13L);
        assertThat(counter.getCompletionTokenCount()).isEqualTo(7L);
        assertThat(counter.getTotalTokenCount()).isEqualTo(20L);
    }

    @Test
    void recordTokensIgnoresFullyUnknownUsage() {
        LlmUsageCounter counter = new LlmUsageCounter();
        counter.recordTokens(-1, -1);
        assertThat(counter.getPromptTokenCount()).isZero();
        assertThat(counter.getCompletionTokenCount()).isZero();
        assertThat(counter.getTotalTokenCount()).isZero();
    }

    @Test
    void micrometerRegistryReceivesIncrements() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        LlmUsageCounter counter = new LlmUsageCounter(registry);
        counter.recordRequest();
        counter.recordTokens(4, 6);

        assertThat(registry.find(LlmUsageCounter.METRIC_REQUESTS).counter()).isNotNull();
        assertThat(registry.find(LlmUsageCounter.METRIC_REQUESTS).counter().count()).isEqualTo(1.0d);
        assertThat(registry.find(LlmUsageCounter.METRIC_PROMPT_TOKENS).counter().count()).isEqualTo(4.0d);
        assertThat(registry.find(LlmUsageCounter.METRIC_COMPLETION_TOKENS).counter().count()).isEqualTo(6.0d);
        assertThat(registry.find(LlmUsageCounter.METRIC_TOTAL_TOKENS).counter().count()).isEqualTo(10.0d);
    }

    @Test
    void haLlmServiceChatIncrementsRequestCounter() throws Exception {
        LlmUsageCounter counter = new LlmUsageCounter();
        HaLlmService service = buildServiceWithMockProvider(counter, "ok", Flux.just("x"));

        String result = service.chat(List.of(new ChatMessage("user", "hi")), "system");
        assertThat(result).isEqualTo("ok");
        assertThat(counter.getRequestCount()).isEqualTo(1L);

        service.chat(List.of(new com.hivearmor.service.llm.ChatMessage("user", "hi")), null);
        assertThat(counter.getRequestCount()).isEqualTo(2L);
    }

    @Property(tries = 50)
    @Label("Property: N chat calls increment request counter by N")
    void property_nChatCalls_incrementByN(
            @ForAll @IntRange(min = 1, max = 20) int n) throws Exception {

        LlmUsageCounter counter = new LlmUsageCounter();
        HaLlmService service = buildServiceWithMockProvider(counter, "ok", Flux.just("x"));

        for (int i = 0; i < n; i++) {
            service.chat(List.of(new ChatMessage("user", "m" + i)), "sys");
        }
        assertThat(counter.getRequestCount()).isEqualTo(n);
    }

    private static HaLlmService buildServiceWithMockProvider(
            LlmUsageCounter counter,
            String chatReply,
            Flux<String> stream) throws Exception {

        HaLlmProvider provider = mock(HaLlmProvider.class);
        when(provider.providerName()).thenReturn("mock");
        when(provider.isConfigured()).thenReturn(true);
        when(provider.chat(anyList(), any())).thenReturn(chatReply);
        when(provider.streamChat(anyList(), any())).thenReturn(stream);

        DisabledLlmProvider disabled = new DisabledLlmProvider();
        ProviderRegistry registry = mock(ProviderRegistry.class);
        when(registry.disabled()).thenReturn(disabled);
        when(registry.forName(anyString())).thenReturn(Optional.of(provider));

        UtmConfigurationParameterRepository configRepo = mock(UtmConfigurationParameterRepository.class);
        when(configRepo.findByConfParamShort(anyString())).thenReturn(Optional.empty());

        HaLlmService service = new HaLlmService(registry, configRepo, counter);

        // Plant mock provider into active ref (bypass disabled fallback from empty config).
        @SuppressWarnings("unchecked")
        AtomicReference<HaLlmProvider> active =
            (AtomicReference<HaLlmProvider>) readableActiveField().get(service);
        active.set(provider);
        return service;
    }

    private static java.lang.reflect.Field readableActiveField() throws Exception {
        java.lang.reflect.Field f = HaLlmService.class.getDeclaredField("active");
        f.setAccessible(true);
        return f;
    }
}
