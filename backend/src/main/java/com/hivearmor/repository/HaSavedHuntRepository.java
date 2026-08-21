package com.hivearmor.repository;

import com.hivearmor.domain.HaSavedHunt;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Spring Data JPA repository for {@link HaSavedHunt}.
 *
 * Provides access to saved hunts that are either owned by the requesting
 * user or shared across all users.
 *
 * Backs GET /api/ha-saved-hunts
 */
@Repository
public interface HaSavedHuntRepository extends JpaRepository<HaSavedHunt, Long> {

    @Query("SELECT h FROM HaSavedHunt h WHERE h.createdBy = :login OR h.isShared = true")
    List<HaSavedHunt> findAccessibleByLogin(@Param("login") String login);
}
