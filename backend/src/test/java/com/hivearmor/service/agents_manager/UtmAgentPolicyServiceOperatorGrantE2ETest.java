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
import com.hivearmor.security.AuthoritiesConstants;
import com.hivearmor.security.jwt.TokenProvider;
import com.hivearmor.service.dto.agent_manager.AgentPolicyDTO;
import com.hivearmor.service.incident_response.grpc_impl.IncidentResponseCommandService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import tech.jhipster.config.JHipsterProperties;

import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * BE-POL (#368) — end-to-end provisioning → gate chain.
 *
 * <p>The two halves of #368 meet here: a principal is reconstituted from its JWT exactly as a
 * live request does ({@link TokenProvider#getAuthentication}), placed in the
 * {@link SecurityContextHolder}, and then driven through the REAL
 * {@link UtmAgentPolicyService#requireGlobalAdminForGlobalWrite} gate on all four GLOBAL write
 * paths (create / update / re-scope / clone-then-re-scope).
 *
 * <p>It proves the grant actually unblocks the workflow: an MSSP operator whose JWT carries only
 * {@code MSSP_ADMIN} is derived up to {@code ROLE_PLATFORM_ADMIN} and therefore PASSES the gate,
 * while a tenant {@code ROLE_ADMIN} reconstituted the same way is still DENIED — the #367
 * escalation stays closed. The gate logic itself is unchanged; this is a chain test, not a gate
 * test (the gate's own unit coverage lives in {@code UtmAgentPolicyServiceGlobalAdminGateTest}).
 */
@ExtendWith(MockitoExtension.class)
class UtmAgentPolicyServiceOperatorGrantE2ETest {

    private static final long TENANT_A = 101L;
    private static final String MSSP_ADMIN = "MSSP_ADMIN";

    private static final String TEST_BASE64_SECRET =
        "ZjY4MDYwNWU0ZTQ3MGFkMjJiY2IzYjMyNzAyMGE5NzMxMjdhY2JhMmQ5MDg5MzVjMmJhMTZlY2I5ZjE0NDZiNg==";

    @Mock private UtmAgentPolicyRepository policyRepo;
    @Mock private UtmPolicyGroupAssignmentRepository assignmentRepo;
    @Mock private UtmPolicyPushLogRepository pushLogRepo;
    @Mock private UtmAgentPolicyStateRepository stateRepo;
    @Mock private UtmAgentGroupMemberRepository memberRepo;
    @Mock private IncidentResponseCommandService commandService;

    private GlobalTemplateWriteProperties writeProps;
    private UtmAgentPolicyService service;
    private TokenProvider tokenProvider;

    @BeforeEach
    void setUp() throws Exception {
        AgentPolicySchemaService schemaService = new AgentPolicySchemaService(new ObjectMapper());
        writeProps = new GlobalTemplateWriteProperties();
        service = new UtmAgentPolicyService(policyRepo, assignmentRepo, pushLogRepo,
            stateRepo, memberRepo, commandService, schemaService, new ObjectMapper(), writeProps);
        lenient().when(assignmentRepo.findByPolicyId(any())).thenReturn(List.of());

        JHipsterProperties props = new JHipsterProperties();
        props.getSecurity().getAuthentication().getJwt().setBase64Secret(TEST_BASE64_SECRET);
        props.getSecurity().getAuthentication().getJwt().setTokenValidityInSeconds(86400L);
        props.getSecurity().getAuthentication().getJwt().setTokenValidityInSecondsForRememberMe(2592000L);
        tokenProvider = new TokenProvider(props);
        tokenProvider.afterPropertiesSet();
    }

    @AfterEach
    void cleanup() {
        TenantContext.clear();
        SecurityContextHolder.clearContext();
    }

    /** Mint a JWT for a principal holding {@code roles}, reconstitute it, and seat it in the context. */
    private void authAsViaJwt(String user, String... roles) {
        var granted = Arrays.stream(roles).map(SimpleGrantedAuthority::new).collect(Collectors.toList());
        var login = new UsernamePasswordAuthenticationToken(user, "pw", granted);
        String token = tokenProvider.createToken(login, false, true);
        SecurityContextHolder.getContext().setAuthentication(tokenProvider.getAuthentication(token));
    }

    private void mssp() {
        TenantContext.set(TENANT_A, "acme");
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
        p.setCreatedBy("op");
        return p;
    }

    private AgentPolicyDTO globalDto() {
        AgentPolicyDTO dto = new AgentPolicyDTO();
        dto.setPolicyName("g-" + System.nanoTime());
        dto.setScope("GLOBAL");
        dto.setIsTemplate(true);
        return dto;
    }

    // ── MSSP operator token (MSSP_ADMIN only) PASSES all four GLOBAL write paths ───────

    @Test
    void msspOperatorToken_canCreateGlobal() {
        mssp();
        authAsViaJwt("operator", MSSP_ADMIN);
        when(policyRepo.save(any(UtmAgentPolicy.class))).thenAnswer(i -> i.getArgument(0));
        AgentPolicyDTO out = service.create(globalDto(), "operator");
        assertThat(out.getScope()).isEqualTo("GLOBAL");
        verify(policyRepo).save(any());
    }

    @Test
    void msspOperatorToken_canUpdateExistingGlobal() {
        mssp();
        authAsViaJwt("operator", MSSP_ADMIN);
        when(policyRepo.findByIdAndTenantId(5L, TENANT_A)).thenReturn(Optional.of(row(5L, "GLOBAL")));
        when(policyRepo.save(any(UtmAgentPolicy.class))).thenAnswer(i -> i.getArgument(0));
        AgentPolicyDTO dto = new AgentPolicyDTO();
        dto.setPolicyName("edited");
        AgentPolicyDTO out = service.update(5L, dto);
        assertThat(out.getScope()).isEqualTo("GLOBAL");
        verify(policyRepo).save(any());
    }

    @Test
    void msspOperatorToken_canReScopeOrgToGlobal() {
        mssp();
        authAsViaJwt("operator", MSSP_ADMIN);
        when(policyRepo.findByIdAndTenantId(6L, TENANT_A)).thenReturn(Optional.of(row(6L, "ORG")));
        when(policyRepo.save(any(UtmAgentPolicy.class))).thenAnswer(i -> i.getArgument(0));
        AgentPolicyDTO dto = new AgentPolicyDTO();
        dto.setPolicyName("promote");
        dto.setScope("GLOBAL");
        AgentPolicyDTO out = service.update(6L, dto);
        assertThat(out.getScope()).isEqualTo("GLOBAL");
        verify(policyRepo).save(any());
    }

    @Test
    void msspOperatorToken_canCloneThenReScopeToGlobal() {
        mssp();
        authAsViaJwt("operator", MSSP_ADMIN);
        when(policyRepo.findVisibleTemplateById(7L, TENANT_A)).thenReturn(Optional.of(row(7L, "GLOBAL")));
        when(policyRepo.existsVisibleByPolicyName("copy", TENANT_A)).thenReturn(false);
        when(policyRepo.save(any(UtmAgentPolicy.class))).thenAnswer(i -> i.getArgument(0));
        AgentPolicyDTO clone = service.cloneTemplate(7L, "copy", "operator");
        assertThat(clone.getScope()).isEqualTo("ORG"); // clone never silently GLOBAL

        when(policyRepo.findByIdAndTenantId(eq(8L), eq(TENANT_A))).thenReturn(Optional.of(row(8L, "ORG")));
        AgentPolicyDTO promote = new AgentPolicyDTO();
        promote.setPolicyName("copy");
        promote.setScope("GLOBAL");
        AgentPolicyDTO out = service.update(8L, promote);
        assertThat(out.getScope()).isEqualTo("GLOBAL");
    }

    // ── tenant ROLE_ADMIN token is STILL denied GLOBAL in MSSP (the #367 fix stays closed) ──

    @Test
    void tenantAdminToken_stillDeniedCreateGlobal() {
        mssp();
        authAsViaJwt("tenant-admin", AuthoritiesConstants.ADMIN);
        assertThatThrownBy(() -> service.create(globalDto(), "tenant-admin"))
            .isInstanceOf(AccessDeniedException.class)
            .hasMessageContaining("ROLE_PLATFORM_ADMIN");
        verify(policyRepo, never()).save(any());
    }

    @Test
    void tenantAdminToken_stillDeniedReScopeToGlobal() {
        mssp();
        authAsViaJwt("tenant-admin", AuthoritiesConstants.ADMIN);
        when(policyRepo.findByIdAndTenantId(9L, TENANT_A)).thenReturn(Optional.of(row(9L, "ORG")));
        AgentPolicyDTO dto = new AgentPolicyDTO();
        dto.setPolicyName("promote");
        dto.setScope("GLOBAL");
        assertThatThrownBy(() -> service.update(9L, dto)).isInstanceOf(AccessDeniedException.class);
        verify(policyRepo, never()).save(any());
    }

    // ── single-tenant / on-prem ROLE_ADMIN unaffected (flag equivalence, not the operator grant) ──

    @Test
    void singleTenantAdminToken_canCreateGlobal_viaFlag() {
        // No tenant prefix -> isMssp()==false; the config flag (default on) lets ROLE_ADMIN write GLOBAL.
        TenantContext.clear();
        authAsViaJwt("onprem-admin", AuthoritiesConstants.ADMIN);
        when(policyRepo.save(any(UtmAgentPolicy.class))).thenAnswer(i -> i.getArgument(0));
        AgentPolicyDTO out = service.create(globalDto(), "onprem-admin");
        assertThat(out.getScope()).isEqualTo("GLOBAL");
        verify(policyRepo).save(any());
    }
}
