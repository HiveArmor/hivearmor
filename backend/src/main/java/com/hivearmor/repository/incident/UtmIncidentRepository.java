package com.hivearmor.repository.incident;

import com.hivearmor.domain.incident.UtmIncident;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;
import java.time.Instant;
import java.util.List;

/**
 * Spring Data  repository for the UtmIncident entity.
 */
@SuppressWarnings("unused")
@Repository
public interface UtmIncidentRepository extends JpaRepository<UtmIncident, Long>, JpaSpecificationExecutor<UtmIncident> {

    List<UtmIncident> findBySlaBreachedFalseAndSlaDeadlineBefore(Instant deadline);

    List<UtmIncident> findByIncidentPriorityOrderByIncidentCreatedDateDesc(String priority);

    long countBySlaBreachedTrue();
}
