package com.hivearmor.multitenancy;

import com.hivearmor.domain.chart_builder.UtmDashboard;
import com.hivearmor.repository.chart_builder.UtmDashboardRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;

/**
 * Shared MSSP access checks for entities linked to {@link UtmDashboard}
 * (visualizations, authorities). When {@link TenantContext#getClientId()} is set,
 * parent dashboard must belong to that tenant — prevents IDOR across tenants.
 * Null context keeps legacy global behavior. STAGING CANDIDATE.
 */
@Component
public class DashboardTenantAccess {

    private final UtmDashboardRepository dashboardRepository;

    public DashboardTenantAccess(UtmDashboardRepository dashboardRepository) {
        this.dashboardRepository = dashboardRepository;
    }

    /**
     * @return empty when the dashboard is outside the active tenant scope
     */
    public Optional<UtmDashboard> findAccessibleDashboard(Long dashboardId) {
        if (dashboardId == null) {
            return Optional.empty();
        }
        Long tenantId = TenantContext.getClientId();
        if (tenantId != null) {
            return dashboardRepository.findByIdAndTenantId(dashboardId, tenantId);
        }
        return dashboardRepository.findById(dashboardId);
    }

    /**
     * Ensures the linked dashboard is visible in the current tenant scope.
     *
     * @throws ResponseStatusException 404 when missing or foreign-tenant (no existence leak)
     */
    public void requireAccessibleDashboard(Long dashboardId) {
        if (findAccessibleDashboard(dashboardId).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                "Dashboard not found: " + dashboardId);
        }
    }

    public boolean isScoped() {
        return TenantContext.getClientId() != null;
    }

    public Long currentTenantId() {
        return TenantContext.getClientId();
    }
}
