package com.hivearmor.web.rest.admin;

import com.hivearmor.security.AuthoritiesConstants;
import com.hivearmor.service.admin.HaLlmService;
import com.hivearmor.service.admin.HaSystemSettingsService;
import com.hivearmor.service.admin.event.LlmConfigChangedEvent;
import com.hivearmor.service.dto.admin.LlmProbeResultDTO;
import com.hivearmor.service.dto.admin.SystemSettingsAiDTO;
import com.hivearmor.service.dto.admin.SystemSettingsDTO;
import com.hivearmor.service.dto.admin.SystemSettingsEmailDTO;
import com.hivearmor.service.dto.admin.SystemSettingsGeneralDTO;
import com.hivearmor.service.dto.admin.SystemSettingsSecurityDTO;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * REST controller for system-wide settings (S20-T01, Requirements 1–3).
 *
 * <h3>Endpoint summary</h3>
 * <pre>
 *   GET    /api/ha-admin/settings              → all settings, secrets masked as "***"
 *   PUT    /api/ha-admin/settings/ai           → update AI/LLM settings, fires hot-reload
 *   PUT    /api/ha-admin/settings/email        → update SMTP settings
 *   PUT    /api/ha-admin/settings/general      → update general settings
 *   PUT    /api/ha-admin/settings/security     → update security settings
 *   POST   /api/ha-admin/settings/ai/test      → live probe against configured LLM endpoint
 * </pre>
 *
 * <p>Every method is protected by {@code @PreAuthorize("hasAuthority('ROLE_ADMIN')")}
 * (Req 13.3).
 *
 * <h3>Secret hygiene (Req 3.2, 3.3, 3.5)</h3>
 * <ul>
 *   <li>No plaintext {@code apiKey} or {@code smtp.password} is ever written to a log
 *       statement at any level.</li>
 *   <li>All GET responses go through {@link SystemSettingsDTO#masked()} or the nested
 *       DTO's {@code masked()} equivalent before being serialized.</li>
 *   <li>The probe response delegates sanitization to
 *       {@link HaLlmService#probe()}, which calls {@link HaLlmService#sanitize(Throwable)}
 *       to strip the persisted {@code apiKey} from error messages (Req 2.6).</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/ha-admin/settings")
@RequiredArgsConstructor
public class HaSystemSettingsController {

    private static final Logger log = LoggerFactory.getLogger(HaSystemSettingsController.class);

    private final HaSystemSettingsService service;
    private final HaLlmService llmService;
    private final ApplicationEventPublisher events;

    // =========================================================================
    // GET — full settings aggregate (Req 1.3, 3.2, 3.3)
    // =========================================================================

    /**
     * Returns all system settings with secret fields replaced by {@code "***"}.
     *
     * @return HTTP 200 with the masked settings aggregate; never null
     */
    @GetMapping
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.ADMIN + "')")
    public ResponseEntity<SystemSettingsDTO> get() {
        return ResponseEntity.ok(service.getMasked());
    }

    // =========================================================================
    // PUT — AI/LLM settings (Req 2.1, 2.2, 3.2)
    // =========================================================================

    /**
     * Updates AI/LLM settings and triggers exactly one LLM client hot-reload.
     *
     * <p>The {@code apiKeyTouched} semantics are enforced by
     * {@link HaSystemSettingsService#updateAi(SystemSettingsAiDTO)}:
     * <ul>
     *   <li>If {@code apiKeyTouched} is {@code false} or absent the persisted key is
     *       preserved unchanged (Req 2.7).</li>
     *   <li>If {@code apiKeyTouched} is {@code true} and {@code apiKey.equals("***")}
     *       the service rejects with HTTP 400 / {@code apiKey.invalid} (Req 3.4).</li>
     * </ul>
     *
     * <p>After a successful update exactly one {@link LlmConfigChangedEvent} is published
     * so {@link HaLlmService} rebuilds its internal HTTP client (Req 2.2).
     *
     * @param body the AI/LLM settings payload; validated before service delegation
     * @return HTTP 200 with the updated settings, secrets masked
     */
    @PutMapping("/ai")
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.ADMIN + "')")
    public ResponseEntity<SystemSettingsAiDTO> updateAi(@Valid @RequestBody SystemSettingsAiDTO body) {
        SystemSettingsAiDTO updated = service.updateAi(body);
        // Publish exactly one event per successful update (Req 2.2).
        events.publishEvent(new LlmConfigChangedEvent(this));
        log.debug("HaSystemSettingsController: AI settings updated — LlmConfigChangedEvent published");
        return ResponseEntity.ok(updated.masked());
    }

    // =========================================================================
    // PUT — Email/SMTP settings (Req 1.5, 3.3)
    // =========================================================================

    /**
     * Updates Email/SMTP settings.
     *
     * <p>The {@code password} field is only persisted when the caller supplies a
     * value other than {@code "***"}; otherwise the persisted password is left
     * untouched (Req 3.3 preservation rule, symmetric with {@code apiKeyTouched}).
     *
     * @param body the SMTP settings payload
     * @return HTTP 200 with the updated settings, password masked
     */
    @PutMapping("/email")
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.ADMIN + "')")
    public ResponseEntity<SystemSettingsEmailDTO> updateEmail(@Valid @RequestBody SystemSettingsEmailDTO body) {
        return ResponseEntity.ok(service.updateEmail(body).masked());
    }

    // =========================================================================
    // PUT — General settings (Req 1.5)
    // =========================================================================

    /**
     * Updates general platform settings (site name, timezone, locale).
     *
     * @param body the general settings payload
     * @return HTTP 200 with the updated settings
     */
    @PutMapping("/general")
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.ADMIN + "')")
    public ResponseEntity<SystemSettingsGeneralDTO> updateGeneral(@Valid @RequestBody SystemSettingsGeneralDTO body) {
        return ResponseEntity.ok(service.updateGeneral(body));
    }

    // =========================================================================
    // PUT — Security settings (Req 1.5)
    // =========================================================================

    /**
     * Updates security policy settings (session timeout, MFA, password length).
     *
     * @param body the security settings payload
     * @return HTTP 200 with the updated settings
     */
    @PutMapping("/security")
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.ADMIN + "')")
    public ResponseEntity<SystemSettingsSecurityDTO> updateSecurity(@Valid @RequestBody SystemSettingsSecurityDTO body) {
        return ResponseEntity.ok(service.updateSecurity(body));
    }

    // =========================================================================
    // POST — AI/LLM probe (Req 2.5, 2.6, 3.5)
    // =========================================================================

    /**
     * Issues a live probe against the currently configured LLM endpoint.
     *
     * <p>Always returns HTTP 200 (Req 2.5, 2.6):
     * <ul>
     *   <li>On success: {@code {"ok":true,"latencyMs":N}}</li>
     *   <li>On failure: {@code {"ok":false,"latencyMs":N,"error":"<sanitized>"}}</li>
     * </ul>
     *
     * <p>The {@code error} field never contains the persisted {@code apiKey} value.
     * {@link HaLlmService#probe()} delegates error sanitization to
     * {@link HaLlmService#sanitize(Throwable)}, which strips the raw key from the
     * exception message before building the response DTO (Req 2.6, 3.5).
     *
     * @return HTTP 200 with the probe result; {@code ok} is {@code false} on failure
     */
    @PostMapping("/ai/test")
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.ADMIN + "')")
    public ResponseEntity<LlmProbeResultDTO> testAi() {
        log.debug("HaSystemSettingsController: LLM probe requested");
        LlmProbeResultDTO result = llmService.probe();
        // Log the outcome without emitting any secret material (Req 3.5).
        if (result.ok()) {
            log.debug("HaSystemSettingsController: LLM probe succeeded — latencyMs={}", result.latencyMs());
        } else {
            // Intentionally do NOT log result.error() — it could still contain path
            // fragments or other URL pieces; we only log the ok flag.
            log.debug("HaSystemSettingsController: LLM probe failed — ok=false");
        }
        return ResponseEntity.ok(result);
    }

    // =========================================================================
    // GET — AI status (Sprint 25, Req 6.4, 6.5)
    // =========================================================================

    /**
     * Returns the current AI/LLM configuration status.
     *
     * <p>Response shape:
     * <pre>
     *   {
     *     "configured": &lt;boolean&gt;,
     *     "provider":   "&lt;name&gt;" | "disabled"
     *   }
     * </pre>
     *
     * <p>{@code configured} is {@code true} when a non-blank endpoint and API key are
     * both persisted. {@code provider} is the configured provider name, or {@code "disabled"}
     * when no provider has been set (Req 6.4, 6.5).
     *
     * <p>Accessible to both {@code ROLE_ANALYST} and {@code ROLE_ADMIN} so the frontend
     * can conditionally show AI surfaces without requiring admin rights.
     *
     * @return HTTP 200 with the AI status map
     */
    @GetMapping("/ai/status")
    @PreAuthorize("hasAnyAuthority('" + AuthoritiesConstants.ANALYST + "', '" + AuthoritiesConstants.ADMIN + "')")
    public ResponseEntity<Map<String, Object>> aiStatus() {
        log.debug("HaSystemSettingsController: AI status requested");
        String providerName = llmService.getActiveProviderName();
        Map<String, Object> status = Map.of(
            "configured", llmService.isConfigured(),
            "provider",   providerName != null ? providerName : "disabled"
        );
        return ResponseEntity.ok(status);
    }
}
