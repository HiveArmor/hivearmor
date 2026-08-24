package com.hivearmor.repository.chart_builder;

import com.hivearmor.domain.chart_builder.UtmDashboardVisualization;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;


/**
 * Spring Data  repository for the UtmDashboardVisualization entity.
 */
@SuppressWarnings("unused")
@Repository
public interface UtmDashboardVisualizationRepository extends JpaRepository<UtmDashboardVisualization, Long>, JpaSpecificationExecutor<UtmDashboardVisualization> {

    Optional<List<UtmDashboardVisualization>> findAllByIdDashboard(Long idDashboard);

    Optional<UtmDashboardVisualization> findByIdDashboardAndIdVisualization(Long idDashboard, Long idVisualization);

    @Query("""
        SELECT dv FROM UtmDashboardVisualization dv
        WHERE dv.id = :id
          AND EXISTS (
            SELECT 1 FROM UtmDashboard d
            WHERE d.id = dv.idDashboard AND d.tenantId = :tenantId
          )
        """)
    Optional<UtmDashboardVisualization> findByIdAndDashboardTenantId(
        @Param("id") Long id, @Param("tenantId") Long tenantId);

    @Query("""
        SELECT dv FROM UtmDashboardVisualization dv
        WHERE EXISTS (
          SELECT 1 FROM UtmDashboard d
          WHERE d.id = dv.idDashboard AND d.tenantId = :tenantId
        )
        """)
    Page<UtmDashboardVisualization> findAllByDashboardTenantId(
        @Param("tenantId") Long tenantId, Pageable pageable);

    @Query("""
        SELECT dv FROM UtmDashboardVisualization dv
        WHERE dv.idDashboard = :idDashboard
          AND EXISTS (
            SELECT 1 FROM UtmDashboard d
            WHERE d.id = dv.idDashboard AND d.tenantId = :tenantId
          )
        """)
    Optional<List<UtmDashboardVisualization>> findAllByIdDashboardAndDashboardTenantId(
        @Param("idDashboard") Long idDashboard, @Param("tenantId") Long tenantId);
}
