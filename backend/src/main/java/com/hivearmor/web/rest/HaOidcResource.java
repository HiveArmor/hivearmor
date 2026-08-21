package com.hivearmor.web.rest;

import com.hivearmor.domain.HaOidcProvider;
import com.hivearmor.repository.HaOidcProviderRepository;
import com.hivearmor.security.AesGcmEncryptionService;
import com.hivearmor.security.AuthoritiesConstants;
import com.hivearmor.security.jwt.TokenProvider;
import com.hivearmor.service.HaOidcService;
import com.hivearmor.service.dto.OidcProviderAdminDTO;
import com.hivearmor.service.dto.OidcProviderPublicDTO;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.net.URI;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * HiveArmor OIDC REST controller.
 *
 * <p>Exposes seven endpoints under {@code /api/ha-oidc/}:
 * <ul>
 *   <li>GET  /ha-oidc/providers/enabled — public, returns enabled providers (public fields only)</li>
 *   <li>GET  /ha-oidc/authorize         — public, initiates PKCE flow and redirects to IdP</li>
 *   <li>GET  /ha-oidc/callback          — public, exchanges code for HiveArmor JWT and redirects to UI</li>
 *   <li>GET  /ha-oidc/providers         — ROLE_ADMIN, admin list with clientSecret always null</li>
 *   <li>POST /ha-oidc/providers         — ROLE_ADMIN, creates a new provider (encrypts secret)</li>
 *   <li>PUT  /ha-oidc/providers/{id}    — ROLE_ADMIN, updates a provider (re-encrypts if new secret supplied)</li>
 *   <li>DELETE /ha-oidc/providers/{id}  — ROLE_ADMIN, deletes a provider (cascade removes state cache rows)</li>
 * </ul>
 *
 * <p>Constructor injection only — no {@code @Autowired} on fields. No Lombok.
 * Secrets, tokens, state values, and claim contents are never written to any log record.
 */
@RestController
@RequestMapping("/api")
public class HaOidcResource {

    private static final Logger log = LoggerFactory.getLogger(HaOidcResource.class);

    private final HaOidcService oidcService;
    private final HaOidcProviderRepository providerRepository;
    private final AesGcmEncryptionService encryptionService;
    private final TokenProvider tokenProvider;

    public HaOidcResource(
            HaOidcService oidcService,
            HaOidcProviderRepository providerRepository,
            AesGcmEncryptionService encryptionService,
            TokenProvider tokenProvider) {
        this.oidcService = oidcService;
        this.providerRepository = providerRepository;
        this.encryptionService = encryptionService;
        this.tokenProvider = tokenProvider;
    }

    // -------------------------------------------------------------------------
    // Public endpoints (no @PreAuthorize — listed in SecurityConfiguration)
    // -------------------------------------------------------------------------

    /**
     * GET /api/ha-oidc/providers/enabled — public.
     *
     * <p>Returns the subset of OIDC providers that are enabled, exposing only
     * the fields required for the login-page SSO button: id, providerName, discoveryUrl.
     * No secret or clientId is ever included.
     *
     * @return HTTP 200 with a (possibly empty) list of public provider DTOs
     */
    @GetMapping("/ha-oidc/providers/enabled")
    public ResponseEntity<List<OidcProviderPublicDTO>> getEnabledProviders() {
        List<HaOidcProvider> providers = providerRepository.findByEnabledTrue();
        List<OidcProviderPublicDTO> dtos = new ArrayList<>(providers.size());
        for (HaOidcProvider p : providers) {
            dtos.add(toPublicDTO(p));
        }
        return ResponseEntity.ok(dtos);
    }

    /**
     * GET /api/ha-oidc/authorize — public.
     *
     * <p>Initiates a PKCE authorization flow for the given provider and issues an
     * HTTP 302 redirect to the identity provider's authorization endpoint.
     *
     * @param providerId  the primary key of the {@code ha_oidc_provider} row
     * @param redirectUri the callback URI registered with the identity provider
     * @param response    the servlet response used to issue the redirect
     * @throws IOException propagated from {@link HttpServletResponse#sendRedirect}
     */
    @GetMapping("/ha-oidc/authorize")
    public void authorize(
            @RequestParam Long providerId,
            @RequestParam String redirectUri,
            HttpServletResponse response) throws IOException {
        Map<String, String> flow = oidcService.initiateAuthFlow(providerId, redirectUri);
        response.sendRedirect(flow.get("authorizationUrl"));
    }

