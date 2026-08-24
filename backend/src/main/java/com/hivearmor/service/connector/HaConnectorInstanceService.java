package com.hivearmor.service.connector;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.connector.HaConnectorInstance;
import com.hivearmor.repository.connector.HaConnectorInstanceRepository;
import com.hivearmor.security.AesGcmEncryptionService;
import com.hivearmor.service.dto.connector.ConnectorInstanceDTO;
import com.hivearmor.service.dto.connector.ConnectorInstanceWriteDTO;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class HaConnectorInstanceService {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final HaConnectorRegistry registry;
    private final HaConnectorInstanceRepository repository;
    private final AesGcmEncryptionService encryption;

    public HaConnectorInstanceService(
            HaConnectorRegistry registry,
            HaConnectorInstanceRepository repository,
            AesGcmEncryptionService encryption) {
        this.registry = registry;
        this.repository = repository;
        this.encryption = encryption;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> catalog() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (HaConnector c : registry.all()) {
            out.add(c.schema().toMap());
        }
        return out;
    }

    @Transactional(readOnly = true)
    public List<ConnectorInstanceDTO> listInstances() {
        return repository.findAllByOrderByNameAsc().stream().map(this::toDto).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public ConnectorInstanceDTO getInstance(Long id) {
        return toDto(require(id));
    }

    @Transactional
    public ConnectorInstanceDTO create(ConnectorInstanceWriteDTO body) {
        if (body.getConnectorId() == null || body.getConnectorId().isBlank()) {
            throw new IllegalArgumentException("connectorId is required");
        }
        if (body.getName() == null || body.getName().isBlank()) {
            throw new IllegalArgumentException("name is required");
        }
        HaConnector connector = registry.require(body.getConnectorId().trim());
        repository.findByNameIgnoreCase(body.getName().trim()).ifPresent(x -> {
            throw new IllegalArgumentException("Connector instance name already exists");
        });

        Instant now = Instant.now();
        HaConnectorInstance row = new HaConnectorInstance();
        row.setConnectorId(connector.connectorId());
        row.setName(body.getName().trim());
        row.setEnabled(body.getEnabled() == null || body.getEnabled());
        applyConfig(row, connector, body.getConfig(), false);
        row.setAllowedCapabilities(joinCaps(body.getAllowedCapabilities()));
        row.setCreatedAt(now);
        row.setUpdatedAt(now);
        return toDto(repository.save(row));
    }

    @Transactional
    public ConnectorInstanceDTO update(Long id, ConnectorInstanceWriteDTO body) {
        HaConnectorInstance row = require(id);
        HaConnector connector = registry.require(row.getConnectorId());
        if (body.getName() != null && !body.getName().isBlank()
            && !body.getName().trim().equalsIgnoreCase(row.getName())) {
            repository.findByNameIgnoreCase(body.getName().trim()).ifPresent(x -> {
                throw new IllegalArgumentException("Connector instance name already exists");
            });
            row.setName(body.getName().trim());
        }
        if (body.getEnabled() != null) {
            row.setEnabled(body.getEnabled());
        }
        if (body.getConfig() != null) {
            applyConfig(row, connector, body.getConfig(), true);
        }
        if (body.getAllowedCapabilities() != null) {
            row.setAllowedCapabilities(joinCaps(body.getAllowedCapabilities()));
        }
        row.setUpdatedAt(Instant.now());
        return toDto(repository.save(row));
    }

    @Transactional
    public void delete(Long id) {
        repository.delete(require(id));
    }

    @Transactional
    public ConnectionTestResult test(Long id) {
        HaConnectorInstance row = require(id);
        HaConnector connector = registry.require(row.getConnectorId());
        Map<String, String> merged = decryptMergedConfig(row, connector);
        ConnectionTestResult result = connector.testConnection(merged);
        row.setLastTestedAt(Instant.now());
        row.setLastTestOk(result.isOk());
        String msg = result.getMessage();
        if (msg != null && msg.length() > 500) {
            msg = msg.substring(0, 500);
        }
        row.setLastTestMessage(msg);
        row.setUpdatedAt(Instant.now());
        repository.save(row);
        return result;
    }

    /**
     * Dry-run fetch — returns normalized alerts only. Does <strong>not</strong> write OpenSearch.
     */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> fetchAlerts(Long id, Instant since) {
        HaConnectorInstance row = require(id);
        HaConnector connector = registry.require(row.getConnectorId());
        Map<String, String> merged = decryptMergedConfig(row, connector);
        Instant from = since != null ? since : Instant.now().minusSeconds(3600);
        return connector.fetchAlerts(merged, from).stream()
            .map(NormalizedAlert::toMap)
            .collect(Collectors.toList());
    }

    private void applyConfig(
            HaConnectorInstance row,
            HaConnector connector,
            Map<String, String> config,
            boolean mergeSecrets) {
        if (config == null) {
            config = Map.of();
        }
        Set<String> secretNames = connector.schema().getFields().stream()
            .filter(ConnectorField::isSecret)
            .map(ConnectorField::getName)
            .collect(Collectors.toCollection(LinkedHashSet::new));

        Map<String, String> pub = new LinkedHashMap<>();
        Map<String, String> secrets = new LinkedHashMap<>();
        if (mergeSecrets) {
            secrets.putAll(readSecrets(row));
        }
        for (Map.Entry<String, String> e : config.entrySet()) {
            if (e.getKey() == null) {
                continue;
            }
            String key = e.getKey();
            String val = e.getValue();
            if (secretNames.contains(key)) {
                if (val != null && !val.isBlank() && !"***".equals(val)) {
                    secrets.put(key, val);
                }
            } else if (val != null) {
                pub.put(key, val);
            }
        }
        try {
            row.setConfigJson(MAPPER.writeValueAsString(pub));
            if (!secrets.isEmpty()) {
                row.setSecretsEncrypted(encryption.encrypt(MAPPER.writeValueAsString(secrets)));
            } else if (!mergeSecrets) {
                row.setSecretsEncrypted(null);
            }
        } catch (Exception e) {
            throw new IllegalStateException("Failed to persist connector config", e);
        }
    }

    private Map<String, String> decryptMergedConfig(HaConnectorInstance row, HaConnector connector) {
        Map<String, String> merged = new LinkedHashMap<>();
        merged.putAll(readPublic(row));
        merged.putAll(readSecrets(row));
        // Apply schema defaults for missing optional fields
        for (ConnectorField f : connector.schema().getFields()) {
            if (!merged.containsKey(f.getName()) && f.getDefaultValue() != null) {
                merged.put(f.getName(), f.getDefaultValue());
            }
        }
        return merged;
    }

    private Map<String, String> readPublic(HaConnectorInstance row) {
        if (row.getConfigJson() == null || row.getConfigJson().isBlank()) {
            return new LinkedHashMap<>();
        }
        try {
            return MAPPER.readValue(row.getConfigJson(), new TypeReference<LinkedHashMap<String, String>>() {});
        } catch (Exception e) {
            return new LinkedHashMap<>();
        }
    }

    private Map<String, String> readSecrets(HaConnectorInstance row) {
        if (row.getSecretsEncrypted() == null || row.getSecretsEncrypted().isBlank()) {
            return new LinkedHashMap<>();
        }
        try {
            String json = encryption.decrypt(row.getSecretsEncrypted());
            return MAPPER.readValue(json, new TypeReference<LinkedHashMap<String, String>>() {});
        } catch (Exception e) {
            throw new IllegalStateException("Failed to decrypt connector secrets", e);
        }
    }

    private HaConnectorInstance require(Long id) {
        return repository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Connector instance not found: " + id));
    }

    private ConnectorInstanceDTO toDto(HaConnectorInstance row) {
        HaConnector connector = registry.require(row.getConnectorId());
        ConnectorInstanceDTO dto = new ConnectorInstanceDTO();
        dto.setId(row.getId());
        dto.setConnectorId(row.getConnectorId());
        dto.setConnectorName(connector.connectorName());
        dto.setCategory(connector.category());
        dto.setName(row.getName());
        dto.setEnabled(row.isEnabled());
        dto.setConfigPublic(readPublic(row));
        dto.setSecretFieldsConfigured(new ArrayList<>(readSecrets(row).keySet()));
        dto.setCapabilities(
            connector.capabilities().stream().map(Enum::name).collect(Collectors.toList())
        );
        dto.setAllowedCapabilities(splitCaps(row.getAllowedCapabilities()));
        dto.setCreatedAt(row.getCreatedAt());
        dto.setUpdatedAt(row.getUpdatedAt());
        dto.setLastTestedAt(row.getLastTestedAt());
        dto.setLastTestOk(row.getLastTestOk());
        dto.setLastTestMessage(row.getLastTestMessage());
        return dto;
    }

    private static String joinCaps(List<String> caps) {
        if (caps == null || caps.isEmpty()) {
            return null;
        }
        return String.join(",", caps);
    }

    private static List<String> splitCaps(String raw) {
        if (raw == null || raw.isBlank()) {
            return List.of();
        }
        List<String> out = new ArrayList<>();
        for (String p : raw.split(",")) {
            if (!p.isBlank()) {
                out.add(p.trim());
            }
        }
        return out;
    }
}
