package com.hivearmor.repository.ueba;

import com.hivearmor.domain.ueba.HaUebaDeviation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

/**
 * Spring Data JPA repository for {@link HaUebaDeviation}.
 *
 * <p>Provides query methods for:
 * <ul>
 *   <li>Per-user scoring-run lookup (deviation engine)</li>
 *   <li>Point summation for threshold checks (deviation engine)</li>
 *   <li>Alert deduplication guard (deviation engine)</li>
 *   <li>Tenant-scoped listing (REST surface)</li>
 *   <li>Per-user aggregate risk scores (REST surface)</li>
 *   <li>30-day risk trend (REST surface)</li>
 *   <li>Per-tier anomaly counts (REST surface)</li>
 * </ul>
 */
@Repository
public interface HaUebaDeviationRepository extends JpaRepository<HaUebaDeviation, Long> {

    /**
     * Finds all deviation rows for a user in a specific scoring run.
     * Used by the deviation engine to inspect scoring results.
     */
    List<HaUebaDeviation> findAllByUserIdAndRunTs(
        @Param("userId") String userId,
        @Param("runTs") Instant runTs);

    /**
     * Sums the awarded points for a user in a specific scoring run.
     * Used by the deviation engine to check the threshold.
     */
    @Query("SELECT COALESCE(SUM(d.points), 0) FROM HaUebaDeviation d " +
           "WHERE d.userId = :userId AND d.runTs = :runTs")
    int sumPointsByUserIdAndRunTs(
        @Param("userId") String userId,
        @Param("runTs") Instant runTs);

    /**
     * Finds all deviations for a tenant since a given timestamp.
     * Used by {@code GET /api/ha-ueba/deviations}.
     */
    @Query("SELECT d FROM HaUebaDeviation d " +
           "WHERE d.tenantId = :tenantId AND (:since IS NULL OR d.runTs >= :since) " +
           "ORDER BY d.runTs DESC")
    List<HaUebaDeviation> findAllByTenantIdSince(
        @Param("tenantId") String tenantId,
        @Param("since") Instant since);

    /**
     * Finds all deviations for a tenant and user, ordered by run timestamp.
     * Used by {@code GET /api/ha-ueba/entity-timeline}.
     */
    List<HaUebaDeviation> findAllByTenantIdAndUserIdOrderByRunTsAsc(
        @Param("tenantId") String tenantId,
        @Param("userId") String userId);

    /**
     * Aggregates risk scores per user for a tenant: total points and anomaly count.
     * Used by {@code GET /api/ha-ueba/risk-scores}.
     *
     * <p>Returns one row per user with their summed points (total risk score)
     * and count of deviation rows (anomaly count).
     */
    @Query("SELECT new com.hivearmor.repository.ueba.UserRiskDTO(" +
           "d.userId, CAST(SUM(d.points) AS int), CAST(COUNT(d) AS int)) " +
           "FROM HaUebaDeviation d " +
           "WHERE d.tenantId = :tenantId " +
           "GROUP BY d.userId " +
           "ORDER BY SUM(d.points) DESC")
    List<UserRiskDTO> aggregateRiskByUser(@Param("tenantId") String tenantId);

    /**
     * Aggregates daily risk scores for the last 30 days for a tenant.
     * Used by {@code GET /api/ha-ueba/risk-trend}.
     *
     * <p>Returns one row per day with the total points awarded that day.
     */
    @Query(value = "SELECT CAST(d.run_ts AS DATE) AS day, CAST(SUM(d.points) AS INT) AS totalScore " +
                   "FROM ha_ueba_deviation d " +
                   "WHERE d.tenant_id = :tenantId AND d.run_ts >= :since " +
                   "GROUP BY CAST(d.run_ts AS DATE) " +
                   "ORDER BY day ASC",
           nativeQuery = true)
    List<Object[]> aggregateRiskDailyRaw(
        @Param("tenantId") String tenantId,
        @Param("since") Instant since);

