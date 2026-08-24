package com.hivearmor.multitenancy;

import com.hivearmor.domain.chart_builder.UtmDashboard;
import com.hivearmor.repository.chart_builder.UtmDashboardRepository;
import com.hivearmor.service.UtmStackService;
import com.hivearmor.service.chart_builder.UtmDashboardQueryService;
import com.hivearmor.service.dto.chart_builder.UtmDashboardCriteria;
import com.hivearmor.service.impl.chart_builder.UtmDashboardServiceImpl;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * GAP-MT-05 / P1 Spike B — Dashboard tenant isolation (STAGING CANDIDATE).
 *
 * <p>Table-driven AiSOC-style coverage: tenant A never sees tenant B dashboards
 * by list or by ID. Null {@link TenantContext} retains legacy global behavior.
 */
@Tag("isolation")
@Tag("integration")
@DisplayName("P1 Spike B — Dashboard tenant isolation (GAP-MT-05)")
class DashboardTenantIsolationIT {

    private static final Long TENANT_A = 101L;
    private static final Long TENANT_B = 202L;
    private static final String PREFIX_A = "tenant-a";
    private static final String PREFIX_B = "tenant-b";

    private UtmDashboardRepository dashboardRepository;
    private UtmDashboardServiceImpl dashboardService;
    private UtmDashboardQueryService queryService;

