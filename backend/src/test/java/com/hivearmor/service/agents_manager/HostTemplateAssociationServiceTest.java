package com.hivearmor.service.agents_manager;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.agents_manager.HostTemplateAssociation;
import com.hivearmor.domain.agents_manager.UtmAgentGroup;
import com.hivearmor.domain.agents_manager.UtmAgentGroupMember;
import com.hivearmor.domain.agents_manager.UtmAgentPolicy;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.repository.agents_manager.HostTemplateAssociationRepository;
import com.hivearmor.repository.agents_manager.UtmAgentGroupMemberRepository;
import com.hivearmor.repository.agents_manager.UtmAgentGroupRepository;
import com.hivearmor.repository.agents_manager.UtmAgentPolicyRepository;
import com.hivearmor.service.dto.agent_manager.ApplyResultDTO;
import com.hivearmor.service.dto.agent_manager.EffectivePolicyDTO;
import com.hivearmor.service.dto.agent_manager.HostTemplateAssociationDTO;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * PT-3 acceptance — the ranked resolver + Apply. Covers the 3 worked examples (Critical / UEBA /
 * Other=ANY), reorder-changes-effective-policy, multi-template union, the mandatory any-catch-all
 * invariant, tenant isolation, and that Apply pushes only affected hosts via the delivery path.
 */
@ExtendWith(MockitoExtension.class)
class HostTemplateAssociationServiceTest {

    private static final long TENANT_A = 101L;

    @Mock private HostTemplateAssociationRepository assocRepo;
    @Mock private UtmAgentPolicyRepository policyRepo;
    @Mock private UtmAgentGroupRepository groupRepo;
    @Mock private UtmAgentGroupMemberRepository memberRepo;
    @Mock private UtmAgentPolicyService policyService;

    private final ObjectMapper mapper = new ObjectMapper();
    private HostTemplateAssociationService service;

    @BeforeEach
    void setUp() {
        service = new HostTemplateAssociationService(assocRepo, policyRepo, groupRepo, memberRepo,
            new PolicyTemplateMerger(mapper), policyService, mapper);
        TenantContext.set(TENANT_A, "acme");
    }

    @AfterEach
    void cleanup() {
        TenantContext.clear();
    }

    // The 3-example fixture table (matches association-example.json + PT-0 §4).
    private static final String TABLE_JSON = "{"
        + "\"scope\":\"ORG\",\"orgId\":\"acme\",\"rows\":["
        + "{\"rank\":1,\"name\":\"Critical_Servers\",\"match\":{\"group\":\"Critical_Servers\"},"
        + "\"templates\":[\"sec-log-full\",\"compliance-scan\"]},"
        + "{\"rank\":2,\"name\":\"UEBA_Workstations\",\"match\":{\"group\":\"UEBA_Workstations\"},"
        + "\"templates\":[\"ueba-on\",\"sec-log-basic\"]},"
        + "{\"rank\":3,\"name\":\"Other\",\"match\":{\"any\":true},\"templates\":[\"sec-log-basic\"]}"
        + "]}";

    private HostTemplateAssociation table(String rowsJson) {
        HostTemplateAssociation a = new HostTemplateAssociation();
        a.setId(1L);
        a.setTenantId(TENANT_A);
        a.setName("Default");
        a.setScope("ORG");
        a.setRowsJson(rowsJson);
        a.setVersionNum(1);
        a.setCreatedBy("admin");
        return a;
    }

    private UtmAgentPolicy template(String name, String cfg) {
        UtmAgentPolicy p = new UtmAgentPolicy();
        p.setId((long) name.hashCode());
        p.setPolicyName(name);
        p.setPolicyConfig(cfg);
        p.setIsTemplate(true);
        p.setScope("GLOBAL");
        p.setTenantId(TENANT_A);
        return p;
    }

