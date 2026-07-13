package com.hivearmor.repository.compliance;

import com.hivearmor.domain.compliance.UtmComplianceQueryConfig;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface UtmComplianceQueryConfigRepository extends JpaRepository<UtmComplianceQueryConfig, Long> {

}