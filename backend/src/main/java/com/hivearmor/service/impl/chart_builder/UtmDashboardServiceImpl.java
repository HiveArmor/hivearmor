package com.hivearmor.service.impl.chart_builder;

import com.hivearmor.domain.chart_builder.UtmDashboard;
import com.hivearmor.domain.chart_builder.UtmDashboardVisualization;
import com.hivearmor.domain.chart_builder.UtmVisualization;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.repository.chart_builder.UtmDashboardRepository;
import com.hivearmor.repository.chart_builder.UtmDashboardVisualizationRepository;
import com.hivearmor.repository.chart_builder.UtmVisualizationRepository;
import com.hivearmor.security.SecurityUtils;
import com.hivearmor.service.UtmStackService;
import com.hivearmor.service.chart_builder.UtmDashboardService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.CollectionUtils;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.*;

/**
 * Service Implementation for managing UtmDashboard.
 *
 * <p>GAP-MT-05 / P1 Spike B — when {@link TenantContext#getClientId()} is non-null,
 * CRUD is scoped to that tenant. Null context keeps legacy global behavior
 * (consistent with investigation sessions). STAGING CANDIDATE.
 */
@Service
@Transactional
public class UtmDashboardServiceImpl implements UtmDashboardService {

    private static final String CLASS_NAME = "UtmDashboardServiceImpl";
    private final Logger log = LoggerFactory.getLogger(UtmDashboardServiceImpl.class);

    private final UtmDashboardRepository dashboardRepository;
    private final UtmVisualizationRepository visualizationRepository;
    private final UtmDashboardVisualizationRepository dashboardVisualizationRepository;
    private final UtmStackService utmStackService;

    public UtmDashboardServiceImpl(UtmDashboardRepository dashboardRepository,
                                   UtmVisualizationRepository visualizationRepository,
                                   UtmDashboardVisualizationRepository dashboardVisualizationRepository,
                                   UtmStackService utmStackService) {
        this.dashboardRepository = dashboardRepository;
        this.visualizationRepository = visualizationRepository;
        this.dashboardVisualizationRepository = dashboardVisualizationRepository;
        this.utmStackService = utmStackService;
    }

    /**
     * Save a utmDashboard.
     *
     * @param utmDashboard the entity to save
     * @return the persisted entity
     */
    @Override
    public UtmDashboard save(UtmDashboard utmDashboard) {
        log.debug("Request to save UtmDashboard : {}", utmDashboard);
        Long tenantId = TenantContext.getClientId();
        if (utmDashboard.getId() == null) {
            utmDashboard.setTenantId(tenantId);
            return dashboardRepository.save(utmDashboard);
        }

        Optional<UtmDashboard> scoped = findOne(utmDashboard.getId());
        if (scoped.isPresent()) {
            // Update: preserve stored tenant_id (ignore client-supplied).
            utmDashboard.setTenantId(scoped.get().getTenantId());
            return dashboardRepository.save(utmDashboard);
        }

        if (dashboardRepository.existsById(utmDashboard.getId())) {
            // Row exists outside this tenant scope — do not leak or overwrite.
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                "Dashboard not found: " + utmDashboard.getId());
        }

