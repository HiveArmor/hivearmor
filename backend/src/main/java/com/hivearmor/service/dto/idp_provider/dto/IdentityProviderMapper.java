package com.hivearmor.service.dto.idp_provider.dto;

import com.hivearmor.config.Constants;
import com.hivearmor.domain.idp_provider.IdentityProviderConfig;
import com.hivearmor.util.CipherUtil;
import com.hivearmor.util.exceptions.FileProcessingException;
import lombok.extern.slf4j.Slf4j;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

@Mapper(componentModel = "spring", imports = {CipherUtil.class, System.class, Constants.class})
public interface IdentityProviderMapper {

    IdentityProviderConfigResponseDto toDto(IdentityProviderConfig entity);

    @Mapping(target = "spPrivateKeyPem", expression = "java(CipherUtil.encrypt(request.getSpPrivateKeyPem(), System.getenv(Constants.ENV_ENCRYPTION_KEY)))")
    IdentityProviderConfig toEntity(IdentityProviderCreateConfigDto request);

    List<IdentityProviderConfigResponseDto> toDtoList(List<IdentityProviderConfig> entities);

    void updateEntityFromRequest(IdentityProviderConfigRequestDto request, @MappingTarget IdentityProviderConfig entity);

    @Mapping(target = "name", source = "name")
    @Mapping(target = "spPrivateKeyPem", source = "privateKeyFile")
    @Mapping(target = "spCertificatePem", source = "certificateFile")
    @Mapping(target = "spEntityId", source = "spEntityId")
    @Mapping(target = "spAcsUrl", source = "spAcsUrl")
    @Mapping(target = "providerType", expression = "java(com.hivearmor.domain.idp_provider.enums.ProviderType.valueOf(providerType))")
    IdentityProviderCreateConfigDto toCreateConfigDto(String name, String providerType, String metadataUrl, Boolean active,
                                                      MultipartFile privateKeyFile, MultipartFile certificateFile, String spEntityId, String spAcsUrl);

    default String mapFileToString(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            return null;
        }

        try {
            return new String(file.getBytes(), StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new FileProcessingException("An error occurred while processing the file: " + file.getOriginalFilename());
        }

    }
}