    /**
     * GET /api/ha-oidc/callback — public.
     *
     * <p>Handles the authorization server callback. On success, issues a HiveArmor JWT
     * and redirects the browser to {@code /oidc-callback?token=<jwt>&source=oidc}.
     * On any exception, redirects to {@code /login?error=oidc_callback_failed}.
     *
     * <p>IMPORTANT: state, code, JWT, and claim contents are never written to any log record.
     *
     * @param state    the OAuth2 {@code state} parameter echoed back by the IdP
     * @param code     the authorization code issued by the IdP
     * @param response the servlet response used to issue the redirect
     * @throws IOException propagated from {@link HttpServletResponse#sendRedirect}
     */
    @GetMapping("/ha-oidc/callback")
    public void callback(
            @RequestParam String state,
            @RequestParam String code,
            HttpServletResponse response) throws IOException {
        try {
            Map<String, Object> claims = oidcService.exchangeCode(state, code);

            // Determine the provider id from the claims (sub is mandatory for OIDC).
            // exchangeCode returns claims from the id_token which includes the provider context;
            // we derive providerId from the state-cache lookup already performed inside exchangeCode.
            // findOrCreateUser accepts the claims and infers a login.
            String login = oidcService.findOrCreateUser(claims, null);

            List<SimpleGrantedAuthority> authorities = new ArrayList<>();
            authorities.add(new SimpleGrantedAuthority(AuthoritiesConstants.USER));

            UsernamePasswordAuthenticationToken authentication =
                    new UsernamePasswordAuthenticationToken(login, null, authorities);

            String jwt = tokenProvider.createToken(authentication, false, true);

            response.sendRedirect("/oidc-callback?token=" + jwt + "&source=oidc");
        } catch (Exception e) {
            // Log only a safe, non-identifying message — no state, code, JWT, or claims.
            log.warn("OIDC callback processing failed: {}", e.getClass().getSimpleName());
            response.sendRedirect("/login?error=oidc_callback_failed");
        }
    }

    // -------------------------------------------------------------------------
    // Admin endpoints — require ROLE_ADMIN
    // -------------------------------------------------------------------------

    /**
     * GET /api/ha-oidc/providers — ROLE_ADMIN.
     *
     * <p>Returns all OIDC providers for admin management.
     * The {@code clientSecret} field is always {@code null} in every response.
     *
     * @return HTTP 200 with the full provider list; clientSecret null on every entry
     */
    @GetMapping("/ha-oidc/providers")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<List<OidcProviderAdminDTO>> getAllProviders() {
        List<HaOidcProvider> providers = providerRepository.findAll();
        List<OidcProviderAdminDTO> dtos = new ArrayList<>(providers.size());
        for (HaOidcProvider p : providers) {
            dtos.add(toAdminDTO(p));
        }
        return ResponseEntity.ok(dtos);
    }

    /**
     * POST /api/ha-oidc/providers — ROLE_ADMIN.
     *
     * <p>Creates a new OIDC provider. Rejects the request with HTTP 400 when
     * {@code clientSecret} is null or blank. The plaintext secret is encrypted
     * via {@link AesGcmEncryptionService} before persisting; it is never stored in
     * plaintext and never returned in any response.
     *
     * @param request the inbound admin DTO containing the new provider details
     * @return HTTP 201 with a {@code Location} header and the created provider DTO (clientSecret null)
     */
    @PostMapping("/ha-oidc/providers")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<OidcProviderAdminDTO> createProvider(
            @RequestBody OidcProviderAdminDTO request) {
        if (request.getClientSecret() == null || request.getClientSecret().isBlank()) {
            return ResponseEntity.badRequest().build();
        }

        HaOidcProvider provider = new HaOidcProvider();
        provider.setProviderName(request.getProviderName());
        provider.setClientId(request.getClientId());
        provider.setClientSecretEncrypted(encryptionService.encrypt(request.getClientSecret()));
        provider.setDiscoveryUrl(request.getDiscoveryUrl());
        provider.setScopes(
                request.getScopes() != null && !request.getScopes().isBlank()
                        ? request.getScopes()
                        : "openid profile email");
        provider.setEnabled(request.isEnabled());
        provider.setCreatedAt(Instant.now());
        provider.setUpdatedAt(Instant.now());

        HaOidcProvider saved = providerRepository.save(provider);

        URI location = URI.create("/api/ha-oidc/providers/" + saved.getId());
        return ResponseEntity.created(location).body(toAdminDTO(saved));
    }

