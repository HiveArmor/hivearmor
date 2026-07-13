package com.hivearmor.repository;

import com.hivearmor.domain.UtmSpaceNotificationControl;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;


/**
 * Spring Data  repository for the UtmSpaceNotificationLast entity.
 */
@SuppressWarnings("unused")
@Repository
public interface UtmSpaceNotificationControlRepository extends JpaRepository<UtmSpaceNotificationControl, Long> {

}
