package com.hivearmor.repository;

import com.hivearmor.domain.HiveTaxiiFeed;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface HiveTaxiiFeedRepository extends JpaRepository<HiveTaxiiFeed, Long> {

    List<HiveTaxiiFeed> findByEnabled(Boolean enabled);
}
