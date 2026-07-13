package com.hivearmor.repository.getting_started;

import com.hivearmor.domain.getting_started.GettingStartedStepEnum;
import com.hivearmor.domain.getting_started.UtmGettingStarted;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;


/**
 * Spring Data  repository for the UtmAgentManager entity.
 */
@SuppressWarnings("unused")
@Repository
public interface UtmGettingStartedRepository extends JpaRepository<UtmGettingStarted, Long> {

    Optional<UtmGettingStarted> findByStepShort(GettingStartedStepEnum stepEnum);

}
