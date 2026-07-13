package com.hivearmor.service.dto.collectors.dto;

import com.hivearmor.service.dto.collectors.dto.CollectorDTO;
import lombok.Getter;
import lombok.Setter;

import java.util.List;

@Setter
@Getter
public class ListCollectorsResponseDTO {
    private List<CollectorDTO> collectors;
    private int total;
}
