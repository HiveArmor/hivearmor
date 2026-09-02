package com.hivearmor.repository.export;

import com.hivearmor.domain.export.HaExportManifest;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/**
 * Repository for {@link HaExportManifest} chain-of-custody rows (B0-4).
 */
@Repository
public interface HaExportManifestRepository extends JpaRepository<HaExportManifest, Long> {

    Optional<HaExportManifest> findByExportId(String exportId);
}
