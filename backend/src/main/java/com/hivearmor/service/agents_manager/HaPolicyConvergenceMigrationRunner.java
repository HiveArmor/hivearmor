package com.hivearmor.service.agents_manager;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.HaAgentPolicy;
import com.hivearmor.domain.agents_manager.UtmAgentPolicy;
import com.hivearmor.repository.HaAgentPolicyRepository;
import com.hivearmor.repository.HaClientRepository;
import com.hivearmor.repository.agents_manager.UtmAgentPolicyRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * SPEC-06 (W5) — Policy-plane convergence projector.
 *
 * <p>Plane A ({@code /api/agent-policies} / {@code hive_agent_policy}) is canonical;
 * Plane B ({@code /api/ha-edr/policies} / {@code ha_agent_policy}) is deprecated.
 * Plane B stores typed FIM columns (filePaths, registryPaths, network/process toggles);
 * Plane A's {@code policy_config} (schema v1) already models the same via
 * {@link AgentPolicySchemaService#fromHaColumns}. This runner projects any existing
 * Plane B rows into a canonical Plane A row so no operator configuration is lost when
 * Plane B is eventually removed.</p>
 *
 * <p><strong>Idempotent and safe:</strong>
 * <ul>
 *   <li>Runs once on {@link ApplicationReadyEvent}.</li>
 *   <li>On fresh/staging deploys the {@code ha_agent_policy} table may not exist
 *       (its create changeset is not wired into master.xml and {@code ddl-auto: none});
 *       any read failure is treated as "nothing to migrate" and logged at INFO.</li>
 *   <li>A projected Plane A policy is named {@code "[EDR] <planeBName>"}; if a policy
 *       with that name already exists the row is skipped, so re-runs never duplicate.</li>
 *   <li>Never touches the agent-device wire contract, never pushes APPLY_POLICY,
 *       never drops Plane B rows or the table.</li>
 * </ul>
 *
 * <p>Projected rows are stamped {@code tenant_id = 0} (single-tenant default, matching
 * the W1b backfill). In an MSSP deployment (any {@code ha_client} row with
 * {@code mssp_managed = true} and a {@code client_prefix}), the runner logs a warning and
 * skips entirely rather than mis-attributing Plane B rows to tenant 0 — matching the
 * single-tenant gate the W1b {@code tenant_id} backfill changesets use. MSSP row migration
 * is a deliberate operator/admin tenant assignment, not this best-effort projector's job.</p>
 *
 * <p>STAGING CANDIDATE — not PRODUCTION READY.</p>
 */
@Component
public class HaPolicyConvergenceMigrationRunner {

    private static final Logger log = LoggerFactory.getLogger(HaPolicyConvergenceMigrationRunner.class);

    /** Prefix marking a Plane A policy that was projected from a deprecated Plane B row. */
    static final String PROJECTED_NAME_PREFIX = "[EDR] ";
    private static final String PROJECTED_CREATED_BY = "spec06-convergence";
    private static final long SINGLE_TENANT_ID = 0L;

    private final HaAgentPolicyRepository haRepo;
    private final UtmAgentPolicyRepository utmRepo;
    private final HaClientRepository haClientRepo;
    private final AgentPolicySchemaService schemaService;
    private final ObjectMapper objectMapper;

    public HaPolicyConvergenceMigrationRunner(HaAgentPolicyRepository haRepo,
                                              UtmAgentPolicyRepository utmRepo,
                                              HaClientRepository haClientRepo,
                                              AgentPolicySchemaService schemaService,
                                              ObjectMapper objectMapper) {
        this.haRepo = haRepo;
        this.utmRepo = utmRepo;
        this.haClientRepo = haClientRepo;
        this.schemaService = schemaService;
        this.objectMapper = objectMapper;
    }

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void projectPlaneBIntoPlaneA() {
        List<HaAgentPolicy> planeB;
        try {
            planeB = haRepo.findAll();
        } catch (Exception e) {
            // Table absent on fresh/staging deploys (unwired create changeset + ddl-auto:none),
            // or otherwise unreadable — nothing to converge. This is the expected clean path.
            log.info("SPEC-06 convergence: ha_agent_policy not readable ({}); nothing to project.",
                e.getMessage());
            return;
        }

        if (planeB.isEmpty()) {
            log.info("SPEC-06 convergence: ha_agent_policy is empty; no Plane B rows to project.");
            return;
        }

        // MSSP guard: with real Plane B rows AND MSSP-managed tenants present, stamping
        // tenant_id=0 would mis-attribute rows to the single-tenant sentinel. Skip with a
        // warning (matches the W1b backfill's single-tenant gate: ha_client mssp_managed +
        // client_prefix). MSSP row migration is a deliberate operator/admin assignment.
        boolean mssp;
        try {
            mssp = !haClientRepo.findByMsspManagedTrueAndClientPrefixIsNotNull().isEmpty();
        } catch (Exception e) {
            // Cannot determine tenancy → refuse to project rather than risk mis-attribution.
            log.warn("SPEC-06 convergence: could not read ha_client to determine tenancy ({}); "
                + "skipping projection of {} Plane B row(s) to avoid tenant mis-attribution.",
                e.getMessage(), planeB.size());
            return;
        }
        if (mssp) {
            log.warn("SPEC-06 convergence: MSSP-managed tenant(s) present and ha_agent_policy has {} "
                + "row(s); skipping automatic projection to avoid mis-attributing them to tenant 0. "
                + "Migrate Plane B policies to /api/agent-policies with an explicit tenant.",
                planeB.size());
            return;
        }

        int projected = 0;
        int skipped = 0;
        for (HaAgentPolicy row : planeB) {
            String targetName = PROJECTED_NAME_PREFIX + safeName(row.getName(), row.getId());
            if (utmRepo.findByPolicyName(targetName).isPresent()) {
                skipped++;
                continue; // already projected — idempotent
            }
            try {
                UtmAgentPolicy target = project(row, targetName);
                utmRepo.save(target);
                projected++;
            } catch (Exception e) {
                skipped++;
                log.warn("SPEC-06 convergence: could not project ha_agent_policy id={} ({}); skipped.",
                    row.getId(), e.getMessage());
            }
        }
        log.info("SPEC-06 convergence: projected {} Plane B policy(ies) into Plane A, {} skipped.",
            projected, skipped);
    }

    private UtmAgentPolicy project(HaAgentPolicy row, String targetName) {
        UtmAgentPolicy target = new UtmAgentPolicy();
        target.setPolicyName(targetName);
        target.setDescription("Converged from deprecated /api/ha-edr/policies (SPEC-06 W5).");
        target.setPlatform(row.getOsType());
        target.setPolicyConfig(schemaService.fromHaColumns(
            deserializeList(row.getFilePaths()),
            deserializeList(row.getRegistryPaths()),
            row.getNetworkMonitor(),
            row.getProcessMonitor()));
        target.setVersionNum(1);
        target.setIsActive(true);
        target.setCreatedBy(PROJECTED_CREATED_BY);
        target.setTenantId(SINGLE_TENANT_ID);
        target.setCreatedAt(Instant.now());
        return target;
    }

    private static String safeName(String name, Long id) {
        if (StringUtils.hasText(name)) {
            return name.trim();
        }
        return "policy-" + id;
    }

    private List<String> deserializeList(String json) {
        if (!StringUtils.hasText(json)) {
            return new ArrayList<>();
        }
        try {
            return objectMapper.readValue(
                json,
                objectMapper.getTypeFactory().constructCollectionType(List.class, String.class));
        } catch (JsonProcessingException e) {
            log.warn("SPEC-06 convergence: malformed JSON list column ({}); treating as empty.",
                e.getOriginalMessage());
            return new ArrayList<>();
        }
    }
}
