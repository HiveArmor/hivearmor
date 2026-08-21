package com.hivearmor.repository;

import com.hivearmor.domain.UtmInvestigationSession;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * Spring Data repository for UtmInvestigationSession.
 * S-5C
 */
@Repository
public interface UtmInvestigationSessionRepository extends JpaRepository<UtmInvestigationSession, Long> {

    /** Returns sessions owned by createdBy, most recent first (for ANALYST/USER scope). */
    Page<UtmInvestigationSession> findByCreatedByOrderByCreatedAtDesc(String createdBy, Pageable pageable);

    /** Returns all sessions, most recent first (for ADMIN/SOC_MANAGER). */
    Page<UtmInvestigationSession> findAllByOrderByCreatedAtDesc(Pageable pageable);

    Page<UtmInvestigationSession> findByTenantIdOrderByCreatedAtDesc(Long tenantId, Pageable pageable);

    Page<UtmInvestigationSession> findByTenantIdAndCreatedByOrderByCreatedAtDesc(Long tenantId, String createdBy, Pageable pageable);

    Optional<UtmInvestigationSession> findByIdAndTenantId(Long id, Long tenantId);

    /** Returns sessions by status, most recent first. */
    List<UtmInvestigationSession> findByStatusOrderByCreatedAtDesc(String status);
}
