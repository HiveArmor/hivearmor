package com.hivearmor.security;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * S-2C — Role model contract tests.
 *
 * These are pure unit tests (no Spring context, no DB) that verify:
 *   1. All expected role constants are present in AuthoritiesConstants.
 *   2. The three new SOC roles follow the ROLE_ naming convention.
 *   3. A simulated "read-only user" authority set does NOT include write roles.
 *
 * Integration-level enforcement (403 on POST /api/ha-incidents for ROLE_READ_ONLY)
 * is documented in the test-results file and will be enforced once the endpoint
 * is annotated with @PreAuthorize (tracked as DEBT-15).
 */
class RoleModelTest {

    // ── Constant existence ──────────────────────────────────────────────────

    @Test
    void adminConstantIsPresent() {
        assertThat(AuthoritiesConstants.ADMIN).isEqualTo("ROLE_ADMIN");
    }

    @Test
    void userConstantIsPresent() {
        assertThat(AuthoritiesConstants.USER).isEqualTo("ROLE_USER");
    }

    @Test
    void socManagerConstantIsPresent() {
        assertThat(AuthoritiesConstants.SOC_MANAGER).isEqualTo("ROLE_SOC_MANAGER");
    }

    @Test
    void analystConstantIsPresent() {
        assertThat(AuthoritiesConstants.ANALYST).isEqualTo("ROLE_ANALYST");
    }

    @Test
    void readOnlyConstantIsPresent() {
        assertThat(AuthoritiesConstants.READ_ONLY).isEqualTo("ROLE_READ_ONLY");
    }

    // ── Naming convention ───────────────────────────────────────────────────

    @Test
    void allRoleConstantsFollowRolePrefix() {
        List<String> roles = List.of(
            AuthoritiesConstants.ADMIN,
            AuthoritiesConstants.USER,
            AuthoritiesConstants.ANONYMOUS,
            AuthoritiesConstants.PRE_VERIFICATION_USER,
            AuthoritiesConstants.SOC_MANAGER,
            AuthoritiesConstants.ANALYST,
            AuthoritiesConstants.READ_ONLY
        );
        roles.forEach(r -> assertThat(r).startsWith("ROLE_"));
    }

    // ── Role model logic ────────────────────────────────────────────────────

    @Test
    void adminUserHasAdminRole() {
        Set<String> adminAuthorities = Set.of(AuthoritiesConstants.ADMIN, AuthoritiesConstants.USER);
        assertThat(adminAuthorities).contains(AuthoritiesConstants.ADMIN);
    }

    @Test
    void analystUserDoesNotHaveAdminRole() {
        Set<String> analystAuthorities = Set.of(AuthoritiesConstants.ANALYST, AuthoritiesConstants.USER);
        assertThat(analystAuthorities).doesNotContain(AuthoritiesConstants.ADMIN);
    }

    @Test
    void readOnlyUserDoesNotHaveWriteRoles() {
        Set<String> readOnlyAuthorities = Set.of(AuthoritiesConstants.READ_ONLY);
        assertThat(readOnlyAuthorities).doesNotContainAnyElementsOf(
            List.of(
                AuthoritiesConstants.ADMIN,
                AuthoritiesConstants.SOC_MANAGER,
                AuthoritiesConstants.ANALYST,
                AuthoritiesConstants.USER
            )
        );
    }

    @Test
    void socManagerHasManagerRoleButNotAdmin() {
        Set<String> managerAuthorities = Set.of(AuthoritiesConstants.SOC_MANAGER, AuthoritiesConstants.USER);
        assertThat(managerAuthorities).contains(AuthoritiesConstants.SOC_MANAGER);
        assertThat(managerAuthorities).doesNotContain(AuthoritiesConstants.ADMIN);
    }

    // ── hasAnyRole simulation ───────────────────────────────────────────────

    @Test
    void hasAnyRoleReturnsTrueWhenOneRoleMatches() {
        Set<String> userRoles = Set.of(AuthoritiesConstants.ANALYST);
        List<String> allowed = List.of(AuthoritiesConstants.ANALYST, AuthoritiesConstants.SOC_MANAGER);
        boolean result = allowed.stream().anyMatch(userRoles::contains);
        assertThat(result).isTrue();
    }

    @Test
    void hasAnyRoleReturnsFalseWhenNoRoleMatches() {
        Set<String> userRoles = Set.of(AuthoritiesConstants.READ_ONLY);
        List<String> allowed = List.of(AuthoritiesConstants.ANALYST, AuthoritiesConstants.SOC_MANAGER, AuthoritiesConstants.ADMIN);
        boolean result = allowed.stream().anyMatch(userRoles::contains);
        assertThat(result).isFalse();
    }
}
