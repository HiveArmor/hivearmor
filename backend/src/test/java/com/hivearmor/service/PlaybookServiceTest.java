package com.hivearmor.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.soar_playbook.UtmPlaybook;
import com.hivearmor.domain.soar_playbook.UtmPlaybookExecution;
import com.hivearmor.repository.soar_playbook.UtmPlaybookExecutionRepository;
import com.hivearmor.repository.soar_playbook.UtmPlaybookRepository;
import com.hivearmor.service.dto.PlaybookDTO;
import com.hivearmor.service.dto.PlaybookExecuteRequestDTO;
import com.hivearmor.service.dto.PlaybookStepDTO;
import com.hivearmor.service.edr.EdrService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for the P0 unstubbed {@link PlaybookService} persistence + step engine.
 */
@ExtendWith(MockitoExtension.class)
class PlaybookServiceTest {

    @Mock
    private PlaybookExecutionStreamService streamService;
    @Mock
    private UtmPlaybookRepository playbookRepository;
    @Mock
    private UtmPlaybookExecutionRepository executionRepository;
    @Mock
    private EdrService edrService;
    @Mock
    private com.hivearmor.service.soar.PlaybookWebhookExecutor webhookExecutor;
    @Mock
    private com.hivearmor.service.connector.PlaybookConnectorDispatcher connectorDispatcher;

    private PlaybookService service;

    @BeforeEach
    void setUp() {
        service = new PlaybookService(
            streamService,
            new ObjectMapper(),
            playbookRepository,
            executionRepository,
            edrService,
            webhookExecutor,
            connectorDispatcher
        );
    }

    @Test
    void findAll_mapsPersistedPlaybooks() {
        UtmPlaybook entity = new UtmPlaybook();
        entity.setId(42L);
        entity.setName("Endpoint Isolation");
        entity.setDescription("Isolate then notify");
        entity.setIsActive(true);
        entity.setDefinitionJson("{\"triggerType\":\"alert-triggered\"}");
        entity.setStepsJson("[{\"stepIndex\":0,\"stepType\":\"delay\",\"label\":\"Wait\",\"config\":{\"delaySeconds\":0}}]");

        when(playbookRepository.findAll()).thenReturn(List.of(entity));
        when(executionRepository.findByPlaybookIdOrderByStartedAtDesc(42L)).thenReturn(List.of());

        List<PlaybookDTO> result = service.findAll();

        assertThat(result).hasSize(1);
        assertThat(result.get(0).getId()).isEqualTo(42L);
        assertThat(result.get(0).getName()).isEqualTo("Endpoint Isolation");
        assertThat(result.get(0).getTriggerType()).isEqualTo("alert-triggered");
        assertThat(result.get(0).getActive()).isTrue();
        assertThat(result.get(0).getSteps()).hasSize(1);
        assertThat(result.get(0).getRunCount()).isZero();
    }

    @Test
    void update_persistsStepsAndName() {
        UtmPlaybook existing = new UtmPlaybook();
        existing.setId(7L);
        existing.setName("Old");
        existing.setIsActive(false);
        existing.setDefinitionJson("{}");
        existing.setStepsJson("[]");

        when(playbookRepository.findById(7L)).thenReturn(Optional.of(existing));
        when(playbookRepository.save(any(UtmPlaybook.class))).thenAnswer(inv -> inv.getArgument(0));
        when(executionRepository.findByPlaybookIdOrderByStartedAtDesc(7L)).thenReturn(List.of());

        PlaybookDTO dto = new PlaybookDTO();
        dto.setName("Updated");
        dto.setActive(true);
        dto.setTriggerType("manual");
        PlaybookStepDTO step = new PlaybookStepDTO();
        step.setStepIndex(0);
        step.setStepType("delay");
        step.setLabel("Pause");
        Map<String, Object> cfg = new HashMap<>();
        cfg.put("delaySeconds", 0);
        step.setConfig(cfg);
        dto.setSteps(List.of(step));

        Optional<PlaybookDTO> updated = service.update(7L, dto);

        assertThat(updated).isPresent();
        assertThat(updated.get().getName()).isEqualTo("Updated");
        assertThat(updated.get().getActive()).isTrue();
        assertThat(existing.getStepsJson()).contains("Pause");
        verify(playbookRepository).save(existing);
    }

