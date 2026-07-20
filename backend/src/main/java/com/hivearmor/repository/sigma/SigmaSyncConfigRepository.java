package com.hivearmor.repository.sigma;

import com.hivearmor.domain.sigma.SigmaSyncConfig;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface SigmaSyncConfigRepository extends JpaRepository<SigmaSyncConfig, Long> {
    Optional<SigmaSyncConfig> findFirstByOrderByIdAsc();
}
