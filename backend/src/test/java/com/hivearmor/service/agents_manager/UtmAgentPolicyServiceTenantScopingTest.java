package com.hivearmor.service.agents_manager;

import com.hivearmor.domain.agents_manager.UtmAgentPolicy;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.repository.agents_manager.UtmAgentGroupMemberRepository;
import com.hivearmor.repository.agents_manager.UtmAgentPolicyRepository;
import com.hivearmor.repository.agents_manager.UtmAgentPolicyStateRepository;
import com.hivearmor.repository.agents_manager.UtmPolicyGroupAssignmentRepository;
import com.hivearmor.repository.agents_manager.UtmPolicyPushLogRepository;
import com.hivearmor.service.dto.agent_manager.AgentPolicyDTO;
import com.hivearmor.service.incident_response.grpc_impl.IncidentResponseCommandService;
import jakarta.persistence.EntityNotFoundException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * SPEC-04 (W1b) PR-1b.2b — UtmAgentPolicyService (canonical Plane A) is tenant-scoped
 * on its request-path methods: create stamps the caller's tenant, list/getById scope
 * to it, and a cross-tenant by-id load reads as not found and cannot be mutated.
 */
@ExtendWith(MockitoExtension.class)
class UtmAgentPolicyServiceTenantScopingTest {

    private static final long TENANT_A = 101L;

    @Mock private UtmAgentPolicyRepository policyRepo;
    @Mock private UtmPolicyGroupAssignmentRepository assignmentRepo;
    @Mock private UtmPolicyPushLogRepository pushLogRepo;
    @Mock private UtmAgentPolicyStateRepository stateRepo;
    @Mock private UtmAgentGroupMemberRepository memberRepo;
    @Mock private IncidentResponseCommandService commandService;
    @Mock private AgentPolicySchemaService schemaService;

    private UtmAgentPolicyService service;

    @BeforeEach
    void setUp() {
        service = new UtmAgentPolicyService(policyRepo, assignmentRepo, pushLogRepo,
            stateRepo, memberRepo, commandService, schemaService);
    }

    @AfterEach
    void cleanup() {
        TenantContext.clear();
    }

    private UtmAgentPolicy policy(Long id, Long tenantId) {
        UtmAgentPolicy p = new UtmAgentPolicy();
        p.setId(id);
        p.setTenantId(tenantId);
        p.setPolicyName("pol-" + id);
        p.setPolicyConfig("{}");
        p.setVersionNum(1);
        p.setIsActive(true);
        p.setCreatedBy("admin");
        return p;
    }

    @Test
    void createStampsCallerTenant() {
        TenantContext.set(TENANT_A, "acme");
        when(schemaService.normalizePolicyConfig(anyString())).thenReturn("{}");
        lenient().when(schemaService.normalizePolicyConfigForServe(anyString())).thenReturn("{}");
        when(policyRepo.save(any(UtmAgentPolicy.class))).thenAnswer(i -> i.getArgument(0));
        lenient().when(assignmentRepo.findByPolicyId(any())).thenReturn(List.of());

        AgentPolicyDTO dto = new AgentPolicyDTO();
        dto.setPolicyName("new-pol");
        service.create(dto, "admin");

        ArgumentCaptor<UtmAgentPolicy> captor = ArgumentCaptor.forClass(UtmAgentPolicy.class);
        verify(policyRepo).save(captor.capture());
        assertThat(captor.getValue().getTenantId()).isEqualTo(TENANT_A);
    }

    @Test
    void listAllScopesToCallerTenant() {
        TenantContext.set(TENANT_A, "acme");
        lenient().when(schemaService.normalizePolicyConfigForServe(anyString())).thenReturn("{}");
        lenient().when(assignmentRepo.findByPolicyId(any())).thenReturn(List.of());
        when(policyRepo.findByTenantIdOrderByPolicyNameAsc(TENANT_A)).thenReturn(List.of(policy(5L, TENANT_A)));

        assertThat(service.listAll()).hasSize(1);
        verify(policyRepo).findByTenantIdOrderByPolicyNameAsc(TENANT_A);
        verify(policyRepo, never()).findAllByOrderByPolicyNameAsc();
    }

    @Test
    void getByIdScopesToCallerTenant() {
        TenantContext.set(TENANT_A, "acme");
        lenient().when(schemaService.normalizePolicyConfigForServe(anyString())).thenReturn("{}");
        lenient().when(assignmentRepo.findByPolicyId(any())).thenReturn(List.of());
        when(policyRepo.findByIdAndTenantId(5L, TENANT_A)).thenReturn(Optional.of(policy(5L, TENANT_A)));

        assertThat(service.getById(5L)).isPresent();
        verify(policyRepo).findByIdAndTenantId(5L, TENANT_A);
    }

    @Test
    void updateCrossTenantIdReadsAsNotFound() {
        TenantContext.set(TENANT_A, "acme");
        when(policyRepo.findByIdAndTenantId(5L, TENANT_A)).thenReturn(Optional.empty());

        AgentPolicyDTO dto = new AgentPolicyDTO();
        dto.setPolicyName("x");
        assertThatThrownBy(() -> service.update(5L, dto)).isInstanceOf(EntityNotFoundException.class);
        verify(policyRepo, never()).save(any());
    }

    @Test
    void deleteCrossTenantIdReadsAsNotFound() {
        TenantContext.set(TENANT_A, "acme");
        when(policyRepo.findByIdAndTenantId(5L, TENANT_A)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.delete(5L)).isInstanceOf(EntityNotFoundException.class);
        verify(policyRepo, never()).deleteById(any());
    }
}
