package com.hivearmor.repository;

import com.hivearmor.domain.UtmAlertLast;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;


/**
 * Spring Data  repository for the UtmAlertLast entity.
 */
@SuppressWarnings("unused")
@Repository
public interface UtmAlertLastRepository extends JpaRepository<UtmAlertLast, Long> {

}
