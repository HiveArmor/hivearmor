package com.hivearmor.repository.compliance;

import com.hivearmor.domain.compliance.UtmComplianceReportExport;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface UtmComplianceReportExportRepository extends JpaRepository<UtmComplianceReportExport, Long> {
    Page<UtmComplianceReportExport> findAllByOrderByCreatedDateDesc(Pageable pageable);
    long countByStatus(String status);
}
