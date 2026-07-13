package com.hivearmor.repository.threat_intel;

import com.hivearmor.domain.threat_intel.UtmIocIndicator;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface UtmIocIndicatorRepository extends JpaRepository<UtmIocIndicator, Long> {
    Optional<UtmIocIndicator> findByValue(String value);
    Page<UtmIocIndicator> findByIocType(String iocType, Pageable pageable);
    Page<UtmIocIndicator> findByFeedId(String feedId, Pageable pageable);
    long countByFeedId(String feedId);
}
