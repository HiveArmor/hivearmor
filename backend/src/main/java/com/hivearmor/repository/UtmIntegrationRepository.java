package com.hivearmor.repository;

import com.hivearmor.domain.UtmIntegration;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;


/**
 * Spring Data  repository for the UtmIntegration entity.
 */
@SuppressWarnings("unused")
@Repository
public interface UtmIntegrationRepository extends JpaRepository<UtmIntegration, Long>, JpaSpecificationExecutor<UtmIntegration> {



}
