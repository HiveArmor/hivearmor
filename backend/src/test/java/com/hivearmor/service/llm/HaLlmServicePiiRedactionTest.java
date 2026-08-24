package com.hivearmor.service.llm;

import com.hivearmor.ai.ChatMessage;
import com.hivearmor.ai.HaLlmService;
import com.hivearmor.repository.UtmConfigurationParameterRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Verifies {@link HaLlmService} redacts PII before calling the active provider
 * and never logs prompt bodies (P1 — STAGING CANDIDATE).
 */
class HaLlmServicePiiRedactionTest {

    private HaLlmProvider provider;
    private HaLlmService service;

    @BeforeEach
    void setUp() throws Exception {
        provider = mock(HaLlmProvider.class);
        when(provider.providerName()).thenReturn("mock");
        when(provider.chat(anyList(), any())).thenReturn("ok");

        ProviderRegistry registry = mock(ProviderRegistry.class);
        when(registry.disabled()).thenReturn(new DisabledLlmProvider());
        when(registry.forName(any())).thenReturn(Optional.of(provider));

        UtmConfigurationParameterRepository configRepo =
            mock(UtmConfigurationParameterRepository.class);
        when(configRepo.findByConfParamShort(any())).thenReturn(Optional.empty());

        service = new HaLlmService(registry, configRepo, new LlmUsageCounter(), HaPiiRedactor.enabled());

        @SuppressWarnings("unchecked")
        AtomicReference<HaLlmProvider> active =
            (AtomicReference<HaLlmProvider>) readableActiveField().get(service);
        active.set(provider);
    }

    @Test
    void legacyChatRedactsUserAndSystemBodiesBeforeProvider() {
        when(provider.chat(anyList(), any())).thenReturn("triage");

        service.chat(
            List.of(new ChatMessage("user", "alert from alice@corp.example at 10.0.0.5")),
            "Context: src 10.0.0.5");

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<com.hivearmor.service.llm.ChatMessage>> captor =
            ArgumentCaptor.forClass(List.class);
        verify(provider).chat(captor.capture(), any());

        List<com.hivearmor.service.llm.ChatMessage> sent = captor.getValue();
        assertThat(sent).hasSize(2);
        assertThat(sent.get(0).content()).isEqualTo("Context: src [IP_1]");
        assertThat(sent.get(1).content()).isEqualTo("alert from [EMAIL_1] at [IP_1]");
        assertThat(sent.get(0).content() + sent.get(1).content())
            .doesNotContain("alice@")
            .doesNotContain("10.0.0.5");
    }

    @Test
    void sprint27ChatRedactsMessageList() {
        service.chat(
            List.of(new com.hivearmor.service.llm.ChatMessage(
                "user", "ssn 123-45-6789")),
            null);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<com.hivearmor.service.llm.ChatMessage>> captor =
            ArgumentCaptor.forClass(List.class);
        verify(provider).chat(captor.capture(), any());
        assertThat(captor.getValue().get(0).content()).isEqualTo("ssn [SSN_1]");
    }

    private static java.lang.reflect.Field readableActiveField() throws Exception {
        java.lang.reflect.Field f = HaLlmService.class.getDeclaredField("active");
        f.setAccessible(true);
        return f;
    }
}
