package com.hivearmor.repository;

import com.hivearmor.domain.ResponseJob;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;

/**
 * Spring Data JPA repository for the {@link ResponseJob} entity.
 *
 * <p>Provides lookup by alert ID and by status for job lifecycle tracking.
 *
 * <p>Sprint 41 — Response action execution and status tracking (ALT-010).
 */
@Repository
public interface ResponseJobRepository extends JpaRepository<ResponseJob, String> {

    /**
     * Finds all response jobs associated with a given alert.
     *
     * @param alertId the alert identifier
     * @return list of jobs linked to the alert
     */
    List<ResponseJob> findByAlertId(String alertId);

    /**
     * Finds all response jobs whose status is one of the provided values.
     *
     * @param statuses collection of status values to filter by (e.g., "queued", "running")
     * @return list of jobs matching any of the given statuses
     */
    List<ResponseJob> findByStatusIn(Collection<String> statuses);
}
