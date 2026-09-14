package com.hivearmor.service.agents_manager;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.HaAgentPolicy;
import com.hivearmor.domain.HaClient;
import com.hivearmor.domain.agents_manager.UtmAgentPolicy;
import com.hivearmor.repository.HaAgentPolicyRepository;
import com.hivearmor.repository.HaClientRepository;
import com.hivearmor.repository.agents_manager.UtmAgentPolicyRepository;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;

/**
 * SPEC-06 W5 — verifies the Plane B → Plane A policy projector is idempotent,
 * safe when Plane B is absent/empty, and maps typed FIM columns into Plane A's
 * schema-v1 policy_config without touching the wire contract.
 */
class HaPolicyConvergenceMigrationRunnerTest {

    private HaAgentPolicyRepository haRepo;
    private UtmAgentPolicyRepository utmRepo;
    private HaClientRepository haClientRepo;
    private AgentPolicySchemaService schemaService;
    private ObjectMapper objectMapper;
    private HaPolicyConvergenceMigrationRunner runner;

    @BeforeEach
    void setUp() {
        haRepo = Mockito.mock(HaAgentPolicyRepository.class);
        utmRepo = Mockito.mock(UtmAgentPolicyRepository.class);
        haClientRepo = Mockito.mock(HaClientRepository.class);
        // Default: single-tenant deployment (no MSSP-managed clients).
        when(haClientRepo.findByMsspManagedTrueAndClientPrefixIsNotNull()).thenReturn(List.of());
        objectMapper = new ObjectMapper();
        schemaService = new AgentPolicySchemaService(objectMapper);
        runner = new HaPolicyConvergenceMigrationRunner(
            haRepo, utmRepo, haClientRepo, schemaService, objectMapper);
    }

    @Test
    void noOpWhenPlaneBEmpty() {
        when(haRepo.findAll()).thenReturn(List.of());

        runner.projectPlaneBIntoPlaneA();

        verify(utmRepo, never()).save(any());
    }

    @Test
    void safeSkipWhenPlaneBTableAbsent() {
        // Fresh/staging: table unwired + ddl-auto:none → read throws. Must not propagate.
        when(haRepo.findAll()).thenThrow(new RuntimeException("relation \"ha_agent_policy\" does not exist"));

        runner.projectPlaneBIntoPlaneA();

        verify(utmRepo, never()).save(any());
    }

    @Test
    void projectsTypedFimColumnsIntoPolicyConfig() throws Exception {
        HaAgentPolicy row = new HaAgentPolicy();
        row.setId(7L);
        row.setName("Win Workstation FIM");
        row.setOsType("windows");
        row.setFilePaths("[\"C:\\\\Windows\\\\System32\"]");
        row.setRegistryPaths("[\"HKLM\\\\SOFTWARE\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Run\"]");
        row.setNetworkMonitor(false);
        row.setProcessMonitor(true);
        when(haRepo.findAll()).thenReturn(List.of(row));
        when(utmRepo.findByPolicyName(anyString())).thenReturn(Optional.empty());
        when(utmRepo.save(any(UtmAgentPolicy.class))).thenAnswer(inv -> inv.getArgument(0));

        runner.projectPlaneBIntoPlaneA();

        ArgumentCaptor<UtmAgentPolicy> captor = ArgumentCaptor.forClass(UtmAgentPolicy.class);
        verify(utmRepo, times(1)).save(captor.capture());
        UtmAgentPolicy saved = captor.getValue();

        assertThat(saved.getPolicyName()).isEqualTo("[EDR] Win Workstation FIM");
        assertThat(saved.getPlatform()).isEqualTo("windows");
        assertThat(saved.getTenantId()).isEqualTo(0L);
        assertThat(saved.getVersionNum()).isEqualTo(1);
        assertThat(saved.getIsActive()).isTrue();

        JsonNode config = objectMapper.readTree(saved.getPolicyConfig());
        assertThat(config.get("schema_version").asInt()).isEqualTo(1);
        assertThat(config.get("fim").get("rules")).hasSize(1);
        assertThat(config.get("fim").get("rules").get(0).get("path").asText())
            .isEqualTo("C:\\Windows\\System32");
        assertThat(config.get("fim").get("registry").get("keys")).hasSize(1);
        // networkMonitor=false must flow into collector toggles.
        assertThat(config.get("collectors").get("netconn").asBoolean()).isFalse();
    }

    @Test
    void idempotentReRunSkipsAlreadyProjected() {
        HaAgentPolicy row = new HaAgentPolicy();
        row.setId(7L);
        row.setName("Win Workstation FIM");
        row.setOsType("windows");
        when(haRepo.findAll()).thenReturn(List.of(row));
        // Simulate a prior run: the projected policy already exists.
        when(utmRepo.findByPolicyName("[EDR] Win Workstation FIM"))
            .thenReturn(Optional.of(new UtmAgentPolicy()));

        runner.projectPlaneBIntoPlaneA();

        verify(utmRepo, never()).save(any());
    }

    @Test
    void skipsProjectionWhenMsspManagedTenantsPresent() {
        HaAgentPolicy row = new HaAgentPolicy();
        row.setId(7L);
        row.setName("Win Workstation FIM");
        when(haRepo.findAll()).thenReturn(List.of(row));
        // MSSP deployment: a managed client with a prefix exists → must not project to tenant 0.
        when(haClientRepo.findByMsspManagedTrueAndClientPrefixIsNotNull())
            .thenReturn(List.of(new HaClient()));

        runner.projectPlaneBIntoPlaneA();

        verify(utmRepo, never()).findByPolicyName(anyString());
        verify(utmRepo, never()).save(any());
    }

    @Test
    void skipsProjectionWhenTenancyUndeterminable() {
        HaAgentPolicy row = new HaAgentPolicy();
        row.setId(7L);
        row.setName("Win Workstation FIM");
        when(haRepo.findAll()).thenReturn(List.of(row));
        // Cannot read ha_client → refuse to project rather than risk mis-attribution.
        when(haClientRepo.findByMsspManagedTrueAndClientPrefixIsNotNull())
            .thenThrow(new RuntimeException("ha_client unreadable"));

        runner.projectPlaneBIntoPlaneA();

        verify(utmRepo, never()).save(any());
    }

    @Test
    void fallsBackToIdWhenNameBlank() {
        HaAgentPolicy row = new HaAgentPolicy();
        row.setId(42L);
        row.setName("   ");
        when(haRepo.findAll()).thenReturn(List.of(row));
        when(utmRepo.findByPolicyName(anyString())).thenReturn(Optional.empty());
        when(utmRepo.save(any(UtmAgentPolicy.class))).thenAnswer(inv -> inv.getArgument(0));

        runner.projectPlaneBIntoPlaneA();

        ArgumentCaptor<UtmAgentPolicy> captor = ArgumentCaptor.forClass(UtmAgentPolicy.class);
        verify(utmRepo).save(captor.capture());
        assertThat(captor.getValue().getPolicyName()).isEqualTo("[EDR] policy-42");
    }
}
