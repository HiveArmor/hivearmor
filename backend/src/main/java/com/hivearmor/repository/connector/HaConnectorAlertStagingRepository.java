package com.hivearmor.repository.connector;

import com.hivearmor.domain.connector.HaConnectorAlertStaging;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface HaConnectorAlertStagingRepository extends JpaRepository<HaConnectorAlertStaging, Long> {

    boolean existsByConnectorInstanceIdAndExternalId(Long connectorInstanceId, String externalId);

    Optional<HaConnectorAlertStaging> findByConnectorInstanceIdAndExternalId(
        Long connectorInstanceId,
        String externalId
    );

    List<HaConnectorAlertStaging> findByConnectorInstanceIdOrderByIngestedAtDesc(
        Long connectorInstanceId,
        Pageable pageable
    );

    long countByConnectorInstanceId(Long connectorInstanceId);

    List<HaConnectorAlertStaging> findByIngestBatchIdOrderByIdAsc(String ingestBatchId);

    List<HaConnectorAlertStaging> findByStatusOrderByIdAsc(String status, Pageable pageable);

    List<HaConnectorAlertStaging> findByIdIn(Collection<Long> ids);
}
