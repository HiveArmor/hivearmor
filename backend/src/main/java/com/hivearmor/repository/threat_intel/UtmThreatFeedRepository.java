package com.hivearmor.repository.threat_intel;

import com.hivearmor.domain.threat_intel.UtmThreatFeed;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface UtmThreatFeedRepository extends JpaRepository<UtmThreatFeed, String> {
    List<UtmThreatFeed> findByEnabledTrue();
    List<UtmThreatFeed> findByStatus(String status);
}
