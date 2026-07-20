package com.hivearmor.repository.jwt;

import com.hivearmor.domain.jwt.HiveJwtConfig;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface HiveJwtConfigRepository extends JpaRepository<HiveJwtConfig, Long> {

    Optional<HiveJwtConfig> findFirstByOrderByCreatedAtAsc();
}
