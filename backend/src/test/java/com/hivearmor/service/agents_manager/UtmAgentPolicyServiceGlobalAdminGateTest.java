package com.hivearmor.service.agents_manager;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.config.GlobalTemplateWriteProperties;
import com.hivearmor.domain.agents_manager.UtmAgentPolicy;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.repository.agents_manager.UtmAgentGroupMemberRepository;
import com.hivearmor.repository.agents_manager.UtmAgentPolicyRepository;
import com.hivearmor.repository.agents_manager.UtmAgentPolicyStateRepository;
import com.hivearmor.repository.agents_manager.UtmPolicyGroupAssignmentRepository;
import com.hivearmor.repository.agents_manager.UtmPolicyPushLogRepository;
import com.hivearmor.service.dto.agent_manager.AgentPolicyDTO;
import com.hivearmor.service.incident_response.grpc_impl.IncidentResponseCommandService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

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
 * BE-POL-GLOBAL-ADMIN — proves the GLOBAL-template write gate requires {@code ROLE_PLATFORM_ADMIN},
 * not a per-tenant {@code ROLE_ADMIN}, across all four write paths (create / update / re-scope /
 * clone-then-re-scope). Also proves the single-tenant / on-prem equivalence flag and that ORG
 * writes are unaffected.
 */
@ExtendWith(MockitoExtension.class)
class UtmAgentPolicyServiceGlobalAdminGateTest {

    private static final long TENANT_A = 101L;

    @Mock private UtmAgentPolicyRepository policyRepo;
    @Mock private UtmPolicyGroupAssignmentRepository assignmentRepo;
    @Mock private UtmPolicyPushLogRepository pushLogRepo;
    @Mock private UtmAgentPolicyStateRepository stateRepo;
    @Mock private UtmAgentGroupMemberRepository memberRepo;
    @Mock private IncidentResponseCommandService commandService;

    private GlobalTemplateWriteProperties writeProps;
    private UtmAgentPolicyService service;

    @BeforeEach
    void setUp() {
        AgentPolicySchemaService schemaService = new AgentPolicySchemaService(new ObjectMapper());
        writeProps = new GlobalTemplateWriteProperties();
        service = new UtmAgentPolicyService(policyRepo, assignmentRepo, pushLogRepo,
            stateRepo, memberRepo, commandService, schemaService, new ObjectMapper(), writeProps);
        lenient().when(assignmentRepo.findByPolicyId(any())).thenReturn(List.of());
    }

    @AfterEach
    void cleanup() {
        TenantContext.clear();
        SecurityContextHolder.clearContext();
    }

    private void authAs(String user, String... roles) {
        var authorities = java.util.Arrays.stream(roles).map(SimpleGrantedAuthority::new).toList();
        SecurityContextHolder.getContext().setAuthentication(
            new UsernamePasswordAuthenticationToken(user, "pw", authorities));
    }

    /** MSSP-scoped request: tenant prefix present -> isMssp()==true. */
    private void mssp() {
        TenantContext.set(TENANT_A, "acme");
    }

    /** Single-tenant / on-prem request: no prefix -> isMssp()==false, requireTenant()==0. */
    private void singleTenant() {
        TenantContext.clear();
    }

    private UtmAgentPolicy row(Long id, String scope) {
        UtmAgentPolicy p = new UtmAgentPolicy();
        p.setId(id);
        p.setTenantId(TENANT_A);
        p.setPolicyName("tmpl-" + id);
        p.setPolicyConfig("{}");
        p.setVersionNum(1);
        p.setIsActive(true);
        p.setIsTemplate(true);
        p.setScope(scope);
        p.setCreatedBy("admin");
        return p;
    }

    private AgentPolicyDTO globalDto() {
        AgentPolicyDTO dto = new AgentPolicyDTO();
        dto.setPolicyName("g-" + System.nanoTime());
        dto.setScope("GLOBAL");
        dto.setIsTemplate(true);
        return dto;
    }

    // ====== MSSP: tenant ROLE_ADMIN DENIED all four GLOBAL write paths ======

    @Test
    void mssp_tenantAdmin_deniedCreateGlobal() {
        mssp();
        authAs("tenant-admin", "ROLE_ADMIN");
        assertThatThrownBy(() -> service.create(globalDto(), "tenant-admin"))
            .isInstanceOf(AccessDeniedException.class)
            .hasMessageContaining("ROLE_PLATFORM_ADMIN");
        verify(policyRepo, never()).save(any());
    }

    @Test
    void mssp_tenantAdmin_deniedUpdateOfExistingGlobal() {
        mssp();
        authAs("tenant-admin", "ROLE_ADMIN");
        when(policyRepo.findByIdAndTenantId(5L, TENANT_A)).thenReturn(Optional.of(row(5L, "GLOBAL")));
        AgentPolicyDTO dto = new AgentPolicyDTO();
        dto.setPolicyName("edited");
        assertThatThrownBy(() -> service.update(5L, dto))
            .isInstanceOf(AccessDeniedException.class);
        verify(policyRepo, never()).save(any());
    }

