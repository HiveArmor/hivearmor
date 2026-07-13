package com.hivearmor.repository.soc_ai;

import com.hivearmor.domain.soc_ai.UtmAiTriage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface UtmAiTriageRepository extends JpaRepository<UtmAiTriage, Long> {
    Optional<UtmAiTriage> findTopByAlertIdOrderByAnalyzedAtDesc(String alertId);
    List<UtmAiTriage> findByAlertIdOrderByAnalyzedAtDesc(String alertId);
}
