package com.hivearmor.service;

import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.repository.api_key.ApiKeyRepository;
import com.hivearmor.service.agent_manager.AgentGrpcService;
import com.hivearmor.service.api_key.ApiKeyService;
import com.hivearmor.service.dto.HaAgentKeyDTO;
import com.hivearmor.service.dto.agent_manager.EnrollmentTokenCreateDTO;
import com.hivearmor.service.dto.agent_manager.EnrollmentTokenCreatedDTO;
import com.hivearmor.service.dto.api_key.ApiKeyUpsertDTO;
import com.hivearmor.service.dto.api_key.ApiKeyResponseDTO;
import com.hivearmor.util.exceptions.ApiKeyExistException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Service for the agent one-click provisioning flow.
 *
 * <p>Orchestrates:
 * <ol>
 *   <li>Alias uniqueness validation</li>
 *   <li>API key creation via {@link ApiKeyService}</li>
 *   <li>Install-script generation via {@link AgentInstallScriptBuilder}</li>
 * </ol>
 *
 * <p>Constraints: No Lombok. Constructor injection only. No {@code List#getFirst()}.
 */
@Service
public class HaAgentKeyService {

    private static final Logger log = LoggerFactory.getLogger(HaAgentKeyService.class);
    private static final String CLASSNAME = "HaAgentKeyService";

    /** Alias character whitelist: lowercase letters, digits, hyphens, max 63 chars. */
    private static final String ALIAS_PATTERN = "^[a-z0-9][a-z0-9\\-]{0,61}[a-z0-9]$|^[a-z0-9]$";

    private final ApiKeyService apiKeyService;
    private final ApiKeyRepository apiKeyRepository;
    private final AgentInstallScriptBuilder scriptBuilder;
    private final AgentGrpcService agentGrpcService;

    public HaAgentKeyService(ApiKeyService apiKeyService,
                             ApiKeyRepository apiKeyRepository,
                             AgentInstallScriptBuilder scriptBuilder,
                             AgentGrpcService agentGrpcService) {
        this.apiKeyService = apiKeyService;
        this.apiKeyRepository = apiKeyRepository;
        this.scriptBuilder = scriptBuilder;
        this.agentGrpcService = agentGrpcService;
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /**
     * Creates a new agent provisioning key for the given admin user.
     *
     * @param userId     the admin user's database ID
     * @param actor      authenticated admin login (for enrollment audit)
     * @param alias      human-readable machine name (DNS-label compatible)
     * @param mode       "log" or "edr"
     * @param expiresIn  expiry duration in hours (24, 48, or 168 for 7 days)
     * @return DTO containing the enrollment token and generated install scripts (shown once only)
     * @throws ApiKeyExistException (HTTP 409) if the alias already exists for this user
     * @throws IllegalArgumentException if the alias fails validation or tenant is not selected
     */
    public HaAgentKeyDTO createAgentKey(Long userId, String actor, String alias, String mode, int expiresIn) {
        final String ctx = CLASSNAME + ".createAgentKey";
        log.debug("{}: userId={} alias={} mode={} expiresIn={}h", ctx, userId, alias, mode, expiresIn);

        // 1. Require a concrete tenant — enrollment tokens are tenant-scoped.
        Long tenantId = TenantContext.getClientId();
        if (tenantId == null || tenantId <= 0) {
            throw new IllegalArgumentException(
                "Select an authorized tenant before generating install scripts");
        }

        // 2. Validate alias format.
        validateAlias(alias);

        // 3. Validate mode.
        if (!"log".equals(mode) && !"edr".equals(mode)) {
            throw new IllegalArgumentException("mode must be 'log' or 'edr', got: " + mode);
        }

        // 4. Validate expiresIn (24h, 48h, or up to 7 days = 168h).
        if (expiresIn < 1 || expiresIn > 168) {
            throw new IllegalArgumentException("expiresIn must be between 1 and 168 hours");
        }

        Instant expiresAt = Instant.now().plus(expiresIn, ChronoUnit.HOURS);

        // 5. Create the API key record (ApiKeyService.createApiKey checks alias uniqueness
        //    via findByNameAndUserId and throws ApiKeyExistException on duplicate).
        ApiKeyUpsertDTO upsert = new ApiKeyUpsertDTO();
        upsert.setName(alias); // alias stored in the name column
        upsert.setExpiresAt(expiresAt);
        upsert.setAllowedIp(List.of());

        ApiKeyResponseDTO created = apiKeyService.createApiKey(userId, upsert);

        // Mark this key as an agent-provisioning key so listAgentKeys can filter it.
        apiKeyRepository.findById(created.getId()).ifPresent(apiKey -> {
            apiKey.setAgentKey(true);
            apiKeyRepository.save(apiKey);
        });

        // 6. Create a one-time enrollment token for agent registration.
        EnrollmentTokenCreateDTO enrollRequest = new EnrollmentTokenCreateDTO(
            alias, "any", expiresAt, 1);
        EnrollmentTokenCreatedDTO enrolled = agentGrpcService.createEnrollmentToken(
            tenantId, enrollRequest, actor);
        String enrollmentToken = enrolled.token();

        // 7. Build the install scripts.
        String serverHost = scriptBuilder.resolveServerHost();
        String expiresAtStr = created.getExpiresAt() != null
            ? created.getExpiresAt().toString()
            : "never";
        boolean insecure = isLocalDev(serverHost);

        String bashScript = scriptBuilder.buildBashScript(
            serverHost, alias, enrollmentToken, mode, expiresAtStr, insecure);
        String psScript = scriptBuilder.buildPowerShellScript(
            serverHost, alias, enrollmentToken, mode, expiresAtStr, insecure);

        // 8. Build response DTO.
        HaAgentKeyDTO dto = new HaAgentKeyDTO();
        dto.setId(String.valueOf(created.getId()));
        dto.setAlias(alias);
        dto.setKey(enrollmentToken);
        dto.setExpiresAt(created.getExpiresAt());
        dto.setMode(mode);
        dto.setBashScript(bashScript);
        dto.setPowershellScript(psScript);
        dto.setServerHost(serverHost);
        dto.setCreatedAt(created.getCreatedAt());
        dto.setStatus("active");

        log.info("{}: created agent key id={} alias={} mode={} expires={}",
            ctx, created.getId(), alias, mode, expiresAtStr);
        return dto;
    }

    /**
     * Lists all agent-provisioning keys for the given admin user.
     * Only returns keys created via the Add Agent UX (isAgentKey = true).
     * The returned DTOs do NOT include the raw key or scripts — key shown once only.
     */
    public List<HaAgentKeyDTO> listAgentKeys(Long userId) {
        final String ctx = CLASSNAME + ".listAgentKeys";
        log.debug("{}: userId={}", ctx, userId);

        return apiKeyRepository.findAllByUserIdAndIsAgentKeyTrue(userId)
            .stream()
            .map(src -> {
                HaAgentKeyDTO dto = new HaAgentKeyDTO();
                dto.setId(String.valueOf(src.getId()));
                dto.setAlias(src.getName());
                // key, bashScript, powershellScript intentionally null — not shown again
                dto.setExpiresAt(src.getExpiresAt());
                dto.setCreatedAt(src.getCreatedAt());
                Instant now = Instant.now();
                if (src.getExpiresAt() != null && src.getExpiresAt().isBefore(now)) {
                    dto.setStatus("expired");
                } else {
                    dto.setStatus("active");
                }
                return dto;
            })
            .collect(Collectors.toList());
    }

    /**
     * Revokes (expires immediately) an agent provisioning key.
     */
    public void revokeAgentKey(Long userId, Long keyId) {
        final String ctx = CLASSNAME + ".revokeAgentKey";
        log.debug("{}: userId={} keyId={}", ctx, userId, keyId);
        apiKeyService.deleteApiKey(userId, keyId);
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private void validateAlias(String alias) {
        if (alias == null || alias.isBlank()) {
            throw new IllegalArgumentException("alias must not be blank");
        }
        if (alias.length() > 63) {
            throw new IllegalArgumentException("alias must be 63 characters or fewer");
        }
        if (!alias.matches(ALIAS_PATTERN)) {
            throw new IllegalArgumentException(
                "alias must contain only lowercase letters, digits, and hyphens, "
                + "and must start and end with a letter or digit");
        }
    }

    /**
     * Returns true when the install script should skip TLS / agent cert validation.
     * Local dev and bare-IP staging hosts typically use self-signed certificates.
     */
    private boolean isLocalDev(String serverHost) {
        if (serverHost == null || serverHost.isBlank()) {
            return false;
        }
        String host = serverHost.split(",")[0].trim();
        int colon = host.indexOf(':');
        if (colon > 0) {
            host = host.substring(0, colon);
        }
        return host.startsWith("localhost")
            || host.startsWith("127.0.0.1")
            || host.startsWith("0.0.0.0")
            || host.matches("^[0-9]{1,3}(\\.[0-9]{1,3}){3}$");
    }
}
