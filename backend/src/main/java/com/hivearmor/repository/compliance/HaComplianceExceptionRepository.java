package com.hivearmor.repository.compliance;

import com.hivearmor.compliance.entity.HaComplianceException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface HaComplianceExceptionRepository extends JpaRepository<HaComplianceException, Long> {

    Page<HaComplianceException> findByControlId(Long controlId, Pageable pageable);
}
