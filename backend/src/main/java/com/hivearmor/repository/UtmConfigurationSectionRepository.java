package com.hivearmor.repository;

import com.hivearmor.domain.UtmConfigurationSection;
import com.hivearmor.domain.shared_types.enums.SectionType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;

import java.util.List;


/**
 * Spring Data  repository for the UtmConfigurationSection entity.
 */
@SuppressWarnings("unused")
@Repository
public interface UtmConfigurationSectionRepository extends JpaRepository<UtmConfigurationSection, Long>, JpaSpecificationExecutor<UtmConfigurationSection> {

    List<UtmConfigurationSection> findAllByShortName(SectionType shortName);

}
