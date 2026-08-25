package com.hivearmor.service;

import com.hivearmor.domain.HaClient;
import com.hivearmor.repository.HaClientRepository;
import com.hivearmor.service.dto.HiveTenantDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;

/**
 * Tenant management service for {@code GET/POST/PUT/DELETE /api/ha-tenants}.
 *
 * <p>Backed by {@code ha_client} ({@link HaClient}) — the live tenant table used by
 * MSSP and platform admin. The legacy {@code hive_client}/{@code UtmClient} mapping
 * is obsolete after the ha_client schema landed.
 */
@Service
@Transactional
public class HiveTenantService {

    private static final Logger log = LoggerFactory.getLogger(HiveTenantService.class);

    private final HaClientRepository clientRepository;

    public HiveTenantService(HaClientRepository clientRepository) {
        this.clientRepository = clientRepository;
    }

    @Transactional(readOnly = true)
    public Page<HiveTenantDTO> findAll(Pageable pageable) {
        return clientRepository.findAll(pageable).map(this::toDTO);
    }

    @Transactional(readOnly = true)
    public Optional<HiveTenantDTO> findById(Long id) {
        return clientRepository.findById(id).map(this::toDTO);
    }

    public HiveTenantDTO create(HiveTenantDTO dto) {
        String prefix = blankToNull(dto.getPrefix());
        if (prefix != null && clientRepository.existsByClientPrefix(prefix)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "tenant prefix already exists");
        }
        HaClient entity = new HaClient();
        entity.setName(dto.getName());
        entity.setClientPrefix(prefix);
        entity.setContactEmail(blankToNull(dto.getDomain()));
        entity.setMsspManaged(false);
        entity.setMaxUsers(50);
        entity.setLicenceType("standard");
        HaClient saved = clientRepository.save(entity);
        log.info("Created ha_client id={} prefixSet={}", saved.getId(), saved.getClientPrefix() != null);
        return toDTO(saved);
    }

    public Optional<HiveTenantDTO> update(Long id, HiveTenantDTO dto) {
        return clientRepository.findById(id).map(existing -> {
            existing.setName(dto.getName());
            // prefix is immutable after creation
            existing.setContactEmail(blankToNull(dto.getDomain()));
            return toDTO(clientRepository.save(existing));
        });
    }

    public void delete(Long id) {
        clientRepository.deleteById(id);
    }

    HiveTenantDTO toDTO(HaClient entity) {
        HiveTenantDTO dto = new HiveTenantDTO();
        dto.setId(entity.getId());
        dto.setName(entity.getName());
        dto.setDomain(entity.getContactEmail());
        dto.setPrefix(entity.getClientPrefix());
        dto.setStatus(resolveStatus(entity));
        dto.setLicenceExpire(null);
        dto.setCreatedAt(null);
        return dto;
    }

    private static String resolveStatus(HaClient entity) {
        if (entity.getClientPrefix() != null && !entity.getClientPrefix().isBlank()) {
            return "ACTIVE";
        }
        return "PROVISIONING";
    }

    private static String blankToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
