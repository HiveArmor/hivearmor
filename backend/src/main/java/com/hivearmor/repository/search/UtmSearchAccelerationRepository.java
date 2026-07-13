package com.hivearmor.repository.search;

import com.hivearmor.domain.search.UtmSearchAcceleration;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface UtmSearchAccelerationRepository extends JpaRepository<UtmSearchAcceleration, Long> {
    List<UtmSearchAcceleration> findAllByOrderBySettingKeyAsc();
    Optional<UtmSearchAcceleration> findBySettingKey(String settingKey);
}
