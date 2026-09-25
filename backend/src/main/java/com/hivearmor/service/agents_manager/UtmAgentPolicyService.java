package com.hivearmor.service.agents_manager;

import com.hivearmor.domain.agents_manager.*;
import com.hivearmor.multitenancy.TenantScope;
import com.hivearmor.repository.agents_manager.*;
import com.hivearmor.service.dto.agent_manager.*;
import com.hivearmor.service.incident_response.grpc_impl.IncidentResponseCommandService;
import io.grpc.stub.StreamObserver;
import jakarta.persistence.EntityNotFoundException;
import com.hivearmor.service.grpc.CommandResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@Transactional
public class UtmAgentPolicyService {

    private static final Logger log = LoggerFactory.getLogger(UtmAgentPolicyService.class);

    private final UtmAgentPolicyRepository policyRepo;
    private final UtmPolicyGroupAssignmentRepository assignmentRepo;
    private final UtmPolicyPushLogRepository pushLogRepo;
    private final UtmAgentPolicyStateRepository stateRepo;
    private final UtmAgentGroupMemberRepository memberRepo;
    private final IncidentResponseCommandService commandService;
    private final AgentPolicySchemaService schemaService;
    private final com.fasterxml.jackson.databind.ObjectMapper objectMapper;

    public UtmAgentPolicyService(UtmAgentPolicyRepository policyRepo,
                                  UtmPolicyGroupAssignmentRepository assignmentRepo,
                                  UtmPolicyPushLogRepository pushLogRepo,
                                  UtmAgentPolicyStateRepository stateRepo,
                                  UtmAgentGroupMemberRepository memberRepo,
                                  IncidentResponseCommandService commandService,
                                  AgentPolicySchemaService schemaService,
                                  com.fasterxml.jackson.databind.ObjectMapper objectMapper) {
        this.policyRepo = policyRepo;
        this.assignmentRepo = assignmentRepo;
        this.pushLogRepo = pushLogRepo;
        this.stateRepo = stateRepo;
        this.memberRepo = memberRepo;
        this.commandService = commandService;
        this.schemaService = schemaService;
        this.objectMapper = objectMapper;
    }

    public List<AgentPolicyDTO> listAll() {
        // SPEC-04 (W1b) — scope to the caller's tenant; single-tenant = 0.
        long tenant = TenantScope.requireTenant();
        return policyRepo.findByTenantIdOrderByPolicyNameAsc(tenant).stream().map(this::toDto)
            .collect(Collectors.toList());
    }

    public Optional<AgentPolicyDTO> getById(Long id) {
        // SPEC-04 (W1b) — by-id load re-checked against the caller's tenant.
        long tenant = TenantScope.requireTenant();
        return policyRepo.findByIdAndTenantId(id, tenant).map(this::toDto);
    }

    public AgentPolicyDTO create(AgentPolicyDTO dto, String createdBy) {
        rejectReservedName(dto.getPolicyName());
        UtmAgentPolicy p = new UtmAgentPolicy();
        p.setPolicyName(dto.getPolicyName());
        p.setDescription(dto.getDescription());
        p.setPlatform(normalizePlatform(dto.getPlatform()));
        p.setPolicyConfig(schemaService.normalizePolicyConfig(
            dto.getPolicyConfig() != null ? dto.getPolicyConfig() : "{}"));
        p.setVersionNum(1);
        p.setIsActive(dto.getIsActive() != null ? dto.getIsActive() : true);
        p.setCreatedBy(createdBy);
        // PT-1 (template library) — scope + template flag. Ad-hoc policies default to
        // ORG / is_template=false, preserving pre-PT-1 behavior exactly.
        String scope = normalizeScope(dto.getScope());
        boolean isTemplate = Boolean.TRUE.equals(dto.getIsTemplate());
        // GLOBAL is writable only by a global-admin (ROLE_ADMIN) — enforced server-side because
        // @PreAuthorize cannot see the payload's scope. Fail-closed AccessDeniedException.
        requireGlobalAdminForGlobalWrite(scope);
        p.setScope(scope);
        p.setOrgId(SCOPE_ORG.equals(scope) ? dto.getOrgId() : null);
        p.setIsTemplate(isTemplate);
        // SPEC-04 (W1b) — stamp the authoritative tenant server-side (never payload).
        p.setTenantId(TenantScope.requireTenant());
        return toDto(policyRepo.save(p));
    }

