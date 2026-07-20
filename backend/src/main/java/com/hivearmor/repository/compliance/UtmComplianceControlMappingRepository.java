package com.hivearmor.repository.compliance;

import com.hivearmor.domain.compliance.UtmComplianceControlMapping;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface UtmComplianceControlMappingRepository extends JpaRepository<UtmComplianceControlMapping, Long> {

    List<UtmComplianceControlMapping> findByControlId(Long controlId);

    Page<UtmComplianceControlMapping> findByMappingType(String mappingType, Pageable pageable);

    @Query(value = "SELECT m FROM UtmComplianceControlMapping m WHERE (:mappingType IS NULL OR m.mappingType = :mappingType)",
           countQuery = "SELECT COUNT(m) FROM UtmComplianceControlMapping m WHERE (:mappingType IS NULL OR m.mappingType = :mappingType)")
    Page<UtmComplianceControlMapping> findByFilters(
            @Param("mappingType") String mappingType,
            Pageable pageable
    );

    @Query(value = "SELECT m FROM UtmComplianceControlMapping m WHERE m.controlId IN (SELECT c.id FROM UtmComplianceControlConfig c WHERE c.standardSectionId IN (SELECT s.id FROM UtmComplianceStandardSection s WHERE s.standardId = :standardId)) AND (:mappingType IS NULL OR m.mappingType = :mappingType)",
           countQuery = "SELECT COUNT(m) FROM UtmComplianceControlMapping m WHERE m.controlId IN (SELECT c.id FROM UtmComplianceControlConfig c WHERE c.standardSectionId IN (SELECT s.id FROM UtmComplianceStandardSection s WHERE s.standardId = :standardId)) AND (:mappingType IS NULL OR m.mappingType = :mappingType)")
    Page<UtmComplianceControlMapping> findByStandardIdAndMappingType(
            @Param("standardId") Long standardId,
            @Param("mappingType") String mappingType,
            Pageable pageable
    );
}
