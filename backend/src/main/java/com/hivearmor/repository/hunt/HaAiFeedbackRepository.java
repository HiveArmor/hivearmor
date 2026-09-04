package com.hivearmor.repository.hunt;

import java.time.Instant;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.hivearmor.domain.hunt.HaAiFeedback;

/**
 * Store for {@link HaAiFeedback}. The two counting queries feed the calibration
 * computation (agreement rate = up-votes / total, over a tenant+scope+time window).
 */
@Repository
public interface HaAiFeedbackRepository extends JpaRepository<HaAiFeedback, Long> {

    @Query("SELECT COUNT(f) FROM HaAiFeedback f "
        + "WHERE f.tenant = :tenant AND f.verdictScope = :scope AND f.createdAt >= :since")
    long countInScope(@Param("tenant") String tenant,
                      @Param("scope") String scope,
                      @Param("since") Instant since);

    @Query("SELECT COUNT(f) FROM HaAiFeedback f "
        + "WHERE f.tenant = :tenant AND f.verdictScope = :scope AND f.createdAt >= :since "
        + "AND f.vote = :vote")
    long countInScopeByVote(@Param("tenant") String tenant,
                            @Param("scope") String scope,
                            @Param("since") Instant since,
                            @Param("vote") String vote);
}
