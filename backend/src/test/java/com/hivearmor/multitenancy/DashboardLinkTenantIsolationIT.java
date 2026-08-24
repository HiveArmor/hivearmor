package com.hivearmor.multitenancy;

import com.hivearmor.domain.chart_builder.UtmDashboard;
import com.hivearmor.domain.chart_builder.UtmDashboardAuthority;
import com.hivearmor.domain.chart_builder.UtmDashboardVisualization;
import com.hivearmor.repository.chart_builder.UtmDashboardAuthorityRepository;
import com.hivearmor.repository.chart_builder.UtmDashboardRepository;
import com.hivearmor.repository.chart_builder.UtmDashboardVisualizationRepository;
import com.hivearmor.service.chart_builder.UtmDashboardVisualizationQueryService;
import com.hivearmor.service.dto.chart_builder.UtmDashboardVisualizationCriteria;
import com.hivearmor.service.impl.chart_builder.UtmDashboardAuthorityServiceImpl;
import com.hivearmor.service.impl.chart_builder.UtmDashboardVisualizationServiceImpl;
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
 * GAP-MT-05 depth — dashboard-linked visualization / authority isolation
 * (STAGING CANDIDATE). Parent {@code hive_dashboard.tenant_id} gates IDOR.
 */
@Tag("isolation")
@Tag("integration")
@DisplayName("P1 MSSP — Dashboard link tenant isolation (GAP-MT-05 depth)")
class DashboardLinkTenantIsolationIT {

    private static final Long TENANT_A = 101L;
    private static final Long TENANT_B = 202L;
    private static final String PREFIX_A = "tenant-a";
    private static final String PREFIX_B = "tenant-b";

    private UtmDashboardRepository dashboardRepository;
    private UtmDashboardVisualizationRepository visualizationRepository;
    private UtmDashboardAuthorityRepository authorityRepository;
    private UtmDashboardVisualizationServiceImpl visualizationService;
    private UtmDashboardAuthorityServiceImpl authorityService;
    private UtmDashboardVisualizationQueryService visualizationQueryService;
    private DashboardTenantAccess dashboardTenantAccess;

