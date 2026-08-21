package com.hivearmor.repository;

import com.hivearmor.domain.UtmInvestigationTask;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/**
 * Spring Data JPA repository for UtmInvestigationTask.
 * S-3B-QUEUE
 */
@Repository
public interface UtmInvestigationTaskRepository extends JpaRepository<UtmInvestigationTask, Long> {

    /**
     * Returns tasks not in the given status that are assigned to a specific user.
     */
    Page<UtmInvestigationTask> findByStatusNotAndAssignedTo(String status, String assignedTo, Pageable pageable);

    /**
     * Returns tasks not in the given status (all assignees).
     */
    Page<UtmInvestigationTask> findByStatusNot(String status, Pageable pageable);
}
