package com.hivearmor.repository.edr;

import com.hivearmor.domain.edr.UtmEdrQuarantine;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface UtmEdrQuarantineRepository extends JpaRepository<UtmEdrQuarantine, Long> {
    Page<UtmEdrQuarantine> findByAgentId(String agentId, Pageable pageable);
    Page<UtmEdrQuarantine> findByStatus(String status, Pageable pageable);
    List<UtmEdrQuarantine> findByAgentIdAndStatus(String agentId, String status);
    long countByStatus(String status);
}
