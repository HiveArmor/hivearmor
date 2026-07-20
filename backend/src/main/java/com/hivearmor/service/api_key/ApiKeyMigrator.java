package com.hivearmor.service.api_key;

import com.hivearmor.repository.api_key.ApiKeyRepository;
import lombok.AllArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@AllArgsConstructor
public class ApiKeyMigrator implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(ApiKeyMigrator.class);

    private final ApiKeyRepository apiKeyRepository;

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        var keys = apiKeyRepository.findAll().stream()
            .filter(k -> k.getApiKeyHash() == null && k.getApiKey() != null)
            .toList();

        if (keys.isEmpty()) {
            return;
        }

        for (var key : keys) {
            String plain = key.getApiKey();
            key.setApiKeyHash(ApiKeyService.hashKey(plain));
            key.setKeyPrefix(plain.substring(0, Math.min(8, plain.length())));
            key.setApiKey(null);
        }

        apiKeyRepository.saveAll(keys);
        log.info("Migrated {} API key(s) to hashed storage", keys.size());
    }
}
