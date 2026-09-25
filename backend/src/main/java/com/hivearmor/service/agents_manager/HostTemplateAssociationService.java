package com.hivearmor.service.agents_manager;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.agents_manager.HostTemplateAssociation;
import com.hivearmor.domain.agents_manager.UtmAgentGroup;
import com.hivearmor.domain.agents_manager.UtmAgentGroupMember;
import com.hivearmor.domain.agents_manager.UtmAgentPolicy;
import com.hivearmor.multitenancy.TenantScope;
import com.hivearmor.repository.agents_manager.HostTemplateAssociationRepository;
import com.hivearmor.repository.agents_manager.UtmAgentGroupMemberRepository;
import com.hivearmor.repository.agents_manager.UtmAgentGroupRepository;
import com.hivearmor.repository.agents_manager.UtmAgentPolicyRepository;
import com.hivearmor.service.dto.agent_manager.ApplyResultDTO;
import com.hivearmor.service.dto.agent_manager.EffectivePolicyDTO;
import com.hivearmor.service.dto.agent_manager.HostTemplateAssociationDTO;
import jakarta.persistence.EntityNotFoundException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * PT-3 — host→template association tables: CRUD, the ranked first-match resolver, and Apply.
 *
 * <p>FortiSIEM model: {@code effective(host) = rows.sortByRank().first(r => matches(r.match,host)).templates},
 * then union+de-dupe the winning row's templates per PT-0 §3. Editing rows is a DRAFT — nothing ships
 * until {@link #apply(Long)} re-resolves every affected host and re-pushes {@code APPLY_POLICY} via the
 * existing {@link UtmAgentPolicyService} delivery path (push-log + drift recorded there).
 *
 * <p>TENANT ISOLATION — the table carries its own {@code tenant_id} + RLS (PT-3 changeset). All reads
 * go through the visible-set repository queries (own-tenant OR GLOBAL) and all writes stamp the
 * authoritative tenant server-side. GLOBAL default tables are writable only by a global admin.
 *
 * <p>STAGING CANDIDATE — not PRODUCTION READY.
 */
@Service
@Transactional
public class HostTemplateAssociationService {

    private static final Logger log = LoggerFactory.getLogger(HostTemplateAssociationService.class);

    static final String SCOPE_GLOBAL = "GLOBAL";
    static final String SCOPE_ORG = "ORG";
    private static final String ROLE_GLOBAL_ADMIN = "ROLE_ADMIN";

    private final HostTemplateAssociationRepository assocRepo;
    private final UtmAgentPolicyRepository policyRepo;
    private final UtmAgentGroupRepository groupRepo;
    private final UtmAgentGroupMemberRepository memberRepo;
    private final PolicyTemplateMerger merger;
    private final UtmAgentPolicyService policyService;
    private final ObjectMapper objectMapper;

    public HostTemplateAssociationService(HostTemplateAssociationRepository assocRepo,
                                          UtmAgentPolicyRepository policyRepo,
                                          UtmAgentGroupRepository groupRepo,
                                          UtmAgentGroupMemberRepository memberRepo,
                                          PolicyTemplateMerger merger,
                                          UtmAgentPolicyService policyService,
                                          ObjectMapper objectMapper) {
        this.assocRepo = assocRepo;
        this.policyRepo = policyRepo;
        this.groupRepo = groupRepo;
        this.memberRepo = memberRepo;
        this.merger = merger;
        this.policyService = policyService;
        this.objectMapper = objectMapper;
    }

    // ==================== CRUD ====================

    public List<HostTemplateAssociationDTO> listVisible() {
        long tenant = TenantScope.requireTenant();
        return assocRepo.findVisible(tenant).stream().map(HostTemplateAssociationDTO::new)
            .collect(Collectors.toList());
    }

    public Optional<HostTemplateAssociationDTO> getById(Long id) {
        long tenant = TenantScope.requireTenant();
        return assocRepo.findVisibleById(id, tenant).map(HostTemplateAssociationDTO::new);
    }

    public HostTemplateAssociationDTO create(HostTemplateAssociationDTO dto, String createdBy) {
        long tenant = TenantScope.requireTenant();
        String scope = normalizeScope(dto.getScope());
        requireGlobalAdminForGlobalWrite(scope);
        String name = requireName(dto.getName());
        if (assocRepo.existsVisibleByName(name, tenant)) {
            throw new IllegalArgumentException("an association table named \"" + name + "\" already exists");
        }
        HostTemplateAssociation a = new HostTemplateAssociation();
        a.setName(name);
        a.setScope(scope);
        a.setOrgId(SCOPE_ORG.equals(scope) ? dto.getOrgId() : null);
        a.setRowsJson(validateAndNormalizeRows(dto.getRowsJson(), scope, a.getOrgId()));
        a.setVersionNum(1);
        a.setCreatedBy(createdBy);
        a.setTenantId(tenant);   // authoritative, never from payload
        return new HostTemplateAssociationDTO(assocRepo.save(a));
    }

    public HostTemplateAssociationDTO update(Long id, HostTemplateAssociationDTO dto) {
        HostTemplateAssociation a = requireVisible(id);
        // A mutation of a GLOBAL table, OR a re-scope into GLOBAL, requires global-admin.
        requireGlobalAdminForGlobalWrite(a.getScope());
        if (dto.getName() != null) a.setName(requireName(dto.getName()));
        if (dto.getScope() != null) {
            String newScope = normalizeScope(dto.getScope());
            requireGlobalAdminForGlobalWrite(newScope);
            a.setScope(newScope);
            if (SCOPE_GLOBAL.equals(newScope)) a.setOrgId(null);
        }
        if (dto.getOrgId() != null && SCOPE_ORG.equals(a.getScope())) a.setOrgId(dto.getOrgId());
        if (dto.getRowsJson() != null) {
            a.setRowsJson(validateAndNormalizeRows(dto.getRowsJson(), a.getScope(), a.getOrgId()));
        }
        // Server owns the version counter — bump on every draft edit; client value never trusted.
        a.setVersionNum(a.getVersionNum() + 1);
        a.setUpdatedAt(Instant.now());
        return new HostTemplateAssociationDTO(assocRepo.save(a));
    }

    public void delete(Long id) {
        HostTemplateAssociation a = requireVisible(id);
        requireGlobalAdminForGlobalWrite(a.getScope());
        assocRepo.deleteById(id);
    }

    // ==================== resolver ====================

    /**
     * Resolve one host's effective policy against the caller tenant's ORG table(s) then any GLOBAL
     * default table. First matching row by ascending rank wins (ties → array order). The winning
     * row's templates are merged (PT-0 §3). The {@code any} catch-all invariant guarantees a result.
     */
    public EffectivePolicyDTO effectiveForHost(String host) {
        long tenant = TenantScope.requireTenant();
        HostModel hm = loadHost(host, tenant);
        // Own ORG rows first, then GLOBAL default (own tenant's binding takes precedence).
        List<HostTemplateAssociation> tables = new ArrayList<>(assocRepo.findOrgTablesForTenant(tenant));
        tables.addAll(assocRepo.findGlobalTables());
        for (HostTemplateAssociation table : tables) {
            EffectivePolicyDTO r = resolveAgainstTable(table, hm, tenant);
            if (r != null) return r;
        }
        // No table matched — report an unresolved host rather than throwing.
        EffectivePolicyDTO empty = new EffectivePolicyDTO();
        empty.setHost(host);
        empty.setTemplates(List.of());
        return empty;
    }

    /** Resolve a host against ONE association table; null if no row matched (should not happen with any-catch-all). */
    private EffectivePolicyDTO resolveAgainstTable(HostTemplateAssociation table, HostModel host, long tenant) {
        JsonNode rows;
        try {
            JsonNode doc = objectMapper.readTree(table.getRowsJson());
            rows = doc.get("rows");
        } catch (Exception e) {
            log.warn("PT-3 resolver: association table id={} has invalid rows_json, skipping", table.getId());
            return null;
        }
        if (rows == null || !rows.isArray()) return null;

        // stable sort by ascending rank; ties keep array order
        List<JsonNode> ordered = new ArrayList<>();
        rows.forEach(ordered::add);
        ordered.sort((x, y) -> Integer.compare(rankOf(x), rankOf(y)));

        for (JsonNode row : ordered) {
            String matchedBy = matches(row.get("match"), host);
            if (matchedBy != null) {
                return buildEffective(host.id, row, matchedBy, tenant);
            }
        }
        return null;
    }

    /** Returns the matched predicate name ("group"|"host"|"tag"|"any") or null if the row does not match. */
    private String matches(JsonNode match, HostModel host) {
        if (match == null || !match.isObject()) return null;
        if (match.has("any") && match.get("any").asBoolean(false)) return "any";
        if (match.hasNonNull("group") && host.groups.contains(match.get("group").asText())) return "group";
        if (match.hasNonNull("host") && host.id.equals(match.get("host").asText())) return "host";
        if (match.hasNonNull("tag") && host.tags.contains(match.get("tag").asText())) return "tag";
        return null;
    }

    private EffectivePolicyDTO buildEffective(String host, JsonNode row, String matchedBy, long tenant) {
        EffectivePolicyDTO dto = new EffectivePolicyDTO();
        dto.setHost(host);
        dto.setMatchedRank(row.hasNonNull("rank") ? row.get("rank").asInt() : null);
        dto.setMatchedRowName(row.hasNonNull("name") ? row.get("name").asText() : null);
        dto.setMatchedBy(matchedBy);

        // union + de-dupe template names, stable order
        LinkedHashSet<String> names = new LinkedHashSet<>();
        if (row.has("templates") && row.get("templates").isArray()) {
            row.get("templates").forEach(t -> names.add(t.asText()));
        }
        dto.setTemplates(new ArrayList<>(names));

        // load each template's config in listed order; collect misses honestly
        List<String> configs = new ArrayList<>();
        List<String> missing = new ArrayList<>();
        for (String name : names) {
            Optional<UtmAgentPolicy> tpl = findTemplateByName(name, tenant);
            if (tpl.isPresent()) {
                configs.add(tpl.get().getPolicyConfig());
            } else {
                missing.add(name);
            }
        }
        dto.setResolved(merger.merge(configs));
        dto.setMissingTemplates(missing);
        dto.setHasMissingTemplate(!missing.isEmpty());
        return dto;
    }

    /** Template lookup within library visibility (own-tenant OR GLOBAL), by name. */
    private Optional<UtmAgentPolicy> findTemplateByName(String name, long tenant) {
        return policyRepo.findVisibleTemplates(tenant).stream()
            .filter(p -> name.equals(p.getPolicyName()))
            .findFirst();
    }

    // ==================== Apply ====================

    /**
     * Re-resolve every host affected by an association table and push {@code APPLY_POLICY} to each.
     * "Affected" = every agent that is a member of a group named by a {@code group} row, plus every
     * agent named by a {@code host} row. (An {@code any} / {@code tag} row does not by itself expand
     * to a concrete host set — {@code any} is the catch-all applied when a host is resolved, and
     * {@code tag} has no host source today.) Each affected host is resolved through the FULL table
     * (so first-match ordering is honored) and pushed its merged effective policy.
     */
    public ApplyResultDTO apply(Long id) {
        long tenant = TenantScope.requireTenant();
        HostTemplateAssociation table = requireVisible(id);
        requireGlobalAdminForGlobalWrite(table.getScope());   // applying a GLOBAL default table is a global-admin act

        Set<Integer> affected = affectedAgents(table, tenant);

        ApplyResultDTO result = new ApplyResultDTO();
        result.setAssociationId(id);
        result.setAffectedHostCount(affected.size());
        List<ApplyResultDTO.HostApply> hosts = new ArrayList<>();
        int pushed = 0;

        for (Integer agentId : affected) {
            EffectivePolicyDTO eff = effectiveForHost(String.valueOf(agentId));
            ApplyResultDTO.HostApply ha = new ApplyResultDTO.HostApply();
            ha.setHost(String.valueOf(agentId));
            ha.setMatchedRank(eff.getMatchedRank());
            ha.setMatchedRowName(eff.getMatchedRowName());
            ha.setTemplates(eff.getTemplates());
            if (eff.getMatchedRank() == null || eff.getResolved() == null) {
                ha.setStatus("SKIPPED_UNRESOLVED");
                ha.setDetail("host did not resolve to any row");
            } else {
                // materialize the merged effective policy + deliver APPLY_POLICY via the existing path
                Long effPolicyId = policyService.applyEffectivePolicyToAgent(
                    tenant, agentId, eff.getMatchedRowName(), eff.getResolved());
                ha.setEffectivePolicyId(effPolicyId);
                ha.setStatus("PUSHED");
                ha.setDetail(eff.isHasMissingTemplate()
                    ? "pushed; missing templates skipped: " + eff.getMissingTemplates()
                    : "pushed");
                pushed++;
            }
            hosts.add(ha);
        }
        result.setPushedCount(pushed);
        result.setHosts(hosts);

        table.setLastAppliedAt(Instant.now());
        assocRepo.save(table);
        log.info("PT-3 apply id={} tenant={} affected={} pushed={}", id, tenant, affected.size(), pushed);
        return result;
    }

    /** The concrete set of agents named (directly or via group) by the table's rows. */
    private Set<Integer> affectedAgents(HostTemplateAssociation table, long tenant) {
        Set<Integer> agents = new LinkedHashSet<>();
        JsonNode rows;
        try {
            rows = objectMapper.readTree(table.getRowsJson()).get("rows");
        } catch (Exception e) {
            return agents;
        }
        if (rows == null || !rows.isArray()) return agents;
        for (JsonNode row : rows) {
            JsonNode m = row.get("match");
            if (m == null) continue;
            if (m.hasNonNull("group")) {
                groupRepo.findByGroupName(m.get("group").asText())
                    .filter(g -> g.getTenantId() != null && g.getTenantId().longValue() == tenant)
                    .ifPresent(g -> memberRepo.findByGroupId(g.getId())
                        .forEach(mem -> agents.add(mem.getAgentId())));
            } else if (m.hasNonNull("host")) {
                // SECURITY (C1): a `host` row names a raw connector id. NEVER push to it without
                // proving the caller's tenant owns that agent — otherwise tenant A could name
                // tenant B's connector id and Apply would deliver APPLY_POLICY across tenants.
                // The agent registry lives out-of-process (agent-manager gRPC), so the authoritative
                // in-backend ownership proof is: the connector is a member of a group owned by this
                // tenant (group tenant_id is RLS-protected). Fail-closed: an id we cannot prove the
                // caller owns is dropped, never pushed.
                try {
                    int connectorId = Integer.parseInt(m.get("host").asText().trim());
                    if (isAgentOwnedByTenant(connectorId, tenant)) {
                        agents.add(connectorId);
                    } else {
                        log.warn("PT-3 apply: host row names connector {} not owned by tenant {} — dropped (fail-closed)",
                            connectorId, tenant);
                    }
                } catch (NumberFormatException ignored) {
                    // host id that is not a numeric connector id: no concrete agent to push to
                }
            }
            // any / tag: no direct host expansion. NOTE: for a GLOBAL default table this method
            // therefore only expands hosts the APPLYING tenant owns — a GLOBAL table applied by a
            // global admin pushes to that admin's own tenant hosts, not silently to every tenant.
            // Per-tenant fan-out of a GLOBAL binding is a deliberate future extension, not a silent
            // cross-tenant push (which would be a leak).
        }
        return agents;
    }

    /**
     * Fail-closed tenant-ownership proof for a bare connector id: the agent must be a member of at
     * least one group owned by {@code tenant}. Group {@code tenant_id} is authoritative and
     * RLS-protected, and this needs no cross-service call to the agent-manager registry. An agent
     * with no caller-tenant group membership is treated as NOT owned (dropped), which is the safe
     * default for a security-critical push path.
     */
    private boolean isAgentOwnedByTenant(int connectorId, long tenant) {
        for (UtmAgentGroupMember mem : memberRepo.findByAgentId(connectorId)) {
            if (groupRepo.findByIdAndTenantId(mem.getGroupId(), tenant).isPresent()) {
                return true;
            }
        }
        return false;
    }

    // ==================== validation / invariant ====================

    /**
     * Validate + normalize the PT-0 host-template-association rows document. Enforces the MANDATORY
     * {@code any} catch-all invariant: exactly one {@code any} row, and it MUST be the highest rank
     * (evaluated last). A table that violates this is REJECTED (not silently repaired) so hosts are
     * never left unpoliced and first-match ordering is never ambiguous. Also stamps scope/orgId onto
     * the document so it matches the columns (single source of truth).
     */
    String validateAndNormalizeRows(String rowsJson, String scope, String orgId) {
        JsonNode doc;
        try {
            doc = objectMapper.readTree(rowsJson == null || rowsJson.isBlank() ? "{}" : rowsJson);
        } catch (Exception e) {
            throw new IllegalArgumentException("rows must be valid JSON: " + e.getMessage());
        }
        if (doc == null || !doc.isObject()) {
            throw new IllegalArgumentException("association document must be a JSON object with a rows[] array");
        }
        JsonNode rows = doc.get("rows");
        if (rows == null || !rows.isArray() || rows.isEmpty()) {
            throw new IllegalArgumentException("association table must have at least one row");
        }

        int anyCount = 0;
        int maxRank = Integer.MIN_VALUE;
        int anyRank = Integer.MIN_VALUE;
        Set<Integer> ranks = new LinkedHashSet<>();
        for (JsonNode row : rows) {
            validateRow(row);
            int rank = rankOf(row);
            maxRank = Math.max(maxRank, rank);
            if (!ranks.add(rank)) {
                log.warn("PT-3 validate: duplicate rank {} in association table (ties break by array order)", rank);
            }
            JsonNode m = row.get("match");
            if (m != null && m.has("any") && m.get("any").asBoolean(false)) {
                anyCount++;
                anyRank = rank;
            }
        }
        if (anyCount == 0) {
            throw new IllegalArgumentException(
                "association table must contain exactly one \"any\" catch-all row so every host resolves; "
                + "add a terminal row with match {\"any\": true} at the highest rank");
        }
        if (anyCount > 1) {
            throw new IllegalArgumentException("association table must contain exactly one \"any\" catch-all row");
        }
        if (anyRank != maxRank) {
            throw new IllegalArgumentException(
                "the \"any\" catch-all must be the highest-ranked row (evaluated last); "
                + "found any at rank " + anyRank + " but a higher rank " + maxRank + " exists");
        }

        // stamp scope/orgId onto the document so it matches the columns (single source of truth)
        com.fasterxml.jackson.databind.node.ObjectNode norm =
            ((com.fasterxml.jackson.databind.node.ObjectNode) doc).deepCopy();
        norm.put("scope", scope);
        if (SCOPE_ORG.equals(scope) && orgId != null) norm.put("orgId", orgId);
        else norm.remove("orgId");
        try {
            return objectMapper.writeValueAsString(norm);
        } catch (Exception e) {
            throw new IllegalStateException("failed to serialize association rows", e);
        }
    }

    private void validateRow(JsonNode row) {
        if (row == null || !row.isObject()) {
            throw new IllegalArgumentException("each association row must be an object");
        }
        if (!row.hasNonNull("rank") || !row.get("rank").isInt() || row.get("rank").asInt() < 1) {
            throw new IllegalArgumentException("each row requires an integer rank >= 1");
        }
        if (!row.hasNonNull("name") || row.get("name").asText().isBlank()) {
            throw new IllegalArgumentException("each row requires a non-blank name");
        }
        JsonNode m = row.get("match");
        if (m == null || !m.isObject()) {
            throw new IllegalArgumentException("each row requires a match object");
        }
        int predicates = 0;
        for (String p : new String[]{"group", "host", "tag", "any"}) if (m.has(p)) predicates++;
        if (predicates != 1) {
            throw new IllegalArgumentException(
                "row \"" + row.get("name").asText() + "\": match must have exactly one of group|host|tag|any");
        }
        JsonNode tpls = row.get("templates");
        if (tpls == null || !tpls.isArray() || tpls.isEmpty()) {
            throw new IllegalArgumentException(
                "row \"" + row.get("name").asText() + "\": templates[] must list at least one template");
        }
        for (JsonNode t : tpls) {
            if (!t.isTextual() || t.asText().isBlank()) {
                throw new IllegalArgumentException("row \"" + row.get("name").asText() + "\": template names must be non-blank strings");
            }
        }
    }

    private int rankOf(JsonNode row) {
        return row.hasNonNull("rank") && row.get("rank").isInt() ? row.get("rank").asInt() : Integer.MAX_VALUE;
    }

    // ==================== host model ====================

    /** Minimal host model for resolution: connector id, group names it belongs to, and tags. */
    private static final class HostModel {
        final String id;
        final Set<String> groups;
        final Set<String> tags;
        HostModel(String id, Set<String> groups, Set<String> tags) {
            this.id = id; this.groups = groups; this.tags = tags;
        }
    }

    /**
     * Load a host's resolution attributes. The host id is the numeric agent connector id.
     * Groups are resolved via tenant-scoped group membership (group RLS keeps this tenant-safe).
     * TAGS: there is no first-class agent-tag store today, so tags resolve to the empty set — a
     * {@code tag} match predicate is stored/validated but matches no host until an agent-tag source
     * exists (out of PT-3 scope; noted for a future wave). This is fail-closed: an unresolvable tag
     * simply never matches, it never widens the match.
     */
    private HostModel loadHost(String host, long tenant) {
        Set<String> groups = new LinkedHashSet<>();
        Integer connectorId = null;
        try {
            connectorId = Integer.parseInt(host.trim());
        } catch (NumberFormatException ignored) {
            // non-numeric host id: only a `host` exact-string predicate can match it
        }
        if (connectorId != null) {
            for (UtmAgentGroupMember mem : memberRepo.findByAgentId(connectorId)) {
                groupRepo.findByIdAndTenantId(mem.getGroupId(), tenant)
                    .map(UtmAgentGroup::getGroupName)
                    .ifPresent(groups::add);
            }
        }
        return new HostModel(host, groups, Set.of());   // tags empty — no agent-tag store yet
    }

    // ==================== authz / normalization ====================

    private HostTemplateAssociation requireVisible(Long id) {
        long tenant = TenantScope.requireTenant();
        return assocRepo.findVisibleById(id, tenant)
            .orElseThrow(() -> new EntityNotFoundException("Association table not found: " + id));
    }

    private String normalizeScope(String raw) {
        if (raw == null || raw.isBlank()) return SCOPE_ORG;
        String s = raw.trim().toUpperCase(Locale.ROOT);
        if (!SCOPE_GLOBAL.equals(s) && !SCOPE_ORG.equals(s)) {
            throw new IllegalArgumentException("scope must be \"" + SCOPE_GLOBAL + "\" or \"" + SCOPE_ORG + "\"");
        }
        return s;
    }

    private String requireName(String raw) {
        if (raw == null || raw.isBlank()) throw new IllegalArgumentException("name is required");
        String n = raw.trim();
        if (n.length() > 128) throw new IllegalArgumentException("name must be <= 128 chars");
        return n;
    }

    /** Fail-closed: writing/applying a GLOBAL-scope table requires the global-admin role. */
    private void requireGlobalAdminForGlobalWrite(String scope) {
        if (!SCOPE_GLOBAL.equals(scope)) return;
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        boolean isGlobalAdmin = auth != null && auth.getAuthorities() != null
            && auth.getAuthorities().stream().map(GrantedAuthority::getAuthority)
                .anyMatch(ROLE_GLOBAL_ADMIN::equals);
        if (!isGlobalAdmin) {
            throw new AccessDeniedException(
                "GLOBAL-scope association tables are writable only by a global admin (" + ROLE_GLOBAL_ADMIN + ")");
        }
    }

    /** Test seam: expose the visible-set collection for assertions without leaking the repo. */
    Collection<HostTemplateAssociationDTO> visibleForTests() {
        return listVisible();
    }
}