    public AgentPolicyDTO update(Long id, AgentPolicyDTO dto) {
        UtmAgentPolicy p = requireInTenant(id);
        // PT-1 — a mutation of an existing GLOBAL row, OR a re-scope into GLOBAL, both require
        // global-admin. Check the row's current scope AND the incoming target scope, fail-closed.
        requireGlobalAdminForGlobalWrite(p.getScope());
        p.setPolicyName(dto.getPolicyName());
        p.setDescription(dto.getDescription());
        if (dto.getPlatform() != null) p.setPlatform(normalizePlatform(dto.getPlatform()));
        if (dto.getPolicyConfig() != null) {
            p.setPolicyConfig(schemaService.normalizePolicyConfig(dto.getPolicyConfig()));
        }
        if (dto.getScope() != null) {
            String newScope = normalizeScope(dto.getScope());
            requireGlobalAdminForGlobalWrite(newScope);
            p.setScope(newScope);
            if (SCOPE_GLOBAL.equals(newScope)) p.setOrgId(null);
        }
        if (dto.getOrgId() != null && SCOPE_ORG.equals(p.getScope())) p.setOrgId(dto.getOrgId());
        if (dto.getIsTemplate() != null) p.setIsTemplate(dto.getIsTemplate());
        if (dto.getIsActive() != null) p.setIsActive(dto.getIsActive());
        // Server owns the authoritative version counter — bump on edit; a client-supplied
        // version (PT-0 envelope alias) is NEVER trusted for the stored value.
        p.setVersionNum(p.getVersionNum() + 1);
        p.setUpdatedAt(Instant.now());
        return toDto(policyRepo.save(p));
    }

    // ---- PT-1 (template library) ------------------------------------------------------

    public static final String SCOPE_GLOBAL = "GLOBAL";
    public static final String SCOPE_ORG = "ORG";
    private static final String ROLE_GLOBAL_ADMIN = "ROLE_ADMIN";

    /**
     * PT-3 — name prefix reserved for the system-managed per-agent effective-policy rows that Apply
     * materializes ({@link #applyEffectivePolicyToAgent}). User-facing create/clone MUST reject it so
     * a low-priv author cannot craft a template whose name collides with (and hijacks) the row a later
     * Apply upserts and pushes. Only {@link #applyEffectivePolicyToAgent} may write a name with it.
     */
    private static final String RESERVED_NAME_PREFIX = "__effective__:";

    /** Reject a user-supplied policy name that intrudes on the reserved system namespace. */
    private void rejectReservedName(String name) {
        if (name != null && name.trim().startsWith(RESERVED_NAME_PREFIX)) {
            throw new IllegalArgumentException(
                "policy name must not start with the reserved prefix \"" + RESERVED_NAME_PREFIX + "\"");
        }
    }

    /** Normalize/validate scope; null/blank defaults to ORG. Rejects unknown values clearly. */
    private String normalizeScope(String raw) {
        if (raw == null || raw.isBlank()) return SCOPE_ORG;
        String s = raw.trim().toUpperCase(Locale.ROOT);
        if (!SCOPE_GLOBAL.equals(s) && !SCOPE_ORG.equals(s)) {
            throw new IllegalArgumentException("scope must be \"" + SCOPE_GLOBAL + "\" or \"" + SCOPE_ORG + "\"");
        }
        return s;
    }

    /** Normalize/validate platform; null passes through. Rejects unknown values clearly. */
    private String normalizePlatform(String raw) {
        if (raw == null || raw.isBlank()) return raw;
        String s = raw.trim().toLowerCase(Locale.ROOT);
        if (!"windows".equals(s) && !"linux".equals(s)) {
            throw new IllegalArgumentException("platform must be \"windows\" or \"linux\"");
        }
        return s;
    }

    /**
     * Fail-closed authorization: writing a GLOBAL-scope row requires the global-admin role
     * ({@code ROLE_ADMIN}). ORG-scope writes are unaffected (already ROLE_SOC_MANAGER|ROLE_ADMIN
     * at the endpoint). Uses the request SecurityContext; a missing/blank authentication denies.
     */
    private void requireGlobalAdminForGlobalWrite(String scope) {
        if (!SCOPE_GLOBAL.equals(scope)) return;
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        boolean isGlobalAdmin = auth != null && auth.getAuthorities() != null
            && auth.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .anyMatch(ROLE_GLOBAL_ADMIN::equals);
        if (!isGlobalAdmin) {
            throw new AccessDeniedException(
                "GLOBAL-scope templates are writable only by a global admin (" + ROLE_GLOBAL_ADMIN + ")");
        }
    }