        // Pre-assigned id create (dev system sequence / import paths).
        utmDashboard.setTenantId(tenantId);
        return dashboardRepository.save(utmDashboard);
    }

    @Override
    public void saveAll(List<UtmDashboard> utmDashboard) {
        Long tenantId = TenantContext.getClientId();
        for (UtmDashboard dashboard : utmDashboard) {
            if (dashboard.getId() == null) {
                dashboard.setTenantId(tenantId);
            } else if (tenantId != null) {
                findOne(dashboard.getId()).orElseThrow(() -> new ResponseStatusException(
                    HttpStatus.NOT_FOUND, "Dashboard not found: " + dashboard.getId()));
                dashboard.setTenantId(tenantId);
            }
        }
        dashboardRepository.saveAll(utmDashboard);
    }

    /**
     * Get all the utmDashboards.
     *
     * @param pageable the pagination information
     * @return the list of entities
     */
    @Override
    @Transactional(readOnly = true)
    public Page<UtmDashboard> findAll(Pageable pageable) {
        log.debug("Request to get all UtmDashboards");
        Long tenantId = TenantContext.getClientId();
        if (tenantId != null) {
            return dashboardRepository.findByTenantId(tenantId, pageable);
        }
        return dashboardRepository.findAll(pageable);
    }


    /**
     * Get one utmDashboard by id.
     *
     * @param id the id of the entity
     * @return the entity
     */
    @Override
    @Transactional(readOnly = true)
    public Optional<UtmDashboard> findOne(Long id) {
        log.debug("Request to get UtmDashboard : {}", id);
        Long tenantId = TenantContext.getClientId();
        if (tenantId != null) {
            return dashboardRepository.findByIdAndTenantId(id, tenantId);
        }
        return dashboardRepository.findById(id);
    }

    /**
     * Delete the utmDashboard by id.
     *
     * @param id the id of the entity
     */
    @Override
    public void delete(Long id) {
        log.debug("Request to delete UtmDashboard : {}", id);
        Long tenantId = TenantContext.getClientId();
        if (tenantId != null) {
            if (dashboardRepository.findByIdAndTenantId(id, tenantId).isEmpty()) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Dashboard not found: " + id);
            }
        }
        dashboardRepository.deleteById(id);
    }

    @Override
    public void deleteAllBySystemOwnerIsTrueAndIdNotIn(List<Long> ids) {
        dashboardRepository.deleteAllBySystemOwnerIsTrueAndIdNotIn(ids);
    }

    @Override
    @Transactional
    public void importDashboards(List<UtmDashboardVisualization> dashboards, Boolean override) throws Exception {
        final String ctx = CLASS_NAME + ".importDashboards";

        try {
            if (CollectionUtils.isEmpty(dashboards))
                return;

            Map<Long, Long> dashboardIds = new HashMap<>();
            Map<Long, Long> visualizationIds = new HashMap<>();

            UtmDashboard utmDashboard;
            UtmVisualization utmVisualization;
            boolean inDevelop = utmStackService.isInDevelop();
            Long tenantId = TenantContext.getClientId();

            for (UtmDashboardVisualization dashboard : dashboards) {
                dashboard.setId(null);

                Objects.requireNonNull(dashboard.getDashboard(), "A dashboard info is missing");
                Objects.requireNonNull(dashboard.getVisualization(), "A visualization info is missing");

                // Inserting visualizations
                if (!visualizationIds.containsKey(dashboard.getIdVisualization())) {
                    utmVisualization = dashboard.getVisualization();
                    Optional<UtmVisualization> dbVisualization = visualizationRepository.findByName(utmVisualization.getName());

                    if (dbVisualization.isPresent()) {
                        if (override) {
                            utmVisualization.setId(dbVisualization.get().getId());
                            utmVisualization.setModifiedDate(LocalDateTime.now().toInstant(ZoneOffset.UTC));
                            utmVisualization.setSystemOwner(inDevelop);
                            utmVisualization = visualizationRepository.save(utmVisualization);
                        } else {
                            utmVisualization = dbVisualization.get();
                        }
                    } else {
                        utmVisualization.setId(inDevelop ? getSystemSequenceNextValue() : null);
                        utmVisualization.setSystemOwner(inDevelop);
                        utmVisualization.setCreatedDate(LocalDateTime.now().toInstant(ZoneOffset.UTC));
                        utmVisualization.setUserCreated(SecurityUtils.getCurrentUserLogin().orElse("system"));
                        utmVisualization = visualizationRepository.save(utmVisualization);
                    }
                    visualizationIds.put(dashboard.getIdVisualization(), utmVisualization.getId());
                }

                // Inserting dashboards
                if (!dashboardIds.containsKey(dashboard.getDashboard().getId())) {
                    utmDashboard = dashboard.getDashboard();
                    Optional<UtmDashboard> dbDashboard = tenantId != null
                        ? dashboardRepository.findByNameAndTenantId(utmDashboard.getName(), tenantId)
                        : dashboardRepository.findByName(utmDashboard.getName());

                    if (dbDashboard.isPresent()) {
                        if (override) {
                            utmDashboard.setId(dbDashboard.get().getId());
                            utmDashboard.setTenantId(dbDashboard.get().getTenantId());
                            utmDashboard.setModifiedDate(LocalDateTime.now().toInstant(ZoneOffset.UTC));
                            utmDashboard = dashboardRepository.save(utmDashboard);
                        } else {
                            utmDashboard = dbDashboard.get();
                        }
                    } else {
                        utmDashboard.setId(inDevelop ? getSystemSequenceNextValue() : null);
                        utmDashboard.setSystemOwner(inDevelop);
                        utmDashboard.setTenantId(tenantId);
                        utmDashboard.setCreatedDate(LocalDateTime.now().toInstant(ZoneOffset.UTC));
                        utmDashboard.setUserCreated(SecurityUtils.getCurrentUserLogin().orElse("system"));
                        utmDashboard = dashboardRepository.save(utmDashboard);
                    }
                    dashboardIds.put(dashboard.getIdDashboard(), utmDashboard.getId());
                }

                Long idDashboard = dashboardIds.get(dashboard.getIdDashboard());
                Long idVisualization = visualizationIds.get(dashboard.getIdVisualization());
                Optional<UtmDashboardVisualization> opt = dashboardVisualizationRepository.findByIdDashboardAndIdVisualization(idDashboard, idVisualization);

                if (!opt.isPresent()) {
                    dashboard.setIdDashboard(dashboardIds.get(dashboard.getIdDashboard()));
                    dashboard.setIdVisualization(visualizationIds.get(dashboard.getIdVisualization()));
                    dashboardVisualizationRepository.save(dashboard);
                }
            }
        } catch (Exception e) {
            throw new Exception(ctx + ": " + e.getMessage());
        }
    }

    @Override
    public Long getSystemSequenceNextValue() {
        long value = 1;
        Optional<UtmDashboard> opt = dashboardRepository.findFirstBySystemOwnerIsTrueOrderByIdDesc();
        if (opt.isPresent())
            value = opt.get().getId() + 1;
        return value;
    }
}