    @Test
    void setActive_updatesFlag() {
        UtmPlaybook existing = new UtmPlaybook();
        existing.setId(3L);
        existing.setName("PB");
        existing.setIsActive(false);
        when(playbookRepository.findById(3L)).thenReturn(Optional.of(existing));
        when(playbookRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        service.setActive(3L, true);

        assertThat(existing.getIsActive()).isTrue();
        verify(playbookRepository).save(existing);
    }

    @Test
    void execute_persistsRunningRowWithUuid() {
        UtmPlaybook pb = new UtmPlaybook();
        pb.setId(9L);
        pb.setName("Manual Triage");
        pb.setDefinitionJson("{\"triggerType\":\"manual\"}");
        pb.setStepsJson("[{\"stepIndex\":0,\"stepType\":\"delay\",\"label\":\"Wait\",\"config\":{\"delaySeconds\":0}}]");
        when(playbookRepository.findById(9L)).thenReturn(Optional.of(pb));
        when(executionRepository.save(any(UtmPlaybookExecution.class))).thenAnswer(inv -> inv.getArgument(0));

        String uuid = service.execute(9L);

        assertThat(uuid).isNotBlank();
        ArgumentCaptor<UtmPlaybookExecution> captor = ArgumentCaptor.forClass(UtmPlaybookExecution.class);
        verify(executionRepository).save(captor.capture());
        assertThat(captor.getValue().getExecutionUuid()).isEqualTo(uuid);
        assertThat(captor.getValue().getStatus()).isEqualTo("running");
        assertThat(captor.getValue().getTotalSteps()).isEqualTo(1);
    }

    @Test
    void executeAsync_runsDelayStepAndCompletes() throws Exception {
        UtmPlaybook pb = new UtmPlaybook();
        pb.setId(11L);
        pb.setName("Delay Only");
        pb.setStepsJson("[{\"stepIndex\":0,\"stepType\":\"delay\",\"label\":\"Wait\",\"config\":{\"delaySeconds\":0}}]");

        UtmPlaybookExecution exec = new UtmPlaybookExecution();
        exec.setId(100L);
        exec.setPlaybookId(11L);
        exec.setPlaybookName("Delay Only");
        exec.setExecutionUuid("exec-uuid-1");
        exec.setStatus("running");
        exec.setTriggerType("manual");
        exec.setTriggeredBy("admin");
        exec.setStartedAt(java.time.Instant.now());
        exec.setTotalSteps(1);
        exec.setCompletedSteps(0);

        when(playbookRepository.findById(11L)).thenReturn(Optional.of(pb));
        when(executionRepository.findByExecutionUuid("exec-uuid-1")).thenReturn(Optional.of(exec));
        when(executionRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        service.executeAsync("exec-uuid-1", 11L);
        // @Async is sync when called directly on the instance (no proxy)
        TimeUnit.MILLISECONDS.sleep(50);

        assertThat(exec.getStatus()).isEqualTo("success");
        assertThat(exec.getCompletedSteps()).isEqualTo(1);
        verify(streamService, atLeastOnce()).broadcastEvent(org.mockito.ArgumentMatchers.eq("exec-uuid-1"), any());
    }

    @Test
    void mergeContextIntoSteps_injectsAgentId() {
        PlaybookStepDTO step = new PlaybookStepDTO();
        step.setStepIndex(0);
        step.setStepType("action");
        step.setLabel("Isolate");
        Map<String, Object> cfg = new HashMap<>();
        cfg.put("actionId", "isolate_host");
        step.setConfig(cfg);

        PlaybookExecuteRequestDTO req = new PlaybookExecuteRequestDTO();
        req.setAgentId("agent-42");
        req.setAlertId("alert-9");

        List<PlaybookStepDTO> merged = service.mergeContextIntoSteps(List.of(step), req);
        assertThat(merged.get(0).getConfig().get("agentId")).isEqualTo("agent-42");
        assertThat(merged.get(0).getConfig().get("alertId")).isEqualTo("alert-9");
        // original unchanged
        assertThat(step.getConfig().containsKey("agentId")).isFalse();
    }
}