    /** Template library list: own-tenant templates (any scope) UNION all GLOBAL templates. */
    public List<AgentPolicyDTO> listTemplates() {
        long tenant = TenantScope.requireTenant();
        return policyRepo.findVisibleTemplates(tenant).stream().map(this::toDto)
            .collect(Collectors.toList());
    }

    /**
     * Template library search: same visibility as {@link #listTemplates()}, filtered
     * in-memory by optional name (case-insensitive contains), scope, and platform.
     */
    public List<AgentPolicyDTO> searchTemplates(String name, String scope, String platform) {
        long tenant = TenantScope.requireTenant();
        String nameLc = name == null ? null : name.trim().toLowerCase(Locale.ROOT);
        String scopeUc = (scope == null || scope.isBlank()) ? null : normalizeScope(scope);
        String platLc = (platform == null || platform.isBlank()) ? null : normalizePlatform(platform);
        return policyRepo.findVisibleTemplates(tenant).stream()
            .filter(p -> nameLc == null
                || (p.getPolicyName() != null && p.getPolicyName().toLowerCase(Locale.ROOT).contains(nameLc)))
            .filter(p -> scopeUc == null || scopeUc.equals(p.getScope()))
            .filter(p -> platLc == null || platLc.equals(p.getPlatform()))
            .map(this::toDto)
            .collect(Collectors.toList());
    }

    /** Get one template by id within library visibility (own-tenant OR GLOBAL). */
    public Optional<AgentPolicyDTO> getTemplateById(Long id) {
        long tenant = TenantScope.requireTenant();
        return policyRepo.findVisibleTemplateById(id, tenant).map(this::toDto);
    }

    /**
     * Clone a visible template into a NEW template row owned by the caller's tenant. The clone is
     * always {@code is_template=true}, starts at version 1, and defaults to ORG scope (cloning a
     * GLOBAL template into your own tenant does not silently create a new GLOBAL). {@code newName}
     * must be provided and unique within the caller's visible library.
     */
    public AgentPolicyDTO cloneTemplate(Long id, String newName, String createdBy) {
        if (newName == null || newName.isBlank()) {
            throw new IllegalArgumentException("clone requires a non-blank name");
        }
        rejectReservedName(newName);
        long tenant = TenantScope.requireTenant();
        UtmAgentPolicy src = policyRepo.findVisibleTemplateById(id, tenant)
            .orElseThrow(() -> new EntityNotFoundException("Template not found: " + id));
        if (policyRepo.existsVisibleByPolicyName(newName.trim(), tenant)) {
            throw new IllegalArgumentException("a policy named \"" + newName.trim() + "\" already exists");
        }
        UtmAgentPolicy clone = new UtmAgentPolicy();
        clone.setPolicyName(newName.trim());
        clone.setDescription(src.getDescription());
        clone.setPlatform(src.getPlatform());
        // Re-normalize the source config so the clone stores a validated document.
        clone.setPolicyConfig(schemaService.normalizePolicyConfig(src.getPolicyConfig()));
        clone.setVersionNum(1);
        clone.setIsActive(src.getIsActive());
        clone.setIsTemplate(true);
        clone.setScope(SCOPE_ORG);           // clone lands in the caller's own org, never GLOBAL
        clone.setOrgId(src.getOrgId());
        clone.setCreatedBy(createdBy);
        clone.setTenantId(tenant);           // owned by the caller's tenant, never the source's
        return toDto(policyRepo.save(clone));
    }

    /**
     * PT-1 — create a template from a raw PT-0 template ENVELOPE JSON (metadata keys + schema-v1
     * sections in one object). Splits metadata into columns and the sections into policyConfig,
     * then delegates to {@link #create}. This is the path that round-trips every PT-0 example.
     */
    public AgentPolicyDTO createFromTemplateEnvelope(String rawEnvelope, String createdBy) {
        AgentPolicySchemaService.TemplateEnvelopeMeta meta = schemaService.extractTemplateMeta(rawEnvelope);
        AgentPolicyDTO dto = new AgentPolicyDTO();
        dto.setPolicyName(meta.name);
        dto.setDescription(meta.description);
        dto.setScope(meta.scope);
        dto.setOrgId(meta.orgId);
        dto.setPlatform(meta.platform);
        dto.setIsTemplate(true);
        dto.setPolicyConfig(schemaService.policyConfigFromTemplateEnvelope(rawEnvelope));
        return create(dto, createdBy);
    }

