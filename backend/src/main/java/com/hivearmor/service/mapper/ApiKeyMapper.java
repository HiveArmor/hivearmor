package com.hivearmor.service.mapper;

import com.hivearmor.domain.api_keys.ApiKey;
import com.hivearmor.service.dto.api_key.ApiKeyResponseDTO;
import org.mapstruct.Mapper;

import java.util.Arrays;
import java.util.Collections;
import java.util.Optional;
import java.util.stream.Collectors;

@Mapper(componentModel = "spring")
public class ApiKeyMapper {

   public ApiKeyResponseDTO toDto(ApiKey apiKey){
        return ApiKeyResponseDTO.builder()
            .id(apiKey.getId())
            .name(apiKey.getName())
            .createdAt(apiKey.getCreatedAt())
            .expiresAt(apiKey.getExpiresAt())
            .allowedIp(
                Optional.ofNullable(apiKey.getAllowedIp())
                    .map(s -> Arrays.stream(s.split(","))
                        .map(String::trim)
                        .filter(str -> !str.isEmpty())
                        .collect(Collectors.toList()))
                    .orElse(Collections.emptyList())
            )
            .build();
    }
}