    /**
     * PUT /api/ha-oidc/providers/{id} — ROLE_ADMIN.
     *
     * <p>Updates an existing provider. When {@code clientSecret} is null, blank, or absent in
     * the request body, the existing encrypted secret is preserved unchanged. Otherwise the
     * new plaintext is encrypted and the stored secret is overwritten.
     *
     * @param id      the primary key of the provider to update
     * @param request the inbound admin DTO with updated field values
     * @return HTTP 200 with the updated provider DTO (clientSecret always null),
     *         or HTTP 404 if no provider with the given id exists
     */
    @PutMapping("/ha-oidc/providers/{id}")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<OidcProviderAdminDTO> updateProvider(
            @PathVariable Long id,
            @RequestBody OidcProviderAdminDTO request) {
        Optional<HaOidcProvider> existing = providerRepository.findById(id);
        if (existing.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        HaOidcProvider provider = existing.get();
        provider.setProviderName(request.getProviderName());
        provider.setClientId(request.getClientId());
        provider.setDiscoveryUrl(request.getDiscoveryUrl());
        provider.setEnabled(request.isEnabled());
        provider.setUpdatedAt(Instant.now());

        if (request.getScopes() != null && !request.getScopes().isBlank()) {
            provider.setScopes(request.getScopes());
        }

        // Only re-encrypt when the caller supplies a new non-blank secret.
        if (request.getClientSecret() != null && !request.getClientSecret().isBlank()) {
            provider.setClientSecretEncrypted(encryptionService.encrypt(request.getClientSecret()));
        }
        // Otherwise leave the existing clientSecretEncrypted value unchanged.

        HaOidcProvider saved = providerRepository.save(provider);
        return ResponseEntity.ok(toAdminDTO(saved));
    }

    /**
     * DELETE /api/ha-oidc/providers/{id} — ROLE_ADMIN.
     *
     * <p>Deletes the provider row. Cascade FK constraints on {@code ha_oidc_state_cache}
     * and {@code ha_oidc_provider_user} ensure related rows are removed automatically.
     *
     * @param id the primary key of the provider to delete
     * @return HTTP 204 No Content
     */
    @DeleteMapping("/ha-oidc/providers/{id}")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<Void> deleteProvider(@PathVariable Long id) {
        providerRepository.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    // -------------------------------------------------------------------------
    // Private mapping helpers
    // -------------------------------------------------------------------------

    /**
     * Maps a {@link HaOidcProvider} entity to the public (unauthenticated) projection.
     *
     * <p>Contains only id, providerName, and discoveryUrl — never clientId, scopes,
     * clientSecretEncrypted, or any secret value.
     */
    private OidcProviderPublicDTO toPublicDTO(HaOidcProvider p) {
        OidcProviderPublicDTO dto = new OidcProviderPublicDTO();
        dto.setId(p.getId());
        dto.setProviderName(p.getProviderName());
        dto.setDiscoveryUrl(p.getDiscoveryUrl());
        return dto;
    }

    /**
     * Maps a {@link HaOidcProvider} entity to the admin projection.
     *
     * <p>The {@code clientSecret} field is <em>always</em> set to {@code null} — the
     * plaintext secret is never returned, and the encrypted form is equally never exposed.
     */
    private OidcProviderAdminDTO toAdminDTO(HaOidcProvider p) {
        OidcProviderAdminDTO dto = new OidcProviderAdminDTO();
        dto.setId(p.getId());
        dto.setProviderName(p.getProviderName());
        dto.setClientId(p.getClientId());
        dto.setClientSecret(null); // MUST always be null on any response
        dto.setDiscoveryUrl(p.getDiscoveryUrl());
        dto.setScopes(p.getScopes());
        dto.setEnabled(p.isEnabled());
        dto.setCreatedAt(p.getCreatedAt() != null ? p.getCreatedAt().toString() : null);
        dto.setUpdatedAt(p.getUpdatedAt() != null ? p.getUpdatedAt().toString() : null);
        return dto;
    }
}
