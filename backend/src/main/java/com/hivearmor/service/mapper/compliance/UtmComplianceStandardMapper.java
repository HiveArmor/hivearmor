package com.hivearmor.service.mapper.compliance;

import com.hivearmor.domain.compliance.UtmComplianceStandard;
import com.hivearmor.service.dto.compliance.UtmComplianceStandardDto;
import org.mapstruct.Mapper;

@Mapper(componentModel = "spring")
public interface UtmComplianceStandardMapper {
    UtmComplianceStandardDto toDto(UtmComplianceStandard entity);
}