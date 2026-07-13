package com.hivearmor.service.dto.visualization.mapper;

import com.hivearmor.domain.chart_builder.UtmVisualization;
import com.hivearmor.service.dto.visualization.UtmVisualizationDto;
import com.hivearmor.util.exceptions.UtmSerializationException;
import org.mapstruct.Mapper;
import org.mapstruct.factory.Mappers;

@Mapper(componentModel = "spring")
public interface UtmVisualizationMapper {
    UtmVisualizationMapper INSTANCE = Mappers.getMapper(UtmVisualizationMapper.class);

    UtmVisualizationDto toDto(UtmVisualization entity) throws UtmSerializationException;

    UtmVisualization toEntity(UtmVisualizationDto dto) throws UtmSerializationException;
}
