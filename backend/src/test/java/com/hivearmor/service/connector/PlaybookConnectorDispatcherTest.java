package com.hivearmor.service.connector;

import com.hivearmor.domain.connector.HaConnectorInstance;
import com.hivearmor.repository.connector.HaConnectorInstanceRepository;
import com.hivearmor.service.connector.impl.OktaConnector;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PlaybookConnectorDispatcherTest {

    @Mock
    private HaConnectorInstanceService instanceService;
    @Mock
    private HaConnectorInstanceRepository instanceRepository;

    private PlaybookConnectorDispatcher dispatcher;

    @BeforeEach
    void setUp() {
        dispatcher = new PlaybookConnectorDispatcher(
            instanceService,
            new HaConnectorRegistry(false),
            instanceRepository
        );
    }

    @Test
    void supportsKnownConnectorActions() {
        assertThat(dispatcher.supports("connector.test")).isTrue();
        assertThat(dispatcher.supports("pull_alerts")).isTrue();
        assertThat(dispatcher.supports("disable_user")).isTrue();
        assertThat(dispatcher.supports("isolate_host")).isFalse();
    }

    @Test
    void disableUserRequiresCapabilityAndInstance() {
        HaConnectorInstance row = new HaConnectorInstance();
        row.setId(9L);
        row.setConnectorId(OktaConnector.ID);
        row.setEnabled(true);
        when(instanceRepository.findById(9L)).thenReturn(Optional.of(row));

        Map<String, Object> out = dispatcher.dispatch(
            "disable_user",
            Map.of("connectorInstanceId", 9L)
        );
        assertThat(out.get("status")).isEqualTo("capability_resolved");
        assertThat(out.get("connectorId")).isEqualTo(OktaConnector.ID);
    }

    @Test
    void pullAlertsRequiresInstanceId() {
        assertThatThrownBy(() -> dispatcher.dispatch("pull_alerts", Map.of()))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("connectorInstanceId");
    }

    @Test
    void resolvesByConnectorId() {
        HaConnectorInstance row = new HaConnectorInstance();
        row.setId(3L);
        row.setConnectorId(OktaConnector.ID);
        row.setEnabled(true);
        when(instanceRepository.findByConnectorIdOrderByNameAsc(OktaConnector.ID))
            .thenReturn(List.of(row));

        Map<String, Object> out = dispatcher.dispatch(
            "disable_user",
            Map.of("connectorId", OktaConnector.ID)
        );
        assertThat(out.get("connectorInstanceId")).isEqualTo(3L);
    }
}
