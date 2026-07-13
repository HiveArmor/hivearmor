package com.hivearmor.service.compliance.config;

import com.hivearmor.domain.compliance.*;
import com.hivearmor.repository.compliance.UtmComplianceControlConfigRepository;
import com.hivearmor.service.dto.compliance.UtmComplianceControlConfigCriteria;
import com.hivearmor.service.dto.compliance.UtmComplianceControlConfigDto;
import com.hivearmor.service.mapper.compliance.UtmComplianceControlConfigMapper;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tech.jhipster.service.QueryService;

@Service
@Transactional(readOnly = true)
public class UtmComplianceControlConfigCriteriaService extends QueryService<UtmComplianceControlConfig> {

    private final UtmComplianceControlConfigRepository complianceControlConfigRepository;
    private final UtmComplianceControlConfigMapper mapper;

    public UtmComplianceControlConfigCriteriaService(UtmComplianceControlConfigRepository complianceControlConfigRepository,
                                                     UtmComplianceControlConfigMapper mapper) {
        this.complianceControlConfigRepository = complianceControlConfigRepository;
        this.mapper = mapper;
    }

    @Transactional(readOnly = true)
    public Page<UtmComplianceControlConfigDto> findByCriteria(UtmComplianceControlConfigCriteria criteria, Pageable page) {
        final Specification<UtmComplianceControlConfig> specification = createSpecification(criteria);
        return complianceControlConfigRepository.findAll(specification, page).map(mapper::toDto);
    }

    private Specification<UtmComplianceControlConfig> createSpecification(UtmComplianceControlConfigCriteria criteria) {
        Specification<UtmComplianceControlConfig> specification = Specification.where(null);
        if (criteria != null) {
            if (criteria.getId() != null) {
                specification = specification.and(buildSpecification(criteria.getId(), UtmComplianceControlConfig_.id));
            }
            if (criteria.getStandardSectionId() != null) {
                specification = specification.and(
                        buildRangeSpecification(criteria.getStandardSectionId(), UtmComplianceControlConfig_.standardSectionId));
            }
            if (criteria.getControlName() != null) {
                specification = specification.and(
                        buildStringSpecification(criteria.getControlName(), UtmComplianceControlConfig_.controlName));
            }
            if (criteria.getControlSolution() != null ) {
                specification = specification.and(
                        buildStringSpecification(criteria.getControlSolution(), UtmComplianceControlConfig_.controlSolution));
            }
            if (criteria.getControlRemediation() != null) {
                specification = specification.and(
                        buildStringSpecification(criteria.getControlRemediation(), UtmComplianceControlConfig_.controlRemediation));
            }
            if (criteria.getControlStrategy() != null) {
                specification = specification.and(
                        buildSpecification(criteria.getControlStrategy(), UtmComplianceControlConfig_.controlStrategy)
                );
            }

        }
        return specification;
    }
}