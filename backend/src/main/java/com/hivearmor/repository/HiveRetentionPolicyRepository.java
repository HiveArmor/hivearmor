package com.hivearmor.repository;

import com.hivearmor.domain.HiveRetentionPolicy;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface HiveRetentionPolicyRepository extends JpaRepository<HiveRetentionPolicy, Long> {

    Optional<HiveRetentionPolicy> findByDataType(String dataType);
}
