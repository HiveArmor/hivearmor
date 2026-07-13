package com.hivearmor.repository.soar_playbook;

import com.hivearmor.domain.soar_playbook.UtmPlaybook;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface UtmPlaybookRepository extends JpaRepository<UtmPlaybook, Long>, JpaSpecificationExecutor<UtmPlaybook> {

    List<UtmPlaybook> findAllByIsActiveTrueOrderByLastModifiedDateDesc();
}