    @Test
    void mssp_tenantAdmin_deniedReScopeOrgToGlobal() {
        mssp();
        authAs("tenant-admin", "ROLE_ADMIN");
        when(policyRepo.findByIdAndTenantId(6L, TENANT_A)).thenReturn(Optional.of(row(6L, "ORG")));
        AgentPolicyDTO dto = new AgentPolicyDTO();
        dto.setPolicyName("promote");
        dto.setScope("GLOBAL");
        assertThatThrownBy(() -> service.update(6L, dto))
            .isInstanceOf(AccessDeniedException.class);
        verify(policyRepo, never()).save(any());
    }

    @Test
    void mssp_tenantAdmin_deniedCloneThenReScopeToGlobal() {
        // Clone itself lands ORG (allowed), but promoting the clone to GLOBAL is a tenant-admin DENY.
        mssp();
        authAs("tenant-admin", "ROLE_ADMIN");
        when(policyRepo.findVisibleTemplateById(7L, TENANT_A)).thenReturn(Optional.of(row(7L, "GLOBAL")));
        when(policyRepo.existsVisibleByPolicyName("copy", TENANT_A)).thenReturn(false);
        when(policyRepo.save(any(UtmAgentPolicy.class))).thenAnswer(i -> i.getArgument(0));
        AgentPolicyDTO clone = service.cloneTemplate(7L, "copy", "tenant-admin");
        assertThat(clone.getScope()).isEqualTo("ORG"); // clone never silently GLOBAL

        when(policyRepo.findByIdAndTenantId(eq(8L), eq(TENANT_A)))
            .thenReturn(Optional.of(row(8L, "ORG")));
        AgentPolicyDTO promote = new AgentPolicyDTO();
        promote.setPolicyName("copy");
        promote.setScope("GLOBAL");
        assertThatThrownBy(() -> service.update(8L, promote))
            .isInstanceOf(AccessDeniedException.class);
    }

    // ====== MSSP: ROLE_PLATFORM_ADMIN ALLOWED ======

    @Test
    void mssp_platformAdmin_allowedCreateGlobal() {
        mssp();
        authAs("platform", "ROLE_PLATFORM_ADMIN");
        when(policyRepo.save(any(UtmAgentPolicy.class))).thenAnswer(i -> i.getArgument(0));
        AgentPolicyDTO dto = service.create(globalDto(), "platform");
        assertThat(dto.getScope()).isEqualTo("GLOBAL");
        ArgumentCaptor<UtmAgentPolicy> captor = ArgumentCaptor.forClass(UtmAgentPolicy.class);
        verify(policyRepo).save(captor.capture());
        assertThat(captor.getValue().getScope()).isEqualTo("GLOBAL");
        assertThat(captor.getValue().getTenantId()).isEqualTo(TENANT_A);
    }

    // ====== Single-tenant / on-prem: ROLE_ADMIN ALLOWED via flag ======

    @Test
    void singleTenant_adminAllowedCreateGlobal_whenFlagDefaultOn() {
        singleTenant();
        authAs("onprem-admin", "ROLE_ADMIN");
        when(policyRepo.save(any(UtmAgentPolicy.class))).thenAnswer(i -> i.getArgument(0));
        AgentPolicyDTO dto = service.create(globalDto(), "onprem-admin");
        assertThat(dto.getScope()).isEqualTo("GLOBAL");
        verify(policyRepo).save(any());
    }

    @Test
    void singleTenant_adminDeniedCreateGlobal_whenFlagDisabled() {
        singleTenant();
        writeProps.setSingleTenantAdminGlobalWrite(false);
        authAs("onprem-admin", "ROLE_ADMIN");
        assertThatThrownBy(() -> service.create(globalDto(), "onprem-admin"))
            .isInstanceOf(AccessDeniedException.class);
        verify(policyRepo, never()).save(any());
    }

    // ====== ORG writes unaffected by the gate ======

    @Test
    void mssp_tenantAdmin_allowedCreateOrg() {
        mssp();
        authAs("tenant-admin", "ROLE_ADMIN");
        when(policyRepo.save(any(UtmAgentPolicy.class))).thenAnswer(i -> i.getArgument(0));
        AgentPolicyDTO dto = new AgentPolicyDTO();
        dto.setPolicyName("org-tmpl");
        dto.setScope("ORG");
        dto.setIsTemplate(true);
        AgentPolicyDTO out = service.create(dto, "tenant-admin");
        assertThat(out.getScope()).isEqualTo("ORG");
        verify(policyRepo).save(any());
    }

    @Test
    void mssp_socManager_allowedCreateOrg() {
        mssp();
        authAs("soc", "ROLE_SOC_MANAGER");
        when(policyRepo.save(any(UtmAgentPolicy.class))).thenAnswer(i -> i.getArgument(0));
        AgentPolicyDTO dto = new AgentPolicyDTO();
        dto.setPolicyName("org-tmpl-2");
        dto.setScope("ORG");
        AgentPolicyDTO out = service.create(dto, "soc");
        assertThat(out.getScope()).isEqualTo("ORG");
        verify(policyRepo).save(any());
    }
}
