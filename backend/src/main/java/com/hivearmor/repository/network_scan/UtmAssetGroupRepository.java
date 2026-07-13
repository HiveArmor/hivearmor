package com.hivearmor.repository.network_scan;

import com.hivearmor.domain.network_scan.UtmAssetGroup;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;


/**
 * Spring Data  repository for the UtmAssetGroup entity.
 */
@SuppressWarnings("unused")
@Repository
public interface UtmAssetGroupRepository extends JpaRepository<UtmAssetGroup, Long> {
}
