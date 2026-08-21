package com.hivearmor.repository;

import com.hivearmor.domain.HiveMispFeed;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface HiveMispFeedRepository extends JpaRepository<HiveMispFeed, Long> {

    List<HiveMispFeed> findByEnabled(Boolean enabled);
}
