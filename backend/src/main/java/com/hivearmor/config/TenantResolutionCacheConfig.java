package com.hivearmor.config;

import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.cache.CacheManager;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

@Configuration
public class TenantResolutionCacheConfig {

    public static final String CACHE_NAME = "tenantResolution";

    @Bean("tenantResolutionCacheManager")
    public CacheManager tenantResolutionCacheManager() {
        CaffeineCacheManager mgr = new CaffeineCacheManager(CACHE_NAME);
        mgr.setCaffeine(Caffeine.newBuilder()
                .expireAfterWrite(Duration.ofMinutes(5))
                .maximumSize(500));
        return mgr;
    }
}
