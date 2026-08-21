package com.hivearmor.multitenancy;

import com.hivearmor.domain.HaClient;
import com.hivearmor.repository.HaClientRepository;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

@Service
@Transactional(readOnly = true)
public class MsspTenantResolver {

    private final HaClientRepository clients;

    public MsspTenantResolver(HaClientRepository clients) {
        this.clients = clients;
    }

    @Cacheable(value = "tenantResolution", key = "#clientId", cacheManager = "tenantResolutionCacheManager")
    public Optional<String> resolvePrefix(Long clientId) {
        if (clientId == null) {
            return Optional.empty();
        }
        return clients.findById(clientId)
                      .filter(HaClient::isMsspManaged)
                      .map(HaClient::getClientPrefix);
    }

    @Cacheable(value = "tenantResolution", key = "'prefix:' + #clientPrefix", cacheManager = "tenantResolutionCacheManager")
    public Optional<HaClient> resolveTenant(String clientPrefix) {
        if (clientPrefix == null || clientPrefix.isBlank()) {
            return Optional.empty();
        }
        return clients.findByClientPrefixAndMsspManagedTrue(clientPrefix.trim());
    }

    @CacheEvict(value = "tenantResolution", key = "#clientId", cacheManager = "tenantResolutionCacheManager")
    public void evict(Long clientId) {
        // no-op body — the annotation performs the eviction
    }
}