    @BeforeEach
    void setUp() {
        dashboardRepository = mock(UtmDashboardRepository.class);
        visualizationRepository = mock(UtmDashboardVisualizationRepository.class);
        authorityRepository = mock(UtmDashboardAuthorityRepository.class);
        dashboardTenantAccess = new DashboardTenantAccess(dashboardRepository);
        visualizationService = new UtmDashboardVisualizationServiceImpl(
            visualizationRepository, dashboardTenantAccess);
        authorityService = new UtmDashboardAuthorityServiceImpl(
            authorityRepository, dashboardTenantAccess);
        visualizationQueryService = new UtmDashboardVisualizationQueryService(visualizationRepository);
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    static Stream<Arguments> crossTenantGetCases() {
        return Stream.of(
            Arguments.of(TENANT_A, PREFIX_A, 42L),
            Arguments.of(TENANT_B, PREFIX_B, 7L)
        );
    }

    @ParameterizedTest(name = "viewer tenant {0} cannot get visualization id {2}")
    @MethodSource("crossTenantGetCases")
    @DisplayName("Visualization get — foreign tenant returns empty / never falls back to findById")
    void visualizationGet_neverLeaksForeignTenant(Long viewerTenant, String viewerPrefix, Long vizLinkId) {
        TenantContext.set(viewerTenant, viewerPrefix);
        when(visualizationRepository.findByIdAndDashboardTenantId(vizLinkId, viewerTenant))
            .thenReturn(Optional.empty());

        assertThat(visualizationService.findOne(vizLinkId)).isEmpty();
        verify(visualizationRepository).findByIdAndDashboardTenantId(vizLinkId, viewerTenant);
        verify(visualizationRepository, never()).findById(vizLinkId);
    }

    @ParameterizedTest(name = "viewer tenant {0} cannot get authority id {2}")
    @MethodSource("crossTenantGetCases")
    @DisplayName("Authority get — foreign tenant returns empty / never falls back to findById")
    void authorityGet_neverLeaksForeignTenant(Long viewerTenant, String viewerPrefix, Long authorityId) {
        TenantContext.set(viewerTenant, viewerPrefix);
        when(authorityRepository.findByIdAndDashboardTenantId(authorityId, viewerTenant))
            .thenReturn(Optional.empty());

        assertThat(authorityService.findOne(authorityId)).isEmpty();
        verify(authorityRepository).findByIdAndDashboardTenantId(authorityId, viewerTenant);
        verify(authorityRepository, never()).findById(authorityId);
    }

    @Test
    @DisplayName("Visualization create — attaching to foreign dashboard returns 404")
    void visualizationSave_foreignDashboard_returnsNotFound() {
        TenantContext.set(TENANT_A, PREFIX_A);
        when(dashboardRepository.findByIdAndTenantId(99L, TENANT_A)).thenReturn(Optional.empty());

        UtmDashboardVisualization attack = visualization(null, 99L);
        assertThatThrownBy(() -> visualizationService.save(attack))
            .isInstanceOf(ResponseStatusException.class)
            .hasMessageContaining("404");

        verify(visualizationRepository, never()).save(any());
        verify(dashboardRepository, never()).findById(99L);
    }

    @Test
    @DisplayName("Authority create — attaching to foreign dashboard returns 404")
    void authoritySave_foreignDashboard_returnsNotFound() {
        TenantContext.set(TENANT_A, PREFIX_A);
        when(dashboardRepository.findByIdAndTenantId(99L, TENANT_A)).thenReturn(Optional.empty());

        UtmDashboardAuthority attack = authority(null, 99L, "ROLE_ANALYST");
        assertThatThrownBy(() -> authorityService.save(attack))
            .isInstanceOf(ResponseStatusException.class)
            .hasMessageContaining("404");

        verify(authorityRepository, never()).save(any());
    }

    @Test
    @DisplayName("Visualization list — uses tenant-scoped repository method")
    void visualizationList_usesTenantScopedQuery() {
        TenantContext.set(TENANT_A, PREFIX_A);
        Pageable pageable = PageRequest.of(0, 25);
        UtmDashboardVisualization owned = visualization(11L, 55L);
        when(visualizationRepository.findAllByDashboardTenantId(TENANT_A, pageable))
            .thenReturn(new PageImpl<>(List.of(owned), pageable, 1));

        var page = visualizationService.findAll(pageable);

        assertThat(page.getContent()).extracting(UtmDashboardVisualization::getId).containsExactly(11L);
        verify(visualizationRepository).findAllByDashboardTenantId(TENANT_A, pageable);
        verify(visualizationRepository, never()).findAll(pageable);
    }

    @Test
    @DisplayName("Authority list — uses tenant-scoped repository method")
    void authorityList_usesTenantScopedQuery() {
        TenantContext.set(TENANT_B, PREFIX_B);
        Pageable pageable = PageRequest.of(0, 10);
        UtmDashboardAuthority owned = authority(3L, 88L, "ROLE_SOC_MANAGER");
        when(authorityRepository.findAllByDashboardTenantId(TENANT_B, pageable))
            .thenReturn(new PageImpl<>(List.of(owned), pageable, 1));

        var page = authorityService.findAll(pageable);

        assertThat(page.getContent()).extracting(UtmDashboardAuthority::getId).containsExactly(3L);
        verify(authorityRepository).findAllByDashboardTenantId(TENANT_B, pageable);
        verify(authorityRepository, never()).findAll(pageable);
    }

    @Test
    @DisplayName("Visualization delete — foreign tenant gets 404 and never deletes")
    void visualizationDelete_foreignTenant_returnsNotFound() {
        TenantContext.set(TENANT_A, PREFIX_A);
        when(visualizationRepository.findByIdAndDashboardTenantId(42L, TENANT_A))
            .thenReturn(Optional.empty());

        assertThatThrownBy(() -> visualizationService.delete(42L))
            .isInstanceOf(ResponseStatusException.class)
            .hasMessageContaining("404");

        verify(visualizationRepository, never()).deleteById(42L);
    }

    @Test
    @DisplayName("Authority delete — foreign tenant gets 404 and never deletes")
    void authorityDelete_foreignTenant_returnsNotFound() {
        TenantContext.set(TENANT_A, PREFIX_A);
        when(authorityRepository.findByIdAndDashboardTenantId(42L, TENANT_A))
            .thenReturn(Optional.empty());

        assertThatThrownBy(() -> authorityService.delete(42L))
            .isInstanceOf(ResponseStatusException.class)
            .hasMessageContaining("404");

        verify(authorityRepository, never()).deleteById(42L);
    }

    @Test
    @DisplayName("Visualization criteria list — specification forced through dashboard tenant")
    void visualizationCriteria_appliesHardTenantGate() {
        TenantContext.set(TENANT_A, PREFIX_A);
        Pageable pageable = PageRequest.of(0, 10);
        when(visualizationRepository.findAll(any(Specification.class), eq(pageable)))
            .thenReturn(new PageImpl<>(List.of(visualization(11L, 55L)), pageable, 1));

        var page = visualizationQueryService.findByCriteria(new UtmDashboardVisualizationCriteria(), pageable);

        assertThat(page.getContent()).hasSize(1);
        verify(visualizationRepository).findAll(any(Specification.class), eq(pageable));
    }

    @Test
    @DisplayName("Visualization create — owned dashboard stamps and persists")
    void visualizationSave_ownedDashboard_succeeds() {
        TenantContext.set(TENANT_A, PREFIX_A);
        UtmDashboard ownedDash = new UtmDashboard();
        ownedDash.setId(55L);
        ownedDash.setTenantId(TENANT_A);
        when(dashboardRepository.findByIdAndTenantId(55L, TENANT_A)).thenReturn(Optional.of(ownedDash));
        when(visualizationRepository.save(any(UtmDashboardVisualization.class))).thenAnswer(inv -> {
            UtmDashboardVisualization saved = inv.getArgument(0);
            saved.setId(77L);
            return saved;
        });

        UtmDashboardVisualization result = visualizationService.save(visualization(null, 55L));

        assertThat(result.getId()).isEqualTo(77L);
        assertThat(result.getIdDashboard()).isEqualTo(55L);
        verify(visualizationRepository).save(any(UtmDashboardVisualization.class));
    }

    @Test
    @DisplayName("Null context — legacy global findById / findAll for links")
    void nullContext_legacyGlobalBehavior() {
        assertThat(TenantContext.getClientId()).isNull();
        when(visualizationRepository.findById(9L)).thenReturn(Optional.of(visualization(9L, 1L)));
        when(authorityRepository.findById(8L)).thenReturn(Optional.of(authority(8L, 1L, "ROLE_USER")));
        Pageable pageable = PageRequest.of(0, 5);
        when(visualizationRepository.findAll(pageable))
            .thenReturn(new PageImpl<>(List.of(visualization(9L, 1L)), pageable, 1));
        when(authorityRepository.findAll(pageable))
            .thenReturn(new PageImpl<>(List.of(authority(8L, 1L, "ROLE_USER")), pageable, 1));

        assertThat(visualizationService.findOne(9L)).isPresent();
        assertThat(authorityService.findOne(8L)).isPresent();
        assertThat(visualizationService.findAll(pageable).getContent()).hasSize(1);
        assertThat(authorityService.findAll(pageable).getContent()).hasSize(1);

        verify(visualizationRepository).findById(9L);
        verify(authorityRepository).findById(8L);
        verify(visualizationRepository, never()).findByIdAndDashboardTenantId(any(), any());
        verify(authorityRepository, never()).findByIdAndDashboardTenantId(any(), any());
    }

    private static UtmDashboardVisualization visualization(Long id, Long dashboardId) {
        UtmDashboardVisualization dv = new UtmDashboardVisualization();
        dv.setId(id);
        dv.setIdDashboard(dashboardId);
        dv.setIdVisualization(1000L);
        dv.setOrder(0);
        dv.setWidth(4f);
        dv.setHeight(3f);
        dv.setTop(0f);
        dv.setLeft(0f);
        return dv;
    }

    private static UtmDashboardAuthority authority(Long id, Long dashboardId, String role) {
        UtmDashboardAuthority a = new UtmDashboardAuthority();
        a.setId(id);
        a.setIdDashboard(dashboardId);
        a.setAuthorityName(role);
        return a;
    }
}
