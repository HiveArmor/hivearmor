package com.hivearmor.repository.chart_builder;

import com.hivearmor.domain.chart_builder.UtmDashboardAuthority;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;


/**
 * Spring Data  repository for the UtmDashboardAuthority entity.
 */
@SuppressWarnings("unused")
@Repository
public interface UtmDashboardAuthorityRepository extends JpaRepository<UtmDashboardAuthority, Long> {

}
