package com.hivearmor.repository.ueba;

import com.hivearmor.domain.ueba.HaUebaBaseline;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

/**
 * Spring Data JPA repository for the {@link HaUebaBaseline} entity.
 *
 * <p>Provides queries for baseline lookup during deviation scoring and
 * baseline computation upsert in {@code HaUebaBaselineService}.
 */
@Repository
public interface HaUebaBaselineRepository extends JpaRepository<HaUebaBaseline, Long> {

    Optional<HaUebaBaseline> findByGroupKeyAndMetricNameAndComputedOn(
        String groupKey, String metricName, LocalDate computedOn);

    @Query("SELECT b FROM HaUebaBaseline b WHERE b.groupKey = :groupKey AND b.metricName = :metricName ORDER BY b.computedOn DESC LIMIT 1")
    Optional<HaUebaBaseline> findLatestByGroupKeyAndMetricName(
        @Param("groupKey") String groupKey, @Param("metricName") String metricName);

    List<HaUebaBaseline> findAllByTenantId(String tenantId);

    @Query("SELECT b FROM HaUebaBaseline b WHERE b.groupKey IN " +
           "(SELECT pg.groupKey FROM HaUebaPeerGroup pg WHERE pg.userId = :userId) " +
           "ORDER BY b.computedOn DESC")
    List<HaUebaBaseline> findLatestForUser(@Param("userId") String userId);
}