    /** PT-1 — serialize a parsed request-body map back to JSON for the envelope splitter. */
    public String serializeEnvelope(Map<String, Object> envelope) {
        try {
            return envelope == null ? "{}" : objectMapper.writeValueAsString(envelope);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new IllegalArgumentException("template body must be valid JSON: " + e.getOriginalMessage());
        }
    }

    /**
     * Maps entity → DTO and ensures {@code policyConfig} is served as schema v1 JSON
     * even for legacy rows written before BE-POL-01.
     */
    private AgentPolicyDTO toDto(UtmAgentPolicy p) {
        AgentPolicyDTO dto = new AgentPolicyDTO(p);
        dto.setPolicyConfig(schemaService.normalizePolicyConfigForServe(p.getPolicyConfig()));
        dto.setAssignedGroupIds(assignmentRepo.findByPolicyId(p.getId()).stream()
            .map(UtmPolicyGroupAssignment::getGroupId).collect(Collectors.toList()));
        return dto;
    }

    public void delete(Long id) {
        // SPEC-04 (W1b) — re-check tenant before delete.
        UtmAgentPolicy p = requireInTenant(id);
        // PT-1 — deleting a GLOBAL-scope row requires global-admin (same gate as write).
        requireGlobalAdminForGlobalWrite(p.getScope());
        policyRepo.deleteById(id);
    }

    /**
     * SPEC-04 (W1b) — resolve a policy by id ONLY within the caller's tenant.
     * A cross-tenant or pre-backfill null-tenant id is treated as not found.
     */
    private UtmAgentPolicy requireInTenant(Long id) {
        long tenant = TenantScope.requireTenant();
        return policyRepo.findByIdAndTenantId(id, tenant)
            .orElseThrow(() -> new EntityNotFoundException("Policy not found: " + id));
    }

    public void assignGroup(Long policyId, Long groupId) {
        // SPEC-04 (W1b) — the policy must belong to the caller's tenant.
        requireInTenant(policyId);
        if (!assignmentRepo.existsByPolicyIdAndGroupId(policyId, groupId)) {
            UtmPolicyGroupAssignment a = new UtmPolicyGroupAssignment();
            a.setPolicyId(policyId);
            a.setGroupId(groupId);
            a.setAssignedAt(Instant.now());
            try {
                a.setAssignedBy(SecurityContextHolder.getContext().getAuthentication().getName());
            } catch (Exception ignored) {}
            assignmentRepo.save(a);
        }
    }

    public void unassignGroup(Long policyId, Long groupId) {
        requireInTenant(policyId);
        assignmentRepo.deleteByPolicyIdAndGroupId(policyId, groupId);
    }

    public void pushPolicyToGroup(Long policyId, Long groupId) {
        UtmAgentPolicy policy = requireInTenant(policyId);

        List<Integer> agentIds = memberRepo.findByGroupId(groupId).stream()
            .map(UtmAgentGroupMember::getAgentId).collect(Collectors.toList());

        for (Integer agentId : agentIds) {
            deliverApplyPolicy(policy, String.valueOf(agentId));
        }
    }

    /**
     * Push APPLY_POLICY to a single agent (same delivery path as group push).
     */
    public void pushPolicyToAgent(Long policyId, Integer agentId) {
        if (agentId == null || agentId <= 0) {
            throw new IllegalArgumentException("agentId must be a positive connector id");
        }
        UtmAgentPolicy policy = requireInTenant(policyId);
        log.info("Pushing policy id={} version={} to agentId={}",
            policyId, policy.getVersionNum(), agentId);
        deliverApplyPolicy(policy, String.valueOf(agentId));
    }

