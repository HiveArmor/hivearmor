package com.hivearmor.repository;

import com.hivearmor.domain.HaAlertView;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Spring Data JPA repository for {@link HaAlertView}.
 *
 * Provides access to saved alert views scoped by owner or shared status.
 *
 * Backs GET/POST/PATCH/DELETE /api/ha-alert-views
 */
@Repository
public interface HaAlertViewRepository extends JpaRepository<HaAlertView, Long> {

    /**
     * Returns all views owned by the given user OR marked as shared.
     * Used by GET /api/ha-alert-views?scope=me
     */
    @Query("SELECT v FROM HaAlertView v WHERE v.ownerId = :ownerId OR v.isShared = true")
    List<HaAlertView> findAccessibleByOwnerId(@Param("ownerId") Long ownerId);

    /**
     * Unsets is_default for all views owned by the given user.
     * Used before marking a specific view as the new default.
     */
    @Modifying
    @Query("UPDATE HaAlertView v SET v.isDefault = false WHERE v.ownerId = :ownerId")
    void clearDefaultForOwner(@Param("ownerId") Long ownerId);
}
