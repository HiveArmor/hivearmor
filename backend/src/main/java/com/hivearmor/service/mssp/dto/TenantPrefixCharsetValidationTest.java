package com.hivearmor.service.mssp.dto;

import com.hivearmor.service.dto.HiveTenantDTO;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * P0-A2 follow-up — the ElasticsearchResource tenant-scope guard
 * ({@code TenantScopeGuard#isPatternInScope}) matches tenant indexes with a
 * {@code startsWith} on {@code "v3-hive-<type>-<prefix>-"}. A hyphen INSIDE a tenant
 * prefix breaks that boundary: tenant {@code cwm}'s scope prefix
 * {@code "v3-hive-alert-cwm-"} would also match tenant {@code cwm-x}'s index
 * {@code "v3-hive-alert-cwm-x-*"}. Creation-time validation must therefore reject
 * hyphens in the prefix. This test pins that contract on both creation DTOs.
 */
@DisplayName("Tenant prefix charset — hyphen rejected at creation (ES scope-guard dependency)")
class TenantPrefixCharsetValidationTest {

    private Validator validator;

    @BeforeEach
    void setUp() {
        validator = Validation.buildDefaultValidatorFactory().getValidator();
    }

    private NewTenantRequest newTenant(String prefix) {
        return new NewTenantRequest("Acme Corp", prefix, "admin@acme.example", "acmeadmin", 10, "STANDARD");
    }

    private HiveTenantDTO hiveTenant(String prefix) {
        HiveTenantDTO dto = new HiveTenantDTO();
        dto.setName("Acme Corp");
        dto.setPrefix(prefix);
        return dto;
    }

    @Test
    @DisplayName("NewTenantRequest: hyphenated prefix is rejected")
    void newTenantRequest_hyphenPrefixRejected() {
        assertThat(validator.validateProperty(newTenant("cwm-x"), "clientPrefix")).isNotEmpty();
        assertThat(validator.validateProperty(newTenant("acme-eu"), "clientPrefix")).isNotEmpty();
        // A trailing/leading hyphen must also be rejected.
        assertThat(validator.validateProperty(newTenant("cwm-"), "clientPrefix")).isNotEmpty();
    }

    @Test
    @DisplayName("NewTenantRequest: hyphen-free prefix is accepted")
    void newTenantRequest_alnumPrefixAccepted() {
        assertThat(validator.validateProperty(newTenant("cwm"), "clientPrefix")).isEmpty();
        assertThat(validator.validateProperty(newTenant("acme2"), "clientPrefix")).isEmpty();
    }

    @Test
    @DisplayName("HiveTenantDTO: hyphenated prefix is rejected")
    void hiveTenantDto_hyphenPrefixRejected() {
        assertThat(validator.validateProperty(hiveTenant("cwm-x"), "prefix")).isNotEmpty();
    }

    @Test
    @DisplayName("HiveTenantDTO: hyphen-free prefix is accepted")
    void hiveTenantDto_alnumPrefixAccepted() {
        assertThat(validator.validateProperty(hiveTenant("cwm"), "prefix")).isEmpty();
        // empty is allowed by the regex (single-tenant / unset) — scope guard treats null/blank as out-of-scope anyway.
        assertThat(validator.validateProperty(hiveTenant(""), "prefix")).isEmpty();
    }
}
