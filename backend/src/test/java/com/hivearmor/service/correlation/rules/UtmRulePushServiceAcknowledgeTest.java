package com.hivearmor.service.correlation.rules;

import com.hivearmor.domain.correlation.rules.UtmRulePushLog;
import com.hivearmor.repository.correlation.rules.UtmRulePushLogRepository;
import com.hivearmor.service.incident_response.grpc_impl.IncidentResponseCommandService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * BE-POL-02 rule push ACK unit tests.
 * STAGING CANDIDATE — not PRODUCTION READY.
 */
@ExtendWith(MockitoExtension.class)
class UtmRulePushServiceAcknowledgeTest {

    @Mock
    private UtmRulePushLogRepository pushLogRepository;
    @Mock
    private IncidentResponseCommandService incidentResponseCommandService;

    private UtmRulePushService service;

    @BeforeEach
    void setUp() {
        service = new UtmRulePushService(pushLogRepository, incidentResponseCommandService);
    }

    @Test
    void acknowledgePushMarksLatestLogAcknowledged() {
        UtmRulePushLog log = new UtmRulePushLog();
        log.setId(9L);
        log.setRuleId(3L);
        log.setAgentId("42");
        log.setPushStatus("DELIVERED");
        log.setPushedAt(Instant.now());
        when(pushLogRepository.findByRuleIdAndAgentIdOrderByPushedAtDesc(3L, "42"))
            .thenReturn(List.of(log));
        when(pushLogRepository.save(any(UtmRulePushLog.class))).thenAnswer(inv -> inv.getArgument(0));

        boolean updated = service.acknowledgePush(3L, "42");

        assertThat(updated).isTrue();
        ArgumentCaptor<UtmRulePushLog> captor = ArgumentCaptor.forClass(UtmRulePushLog.class);
        verify(pushLogRepository).save(captor.capture());
        assertThat(captor.getValue().getPushStatus()).isEqualTo("ACKNOWLEDGED");
        assertThat(captor.getValue().getAckAt()).isNotNull();
    }

    @Test
    void acknowledgePushReturnsFalseWhenNoLog() {
        when(pushLogRepository.findByRuleIdAndAgentIdOrderByPushedAtDesc(3L, "42"))
            .thenReturn(List.of());
        assertThat(service.acknowledgePush(3L, "42")).isFalse();
    }

    @Test
    void acknowledgePushRequiresIds() {
        assertThatThrownBy(() -> service.acknowledgePush(null, "42"))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.acknowledgePush(1L, " "))
            .isInstanceOf(IllegalArgumentException.class);
    }
}