    private void stubTemplateLibrary() {
        when(policyRepo.findVisibleTemplates(TENANT_A)).thenReturn(List.of(
            template("sec-log-full", "{\"event\":{\"eventLogs\":[{\"type\":\"Security\",\"include\":\"ALL\"}]}}"),
            template("compliance-scan", "{\"scans\":{\"cis\":{\"enabled\":true,\"profile\":\"lvl1\"}}}"),
            template("ueba-on", "{\"ueba\":{\"enabled\":true}}"),
            template("sec-log-basic", "{\"fim\":{\"mode\":\"merge\",\"rules\":[{\"path\":\"/etc\"}]}}")
        ));
    }

    private void stubOneOrgTable(String rowsJson) {
        when(assocRepo.findOrgTablesForTenant(TENANT_A)).thenReturn(List.of(table(rowsJson)));
        lenient().when(assocRepo.findGlobalTables()).thenReturn(List.of());
    }

    // ---- worked example 1: Critical → rank 1 union ----
    @Test
    void criticalHostResolvesToRank1Union() {
        stubOneOrgTable(TABLE_JSON);
        stubTemplateLibrary();
        // agent 10 belongs to group "Critical_Servers"
        UtmAgentGroupMember m = new UtmAgentGroupMember();
        m.setGroupId(500L); m.setAgentId(10);
        when(memberRepo.findByAgentId(10)).thenReturn(List.of(m));
        UtmAgentGroup g = new UtmAgentGroup(); g.setId(500L); g.setGroupName("Critical_Servers"); g.setTenantId(TENANT_A);
        when(groupRepo.findByIdAndTenantId(500L, TENANT_A)).thenReturn(Optional.of(g));

        EffectivePolicyDTO eff = service.effectiveForHost("10");
        assertThat(eff.getMatchedRank()).isEqualTo(1);
        assertThat(eff.getMatchedBy()).isEqualTo("group");
        assertThat(eff.getTemplates()).containsExactly("sec-log-full", "compliance-scan");
        assertThat(eff.getResolved()).contains("\"scans\"").contains("\"event\"");
        assertThat(eff.isHasMissingTemplate()).isFalse();
    }

    // ---- worked example 2: UEBA → rank 2 union ----
    @Test
    void uebaHostResolvesToRank2Union() {
        stubOneOrgTable(TABLE_JSON);
        stubTemplateLibrary();
        UtmAgentGroupMember m = new UtmAgentGroupMember();
        m.setGroupId(600L); m.setAgentId(20);
        when(memberRepo.findByAgentId(20)).thenReturn(List.of(m));
        UtmAgentGroup g = new UtmAgentGroup(); g.setId(600L); g.setGroupName("UEBA_Workstations"); g.setTenantId(TENANT_A);
        when(groupRepo.findByIdAndTenantId(600L, TENANT_A)).thenReturn(Optional.of(g));

        EffectivePolicyDTO eff = service.effectiveForHost("20");
        assertThat(eff.getMatchedRank()).isEqualTo(2);
        assertThat(eff.getTemplates()).containsExactly("ueba-on", "sec-log-basic");
    }

    // ---- worked example 3: Other → any catch-all ----
    @Test
    void otherHostResolvesToAnyCatchAll() {
        stubOneOrgTable(TABLE_JSON);
        stubTemplateLibrary();
        when(memberRepo.findByAgentId(30)).thenReturn(List.of()); // no group membership
        EffectivePolicyDTO eff = service.effectiveForHost("30");
        assertThat(eff.getMatchedRank()).isEqualTo(3);
        assertThat(eff.getMatchedBy()).isEqualTo("any");
        assertThat(eff.getTemplates()).containsExactly("sec-log-basic");
    }

