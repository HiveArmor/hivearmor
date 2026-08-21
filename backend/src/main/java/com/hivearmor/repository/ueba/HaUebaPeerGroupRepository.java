package com.hivearmor.repository.ueba;

import com.hivearmor.domain.ueba.HaUebaPeerGroup;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

/**
 * Spring Data JPA repository for the {@link HaUebaPeerGroup} entity.
 *
 * <p>Provides tenant-scoped lookups for peer-group assignment and
 * baseline computation flows in {@code HaUebaBaselineService}.
 */
@Repository
public interface HaUebaPeerGroupRepository extends JpaRepository<HaUebaPeerGroup, Long> {

    Optional<HaUebaPeerGroup> findByUserIdAndComputedOn(String userId, LocalDate computedOn);

    List<HaUebaPeerGroup> findByTenantIdAndUserId(String tenantId, String userId);

    List<HaUebaPeerGroup> findByTenantIdAndGroupKey(String tenantId, String groupKey);

    List<HaUebaPeerGroup> findAllByTenantId(String tenantId);

    @Query("SELECT DISTINCT pg.groupKey FROM HaUebaPeerGroup pg WHERE pg.computedOn = :day")
    List<String> distinctGroupKeysForDay(@Param("day") LocalDate day);

    @Query("SELECT pg.userId FROM HaUebaPeerGroup pg WHERE pg.groupKey = :groupKey AND pg.computedOn = :day")
    List<String> userIdsForGroupOnDay(@Param("groupKey") String groupKey, @Param("day") LocalDate day);

    Optional<HaUebaPeerGroup> findFirstByUserIdOrderByComputedOnDesc(String userId);

    /**
     * Finds the most recent peer-group assignment for a user (latest by computation date).
     * Used by {@code HaUebaDeviationEngine.scoreUser} to look up the user's current peer group.
     */
    default Optional<HaUebaPeerGroup> findLatestByUserId(String userId) {
        return findFirstByUserIdOrderByComputedOnDesc(userId);
    }
}
