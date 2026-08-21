package com.hivearmor.repository;

import com.hivearmor.domain.UtmSavedQuery;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Repository for {@link UtmSavedQuery}.
 * S-5B
 */
@Repository
public interface UtmSavedQueryRepository extends JpaRepository<UtmSavedQuery, Long> {

    /**
     * Returns all queries owned by the given user, newest first.
     */
    List<UtmSavedQuery> findByUserLoginOrderByCreatedAtDesc(String userLogin);

    /**
     * Returns queries owned by the given user OR shared with everyone, newest first.
     */
    List<UtmSavedQuery> findByUserLoginOrIsSharedTrueOrderByCreatedAtDesc(String userLogin);
}
