package com.hivearmor.service.mapper.compliance;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.HaClient;
import com.hivearmor.domain.compliance.ComplianceResult;
import com.hivearmor.repository.HaClientRepository;
import com.hivearmor.service.dto.compliance.ComplianceResultDto;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link ComplianceResultMapper#toDto(ComplianceResult)}.
 *
 * <p>Validates requirements 4.2, 4.3, and 4.4:
 * <ul>
 *   <li>4.2 — {@code tenantPrefix} is populated from {@code ha_client.client_prefix}
 *       when the entity's {@code client_id} matches a row.</li>
 *   <li>4.3 — {@code tenantPrefix} is {@code null} when the entity's {@code client_id}
 *       is {@code null}; no repository call is issued in that case.</li>
 *   <li>4.4 — The JSON property key serializes as exactly {@code "tenantPrefix"}.</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
class ComplianceResultMapperTest {

    @Mock
    private HaClientRepository haClientRepository;

    private ComplianceResultMapper mapper;

    @BeforeEach
    void setUp() {
        mapper = new ComplianceResultMapper(haClientRepository);
    }

    // -------------------------------------------------------------------------
    // Helper
    // -------------------------------------------------------------------------

    /** Builds a minimal {@link ComplianceResult} with the given {@code clientId}. */
    private ComplianceResult buildEntity(Long clientId) {
        ComplianceResult entity = new ComplianceResult();
        entity.setId(1L);
        entity.setControlId(10L);
        entity.setControlName("AC-1");
        entity.setFramework("NIST");
        entity.setStatus("PASS");
        entity.setEvaluatedAt(Instant.parse("2026-07-24T12:00:00Z"));
        entity.setClientId(clientId);
        return entity;
    }

    // -------------------------------------------------------------------------
    // Requirement 4.2 — tenantPrefix is populated from ha_client.client_prefix
    // -------------------------------------------------------------------------

    /**
     * When the entity has a non-null {@code clientId} and the repository returns an
     * {@link HaClient} with {@code clientPrefix = "acme"}, the DTO must carry
     * {@code tenantPrefix = "acme"}.
     *
     * <p>Validates: Requirement 4.2
     */
    @Test
    void toDto_withClientId_populatesTenantPrefix() {
        long clientId = 42L;

        HaClient client = new HaClient();
        client.setId(clientId);
        client.setClientPrefix("acme");

        when(haClientRepository.findById(clientId)).thenReturn(Optional.of(client));

        ComplianceResultDto dto = mapper.toDto(buildEntity(clientId));

        assertThat(dto.getTenantPrefix()).isEqualTo("acme");
    }

    // -------------------------------------------------------------------------
    // Requirement 4.3 — tenantPrefix is null when entity clientId is null;
    //                   repository must NOT be called
    // -------------------------------------------------------------------------

    /**
     * When the entity has a {@code null} {@code clientId}, the mapper must set
     * {@code tenantPrefix} to {@code null} on the DTO and must never invoke
     * {@link HaClientRepository#findById}.
     *
     * <p>Validates: Requirement 4.3
     */
    @Test
    void toDto_withNullClientId_tenantPrefixIsNull() {
        ComplianceResultDto dto = mapper.toDto(buildEntity(null));

        assertThat(dto.getTenantPrefix()).isNull();
        verify(haClientRepository, never()).findById(anyLong());
    }

    // -------------------------------------------------------------------------
    // Requirement 4.2 — tenantPrefix is null when ha_client row is missing
    // -------------------------------------------------------------------------

    /**
     * When the entity has a non-null {@code clientId} but no matching row exists in
     * {@code ha_client}, the mapper must set {@code tenantPrefix} to {@code null}.
     *
     * <p>Validates: Requirement 4.2
     */
    @Test
    void toDto_withMissingClient_tenantPrefixIsNull() {
        long clientId = 99L;

        when(haClientRepository.findById(clientId)).thenReturn(Optional.empty());

        ComplianceResultDto dto = mapper.toDto(buildEntity(clientId));

        assertThat(dto.getTenantPrefix()).isNull();
    }

    // -------------------------------------------------------------------------
    // Requirement 4.4 — JSON property key is exactly "tenantPrefix"
    // -------------------------------------------------------------------------

    /**
     * Serializing a {@link ComplianceResultDto} with {@code tenantPrefix = "acme"}
     * via Jackson's {@link ObjectMapper} must produce JSON that contains the key
     * {@code "tenantPrefix"} — not {@code "tenant_prefix"} or any other variant.
     *
     * <p>Validates: Requirement 4.4
     */
    @Test
    void tenantPrefixJsonKey_isExactlyTenantPrefix() throws Exception {
        ComplianceResultDto dto = new ComplianceResultDto();
        dto.setTenantPrefix("acme");

        ObjectMapper objectMapper = new ObjectMapper();
        String json = objectMapper.writeValueAsString(dto);

        assertThat(json).contains("\"tenantPrefix\":\"acme\"");
        assertThat(json).doesNotContain("tenant_prefix");
    }
}
