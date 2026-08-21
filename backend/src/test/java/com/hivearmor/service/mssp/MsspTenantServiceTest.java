package com.hivearmor.service.mssp;

import com.hivearmor.domain.HaClient;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.repository.HaClientRepository;
import com.hivearmor.repository.HaTenantUserRepository;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import com.hivearmor.service.mssp.dto.TenantDetailDTO;
import com.hivearmor.service.mssp.dto.UpdateTenantRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Pure Mockito unit tests for {@link MsspTenantService}.
 *
 * <p>No Spring context is loaded; all collaborators are Mockito mocks.
 *
 * <p>Sprint 23 — S23-T04.
 */
@ExtendWith(MockitoExtension.class)
class MsspTenantServiceTest {

    @Mock
    private HaClientRepository clients;

    @Mock
    private HaTenantUserRepository memberships;

    @Mock
    private MsspIndexResolver indexResolver;

    @Mock
    private OpensearchClientBuilder os;

    private MsspTenantService service;

    private static final Clock FIXED_CLOCK =
            Clock.fixed(Instant.parse("2026-01-15T12:00:00Z"), ZoneOffset.UTC);

    @BeforeEach
    void setUp() {
        service = new MsspTenantService(clients, memberships, indexResolver, os, FIXED_CLOCK);
    }

    // =========================================================================
    // Test (a) — update() never mutates clientPrefix
    // =========================================================================

    /**
     * {@code update(id, req)} must write only the four allowed fields and must
     * never call {@link HaClient#setClientPrefix(String)} on the persisted entity.
     *
     * <p>Validates: Requirements 9.2, 10.5
     */
    @Test
    @DisplayName("update() saves entity with original clientPrefix — setClientPrefix never called")
    void update_neverMutatesClientPrefix() throws Exception {
        // Arrange
        HaClient original = new HaClient();
        original.setId(1L);
        original.setName("Old Name");
        original.setClientPrefix("original-prefix");
        original.setMsspManaged(true);
        original.setMaxUsers(50);
        original.setLicenceType("standard");
        original.setContactEmail("old@test.com");

        HaClient spy = spy(original);

        when(clients.findById(1L)).thenReturn(Optional.of(spy));
        when(clients.save(any(HaClient.class))).thenAnswer(inv -> inv.getArgument(0));
        when(memberships.countByClientId(1L)).thenReturn(0L);
        // OpenSearch calls will throw, so safe helpers return zero-filled arrays
        doThrow(new RuntimeException("no-opensearch"))
                .when(os).execute(any());

        UpdateTenantRequest req = new UpdateTenantRequest(
                "NewName", 100, "enterprise", "new@test.com");

        // Act
        TenantDetailDTO result = service.update(1L, req);

        // Assert — the entity captured by save() still has the original prefix
        ArgumentCaptor<HaClient> saved = ArgumentCaptor.forClass(HaClient.class);
        verify(clients).save(saved.capture());
        assertThat(saved.getValue().getClientPrefix()).isEqualTo("original-prefix");

        // setClientPrefix must never have been called on the spy
        verify(spy, never()).setClientPrefix(any());

        // The returned DTO also reflects the unchanged prefix
        assertThat(result.clientPrefix()).isEqualTo("original-prefix");
        assertThat(result.name()).isEqualTo("NewName");
        assertThat(result.maxUsers()).isEqualTo(100);
        assertThat(result.licenceType()).isEqualTo("enterprise");
        assertThat(result.contactEmail()).isEqualTo("new@test.com");
    }

    // =========================================================================
    // Test (b) — getById() returns arrays of exact lengths 60 and 7
    // =========================================================================

    /**
     * When OpenSearch is unavailable, {@code getById()} must still return a
     * {@link TenantDetailDTO} whose {@code epsSparkline} has exactly 60 elements
     * and whose {@code alertsTrend7d} has exactly 7 elements (all zeros).
     *
     * <p>Validates: Requirements 9.3, 9.4
     */
    @Test
    @DisplayName("getById() returns epsSparkline.length==60 and alertsTrend7d.length==7 when OS throws")
    void getById_opensearchUnavailable_returnsZeroFilledArraysOfCorrectLength() throws Exception {
        // Arrange
        HaClient client = validMsspClient(10L, "acme-prefix");

        when(clients.findById(10L)).thenReturn(Optional.of(client));
        when(memberships.countByClientId(10L)).thenReturn(3L);
        doThrow(new RuntimeException("opensearch-down"))
                .when(os).execute(any());

        // Act
        Optional<TenantDetailDTO> result = service.getById(10L);

        // Assert
        assertThat(result).isPresent();
        TenantDetailDTO dto = result.get();
        assertThat(dto.epsSparkline()).hasSize(60);
        assertThat(dto.alertsTrend7d()).hasSize(7);
    }

    // =========================================================================
    // Test (c) — missing tenant → Optional.empty()
    // =========================================================================

    /**
     * {@code getById(999L)} must return {@link Optional#empty()} when no row
     * exists for that id.
     *
     * <p>Validates: Requirement 9.1
     */
    @Test
    @DisplayName("getById() returns Optional.empty() when tenant id does not exist")
    void getById_missingTenant_returnsEmpty() {
        when(clients.findById(999L)).thenReturn(Optional.empty());

        Optional<TenantDetailDTO> result = service.getById(999L);

        assertThat(result).isEmpty();
        verify(clients).findById(999L);
    }

    // =========================================================================
    // Test (d) — mssp_managed = false → Optional.empty()
    // =========================================================================

    /**
     * {@code getById()} must return {@link Optional#empty()} when the row exists
     * but {@code mssp_managed = false}.
     *
     * <p>Validates: Requirement 9.1
     */
    @Test
    @DisplayName("getById() returns Optional.empty() when mssp_managed = false")
    void getById_notMsspManaged_returnsEmpty() {
        HaClient nonMssp = new HaClient();
        nonMssp.setId(5L);
        nonMssp.setName("Non-MSSP client");
        nonMssp.setClientPrefix("some-prefix");
        nonMssp.setMsspManaged(false);

        when(clients.findById(5L)).thenReturn(Optional.of(nonMssp));

        Optional<TenantDetailDTO> result = service.getById(5L);

        assertThat(result).isEmpty();
    }

    // =========================================================================
    // Helper
    // =========================================================================

    private static HaClient validMsspClient(Long id, String prefix) {
        HaClient c = new HaClient();
        c.setId(id);
        c.setName("Test Tenant");
        c.setClientPrefix(prefix);
        c.setMsspManaged(true);
        c.setMaxUsers(25);
        c.setLicenceType("standard");
        c.setContactEmail("contact@test.com");
        return c;
    }
}