    /**
     * Best-effort push-on-connect: resolve agent → groups → assigned active policies,
     * return configs, and queue APPLY_POLICY via gRPC when version drifts or no APPLIED state.
     * Does not require agent-manager stream-open hooks (document AM follow-up in EXTERNAL_WORK).
     */
    public AgentPolicySyncOnConnectDTO syncOnConnect(String agentId) {
        if (agentId == null || agentId.isBlank()) {
            throw new IllegalArgumentException("agentId required");
        }
        int connectorId;
        try {
            connectorId = Integer.parseInt(agentId.trim());
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("agentId must be numeric connector id");
        }
        if (connectorId <= 0) {
            throw new IllegalArgumentException("agentId must be a positive connector id");
        }

        AgentPolicySyncOnConnectDTO result = new AgentPolicySyncOnConnectDTO();
        result.setAgentId(String.valueOf(connectorId));

        List<UtmAgentGroupMember> memberships = memberRepo.findByAgentId(connectorId);
        // Deduplicate policies across groups (LinkedHashMap preserves first-seen order).
        Map<Long, UtmAgentPolicy> policiesById = new LinkedHashMap<>();
        for (UtmAgentGroupMember membership : memberships) {
            for (UtmPolicyGroupAssignment assignment : assignmentRepo.findByGroupId(membership.getGroupId())) {
                if (policiesById.containsKey(assignment.getPolicyId())) {
                    continue;
                }
                policyRepo.findById(assignment.getPolicyId()).ifPresent(policy -> {
                    if (Boolean.TRUE.equals(policy.getIsActive())) {
                        policiesById.put(policy.getId(), policy);
                    }
                });
            }
        }

        List<AgentPolicySyncOnConnectDTO.AssignedPolicy> assigned = new ArrayList<>();
        for (UtmAgentPolicy policy : policiesById.values()) {
            AgentPolicySyncOnConnectDTO.AssignedPolicy item = new AgentPolicySyncOnConnectDTO.AssignedPolicy();
            item.setPolicyId(policy.getId());
            item.setPolicyName(policy.getPolicyName());
            item.setVersionNum(policy.getVersionNum());
            item.setPolicyConfig(schemaService.normalizePolicyConfigForServe(policy.getPolicyConfig()));

            Optional<UtmAgentPolicyState> stateOpt =
                stateRepo.findByAgentIdAndPolicyId(String.valueOf(connectorId), policy.getId());
            boolean current = stateOpt
                .filter(s -> "APPLIED".equals(s.getState()))
                .filter(s -> policy.getVersionNum().equals(s.getAppliedVersion()))
                .isPresent();
            item.setAlreadyCurrent(current);
            if (!current) {
                deliverApplyPolicy(policy, String.valueOf(connectorId));
                item.setPushed(true);
            } else {
                item.setPushed(false);
            }
            assigned.add(item);
        }
        result.setPolicies(assigned);
        log.info("sync-on-connect agentId={} policies={} pushed={}",
            connectorId, assigned.size(),
            assigned.stream().filter(AgentPolicySyncOnConnectDTO.AssignedPolicy::isPushed).count());
        return result;
    }

    // ---- PT-3 (host→template associations) ------------------------------------------------

    /**
     * PT-3 — materialize a host's resolved effective policy as a per-agent NON-template row and
     * push {@code APPLY_POLICY} to that agent through the SAME delivery path as group/agent push
     * ({@link #deliverApplyPolicy}), so push-log + drift are recorded identically.
     *
     * <p>The effective row is UPSERTED under a stable per-agent name so re-Apply updates one row
     * (bumping its version) rather than accumulating duplicates. The row is tenant-stamped, ORG
     * scope, {@code is_template=false}, {@code is_active=true}. The version bumps only when the
     * resolved config actually changed, so an unchanged re-Apply is a no-op push with the same
     * version (the agent recognizes it as current).
     *
     * @param tenant   authoritative tenant (already resolved by the caller under TenantScope)
     * @param agentId  target connector id
     * @param rowName  winning association-row name (for the effective policy's description)
     * @param resolvedConfig merged schema-v1 policyConfig JSON
     * @return the effective policy row id APPLY_POLICY was issued for
     */
    public Long applyEffectivePolicyToAgent(long tenant, Integer agentId, String rowName, String resolvedConfig) {
        if (agentId == null || agentId <= 0) {
            throw new IllegalArgumentException("agentId must be a positive connector id");
        }
        String normalized = schemaService.normalizePolicyConfig(
            resolvedConfig == null || resolvedConfig.isBlank() ? "{}" : resolvedConfig);
        String effName = RESERVED_NAME_PREFIX + "agent:" + agentId;   // stable per-agent upsert key

        UtmAgentPolicy row = policyRepo.findByPolicyNameAndTenantId(effName, tenant).orElse(null);
        if (row == null) {
            row = new UtmAgentPolicy();
            row.setPolicyName(effName);
            row.setVersionNum(1);
            row.setCreatedBy("system:pt3-apply");
            row.setTenantId(tenant);
            row.setScope(SCOPE_ORG);
            row.setIsTemplate(false);
            row.setIsActive(true);
            row.setPolicyConfig(normalized);
        } else {
            // bump version only on real change so an unchanged re-Apply does not churn the agent
            if (!normalized.equals(row.getPolicyConfig())) {
                row.setPolicyConfig(normalized);
                row.setVersionNum(row.getVersionNum() + 1);
            }
            row.setUpdatedAt(Instant.now());
        }
        row.setDescription("PT-3 effective policy (winning row: "
            + (rowName == null ? "?" : rowName) + ")");
        UtmAgentPolicy saved = policyRepo.save(row);

        deliverApplyPolicy(saved, String.valueOf(agentId));
        return saved.getId();
    }

