package com.hivearmor.service.impl.chart_builder;

import com.hivearmor.domain.chart_builder.UtmDashboardVisualization;
import com.hivearmor.multitenancy.DashboardTenantAccess;
import com.hivearmor.repository.chart_builder.UtmDashboardVisualizationRepository;
import com.hivearmor.service.chart_builder.UtmDashboardVisualizationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * Service Implementation for managing UtmDashboardVisualization.
 *
 * <p>GAP-MT-05 depth — when {@link com.hivearmor.multitenancy.TenantContext} is set,
 * CRUD is scoped through the parent {@code hive_dashboard.tenant_id} to prevent
 * cross-tenant IDOR. STAGING CANDIDATE.
 */
@Service
@Transactional
public class UtmDashboardVisualizationServiceImpl implements UtmDashboardVisualizationService {

    private final Logger log = LoggerFactory.getLogger(UtmDashboardVisualizationServiceImpl.class);

    private final UtmDashboardVisualizationRepository utmDashboardVisualizationRepository;
    private final DashboardTenantAccess dashboardTenantAccess;

    public UtmDashboardVisualizationServiceImpl(
        UtmDashboardVisualizationRepository utmDashboardVisualizationRepository,
        DashboardTenantAccess dashboardTenantAccess) {
        this.utmDashboardVisualizationRepository = utmDashboardVisualizationRepository;
        this.dashboardTenantAccess = dashboardTenantAccess;
    }

    /**
     * Save a utmDashboardVisualization.
     *
     * @param utmDashboardVisualization the entity to save
     * @return the persisted entity
     */
    @Override
    public UtmDashboardVisualization save(UtmDashboardVisualization utmDashboardVisualization) {
        log.debug("Request to save UtmDashboardVisualization : {}", utmDashboardVisualization);
        if (utmDashboardVisualization.getId() != null && dashboardTenantAccess.isScoped()) {
            findOne(utmDashboardVisualization.getId()).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND,
                    "Dashboard visualization not found: " + utmDashboardVisualization.getId()));
        }
        dashboardTenantAccess.requireAccessibleDashboard(utmDashboardVisualization.getIdDashboard());
        return utmDashboardVisualizationRepository.save(utmDashboardVisualization);
    }

    @Override
    public void saveAll(List<UtmDashboardVisualization> relations) {
        relations = relations.stream()
            .filter(rel -> {
                dashboardTenantAccess.requireAccessibleDashboard(rel.getIdDashboard());
                return utmDashboardVisualizationRepository
                    .findByIdDashboardAndIdVisualization(rel.getIdDashboard(), rel.getIdVisualization())
                    .isEmpty();
            })
            .collect(Collectors.toList());
        utmDashboardVisualizationRepository.saveAll(relations);
    }

    /**
     * Get all the utmDashboardVisualizations.
     *
     * @param pageable the pagination information
     * @return the list of entities
     */
    @Override
    @Transactional(readOnly = true)
    public Page<UtmDashboardVisualization> findAll(Pageable pageable) {
        log.debug("Request to get all UtmDashboardVisualizations");
        Long tenantId = dashboardTenantAccess.currentTenantId();
        if (tenantId != null) {
            return utmDashboardVisualizationRepository.findAllByDashboardTenantId(tenantId, pageable);
        }
        return utmDashboardVisualizationRepository.findAll(pageable);
    }


    /**
     * Get one utmDashboardVisualization by id.
     *
     * @param id the id of the entity
     * @return the entity
     */
    @Override
    @Transactional(readOnly = true)
    public Optional<UtmDashboardVisualization> findOne(Long id) {
        log.debug("Request to get UtmDashboardVisualization : {}", id);
        Long tenantId = dashboardTenantAccess.currentTenantId();
        if (tenantId != null) {
            return utmDashboardVisualizationRepository.findByIdAndDashboardTenantId(id, tenantId);
        }
        return utmDashboardVisualizationRepository.findById(id);
    }

    /**
     * Delete the utmDashboardVisualization by id.
     *
     * @param id the id of the entity
     */
    @Override
    public void delete(Long id) {
        log.debug("Request to delete UtmDashboardVisualization : {}", id);
        if (dashboardTenantAccess.isScoped()) {
            findOne(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                "Dashboard visualization not found: " + id));
        }
        utmDashboardVisualizationRepository.deleteById(id);
    }

    @Override
    public Optional<List<UtmDashboardVisualization>> findAllByIdDashboard(Long idDashboard) {
        Long tenantId = dashboardTenantAccess.currentTenantId();
        if (tenantId != null) {
            return utmDashboardVisualizationRepository
                .findAllByIdDashboardAndDashboardTenantId(idDashboard, tenantId);
        }
        return utmDashboardVisualizationRepository.findAllByIdDashboard(idDashboard);
    }
}
