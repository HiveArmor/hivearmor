package com.hivearmor.repository;

import com.hivearmor.domain.HaAgentPolicy;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Spring Data JPA repository for {@link HaAgentPolicy}.
 *
 * Provides query access to the ha_agent_policy table,
 * filtered by OS type and uniqueness checks on policy name.
 *
 * Backs GET/POST/PUT/DELETE /api/ha-edr/agent-policies.
 */
@Repository
public interface HaAgentPolicyRepository extends JpaRepository<HaAgentPolicy, Long> {

    /**
     * Returns all policies targeting the given OS type (e.g. "windows", "linux").
     */
    List<HaAgentPolicy> findByOsType(String osType);

    /**
     * Returns {@code true} if a policy with the given name already exists.
     * Used for uniqueness validation before create/update.
     */
    boolean existsByName(String name);
}
