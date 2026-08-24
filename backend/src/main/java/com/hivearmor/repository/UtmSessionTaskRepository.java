package com.hivearmor.repository;

import com.hivearmor.domain.UtmSessionTask;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * Spring Data repository for UtmSessionTask.
 * STAGING CANDIDATE — P1 session case tasks.
 */
@Repository
public interface UtmSessionTaskRepository extends JpaRepository<UtmSessionTask, Long> {

    List<UtmSessionTask> findBySessionIdOrderByCreatedAtAsc(Long sessionId);

    Optional<UtmSessionTask> findByIdAndSessionId(Long id, Long sessionId);

    long countBySessionId(Long sessionId);

    long countBySessionIdAndStatus(Long sessionId, String status);
}
