package com.hivearmor.repository.chart_builder;

import com.hivearmor.domain.chart_builder.UtmDashboardAuthority;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;


/**
 * Spring Data  repository for the UtmDashboardAuthority entity.
 */
@SuppressWarnings("unused")
@Repository
public interface UtmDashboardAuthorityRepository extends JpaRepository<UtmDashboardAuthority, Long> {

    @Query("""
        SELECT a FROM UtmDashboardAuthority a
        WHERE a.id = :id
          AND EXISTS (
            SELECT 1 FROM UtmDashboard d
            WHERE d.id = a.idDashboard AND d.tenantId = :tenantId
          )
        """)
    Optional<UtmDashboardAuthority> findByIdAndDashboardTenantId(
        @Param("id") Long id, @Param("tenantId") Long tenantId);

    @Query("""
        SELECT a FROM UtmDashboardAuthority a
        WHERE EXISTS (
          SELECT 1 FROM UtmDashboard d
          WHERE d.id = a.idDashboard AND d.tenantId = :tenantId
        )
        """)
    Page<UtmDashboardAuthority> findAllByDashboardTenantId(
        @Param("tenantId") Long tenantId, Pageable pageable);
}
