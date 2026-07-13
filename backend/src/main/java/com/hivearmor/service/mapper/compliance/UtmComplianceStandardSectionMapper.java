package com.hivearmor.service.mapper.compliance;

import com.hivearmor.domain.compliance.UtmComplianceStandardSection;
import com.hivearmor.service.dto.compliance.UtmComplianceStandardSectionDto;
import org.mapstruct.Mapper;

@Mapper(componentModel = "spring", uses = {UtmComplianceStandardMapper.class})
public interface UtmComplianceStandardSectionMapper {
    UtmComplianceStandardSectionDto toDto(UtmComplianceStandardSection entity);
}
