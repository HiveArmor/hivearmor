package com.hivearmor.compliance.service;

import com.hivearmor.compliance.dto.ComplianceControlExceptionDTO;
import com.hivearmor.compliance.entity.HaComplianceException;
import com.hivearmor.repository.compliance.HaComplianceExceptionRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class HaComplianceExceptionService {

    private final HaComplianceExceptionRepository exceptionRepository;

    public HaComplianceExceptionService(HaComplianceExceptionRepository exceptionRepository) {
        this.exceptionRepository = exceptionRepository;
    }

    public Page<ComplianceControlExceptionDTO> listByControlId(Long controlId, Pageable pageable) {
        Page<HaComplianceException> page = exceptionRepository.findByControlId(controlId, pageable);
        return page.map(ComplianceControlExceptionDTO::from);
    }
}
