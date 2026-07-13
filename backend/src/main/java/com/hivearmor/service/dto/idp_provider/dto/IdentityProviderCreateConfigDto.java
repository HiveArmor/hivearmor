package com.hivearmor.service.dto.idp_provider.dto;

import com.hivearmor.domain.idp_provider.enums.ProviderType;
import com.hivearmor.validation.saml.ValidCertificate;
import com.hivearmor.validation.saml.ValidPrivateKey;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

@EqualsAndHashCode(callSuper = true)
@Data
@NoArgsConstructor
@AllArgsConstructor
public class IdentityProviderCreateConfigDto extends IdentityProviderConfigRequestDto {

    @NotBlank
    @ValidPrivateKey
    private String spPrivateKeyPem;

    @NotBlank
    private String spCertificatePem;

}