    private void deliverApplyPolicy(UtmAgentPolicy policy, String agentIdStr) {
        Long policyId = policy.getId();
        UtmPolicyPushLog pushLog = new UtmPolicyPushLog();
        pushLog.setPolicyId(policyId);
        pushLog.setPolicyName(policy.getPolicyName());
        pushLog.setAgentId(agentIdStr);
        pushLog.setPushedAt(Instant.now());
        pushLog.setPushStatus("PENDING");
        UtmPolicyPushLog savedLog = pushLogRepo.save(pushLog);

        commandService.sendCommand(
            agentIdStr,
            "APPLY_POLICY:" + policyId + ":" + policy.getVersionNum(),
            "POLICY_DISTRIBUTION",
            policyId.toString(),
            "Push policy " + policy.getPolicyName() + " v" + policy.getVersionNum(),
            "system",
            "",
            new StreamObserver<CommandResult>() {
                @Override public void onNext(CommandResult r) {
                    savedLog.setPushStatus("DELIVERED");
                    savedLog.setAckAt(Instant.now());
                    pushLogRepo.save(savedLog);
                }
                @Override public void onError(Throwable t) {
                    savedLog.setPushStatus("FAILED");
                    savedLog.setErrorMsg(t.getMessage());
                    pushLogRepo.save(savedLog);
                }
                @Override public void onCompleted() {}
            }
        );
    }

    public List<PolicyPushLogDTO> getPushLog(Long policyId) {
        requireInTenant(policyId);
        return pushLogRepo.findByPolicyIdOrderByPushedAtDesc(policyId).stream()
            .map(PolicyPushLogDTO::new).collect(Collectors.toList());
    }

    public List<AgentPolicyStateDTO> getPolicyStates(Long policyId) {
        requireInTenant(policyId);
        return stateRepo.findByPolicyId(policyId).stream()
            .map(AgentPolicyStateDTO::new).collect(Collectors.toList());
    }

    public void updatePolicyState(String agentId, Long policyId, Integer appliedVersion, String state, String driftDetails) {
        UtmAgentPolicyState s = stateRepo.findByAgentIdAndPolicyId(agentId, policyId)
            .orElseGet(() -> {
                UtmAgentPolicyState ns = new UtmAgentPolicyState();
                ns.setAgentId(agentId);
                ns.setPolicyId(policyId);
                return ns;
            });
        if (appliedVersion != null) s.setAppliedVersion(appliedVersion);
        s.setState(state);
        s.setLastCheckedAt(Instant.now());
        if ("APPLIED".equals(state)) s.setLastAppliedAt(Instant.now());
        if (driftDetails != null) s.setDriftDetails(driftDetails);
        Optional<UtmAgentPolicy> policyOpt = policyRepo.findById(policyId);
        policyOpt.ifPresent(p -> s.setDesiredVersion(p.getVersionNum()));
        stateRepo.save(s);
    }

    @Scheduled(fixedDelay = 600_000)
    public void driftCheck() {
        List<UtmAgentPolicyState> states = stateRepo.findAll();
        for (UtmAgentPolicyState s : states) {
            policyRepo.findById(s.getPolicyId()).ifPresent(policy -> {
                if (s.getAppliedVersion() != null && !s.getAppliedVersion().equals(policy.getVersionNum())) {
                    s.setState("DRIFT");
                    s.setDriftDetails("Applied v" + s.getAppliedVersion() + " != desired v" + policy.getVersionNum());
                    s.setLastCheckedAt(Instant.now());
                    stateRepo.save(s);
                }
            });
        }
    }
}
