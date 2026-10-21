package com.hivearmor.security.jwt;

import com.hivearmor.security.AuthoritiesConstants;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import tech.jhipster.config.JHipsterProperties;

import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * BE-POL (#368) — operator-provisioning code path.
 *
 * <p>Proves the forward-safe half of the {@code ROLE_PLATFORM_ADMIN} grant: wherever the MSSP
 * operator identity ({@code MSSP_ADMIN}) is reconstituted from its JWT, it is ALSO granted
 * {@code ROLE_PLATFORM_ADMIN} — the authority that gates GLOBAL agent-policy-template writes
 * (BE-POL-GLOBAL-ADMIN, #367). This covers operators whose authorities arrive in the JWT
 * {@code auth} claim from an external IdP and never land in {@code jhi_user_authority}
 * (the DB-backed route is covered by the Liquibase changeset
 * {@code 20260925001_platform_admin_operator_grant.xml}).
 *
 * <p>Crucially it also proves the derivation does NOT widen any tenant role: a token carrying
 * only {@code ROLE_ADMIN} never gains {@code ROLE_PLATFORM_ADMIN}, so the #367 escalation — a
 * single tenant admin authoring policy every other tenant inherits — stays closed, and a
 * single-tenant / on-prem {@code ROLE_ADMIN} is unaffected.
 */
class TokenProviderPlatformAdminGrantTest {

    private static final String MSSP_ADMIN = "MSSP_ADMIN";

    // Fixed test key — 64 random bytes encoded as Base64 (same fixture as TokenProviderTest).
    private static final String TEST_BASE64_SECRET =
        "ZjY4MDYwNWU0ZTQ3MGFkMjJiY2IzYjMyNzAyMGE5NzMxMjdhY2JhMmQ5MDg5MzVjMmJhMTZlY2I5ZjE0NDZiNg==";

    private TokenProvider tokenProvider;

    @BeforeEach
    void setUp() throws Exception {
        JHipsterProperties props = new JHipsterProperties();
        props.getSecurity().getAuthentication().getJwt().setBase64Secret(TEST_BASE64_SECRET);
        props.getSecurity().getAuthentication().getJwt().setTokenValidityInSeconds(86400L);
        props.getSecurity().getAuthentication().getJwt().setTokenValidityInSecondsForRememberMe(2592000L);
        tokenProvider = new TokenProvider(props);
        tokenProvider.afterPropertiesSet();
    }

    private List<String> authoritiesOf(String... roles) {
        Authentication auth = new UsernamePasswordAuthenticationToken(
            "principal", "pw",
            Arrays.stream(roles).map(SimpleGrantedAuthority::new).collect(Collectors.toList()));
        String token = tokenProvider.createToken(auth, false, true);
        return tokenProvider.getAuthentication(token).getAuthorities().stream()
            .map(GrantedAuthority::getAuthority)
            .collect(Collectors.toList());
    }

    // ── MSSP operator (MSSP_ADMIN) RECEIVES ROLE_PLATFORM_ADMIN ───────────────────────

    @Test
    void msspAdminToken_isGrantedPlatformAdmin() {
        List<String> authorities = authoritiesOf(MSSP_ADMIN);
        assertThat(authorities)
            .as("MSSP operator must be granted the GLOBAL-template-write authority")
            .contains(MSSP_ADMIN, AuthoritiesConstants.PLATFORM_ADMIN);
    }

    @Test
    void msspAdminWithTenantAdmin_isGrantedPlatformAdmin_andKeepsOtherRoles() {
        List<String> authorities = authoritiesOf(MSSP_ADMIN, AuthoritiesConstants.ADMIN);
        assertThat(authorities)
            .contains(MSSP_ADMIN, AuthoritiesConstants.ADMIN, AuthoritiesConstants.PLATFORM_ADMIN);
    }

    @Test
    void msspAdminAlreadyHoldingPlatformAdmin_isNotDuplicated() {
        List<String> authorities = authoritiesOf(MSSP_ADMIN, AuthoritiesConstants.PLATFORM_ADMIN);
        assertThat(authorities).filteredOn(AuthoritiesConstants.PLATFORM_ADMIN::equals).hasSize(1);
        assertThat(authorities).contains(MSSP_ADMIN, AuthoritiesConstants.PLATFORM_ADMIN);
    }

    // ── tenant / single-tenant ROLE_ADMIN is NOT escalated (the #367 fix stays closed) ──

    @Test
    void tenantAdminToken_isNotGrantedPlatformAdmin() {
        List<String> authorities = authoritiesOf(AuthoritiesConstants.ADMIN);
        assertThat(authorities)
            .as("a tenant / single-tenant ROLE_ADMIN must never gain platform-admin")
            .containsExactly(AuthoritiesConstants.ADMIN)
            .doesNotContain(AuthoritiesConstants.PLATFORM_ADMIN);
    }

    @Test
    void socManagerToken_isNotGrantedPlatformAdmin() {
        List<String> authorities = authoritiesOf(AuthoritiesConstants.SOC_MANAGER);
        assertThat(authorities)
            .containsExactly(AuthoritiesConstants.SOC_MANAGER)
            .doesNotContain(AuthoritiesConstants.PLATFORM_ADMIN);
    }

    @Test
    void analystToken_isNotGrantedPlatformAdmin() {
        List<String> authorities = authoritiesOf(AuthoritiesConstants.ANALYST);
        assertThat(authorities).doesNotContain(AuthoritiesConstants.PLATFORM_ADMIN);
    }

    @Test
    void userToken_isNotGrantedPlatformAdmin() {
        List<String> authorities = authoritiesOf(AuthoritiesConstants.USER);
        assertThat(authorities).doesNotContain(AuthoritiesConstants.PLATFORM_ADMIN);
    }
}
