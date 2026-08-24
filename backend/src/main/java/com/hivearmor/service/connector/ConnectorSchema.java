package com.hivearmor.service.connector;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Self-describing catalog schema for the Admin "Add connector" wizard.
 */
public final class ConnectorSchema {

    private final String connectorId;
    private final String connectorName;
    private final String category;
    private final String description;
    private final List<ConnectorField> fields;
    private final List<ConnectorCapability> capabilities;

    public ConnectorSchema(
            String connectorId,
            String connectorName,
            String category,
            String description,
            List<ConnectorField> fields,
            List<ConnectorCapability> capabilities) {
        this.connectorId = connectorId;
        this.connectorName = connectorName;
        this.category = category;
        this.description = description;
        this.fields = List.copyOf(fields);
        this.capabilities = List.copyOf(capabilities);
    }

    public String getConnectorId() {
        return connectorId;
    }

    public String getConnectorName() {
        return connectorName;
    }

    public String getCategory() {
        return category;
    }

    public String getDescription() {
        return description;
    }

    public List<ConnectorField> getFields() {
        return fields;
    }

    public List<ConnectorCapability> getCapabilities() {
        return capabilities;
    }

    public Map<String, Object> toMap() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("connectorId", connectorId);
        m.put("connectorName", connectorName);
        m.put("category", category);
        m.put("description", description);
        m.put("fields", fields.stream().map(ConnectorField::toMap).collect(Collectors.toList()));
        m.put(
            "capabilities",
            capabilities.stream().map(Enum::name).collect(Collectors.toCollection(ArrayList::new))
        );
        return m;
    }
}
