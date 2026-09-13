package com.hivearmor.service.agents_manager;

import com.hivearmor.domain.agents_manager.UtmAgentGroup;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.repository.agents_manager.UtmAgentGroupMemberRepository;
import com.hivearmor.repository.agents_manager.UtmAgentGroupRepository;
import com.hivearmor.service.dto.agent_manager.AgentGroupDTO;
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
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * SPEC-04 (W1b) PR-1b.2b — UtmAgentGroupService is tenant-scoped: create stamps the
 * caller's tenant, list/getById scope to it, and a cross-tenant by-id load reads as
 * not found (no disclosure) and cannot be mutated.
 */
@ExtendWith(MockitoExtension.class)
class UtmAgentGroupServiceTenantScopingTest {

    private static final long TENANT_A = 101L;

    @Mock private UtmAgentGroupRepository groupRepo;
    @Mock private UtmAgentGroupMemberRepository memberRepo;

    private UtmAgentGroupService service;

    @BeforeEach
    void setUp() {
        service = new UtmAgentGroupService(groupRepo, memberRepo);
    }

    @AfterEach
    void cleanup() {
        TenantContext.clear();
    }

    private UtmAgentGroup group(Long id, Long tenantId) {
        UtmAgentGroup g = new UtmAgentGroup();
        g.setId(id);
        g.setTenantId(tenantId);
        g.setGroupName("grp-" + id);
        g.setCreatedBy("admin");
        return g;
    }

    @Test
    void createStampsCallerTenant() {
        TenantContext.set(TENANT_A, "acme");
        when(groupRepo.save(any(UtmAgentGroup.class))).thenAnswer(i -> i.getArgument(0));

        AgentGroupDTO dto = new AgentGroupDTO();
        dto.setGroupName("new-grp");
        service.create(dto, "admin");

        ArgumentCaptor<UtmAgentGroup> captor = ArgumentCaptor.forClass(UtmAgentGroup.class);
        verify(groupRepo).save(captor.capture());
        assertThat(captor.getValue().getTenantId()).isEqualTo(TENANT_A);
    }

    @Test
    void listAllScopesToCallerTenant() {
        TenantContext.set(TENANT_A, "acme");
        when(groupRepo.findByTenantIdOrderByGroupNameAsc(TENANT_A)).thenReturn(List.of(group(5L, TENANT_A)));
        lenient().when(memberRepo.findByGroupId(any())).thenReturn(List.of());

        List<AgentGroupDTO> out = service.listAll();

        assertThat(out).hasSize(1);
        verify(groupRepo).findByTenantIdOrderByGroupNameAsc(TENANT_A);
        verify(groupRepo, never()).findAllByOrderByGroupNameAsc();
    }

    @Test
    void getByIdScopesToCallerTenant() {
        TenantContext.set(TENANT_A, "acme");
        when(groupRepo.findByIdAndTenantId(5L, TENANT_A)).thenReturn(Optional.of(group(5L, TENANT_A)));
        lenient().when(memberRepo.findByGroupId(any())).thenReturn(List.of());

        assertThat(service.getById(5L)).isPresent();
        verify(groupRepo).findByIdAndTenantId(5L, TENANT_A);
    }

    @Test
    void updateCrossTenantIdReadsAsNotFound() {
        TenantContext.set(TENANT_A, "acme");
        // Row belongs to another tenant → scoped finder returns empty.
        when(groupRepo.findByIdAndTenantId(5L, TENANT_A)).thenReturn(Optional.empty());

        AgentGroupDTO dto = new AgentGroupDTO();
        dto.setGroupName("x");
        assertThatThrownBy(() -> service.update(5L, dto)).isInstanceOf(EntityNotFoundException.class);
        verify(groupRepo, never()).save(any());
    }

    @Test
    void deleteCrossTenantIdReadsAsNotFound() {
        TenantContext.set(TENANT_A, "acme");
        when(groupRepo.findByIdAndTenantId(5L, TENANT_A)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.delete(5L)).isInstanceOf(EntityNotFoundException.class);
        verify(groupRepo, never()).deleteById(any());
    }
}
