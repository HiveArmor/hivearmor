package com.hivearmor.repository.agents_manager;

import com.hivearmor.domain.agents_manager.UtmAgentManager;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;


/**
 * Spring Data  repository for the UtmAgentManager entity.
 */
@SuppressWarnings("unused")
@Repository
public interface UtmAgentManagerRepository extends JpaRepository<UtmAgentManager, Long> {

}
