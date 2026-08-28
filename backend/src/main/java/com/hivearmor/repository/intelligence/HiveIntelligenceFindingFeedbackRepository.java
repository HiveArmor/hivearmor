package com.hivearmor.repository.intelligence;

import com.hivearmor.domain.intelligence.HiveIntelligenceFindingFeedback;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface HiveIntelligenceFindingFeedbackRepository extends JpaRepository<HiveIntelligenceFindingFeedback, Long> {
}
