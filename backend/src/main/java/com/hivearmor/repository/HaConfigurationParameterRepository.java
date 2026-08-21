package com.hivearmor.repository;

import com.hivearmor.domain.HaConfigurationParameter;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/**
 * Spring Data JPA repository for the {@link HaConfigurationParameter} entity.
 */
@Repository
public interface HaConfigurationParameterRepository extends JpaRepository<HaConfigurationParameter, Long> {

    /**
     * Look up a configuration parameter by its unique key.
     *
     * @param key the {@code param_key} value (e.g. {@code "SCIM_BEARER_TOKEN_HASH"})
     * @return the matching row, or {@link Optional#empty()} when absent
     */
    Optional<HaConfigurationParameter> findByParamKey(String key);
}
