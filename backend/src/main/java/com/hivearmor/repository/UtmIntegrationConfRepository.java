package com.hivearmor.repository;

import com.hivearmor.domain.UtmIntegrationConf;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;


/**
 * Spring Data  repository for the UtmIntegrationConf entity.
 */
@SuppressWarnings("unused")
@Repository
public interface UtmIntegrationConfRepository extends JpaRepository<UtmIntegrationConf, Long>, JpaSpecificationExecutor<UtmIntegrationConf> {

}
