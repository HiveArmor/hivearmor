package com.hivearmor.repository.chart_builder;

import com.hivearmor.domain.chart_builder.UtmDashboard;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;


/**
 * Spring Data  repository for the UtmDashboard entity.
 */
@SuppressWarnings("unused")
@Repository
public interface UtmDashboardRepository extends JpaRepository<UtmDashboard, Long>, JpaSpecificationExecutor<UtmDashboard> {

    Optional<UtmDashboard> findByName(String name);

    Optional<UtmDashboard> findByNameAndTenantId(String name, Long tenantId);

    Optional<UtmDashboard> findByIdAndName(Long id, String name);

    Optional<UtmDashboard> findByIdAndTenantId(Long id, Long tenantId);

    Page<UtmDashboard> findByTenantId(Long tenantId, Pageable pageable);

    void deleteAllBySystemOwnerIsTrueAndIdNotIn(List<Long> ids);

    Optional<UtmDashboard> findFirstBySystemOwnerIsTrueOrderByIdDesc();

}
