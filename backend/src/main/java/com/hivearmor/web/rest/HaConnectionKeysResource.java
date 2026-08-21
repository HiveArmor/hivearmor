package com.hivearmor.web.rest;

import com.hivearmor.security.AuthoritiesConstants;
import com.hivearmor.service.UserService;
import com.hivearmor.service.api_key.ApiKeyService;
import com.hivearmor.service.dto.HiveConnectionKeyDTO;
import com.hivearmor.service.dto.api_key.ApiKeyResponseDTO;
import com.hivearmor.service.dto.api_key.ApiKeyUpsertDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * REST controller for the Connection Keys admin page (ADM-06).
 * Wraps the existing ApiKeyService and translates to/from the frontend ConnectionKeyDTO shape.
 *
 * GET    /api/ha-connection-keys
 * POST   /api/ha-connection-keys         → returns CreateConnectionKeyResponse (includes raw key once)
 * DELETE /api/ha-connection-keys/{id}
 */
@RestController
@RequestMapping("/api")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class HaConnectionKeysResource {

    private static final Logger log = LoggerFactory.getLogger(HaConnectionKeysResource.class);

    private final ApiKeyService apiKeyService;
    private final UserService userService;

    public HaConnectionKeysResource(ApiKeyService apiKeyService,
                                    UserService userService) {
        this.apiKeyService = apiKeyService;
        this.userService = userService;
    }

    /**
     * GET /api/ha-connection-keys
     * Returns all API keys for the current user (admins see their own keys here).
     */
    @GetMapping("/ha-connection-keys")
    public ResponseEntity<List<HiveConnectionKeyDTO>> listConnectionKeys() {
        log.debug("REST request to list connection keys");
        Long userId = userService.getCurrentUserLogin().getId();
        Page<ApiKeyResponseDTO> page = apiKeyService.listApiKeys(userId, PageRequest.of(0, 500));
        List<HiveConnectionKeyDTO> result = page.getContent().stream()
            .map(this::toConnectionKeyDTO)
            .collect(Collectors.toList());
        return ResponseEntity.ok(result);
    }

    /**
     * POST /api/ha-connection-keys
     * Creates a new API key and returns the raw key value (only shown once).
     * Response shape matches frontend CreateConnectionKeyResponse.
     */
    @PostMapping("/ha-connection-keys")
    public ResponseEntity<Map<String, Object>> createConnectionKey(@RequestBody Map<String, Object> request) {
        log.debug("REST request to create connection key: {}", request.get("name"));
        Long userId = userService.getCurrentUserLogin().getId();

        ApiKeyUpsertDTO upsertDTO = new ApiKeyUpsertDTO();
        upsertDTO.setName((String) request.get("name"));
        if (request.get("expiryDate") != null) {
            upsertDTO.setExpiresAt(Instant.parse((String) request.get("expiryDate")));
        }
        upsertDTO.setAllowedIp(List.of());

        ApiKeyResponseDTO created = apiKeyService.createApiKey(userId, upsertDTO);
        // Generate the actual key bytes and return them once
        String rawKey = apiKeyService.generateApiKey(userId, created.getId());

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("id", String.valueOf(created.getId()));
        response.put("name", created.getName());
        response.put("key", rawKey);
        response.put("createdDate", created.getCreatedAt());
        response.put("expiryDate", created.getExpiresAt());

        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * DELETE /api/ha-connection-keys/{id}
     */
    @DeleteMapping("/ha-connection-keys/{id}")
    public ResponseEntity<Void> deleteConnectionKey(@PathVariable Long id) {
        log.debug("REST request to delete connection key: {}", id);
        Long userId = userService.getCurrentUserLogin().getId();
        apiKeyService.deleteApiKey(userId, id);
        return ResponseEntity.noContent().build();
    }

    // ---- mapping helper ----

    private HiveConnectionKeyDTO toConnectionKeyDTO(ApiKeyResponseDTO src) {
        HiveConnectionKeyDTO dto = new HiveConnectionKeyDTO();
        dto.setId(String.valueOf(src.getId()));
        dto.setName(src.getName());
        dto.setCreatedDate(src.getCreatedAt());
        dto.setExpiryDate(src.getExpiresAt());
        dto.setLastUsed(src.getGeneratedAt());

        Instant now = Instant.now();
        if (src.getExpiresAt() != null && src.getExpiresAt().isBefore(now)) {
            dto.setStatus("expired");
        } else {
            dto.setStatus("active");
        }
        return dto;
    }
}
