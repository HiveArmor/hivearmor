package com.hivearmor.repository.reports;

import com.hivearmor.domain.reports.UtmReportSection;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;

import java.util.List;


/**
 * Spring Data  repository for the UtmReportSection entity.
 */
@SuppressWarnings("unused")
@Repository
public interface UtmReportSectionRepository extends JpaRepository<UtmReportSection, Long>, JpaSpecificationExecutor<UtmReportSection> {

    void deleteAllByRepSecSystemTrueAndIdNotIn(List<Long> sectionIds);
}
