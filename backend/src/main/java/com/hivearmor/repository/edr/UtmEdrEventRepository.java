package com.hivearmor.repository.edr;

import com.hivearmor.domain.edr.UtmEdrEvent;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
public interface UtmEdrEventRepository extends JpaRepository<UtmEdrEvent, Long> {
    Page<UtmEdrEvent> findByAgentId(String agentId, Pageable pageable);
    Page<UtmEdrEvent> findByEventType(String eventType, Pageable pageable);
    Page<UtmEdrEvent> findBySeverity(String severity, Pageable pageable);
    Page<UtmEdrEvent> findByAgentIdAndEventType(String agentId, String eventType, Pageable pageable);
    Page<UtmEdrEvent> findByEventTimeBetween(Instant from, Instant to, Pageable pageable);

    @Query("SELECT e FROM UtmEdrEvent e WHERE " +
           "(:agentId IS NULL OR e.agentId = :agentId) AND " +
           "(:eventType IS NULL OR e.eventType = :eventType) AND " +
           "(:severity IS NULL OR e.severity = :severity) AND " +
           "(:from IS NULL OR e.eventTime >= :from) AND " +
           "(:to IS NULL OR e.eventTime <= :to)")
    Page<UtmEdrEvent> findFiltered(
        @Param("agentId") String agentId,
        @Param("eventType") String eventType,
        @Param("severity") String severity,
        @Param("from") Instant from,
        @Param("to") Instant to,
        Pageable pageable);

    List<UtmEdrEvent> findByAgentIdOrderByEventTimeDesc(String agentId);
    long countByAgentIdAndSeverity(String agentId, String severity);
}
