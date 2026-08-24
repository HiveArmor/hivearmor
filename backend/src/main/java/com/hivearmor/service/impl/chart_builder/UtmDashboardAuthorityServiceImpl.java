package com.hivearmor.service.impl.chart_builder;

import com.hivearmor.domain.chart_builder.UtmDashboardAuthority;
import com.hivearmor.multitenancy.DashboardTenantAccess;
import com.hivearmor.repository.chart_builder.UtmDashboardAuthorityRepository;
import com.hivearmor.service.chart_builder.UtmDashboardAuthorityService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;

/**
 * Service Implementation for managing UtmDashboardAuthority.
 *
 * <p>GAP-MT-05 depth — when {@link com.hivearmor.multitenancy.TenantContext} is set,
 * CRUD is scoped through the parent {@code hive_dashboard.tenant_id} to prevent
 * cross-tenant IDOR. STAGING CANDIDATE.
 */
@Service
@Transactional
public class UtmDashboardAuthorityServiceImpl implements UtmDashboardAuthorityService {

    private final Logger log = LoggerFactory.getLogger(UtmDashboardAuthorityServiceImpl.class);

    private final UtmDashboardAuthorityRepository utmDashboardAuthorityRepository;
    private final DashboardTenantAccess dashboardTenantAccess;

    public UtmDashboardAuthorityServiceImpl(
        UtmDashboardAuthorityRepository utmDashboardAuthorityRepository,
        DashboardTenantAccess dashboardTenantAccess) {
        this.utmDashboardAuthorityRepository = utmDashboardAuthorityRepository;
        this.dashboardTenantAccess = dashboardTenantAccess;
    }

    /**
     * Save a utmDashboardAuthority.
     *
     * @param utmDashboardAuthority the entity to save
     * @return the persisted entity
     */
    @Override
    public UtmDashboardAuthority save(UtmDashboardAuthority utmDashboardAuthority) {
        log.debug("Request to save UtmDashboardAuthority : {}", utmDashboardAuthority);
        if (utmDashboardAuthority.getId() != null && dashboardTenantAccess.isScoped()) {
            findOne(utmDashboardAuthority.getId()).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND,
                    "Dashboard authority not found: " + utmDashboardAuthority.getId()));
        }
        dashboardTenantAccess.requireAccessibleDashboard(utmDashboardAuthority.getIdDashboard());
        return utmDashboardAuthorityRepository.save(utmDashboardAuthority);
    }

    /**
     * Get all the utmDashboardAuthorities.
     *
     * @param pageable the pagination information
     * @return the list of entities
     */
    @Override
    @Transactional(readOnly = true)
    public Page<UtmDashboardAuthority> findAll(Pageable pageable) {
        log.debug("Request to get all UtmDashboardAuthorities");
        Long tenantId = dashboardTenantAccess.currentTenantId();
        if (tenantId != null) {
            return utmDashboardAuthorityRepository.findAllByDashboardTenantId(tenantId, pageable);
        }
        return utmDashboardAuthorityRepository.findAll(pageable);
    }


    /**
     * Get one utmDashboardAuthority by id.
     *
     * @param id the id of the entity
     * @return the entity
     */
    @Override
    @Transactional(readOnly = true)
    public Optional<UtmDashboardAuthority> findOne(Long id) {
        log.debug("Request to get UtmDashboardAuthority : {}", id);
        Long tenantId = dashboardTenantAccess.currentTenantId();
        if (tenantId != null) {
            return utmDashboardAuthorityRepository.findByIdAndDashboardTenantId(id, tenantId);
        }
        return utmDashboardAuthorityRepository.findById(id);
    }

    /**
     * Delete the utmDashboardAuthority by id.
     *
     * @param id the id of the entity
     */
    @Override
    public void delete(Long id) {
        log.debug("Request to delete UtmDashboardAuthority : {}", id);
        if (dashboardTenantAccess.isScoped()) {
            findOne(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                "Dashboard authority not found: " + id));
        }
        utmDashboardAuthorityRepository.deleteById(id);
    }
}