    // ---- first-match: host in BOTH groups resolves to rank 1 only ----
    @Test
    void firstMatchWinsWhenHostInMultipleGroups() {
        stubOneOrgTable(TABLE_JSON);
        stubTemplateLibrary();
        UtmAgentGroupMember mc = new UtmAgentGroupMember(); mc.setGroupId(500L); mc.setAgentId(40);
        UtmAgentGroupMember mu = new UtmAgentGroupMember(); mu.setGroupId(600L); mu.setAgentId(40);
        when(memberRepo.findByAgentId(40)).thenReturn(List.of(mc, mu));
        UtmAgentGroup gc = new UtmAgentGroup(); gc.setId(500L); gc.setGroupName("Critical_Servers"); gc.setTenantId(TENANT_A);
        UtmAgentGroup gu = new UtmAgentGroup(); gu.setId(600L); gu.setGroupName("UEBA_Workstations"); gu.setTenantId(TENANT_A);
        when(groupRepo.findByIdAndTenantId(500L, TENANT_A)).thenReturn(Optional.of(gc));
        when(groupRepo.findByIdAndTenantId(600L, TENANT_A)).thenReturn(Optional.of(gu));

        EffectivePolicyDTO eff = service.effectiveForHost("40");
        assertThat(eff.getMatchedRank()).isEqualTo(1);
        assertThat(eff.getTemplates()).containsExactly("sec-log-full", "compliance-scan");
    }

    // ---- reordering ranks changes the effective policy ----
    @Test
    void reorderingRanksChangesEffectivePolicy() {
        // Swap: UEBA now rank 1, Critical rank 2. A host in BOTH groups now resolves to UEBA.
        String reordered = TABLE_JSON
            .replace("\"rank\":1,\"name\":\"Critical_Servers\"", "\"rank\":2,\"name\":\"Critical_Servers\"")
            .replace("\"rank\":2,\"name\":\"UEBA_Workstations\"", "\"rank\":1,\"name\":\"UEBA_Workstations\"");
        stubOneOrgTable(reordered);
        stubTemplateLibrary();
        UtmAgentGroupMember mc = new UtmAgentGroupMember(); mc.setGroupId(500L); mc.setAgentId(40);
        UtmAgentGroupMember mu = new UtmAgentGroupMember(); mu.setGroupId(600L); mu.setAgentId(40);
        when(memberRepo.findByAgentId(40)).thenReturn(List.of(mc, mu));
        UtmAgentGroup gc = new UtmAgentGroup(); gc.setId(500L); gc.setGroupName("Critical_Servers"); gc.setTenantId(TENANT_A);
        UtmAgentGroup gu = new UtmAgentGroup(); gu.setId(600L); gu.setGroupName("UEBA_Workstations"); gu.setTenantId(TENANT_A);
        when(groupRepo.findByIdAndTenantId(500L, TENANT_A)).thenReturn(Optional.of(gc));
        when(groupRepo.findByIdAndTenantId(600L, TENANT_A)).thenReturn(Optional.of(gu));

        EffectivePolicyDTO eff = service.effectiveForHost("40");
        assertThat(eff.getMatchedRank()).isEqualTo(1);
        assertThat(eff.getTemplates()).containsExactly("ueba-on", "sec-log-basic");
    }

    // ---- mandatory any-catch-all invariant ----
    @Test
    void createRejectsTableWithoutAnyCatchAll() {
        String noAny = "{\"rows\":[{\"rank\":1,\"name\":\"C\",\"match\":{\"group\":\"G\"},\"templates\":[\"t\"]}]}";
        HostTemplateAssociationDTO dto = new HostTemplateAssociationDTO();
        dto.setName("bad"); dto.setScope("ORG"); dto.setRowsJson(noAny);
        when(assocRepo.existsVisibleByName(anyString(), eq(TENANT_A))).thenReturn(false);
        assertThatThrownBy(() -> service.create(dto, "admin"))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("any");
    }

    @Test
    void createRejectsAnyNotHighestRank() {
        String anyNotLast = "{\"rows\":["
            + "{\"rank\":1,\"name\":\"Other\",\"match\":{\"any\":true},\"templates\":[\"t\"]},"
            + "{\"rank\":2,\"name\":\"C\",\"match\":{\"group\":\"G\"},\"templates\":[\"t\"]}]}";
        HostTemplateAssociationDTO dto = new HostTemplateAssociationDTO();
        dto.setName("bad"); dto.setScope("ORG"); dto.setRowsJson(anyNotLast);
        when(assocRepo.existsVisibleByName(anyString(), eq(TENANT_A))).thenReturn(false);
        assertThatThrownBy(() -> service.create(dto, "admin"))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("highest-ranked");
    }