    /**
     * Counts deviation rows by tier for a tenant.
     * Used by {@code GET /api/ha-ueba/anomaly-counts}.
     *
     * <p>Returns counts for the three scoring tiers (10, 25, 50 points).
     */
    @Query(value = "SELECT " +
                   "CAST(COUNT(CASE WHEN d.points = 10 THEN 1 END) AS INT) AS tier10, " +
                   "CAST(COUNT(CASE WHEN d.points = 25 THEN 1 END) AS INT) AS tier25, " +
                   "CAST(COUNT(CASE WHEN d.points = 50 THEN 1 END) AS INT) AS tier50 " +
                   "FROM ha_ueba_deviation d " +
                   "WHERE d.tenant_id = :tenantId",
           nativeQuery = true)
    Object[] countByTierRaw(@Param("tenantId") String tenantId);

    /**
     * Finds deviations for a tenant, user, and time range.
     * Used for time-bounded deviation queries.
     */
    @Query("SELECT d FROM HaUebaDeviation d " +
           "WHERE d.tenantId = :tenantId AND d.userId = :userId " +
           "AND d.runTs >= :from AND d.runTs <= :to " +
           "ORDER BY d.runTs ASC")
    List<HaUebaDeviation> findByTenantIdAndUserIdAndRunTsBetween(
        @Param("tenantId") String tenantId,
        @Param("userId") String userId,
        @Param("from") Instant from,
        @Param("to") Instant to);

    /**
     * Sums awarded points for a tenant and user since a given timestamp.
     * Used for cumulative risk score computation.
     */
    @Query("SELECT COALESCE(SUM(d.points), 0) FROM HaUebaDeviation d " +
           "WHERE d.tenantId = :tenantId AND d.userId = :userId AND d.runTs >= :since")
    int sumAwardedPointsByTenantIdAndUserIdSince(
        @Param("tenantId") String tenantId,
        @Param("userId") String userId,
        @Param("since") Instant since);

    /**
     * Deduplication guard for synthetic alert emission.
     *
     * <p>Inserts a sentinel deviation row with {@code metricName = 'ALERT'} and
     * {@code points = 0} to mark that an alert was emitted for this user and run.
     * The unique constraint on {@code (user_id, metric_name, run_ts)} prevents
     * double-insertion, making this operation idempotent within a scoring run.
     *
     * @return {@code true} if the sentinel row was successfully inserted (first call),
     *         {@code false} if a constraint violation occurred (repeat call)
     */
    @Modifying
    @Transactional
    @Query(value = "INSERT INTO ha_ueba_deviation (user_id, metric_name, run_ts, z_score, points, tenant_id, created_at) " +
                   "VALUES (:userId, 'ALERT', :runTs, 0, 0, :tenantId, CURRENT_TIMESTAMP) " +
                   "ON CONFLICT (user_id, metric_name, run_ts) DO NOTHING",
           nativeQuery = true)
    int insertAlertSentinel(
        @Param("userId") String userId,
        @Param("runTs") Instant runTs,
        @Param("tenantId") String tenantId);

    /**
     * Convenience method wrapping {@link #insertAlertSentinel} with a boolean return.
     *
     * @return {@code true} if the alert sentinel was inserted (first emission),
     *         {@code false} if already present (dedup hit)
     */
    default boolean markAlertOnce(String userId, Instant runTs, String tenantId) {
        return insertAlertSentinel(userId, runTs, tenantId) > 0;
    }

    /**
     * Convenience method to convert raw tier count query results to a typed DTO.
     */
    default AnomalyCountsDTO countByTier(String tenantId) {
        Object[] row = countByTierRaw(tenantId);
        if (row == null || row.length == 0 || row[0] == null) {
            return new AnomalyCountsDTO(0, 0, 0);
        }
        // Native query returns a single row as Object[]
        Object[] values = (row[0] instanceof Object[]) ? (Object[]) row[0] : row;
        return new AnomalyCountsDTO(
            ((Number) values[0]).intValue(),
            ((Number) values[1]).intValue(),
            ((Number) values[2]).intValue()
        );
    }

    /**
     * Convenience method to convert raw daily risk trend query results to typed DTOs.
     */
    default List<RiskTrendPointDTO> aggregateRiskDailyForLast30Days(String tenantId) {
        Instant since = Instant.now().minus(java.time.Duration.ofDays(30));
        return aggregateRiskDailyRaw(tenantId, since).stream()
            .map(row -> new RiskTrendPointDTO(
                ((java.sql.Date) row[0]).toLocalDate(),
                ((Number) row[1]).intValue()))
            .toList();
    }
}
