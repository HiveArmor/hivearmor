package com.hivearmor.compliance.service;

import com.hivearmor.compliance.dto.ComplianceControlExceptionDTO;
import com.hivearmor.compliance.dto.CreateComplianceExceptionRequest;
import com.hivearmor.compliance.entity.HaComplianceException;
import com.hivearmor.repository.compliance.HaComplianceExceptionRepository;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Set;

@Service
@Transactional
public class HaComplianceExceptionService {

    static final Set<String> ALLOWED_STATUSES = Set.of("pending", "approved", "rejected", "revoked");

    private final HaComplianceExceptionRepository exceptionRepository;

    public HaComplianceExceptionService(HaComplianceExceptionRepository exceptionRepository) {
        this.exceptionRepository = exceptionRepository;
    }

    @Transactional(readOnly = true)
    public Page<ComplianceControlExceptionDTO> listByControlId(Long controlId, Pageable pageable) {
        Page<HaComplianceException> page = exceptionRepository.findByControlId(controlId, pageable);
        return page.map(ComplianceControlExceptionDTO::from);
    }

    public ComplianceControlExceptionDTO create(CreateComplianceExceptionRequest request) {
        HaComplianceException entity = new HaComplianceException();
        entity.setControlId(request.controlId());
        entity.setTitle(request.title().trim());
        entity.setReason(trimOrNull(request.reason()));
        entity.setStatus("pending");
        entity.setEffectiveFrom(request.effectiveFrom());
        entity.setEffectiveUntil(request.effectiveUntil());
        return ComplianceControlExceptionDTO.from(exceptionRepository.save(entity));
    }

    public ComplianceControlExceptionDTO approve(Long id, String approver) {
        return transitionStatus(id, "approved", approver, Set.of("pending"));
    }

    public ComplianceControlExceptionDTO reject(Long id, String approver) {
        return transitionStatus(id, "rejected", approver, Set.of("pending"));
    }

    public ComplianceControlExceptionDTO revoke(Long id, String approver) {
        return transitionStatus(id, "revoked", approver, Set.of("approved"));
    }

    public void delete(Long id) {
        if (!exceptionRepository.existsById(id)) {
            throw new EntityNotFoundException("Compliance exception not found: " + id);
        }
        exceptionRepository.deleteById(id);
    }

    private ComplianceControlExceptionDTO transitionStatus(
        Long id,
        String targetStatus,
        String approver,
        Set<String> allowedFrom
    ) {
        HaComplianceException entity = exceptionRepository
            .findById(id)
            .orElseThrow(() -> new EntityNotFoundException("Compliance exception not found: " + id));
        if (!allowedFrom.contains(entity.getStatus())) {
            throw new IllegalStateException(
                "Cannot transition exception " + id + " from status '" + entity.getStatus() + "' to '" + targetStatus + "'"
            );
        }
        entity.setStatus(targetStatus);
        entity.setApprover(approver);
        return ComplianceControlExceptionDTO.from(exceptionRepository.save(entity));
    }

    private static String trimOrNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
