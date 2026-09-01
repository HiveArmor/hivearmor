package com.hivearmor.web.rest;

import com.hivearmor.security.AuthoritiesConstants;
import com.hivearmor.service.HaAgentKeyService;
import com.hivearmor.service.UserService;
import com.hivearmor.service.dto.HaAgentKeyDTO;
import com.hivearmor.util.exceptions.ApiKeyExistException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * REST controller for the Add Agent one-click provisioning UX.
 *
 * <p>Endpoints:
 * <ul>
 *   <li>{@code POST /api/ha-agent-keys} — create a new agent provisioning key and return
 *       the raw key + install scripts (key shown once only)</li>
 *   <li>{@code GET  /api/ha-agent-keys} — list all provisioning keys (no raw keys)</li>
 *   <li>{@code DELETE /api/ha-agent-keys/{id}} — revoke a key immediately</li>
 * </ul>
 *
 * <p>All endpoints require {@code ROLE_ADMIN}. Constructor injection only. No Lombok.
 */
@RestController
@RequestMapping("/api")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class HaAgentKeyResource {

    private static final Logger log = LoggerFactory.getLogger(HaAgentKeyResource.class);
    private static final String CLASSNAME = "HaAgentKeyResource";

    private final HaAgentKeyService agentKeyService;
    private final UserService userService;

    public HaAgentKeyResource(HaAgentKeyService agentKeyService,
                              UserService userService) {
        this.agentKeyService = agentKeyService;
        this.userService = userService;
    }

    // -------------------------------------------------------------------------
    // POST /api/ha-agent-keys
    // -------------------------------------------------------------------------

    /**
     * Creates a new agent provisioning key and returns the raw key + install scripts.
     *
     * <p>Request body (JSON):
     * <pre>
     * {
     *   "alias":     "web-server-01",   // required, DNS-label compatible
     *   "mode":      "edr",             // "log" or "edr"
     *   "expiresIn": 24                 // hours until expiry (1–168)
     * }
     * </pre>
     *
     * <p>Response: {@link HaAgentKeyDTO} with {@code key}, {@code bashScript},
     * and {@code powershellScript} populated. These fields are never returned again.
     *
     * @return 201 Created with the full DTO, or 409 Conflict if alias already exists,
     *         or 400 Bad Request if validation fails.
     */
    @PostMapping("/ha-agent-keys")
    public ResponseEntity<?> createAgentKey(@RequestBody Map<String, Object> request) {
        final String ctx = CLASSNAME + ".createAgentKey";

        String alias = (String) request.get("alias");
        String mode = request.getOrDefault("mode", "log").toString();
        int expiresIn;
        try {
            expiresIn = Integer.parseInt(request.getOrDefault("expiresIn", 24).toString());
        } catch (NumberFormatException e) {
            return ResponseEntity.badRequest()
                .body(Map.of("message", "expiresIn must be an integer (hours)"));
        }

        log.debug("{}: alias={} mode={} expiresIn={}h", ctx, alias, mode, expiresIn);

        try {
            Long userId = userService.getCurrentUserLogin().getId();
            String actor = userService.getCurrentUserLogin().getLogin();
            HaAgentKeyDTO dto = agentKeyService.createAgentKey(userId, actor, alias, mode, expiresIn);
            return ResponseEntity.status(HttpStatus.CREATED).body(dto);

        } catch (ApiKeyExistException e) {
            // Alias already exists for this user → 409 Conflict
            log.debug("{}: alias conflict for alias={}: {}", ctx, alias, e.getMessage());
            return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("message", "An agent with the name \"" + alias + "\" already exists. "
                    + "Choose a different alias or revoke the existing key first."));

        } catch (IllegalArgumentException e) {
            // Validation failed → 400 Bad Request
            log.debug("{}: validation error: {}", ctx, e.getMessage());
            return ResponseEntity.badRequest()
                .body(Map.of("message", e.getMessage()));
        }
    }

    // -------------------------------------------------------------------------
    // GET /api/ha-agent-keys
    // -------------------------------------------------------------------------

    /**
     * Lists all agent provisioning keys created by the current admin.
     *
     * <p>The returned DTOs do <em>not</em> include the raw key, bash script,
     * or PowerShell script — those are only present in the POST response.
     *
     * @return 200 OK with list of {@link HaAgentKeyDTO}
     */
    @GetMapping("/ha-agent-keys")
    public ResponseEntity<List<HaAgentKeyDTO>> listAgentKeys() {
        final String ctx = CLASSNAME + ".listAgentKeys";
        log.debug("{}", ctx);
        Long userId = userService.getCurrentUserLogin().getId();
        return ResponseEntity.ok(agentKeyService.listAgentKeys(userId));
    }

    // -------------------------------------------------------------------------
    // DELETE /api/ha-agent-keys/{id}
    // -------------------------------------------------------------------------

    /**
     * Revokes (expires immediately) an agent provisioning key.
     *
     * <p>After revocation, any attempt to use the key to register a new agent
     * will fail with an authentication error at the agent-manager gRPC level.
     *
     * @param id the key ID (as returned in the {@code id} field of the DTO)
     * @return 204 No Content on success
     */
    @DeleteMapping("/ha-agent-keys/{id}")
    public ResponseEntity<Void> revokeAgentKey(@PathVariable Long id) {
        final String ctx = CLASSNAME + ".revokeAgentKey";
        log.debug("{}: id={}", ctx, id);
        Long userId = userService.getCurrentUserLogin().getId();
        agentKeyService.revokeAgentKey(userId, id);
        return ResponseEntity.noContent().build();
    }
}
