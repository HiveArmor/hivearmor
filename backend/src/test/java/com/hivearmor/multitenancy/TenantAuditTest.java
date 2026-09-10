package com.hivearmor.multitenancy;

import com.hivearmor.domain.application_events.enums.ApplicationEventType;
import com.hivearmor.service.application_events.ApplicationEventService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

/**
 * P0A1-T17 — verifies cross-tenant denials are recorded as structured, secret-free
 * audit events, and that auditing degrades to a no-op (never throws) before the bean
 * is wired.
 */
class TenantAuditTest {

    @AfterEach
    void cleanUp() {
        TenantAudit.resetForTests();
        TenantContext.clear();
    }

    @Test
    void deniedAccessEmitsCrossTenantEventWithNoSecrets() {
        ApplicationEventService svc = mock(ApplicationEventService.class);
        new TenantAudit(svc); // publishes into the static bridge

        TenantAudit.crossTenantDenied("quarantineFile", "agent", "web-01", "target-outside-tenant");

        ArgumentCaptor<String> msg = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<ApplicationEventType> type = ArgumentCaptor.forClass(ApplicationEventType.class);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> details = ArgumentCaptor.forClass(Map.class);
        verify(svc).createEvent(msg.capture(), type.capture(), details.capture());

        assertThat(type.getValue()).isEqualTo(ApplicationEventType.CROSS_TENANT_DENIED);
        assertThat(details.getValue())
            .containsEntry("operation", "quarantineFile")
            .containsEntry("targetType", "agent")
            .containsEntry("targetId", "web-01")
            .containsEntry("decision", "DENY")
            .containsEntry("reason", "target-outside-tenant");
        // No secret-bearing keys leaked into the audit detail.
        assertThat(details.getValue().keySet())
            .doesNotContain("token", "password", "agentKey", "secret");
        assertThat(msg.getValue()).doesNotContainIgnoringCase("password");
    }

    @Test
    void auditIsNoOpWhenServiceNotWired() {
        // Bridge reset by @AfterEach of a prior test / fresh JVM — must not throw.
        TenantAudit.resetForTests();
        TenantAudit.crossTenantDenied("listAgents", "agent", 1, "no-tenant-scope");
        // Reaching here without an exception is the assertion.
    }
}
