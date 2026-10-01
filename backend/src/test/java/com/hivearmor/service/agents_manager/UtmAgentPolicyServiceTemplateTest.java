package com.hivearmor.service.agents_manager;

import com.fasterxml.jackson.databind.ObjectMapper;
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
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

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
 * SPEC-PT-1 — template-library behavior on the canonical Plane A service:
 * scope normalization, GLOBAL-write global-admin gate (fail-closed), template list/get/search
 * visibility (own-tenant + GLOBAL), and clone into the caller's own ORG.
 */
@ExtendWith(MockitoExtension.class)
class UtmAgentPolicyServiceTemplateTest {

    private static final long TENANT_A = 101L;

    @Mock private UtmAgentPolicyRepository policyRepo;
    @Mock private UtmPolicyGroupAssignmentRepository assignmentRepo;
    @Mock private UtmPolicyPushLogRepository pushLogRepo;
    @Mock private UtmAgentPolicyStateRepository stateRepo;
    @Mock private UtmAgentGroupMemberRepository memberRepo;
    @Mock private IncidentResponseCommandService commandService;

    private UtmAgentPolicyService service;

    @BeforeEach
    void setUp() {
        // Real schema service + mapper so validation/normalization is exercised end-to-end.
        AgentPolicySchemaService schemaService = new AgentPolicySchemaService(new ObjectMapper());
        service = new UtmAgentPolicyService(policyRepo, assignmentRepo, pushLogRepo,
            stateRepo, memberRepo, commandService, schemaService, new ObjectMapper());
        TenantContext.set(TENANT_A, "acme");
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

    private UtmAgentPolicy template(Long id, Long tenantId, String scope) {
        UtmAgentPolicy p = new UtmAgentPolicy();
        p.setId(id);
        p.setTenantId(tenantId);
        p.setPolicyName("tmpl-" + id);
        p.setPolicyConfig("{}");
        p.setVersionNum(1);
        p.setIsActive(true);
        p.setIsTemplate(true);
        p.setScope(scope);
        p.setCreatedBy("admin");
        return p;
    }

    // ---- scope normalization ----

    @Test
    void createDefaultsScopeToOrgAndTemplateFalse() {
        authAs("soc", "ROLE_SOC_MANAGER");
        when(policyRepo.save(any(UtmAgentPolicy.class))).thenAnswer(i -> i.getArgument(0));
        AgentPolicyDTO dto = new AgentPolicyDTO();
        dto.setPolicyName("adhoc");
        service.create(dto, "soc");

        ArgumentCaptor<UtmAgentPolicy> captor = ArgumentCaptor.forClass(UtmAgentPolicy.class);
        verify(policyRepo).save(captor.capture());
        assertThat(captor.getValue().getScope()).isEqualTo("ORG");
        assertThat(captor.getValue().getIsTemplate()).isFalse();
    }

    @Test
    void createRejectsUnknownScope() {
        authAs("soc", "ROLE_SOC_MANAGER");
        AgentPolicyDTO dto = new AgentPolicyDTO();
        dto.setPolicyName("x");
        dto.setScope("REGIONAL");
        assertThatThrownBy(() -> service.create(dto, "soc"))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("scope");
        verify(policyRepo, never()).save(any());
    }

    @Test
    void createRejectsUnknownPlatform() {
        authAs("soc", "ROLE_SOC_MANAGER");
        AgentPolicyDTO dto = new AgentPolicyDTO();
        dto.setPolicyName("x");
        dto.setPlatform("solaris");
        assertThatThrownBy(() -> service.create(dto, "soc"))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("platform");
        verify(policyRepo, never()).save(any());
    }

    // ---- GLOBAL-write global-admin gate (fail-closed) ----

    @Test
    void createGlobalRequiresAdmin_deniedForSocManager() {
        authAs("soc", "ROLE_SOC_MANAGER");
        AgentPolicyDTO dto = new AgentPolicyDTO();
        dto.setPolicyName("g");
        dto.setScope("GLOBAL");
        dto.setIsTemplate(true);
        assertThatThrownBy(() -> service.create(dto, "soc"))
            .isInstanceOf(AccessDeniedException.class);
        verify(policyRepo, never()).save(any());
    }

    @Test
    void createGlobalAllowedForAdmin() {
        authAs("admin", "ROLE_ADMIN");
        when(policyRepo.save(any(UtmAgentPolicy.class))).thenAnswer(i -> i.getArgument(0));
        AgentPolicyDTO dto = new AgentPolicyDTO();
        dto.setPolicyName("g");
        dto.setScope("GLOBAL");
        dto.setIsTemplate(true);
        dto.setOrgId("acme"); // ignored for GLOBAL
        service.create(dto, "admin");

        ArgumentCaptor<UtmAgentPolicy> captor = ArgumentCaptor.forClass(UtmAgentPolicy.class);
        verify(policyRepo).save(captor.capture());
        assertThat(captor.getValue().getScope()).isEqualTo("GLOBAL");
        assertThat(captor.getValue().getOrgId()).isNull();
        assertThat(captor.getValue().getTenantId()).isEqualTo(TENANT_A);
    }

    @Test
    void deleteGlobalRequiresAdmin() {
        authAs("soc", "ROLE_SOC_MANAGER");
        when(policyRepo.findByIdAndTenantId(7L, TENANT_A))
            .thenReturn(Optional.of(template(7L, TENANT_A, "GLOBAL")));
        assertThatThrownBy(() -> service.delete(7L)).isInstanceOf(AccessDeniedException.class);
        verify(policyRepo, never()).deleteById(any());
    }

    @Test
    void updateReScopeToGlobalRequiresAdmin() {
        authAs("soc", "ROLE_SOC_MANAGER");
        when(policyRepo.findByIdAndTenantId(8L, TENANT_A))
            .thenReturn(Optional.of(template(8L, TENANT_A, "ORG")));
        AgentPolicyDTO dto = new AgentPolicyDTO();
        dto.setPolicyName("t");
        dto.setScope("GLOBAL");
        assertThatThrownBy(() -> service.update(8L, dto)).isInstanceOf(AccessDeniedException.class);
        verify(policyRepo, never()).save(any());
    }

    // ---- template visibility ----

    @Test
    void listTemplatesUsesVisibleQuery() {
        authAs("analyst", "ROLE_ANALYST");
        when(policyRepo.findVisibleTemplates(TENANT_A))
            .thenReturn(List.of(template(1L, TENANT_A, "ORG"), template(2L, 999L, "GLOBAL")));
        List<AgentPolicyDTO> out = service.listTemplates();
        assertThat(out).hasSize(2);
        verify(policyRepo).findVisibleTemplates(TENANT_A);
        verify(policyRepo, never()).findAllByOrderByPolicyNameAsc();
    }

    @Test
    void searchTemplatesFiltersByScopeAndPlatformAndName() {
        authAs("analyst", "ROLE_ANALYST");
        UtmAgentPolicy org = template(1L, TENANT_A, "ORG");
        org.setPolicyName("sec-log-basic");
        org.setPlatform("windows");
        UtmAgentPolicy glob = template(2L, 999L, "GLOBAL");
        glob.setPolicyName("compliance-scan");
        glob.setPlatform("linux");
        when(policyRepo.findVisibleTemplates(TENANT_A)).thenReturn(List.of(org, glob));

        assertThat(service.searchTemplates(null, "GLOBAL", null)).extracting(AgentPolicyDTO::getPolicyName)
            .containsExactly("compliance-scan");
        assertThat(service.searchTemplates(null, null, "windows")).extracting(AgentPolicyDTO::getPolicyName)
            .containsExactly("sec-log-basic");
        assertThat(service.searchTemplates("scan", null, null)).extracting(AgentPolicyDTO::getPolicyName)
            .containsExactly("compliance-scan");
    }

    @Test
    void getTemplateByIdUsesVisibleQuery() {
        authAs("analyst", "ROLE_ANALYST");
        when(policyRepo.findVisibleTemplateById(2L, TENANT_A))
            .thenReturn(Optional.of(template(2L, 999L, "GLOBAL")));
        assertThat(service.getTemplateById(2L)).isPresent();
        verify(policyRepo).findVisibleTemplateById(2L, TENANT_A);
    }

    // ---- clone ----

    @Test
    void cloneCreatesOrgTemplateOwnedByCallerAtVersion1() {
        authAs("soc", "ROLE_SOC_MANAGER");
        UtmAgentPolicy src = template(2L, 999L, "GLOBAL"); // a GLOBAL template from another tenant
        src.setVersionNum(5);
        when(policyRepo.findVisibleTemplateById(2L, TENANT_A)).thenReturn(Optional.of(src));
        when(policyRepo.existsVisibleByPolicyName("my-copy", TENANT_A)).thenReturn(false);
        when(policyRepo.save(any(UtmAgentPolicy.class))).thenAnswer(i -> i.getArgument(0));

        service.cloneTemplate(2L, "my-copy", "soc");

        ArgumentCaptor<UtmAgentPolicy> captor = ArgumentCaptor.forClass(UtmAgentPolicy.class);
        verify(policyRepo).save(captor.capture());
        UtmAgentPolicy saved = captor.getValue();
        assertThat(saved.getPolicyName()).isEqualTo("my-copy");
        assertThat(saved.getIsTemplate()).isTrue();
        assertThat(saved.getScope()).isEqualTo("ORG");        // never silently GLOBAL
        assertThat(saved.getTenantId()).isEqualTo(TENANT_A);  // owned by caller, not source (999)
        assertThat(saved.getVersionNum()).isEqualTo(1);       // fresh version
    }

    @Test
    void cloneRejectsDuplicateName() {
        authAs("soc", "ROLE_SOC_MANAGER");
        when(policyRepo.findVisibleTemplateById(2L, TENANT_A))
            .thenReturn(Optional.of(template(2L, TENANT_A, "ORG")));
        when(policyRepo.existsVisibleByPolicyName("dup", TENANT_A)).thenReturn(true);
        assertThatThrownBy(() -> service.cloneTemplate(2L, "dup", "soc"))
            .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("already exists");
        verify(policyRepo, never()).save(any());
    }

    @Test
    void cloneMissingTemplateIsNotFound() {
        authAs("soc", "ROLE_SOC_MANAGER");
        when(policyRepo.findVisibleTemplateById(404L, TENANT_A)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.cloneTemplate(404L, "x", "soc"))
            .isInstanceOf(EntityNotFoundException.class);
    }

    @Test
    void cloneRejectsBlankName() {
        authAs("soc", "ROLE_SOC_MANAGER");
        assertThatThrownBy(() -> service.cloneTemplate(2L, "  ", "soc"))
            .isInstanceOf(IllegalArgumentException.class);
        verify(policyRepo, never()).findVisibleTemplateById(any(), any());
    }

    // ---- PT-3 M1 regression: the reserved effective-policy name prefix is not user-writable ----
    @Test
    void createRejectsReservedEffectiveNamePrefix() {
        authAs("soc", "ROLE_SOC_MANAGER");
        AgentPolicyDTO dto = new AgentPolicyDTO();
        dto.setPolicyName("__effective__:agent:5");
        assertThatThrownBy(() -> service.create(dto, "soc"))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("reserved prefix");
        verify(policyRepo, never()).save(any());
    }

    @Test
    void cloneRejectsReservedEffectiveNamePrefix() {
        authAs("soc", "ROLE_SOC_MANAGER");
        assertThatThrownBy(() -> service.cloneTemplate(2L, "__effective__:agent:9", "soc"))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("reserved prefix");
        verify(policyRepo, never()).findVisibleTemplateById(any(), any());
    }
}
