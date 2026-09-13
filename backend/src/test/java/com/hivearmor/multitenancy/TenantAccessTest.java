package com.hivearmor.multitenancy;

import com.hivearmor.web.rest.errors.HaResourceNotFoundException;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.AccessDeniedException;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * P0A1-T16 — pins the tenant error-semantics convention so it cannot silently drift:
 * cross-tenant object access → 404 (no disclosure), missing authority → 403,
 * tenant-scoped list → empty.
 */
class TenantAccessTest {

    @Test
    void crossTenantAndGenuineMissAreIndistinguishable404() {
        // Both must throw the SAME 404-mapped exception with the SAME shape — a caller
        // cannot tell "exists in another tenant" from "does not exist".
        assertThatThrownBy(() -> TenantAccess.notFound("agent", 42))
            .isInstanceOf(HaResourceNotFoundException.class)
            .hasMessageContaining("42");

        assertThatThrownBy(() -> TenantAccess.crossTenantNotFound("agent", 42))
            .isInstanceOf(HaResourceNotFoundException.class)
            .hasMessageContaining("42");
    }

    @Test
    void notFoundMessageDoesNotDiscloseTenant() {
        HaResourceNotFoundException ex = catchNotFound(() -> TenantAccess.crossTenantNotFound("incident", 7));
        assertThat(ex.getMessage()).doesNotContainIgnoringCase("tenant");
        assertThat(ex.getResourceType()).isEqualTo("incident");
        assertThat(ex.getResourceId()).isEqualTo("7");
    }

    @Test
    void missingAuthorityIs403() {
        assertThatThrownBy(() -> TenantAccess.forbidden("insufficient role"))
            .isInstanceOf(AccessDeniedException.class)
            .hasMessageContaining("insufficient role");
    }

    @Test
    void requirePresentReturnsValueAbsentThrows404() {
        assertThat(TenantAccess.require(Optional.of("ok"), "agent", 1)).isEqualTo("ok");
        assertThatThrownBy(() -> TenantAccess.require(Optional.empty(), "agent", 99))
            .isInstanceOf(HaResourceNotFoundException.class)
            .hasMessageContaining("99");
    }

    @Test
    void emptyListIsImmutableAndEmpty() {
        List<String> empty = TenantAccess.emptyList();
        assertThat(empty).isEmpty();
        assertThatThrownBy(() -> empty.add("leak"))
            .isInstanceOf(UnsupportedOperationException.class);
    }

    private HaResourceNotFoundException catchNotFound(Runnable r) {
        try {
            r.run();
        } catch (HaResourceNotFoundException ex) {
            return ex;
        }
        throw new AssertionError("expected HaResourceNotFoundException");
    }
}
