package com.hivearmor.repository;

import com.hivearmor.domain.IncidentActivity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;

/**
 * Spring Data JPA repository for the {@link IncidentActivity} entity.
 *
 * <p>Provides lookup methods for the incident activity feed, supporting
 * chronological ordering and type-based filtering.
 *
 * <p>Sprint 43 — Incident workbench collaboration activity feed (INC-006).
 */
@Repository
public interface IncidentActivityRepository extends JpaRepository<IncidentActivity, String> {

    /**
     * Finds all activity entries for an incident ordered by creation time descending
     * (most recent first).
     *
     * @param incidentId the incident identifier
     * @return activity entries in reverse chronological order
     */
    List<IncidentActivity> findByIncidentIdOrderByCreatedAtDesc(String incidentId);

    /**
     * Finds activity entries for an incident filtered by one or more activity types.
     *
     * @param incidentId the incident identifier
     * @param types      collection of activity types to include (e.g., "note", "field_change")
     * @return activity entries matching the incident and any of the specified types
     */
    List<IncidentActivity> findByIncidentIdAndTypeIn(String incidentId, Collection<String> types);
}
