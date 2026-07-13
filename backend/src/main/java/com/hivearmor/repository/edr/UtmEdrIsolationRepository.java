package com.hivearmor.repository.edr;

import com.hivearmor.domain.edr.UtmEdrIsolation;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface UtmEdrIsolationRepository extends JpaRepository<UtmEdrIsolation, Long> {
    Optional<UtmEdrIsolation> findByAgentIdAndStatus(String agentId, String status);
    List<UtmEdrIsolation> findByAgentId(String agentId);
    Page<UtmEdrIsolation> findByStatus(String status, Pageable pageable);
    boolean existsByAgentIdAndStatus(String agentId, String status);
}
