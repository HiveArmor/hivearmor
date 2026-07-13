package com.hivearmor.repository.alert_response_rule;

import com.hivearmor.domain.alert_response_rule.UtmAlertResponseActionTemplate;
import com.hivearmor.domain.compliance.UtmComplianceStandardSection;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;

import java.util.Optional;


/**
 * Spring Data  repository for the UtmAlertSoarRule entity.
 */

@Repository
public interface UtmAlertResponseActionTemplateRepository extends JpaRepository<UtmAlertResponseActionTemplate, Long>, JpaSpecificationExecutor<UtmAlertResponseActionTemplate> {

    Optional<UtmAlertResponseActionTemplate> findFirstBySystemOwnerIsTrueOrderByIdDesc();

}
