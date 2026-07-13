package com.hivearmor.repository;

import com.hivearmor.domain.UtmAssetMetrics;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;


/**
 * Spring Data  repository for the UtmAssetMetrics entity.
 */
@SuppressWarnings("unused")
@Repository
public interface UtmAssetMetricsRepository extends JpaRepository<UtmAssetMetrics, String> {

    List<UtmAssetMetrics> findAllByAssetName(String assetName);

    List<UtmAssetMetrics> findAllByAssetNameIn(List<String> assetNames);

}
