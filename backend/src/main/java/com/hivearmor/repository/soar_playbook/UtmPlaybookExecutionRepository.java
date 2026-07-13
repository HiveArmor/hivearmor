package com.hivearmor.repository.soar_playbook;

import com.hivearmor.domain.soar_playbook.UtmPlaybookExecution;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface UtmPlaybookExecutionRepository extends JpaRepository<UtmPlaybookExecution, Long> {

    Page<UtmPlaybookExecution> findAllByOrderByStartedAtDesc(Pageable pageable);

    List<UtmPlaybookExecution> findByPlaybookIdOrderByStartedAtDesc(Long playbookId);
}
