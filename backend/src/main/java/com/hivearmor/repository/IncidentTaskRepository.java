package com.hivearmor.repository;

import com.hivearmor.domain.IncidentTask;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Spring Data JPA repository for the {@link IncidentTask} entity.
 *
 * <p>Provides lookup methods for task listing, filtering by status, and counting
 * for progress indicators within the incident workbench.
 *
 * <p>Sprint 43 — Incident workbench task management (INC-002).
 */
@Repository
public interface IncidentTaskRepository extends JpaRepository<IncidentTask, String> {

    /**
     * Finds all tasks for a given incident within the specified tenant.
     *
     * @param incidentId the incident identifier
     * @param tenantId   the tenant identifier
     * @return list of tasks belonging to the incident and tenant
     */
    List<IncidentTask> findByIncidentIdAndTenantId(String incidentId, Long tenantId);

    /**
     * Finds all tasks for a given incident filtered by status.
     *
     * @param incidentId the incident identifier
     * @param status     the task status to filter by (e.g., "open", "in_progress", "completed")
     * @return list of tasks matching the incident and status
     */
    List<IncidentTask> findByIncidentIdAndStatus(String incidentId, String status);

    /**
     * Counts tasks for a given incident with a specific status.
     *
     * @param incidentId the incident identifier
     * @param status     the task status to count
     * @return number of tasks matching the incident and status
     */
    long countByIncidentIdAndStatus(String incidentId, String status);
}
