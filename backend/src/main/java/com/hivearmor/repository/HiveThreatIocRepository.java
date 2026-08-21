package com.hivearmor.repository;

import com.hivearmor.domain.HiveThreatIoc;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public interface HiveThreatIocRepository extends JpaRepository<HiveThreatIoc, Long> {

    Optional<HiveThreatIoc> findByIocTypeAndIocValueAndFeedId(String iocType, String iocValue, Long feedId);

    Optional<HiveThreatIoc> findFirstByIocValueAndActiveTrue(String iocValue);

    @Query("SELECT i FROM HiveThreatIoc i WHERE i.iocValue = :value AND i.active = true ORDER BY i.confidence DESC")
    List<HiveThreatIoc> findActiveByValue(@Param("value") String value);

    @Query("SELECT i FROM HiveThreatIoc i WHERE i.iocType = :type AND i.iocValue = :value AND i.active = true ORDER BY i.confidence DESC")
    List<HiveThreatIoc> findAllActiveByTypeAndValue(@Param("type") String type, @Param("value") String value);

    @Query("SELECT i FROM HiveThreatIoc i WHERE i.active = true AND i.lastSeen < :threshold")
    List<HiveThreatIoc> findActiveOlderThan(@Param("threshold") Instant threshold);

    long countByActiveTrue();

    long countByActiveTrueAndIocType(String iocType);

    @Query("SELECT COUNT(i) FROM HiveThreatIoc i WHERE i.active = false AND i.lastSeen >= :since")
    long countExpiredSince(@Param("since") Instant since);
}
