package com.hivearmor.repository;

import com.hivearmor.domain.HiveIncidentEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface HiveIncidentEntityRepository extends JpaRepository<HiveIncidentEntity, Long> {

    List<HiveIncidentEntity> findAllByIncidentId(Long incidentId);

    Optional<HiveIncidentEntity> findByIncidentIdAndEntityId(Long incidentId, String entityId);

    boolean existsByIncidentIdAndEntityId(Long incidentId, String entityId);
}
