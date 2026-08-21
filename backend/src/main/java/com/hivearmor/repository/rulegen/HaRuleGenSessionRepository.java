package com.hivearmor.repository.rulegen;

import com.hivearmor.domain.rulegen.HaRuleGenSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Spring Data JPA repository for {@link HaRuleGenSession}.
 *
 * <p>Provides status-based lookup for the rule generation workflow.
 * {@code findById} is inherited from {@link JpaRepository}.
 */
@Repository
public interface HaRuleGenSessionRepository extends JpaRepository<HaRuleGenSession, Long> {

    /**
     * Returns all sessions with the given status, ordered by creation time descending
     * (newest first). Used primarily to list pending-review sessions in the admin UI.
     *
     * @param status the session lifecycle status to filter by
     * @return matching sessions ordered by {@code createdAt} descending
     */
    List<HaRuleGenSession> findAllByStatusOrderByCreatedAtDesc(HaRuleGenSession.SessionStatus status);
}
