package com.hivearmor.repository.idp_provider;

import com.hivearmor.domain.idp_provider.IdentityProviderConfig;
import com.hivearmor.domain.idp_provider.enums.ProviderType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface IdentityProviderConfigRepository extends JpaRepository<IdentityProviderConfig, Long>, JpaSpecificationExecutor<IdentityProviderConfig> {

    Optional<IdentityProviderConfig> findByProviderTypeAndActiveTrue(ProviderType providerType);

    List<IdentityProviderConfig> findAllByActiveTrue();
}
