package com.hivearmor.repository;

import com.hivearmor.domain.UtmAlertLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;


/**
 * Spring Data  repository for the UtmAlertLog entity.
 */
@SuppressWarnings("unused")
@Repository
public interface UtmAlertLogRepository extends JpaRepository<UtmAlertLog, Long>, JpaSpecificationExecutor<UtmAlertLog> {

}