    @Test
    void createAcceptsValidTableAndStampsTenant() {
        HostTemplateAssociationDTO dto = new HostTemplateAssociationDTO();
        dto.setName("Default"); dto.setScope("ORG"); dto.setRowsJson(TABLE_JSON);
        when(assocRepo.existsVisibleByName(anyString(), eq(TENANT_A))).thenReturn(false);
        when(assocRepo.save(any(HostTemplateAssociation.class))).thenAnswer(i -> {
            HostTemplateAssociation a = i.getArgument(0); a.setId(7L); return a;
        });
        HostTemplateAssociationDTO out = service.create(dto, "admin");
        assertThat(out.getVersionNum()).isEqualTo(1);
        assertThat(out.getName()).isEqualTo("Default");
    }

    // ---- Apply pushes only affected hosts via the delivery path ----
    @Test
    void applyPushesOnlyAffectedHostsAndRecordsResult() {
        when(assocRepo.findVisibleById(1L, TENANT_A)).thenReturn(Optional.of(table(TABLE_JSON)));
        when(assocRepo.save(any(HostTemplateAssociation.class))).thenAnswer(i -> i.getArgument(0));
        stubTemplateLibrary();
        stubOneOrgTable(TABLE_JSON);

        // groups named by the table → members. Critical_Servers has agent 10; UEBA_Workstations has agent 20.
        UtmAgentGroup gc = new UtmAgentGroup(); gc.setId(500L); gc.setGroupName("Critical_Servers"); gc.setTenantId(TENANT_A);
        UtmAgentGroup gu = new UtmAgentGroup(); gu.setId(600L); gu.setGroupName("UEBA_Workstations"); gu.setTenantId(TENANT_A);
        when(groupRepo.findByGroupName("Critical_Servers")).thenReturn(Optional.of(gc));
        when(groupRepo.findByGroupName("UEBA_Workstations")).thenReturn(Optional.of(gu));
        UtmAgentGroupMember m10 = new UtmAgentGroupMember(); m10.setGroupId(500L); m10.setAgentId(10);
        UtmAgentGroupMember m20 = new UtmAgentGroupMember(); m20.setGroupId(600L); m20.setAgentId(20);
        when(memberRepo.findByGroupId(500L)).thenReturn(List.of(m10));
        when(memberRepo.findByGroupId(600L)).thenReturn(List.of(m20));
        // per-host resolution membership lookups
        when(memberRepo.findByAgentId(10)).thenReturn(List.of(m10));
        when(memberRepo.findByAgentId(20)).thenReturn(List.of(m20));
        when(groupRepo.findByIdAndTenantId(500L, TENANT_A)).thenReturn(Optional.of(gc));
        when(groupRepo.findByIdAndTenantId(600L, TENANT_A)).thenReturn(Optional.of(gu));
        when(policyService.applyEffectivePolicyToAgent(eq(TENANT_A), any(), anyString(), anyString()))
            .thenReturn(999L);

        ApplyResultDTO res = service.apply(1L);
        // exactly the two group members were affected + pushed (the any row expands to no concrete host)
        assertThat(res.getAffectedHostCount()).isEqualTo(2);
        assertThat(res.getPushedCount()).isEqualTo(2);
        // delivery went through the reused path for each affected host
        verify(policyService).applyEffectivePolicyToAgent(eq(TENANT_A), eq(10), anyString(), anyString());
        verify(policyService).applyEffectivePolicyToAgent(eq(TENANT_A), eq(20), anyString(), anyString());
    }