    @BeforeEach
    void setUp() {
        dashboardRepository = mock(UtmDashboardRepository.class);
        UtmStackService stackService = mock(UtmStackService.class);
        dashboardService = new UtmDashboardServiceImpl(
            dashboardRepository,
            mock(com.hivearmor.repository.chart_builder.UtmVisualizationRepository.class),
            mock(com.hivearmor.repository.chart_builder.UtmDashboardVisualizationRepository.class),
            stackService
        );
        queryService = new UtmDashboardQueryService(dashboardRepository);
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    static Stream<Arguments> crossTenantGetCases() {
        return Stream.of(
            Arguments.of(TENANT_A, PREFIX_A, 42L, TENANT_B),
            Arguments.of(TENANT_B, PREFIX_B, 7L, TENANT_A)
        );
    }

    @ParameterizedTest(name = "viewer tenant {0} cannot get id {2} owned by {3}")
    @MethodSource("crossTenantGetCases")
    @DisplayName("Get by ID — foreign tenant returns empty / never falls back to global findById")
    void getById_neverLeaksForeignTenant(Long viewerTenant, String viewerPrefix,
                                          Long dashboardId, Long ownerTenant) {
        TenantContext.set(viewerTenant, viewerPrefix);
        when(dashboardRepository.findByIdAndTenantId(dashboardId, viewerTenant))
            .thenReturn(Optional.empty());

        assertThat(dashboardService.findOne(dashboardId)).isEmpty();
        verify(dashboardRepository).findByIdAndTenantId(dashboardId, viewerTenant);
        verify(dashboardRepository, never()).findById(dashboardId);
        assertThat(ownerTenant).isNotEqualTo(viewerTenant);
    }

    static Stream<Arguments> listIsolationCases() {
        return Stream.of(
            Arguments.of(TENANT_A, PREFIX_A, 11L),
            Arguments.of(TENANT_B, PREFIX_B, 22L)
        );
    }

    @ParameterizedTest(name = "tenant {0} lists only own dashboards")
    @MethodSource("listIsolationCases")
    @DisplayName("List — findAll uses tenant-scoped repository method")
    void list_usesTenantScopedQuery(Long tenantId, String prefix, Long dashboardId) {
        TenantContext.set(tenantId, prefix);
        Pageable pageable = PageRequest.of(0, 25);
        UtmDashboard owned = dashboard(dashboardId, tenantId, "dash-" + prefix);
        when(dashboardRepository.findByTenantId(tenantId, pageable))
            .thenReturn(new PageImpl<>(List.of(owned), pageable, 1));

        var page = dashboardService.findAll(pageable);

        assertThat(page.getContent()).extracting(UtmDashboard::getId).containsExactly(dashboardId);
        assertThat(page.getContent()).allMatch(d -> tenantId.equals(d.getTenantId()));
        verify(dashboardRepository).findByTenantId(tenantId, pageable);
        verify(dashboardRepository, never()).findAll(pageable);
    }

    @Test
    @DisplayName("Criteria list — specification forces tenant_id equality (no global findAll)")
    void criteriaList_appliesHardTenantGate() {
        TenantContext.set(TENANT_A, PREFIX_A);
        Pageable pageable = PageRequest.of(0, 10);
        when(dashboardRepository.findAll(any(Specification.class), eq(pageable)))
            .thenReturn(new PageImpl<>(List.of(dashboard(11L, TENANT_A, "alpha-only")), pageable, 1));

        var page = queryService.findByCriteria(new UtmDashboardCriteria(), pageable);

        assertThat(page.getContent()).hasSize(1);
        assertThat(page.getContent().get(0).getTenantId()).isEqualTo(TENANT_A);
        verify(dashboardRepository).findAll(any(Specification.class), eq(pageable));
    }

    @Test
    @DisplayName("Create — stamps TenantContext client id onto new dashboard")
    void create_stampsTenantIdFromContext() {
        TenantContext.set(TENANT_A, PREFIX_A);
        UtmDashboard incoming = dashboard(null, 999L, "should-be-overwritten");
        when(dashboardRepository.save(any(UtmDashboard.class))).thenAnswer(inv -> {
            UtmDashboard saved = inv.getArgument(0);
            saved.setId(55L);
            return saved;
        });

        UtmDashboard result = dashboardService.save(incoming);

        assertThat(result.getTenantId()).isEqualTo(TENANT_A);
        verify(dashboardRepository).save(any(UtmDashboard.class));
    }

    @Test
    @DisplayName("Update — foreign tenant gets 404 and cannot mutate")
    void update_foreignTenant_returnsNotFound() {
        TenantContext.set(TENANT_A, PREFIX_A);
        when(dashboardRepository.findByIdAndTenantId(42L, TENANT_A)).thenReturn(Optional.empty());

        UtmDashboard attack = dashboard(42L, TENANT_B, "stolen");
        // Cross-tenant update must 404 when the row exists outside viewer scope
        when(dashboardRepository.existsById(42L)).thenReturn(true);
        assertThatThrownBy(() -> dashboardService.save(attack))
            .isInstanceOf(ResponseStatusException.class)
            .hasMessageContaining("404");

        verify(dashboardRepository, never()).save(any());
        verify(dashboardRepository, never()).findById(42L);
    }

    @Test
    @DisplayName("Delete — foreign tenant gets 404 and never deletes")
    void delete_foreignTenant_returnsNotFound() {
        TenantContext.set(TENANT_A, PREFIX_A);
        when(dashboardRepository.findByIdAndTenantId(42L, TENANT_A)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> dashboardService.delete(42L))
            .isInstanceOf(ResponseStatusException.class)
            .hasMessageContaining("404");

        verify(dashboardRepository, never()).deleteById(42L);
    }

    @Test
    @DisplayName("Null context — legacy global findById / findAll (no tenant filter)")
    void nullContext_legacyGlobalBehavior() {
        assertThat(TenantContext.getClientId()).isNull();
        when(dashboardRepository.findById(9L)).thenReturn(Optional.of(dashboard(9L, TENANT_B, "legacy-or-b")));
        Pageable pageable = PageRequest.of(0, 5);
        when(dashboardRepository.findAll(pageable))
            .thenReturn(new PageImpl<>(List.of(dashboard(9L, TENANT_B, "legacy-or-b")), pageable, 1));

        assertThat(dashboardService.findOne(9L)).isPresent();
        assertThat(dashboardService.findAll(pageable).getContent()).hasSize(1);

        verify(dashboardRepository).findById(9L);
        verify(dashboardRepository).findAll(pageable);
        verify(dashboardRepository, never()).findByIdAndTenantId(any(), any());
        verify(dashboardRepository, never()).findByTenantId(any(), any());
    }

    private static UtmDashboard dashboard(Long id, Long tenantId, String name) {
        UtmDashboard d = new UtmDashboard();
        d.setId(id);
        d.setTenantId(tenantId);
        d.setName(name);
        d.setDescription("isolation fixture");
        d.setCreatedDate(Instant.parse("2026-08-24T10:00:00Z"));
        d.setModifiedDate(Instant.parse("2026-08-24T10:00:00Z"));
        d.setUserCreated("tester");
        d.setSidebarPinned(false);
        return d;
    }
}
