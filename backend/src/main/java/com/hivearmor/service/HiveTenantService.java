package com.hivearmor.service;

import com.hivearmor.domain.UtmClient;
import com.hivearmor.repository.UtmClientRepository;
import com.hivearmor.service.dto.HiveTenantDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

/**
 * Tenant management service.
 * Backs /api/ha-tenants — wraps the existing hive_client table (UtmClient entity).
 */
@Service
@Transactional
public class HiveTenantService {

    private static final Logger log = LoggerFactory.getLogger(HiveTenantService.class);

    private final UtmClientRepository clientRepository;

    public HiveTenantService(UtmClientRepository clientRepository) {
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
        UtmClient entity = toEntity(dto);
        entity.setId(null);
        return toDTO(clientRepository.save(entity));
    }

    public Optional<HiveTenantDTO> update(Long id, HiveTenantDTO dto) {
        return clientRepository.findById(id).map(existing -> {
            existing.setClientName(dto.getName());
            existing.setClientDomain(dto.getDomain());
            // prefix is immutable after creation — do not update
            if (dto.getLicenceExpire() != null) {
                existing.setClientLicenceExpire(dto.getLicenceExpire());
            }
            return toDTO(clientRepository.save(existing));
        });
    }

    public void delete(Long id) {
        clientRepository.deleteById(id);
    }

    // ---- mapping helpers ----

    private HiveTenantDTO toDTO(UtmClient entity) {
        HiveTenantDTO dto = new HiveTenantDTO();
        dto.setId(entity.getId());
        dto.setName(entity.getClientName());
        dto.setDomain(entity.getClientDomain());
        dto.setPrefix(entity.getClientPrefix());
        // Map licence verified to status: true→ACTIVE, null/false→PROVISIONING
        if (Boolean.TRUE.equals(entity.isClientLicenceVerified())) {
            dto.setStatus("ACTIVE");
        } else if (entity.getClientLicenceExpire() != null &&
                   entity.getClientLicenceExpire().isBefore(java.time.Instant.now())) {
            dto.setStatus("DEPROVISIONED");
        } else {
            dto.setStatus("PROVISIONING");
        }
        dto.setLicenceExpire(entity.getClientLicenceExpire());
        dto.setCreatedAt(entity.getClientLicenceCreation());
        return dto;
    }

    private UtmClient toEntity(HiveTenantDTO dto) {
        UtmClient entity = new UtmClient();
        entity.setClientName(dto.getName());
        entity.setClientDomain(dto.getDomain());
        entity.setClientPrefix(dto.getPrefix());
        entity.setClientLicenceExpire(dto.getLicenceExpire());
        entity.setClientLicenceVerified(false);
        entity.setClientLicenceCreation(java.time.Instant.now());
        return entity;
    }
}