    // ---- C1 regression: a `host` row naming a NON-owned connector is dropped (no cross-tenant push) ----
    @Test
    void applyDropsHostRowForConnectorNotOwnedByTenant() {
        String tbl = "{\"rows\":["
            + "{\"rank\":1,\"name\":\"Foreign host\",\"match\":{\"host\":\"777\"},\"templates\":[\"sec-log-basic\"]},"
            + "{\"rank\":2,\"name\":\"Other\",\"match\":{\"any\":true},\"templates\":[\"sec-log-basic\"]}]}";
        when(assocRepo.findVisibleById(1L, TENANT_A)).thenReturn(Optional.of(table(tbl)));
        when(assocRepo.save(any(HostTemplateAssociation.class))).thenAnswer(i -> i.getArgument(0));
        // connector 777 belongs to a group NOT owned by TENANT_A -> ownership proof fails
        UtmAgentGroupMember foreign = new UtmAgentGroupMember();
        foreign.setGroupId(900L);
        foreign.setAgentId(777);
        when(memberRepo.findByAgentId(777)).thenReturn(List.of(foreign));
        when(groupRepo.findByIdAndTenantId(900L, TENANT_A)).thenReturn(Optional.empty()); // not owned

        ApplyResultDTO res = service.apply(1L);
        // the foreign host is dropped (fail-closed); no APPLY_POLICY is delivered to it
        assertThat(res.getAffectedHostCount()).isZero();
        assertThat(res.getPushedCount()).isZero();
        verify(policyService, never()).applyEffectivePolicyToAgent(anyLong(), eq(777), anyString(), anyString());
    }

    // ---- C1 regression: a `host` row naming an OWNED connector IS pushed ----
    @Test
    void applyPushesHostRowForConnectorOwnedByTenant() {
        String tbl = "{\"rows\":["
            + "{\"rank\":1,\"name\":\"Owned host\",\"match\":{\"host\":\"55\"},\"templates\":[\"sec-log-basic\"]},"
            + "{\"rank\":2,\"name\":\"Other\",\"match\":{\"any\":true},\"templates\":[\"sec-log-basic\"]}]}";
        when(assocRepo.findVisibleById(1L, TENANT_A)).thenReturn(Optional.of(table(tbl)));
        when(assocRepo.save(any(HostTemplateAssociation.class))).thenAnswer(i -> i.getArgument(0));
        stubTemplateLibrary();
        stubOneOrgTable(tbl);
        UtmAgentGroupMember owned = new UtmAgentGroupMember();
        owned.setGroupId(500L);
        owned.setAgentId(55);
        when(memberRepo.findByAgentId(55)).thenReturn(List.of(owned));
        UtmAgentGroup g = new UtmAgentGroup();
        g.setId(500L); g.setGroupName("Owned"); g.setTenantId(TENANT_A);
        when(groupRepo.findByIdAndTenantId(500L, TENANT_A)).thenReturn(Optional.of(g));
        when(policyService.applyEffectivePolicyToAgent(eq(TENANT_A), any(), anyString(), anyString()))
            .thenReturn(42L);

        ApplyResultDTO res = service.apply(1L);
        assertThat(res.getPushedCount()).isEqualTo(1);
        verify(policyService).applyEffectivePolicyToAgent(eq(TENANT_A), eq(55), anyString(), anyString());
    }

    // ---- tenant isolation: cross-tenant by-id load reads as not found ----
    @Test
    void crossTenantByIdIsNotFound() {
        when(assocRepo.findVisibleById(1L, TENANT_A)).thenReturn(Optional.empty());
        assertThat(service.getById(1L)).isEmpty();
        assertThatThrownBy(() -> service.apply(1L))
            .isInstanceOf(jakarta.persistence.EntityNotFoundException.class);
    }

    // ---- missing template surfaced honestly, not silently dropped ----
    @Test
    void missingTemplateReportedNotSilentlyDropped() {
        String tbl = "{\"rows\":[{\"rank\":1,\"name\":\"Other\",\"match\":{\"any\":true},\"templates\":[\"ghost\",\"sec-log-basic\"]}]}";
        stubOneOrgTable(tbl);
        when(policyRepo.findVisibleTemplates(TENANT_A)).thenReturn(List.of(
            template("sec-log-basic", "{\"fim\":{\"mode\":\"merge\",\"rules\":[{\"path\":\"/etc\"}]}}")));
        when(memberRepo.findByAgentId(50)).thenReturn(List.of());
        EffectivePolicyDTO eff = service.effectiveForHost("50");
        assertThat(eff.isHasMissingTemplate()).isTrue();
        assertThat(eff.getMissingTemplates()).containsExactly("ghost");
        assertThat(eff.getResolved()).contains("/etc"); // resolvable one still merged
    }
}
