package com.hivearmor.repository;

import com.hivearmor.domain.UtmConfigurationParameter;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;

import java.util.List;


/**
 * Spring Data  repository for the UtmConfigurationParameter entity.
 */
@SuppressWarnings("unused")
@Repository
public interface UtmConfigurationParameterRepository extends JpaRepository<UtmConfigurationParameter, Long>, JpaSpecificationExecutor<UtmConfigurationParameter> {
    List<UtmConfigurationParameter> findAllBySectionId(Long sectionId);


}
