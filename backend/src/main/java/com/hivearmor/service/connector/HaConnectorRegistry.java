package com.hivearmor.service.connector;

import com.hivearmor.service.connector.impl.AwsSecurityHubConnector;
import com.hivearmor.service.connector.impl.AzureDefenderConnector;
import com.hivearmor.service.connector.impl.AzureEntraConnector;
import com.hivearmor.service.connector.impl.CrowdStrikeConnector;
import com.hivearmor.service.connector.impl.GoogleWorkspaceConnector;
import com.hivearmor.service.connector.impl.OktaConnector;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * In-process catalog of typed connectors (P1 six: five vendors + Google Workspace).
 *
 * <p>The production constructor must be {@code @Autowired}: additional public
 * test helpers leave Spring with no unambiguous candidate, and it falls back
 * to a missing no-arg ctor (boot failure).
 */
@Component
public class HaConnectorRegistry {

    private final Map<String, HaConnector> byId = new LinkedHashMap<>();

    @Autowired
    public HaConnectorRegistry(
            MicrosoftOAuthClient microsoftOAuthClient,
            OktaIdentityClient oktaIdentityClient,
            @Value("${hivearmor.connectors.vendor-isolate-enabled:false}") boolean vendorIsolateEnabled) {
        MicrosoftOAuthClient oauth = microsoftOAuthClient != null
            ? microsoftOAuthClient
            : new MicrosoftOAuthClient();
        OktaIdentityClient okta = oktaIdentityClient != null
            ? oktaIdentityClient
            : new OktaIdentityClient();
        register(new CrowdStrikeConnector(vendorIsolateEnabled));
        register(new AzureDefenderConnector(oauth));
        register(new OktaConnector(okta));
        register(new AzureEntraConnector(oauth));
        register(new AwsSecurityHubConnector());
        register(new GoogleWorkspaceConnector());
    }

    /** Test helper — same catalog with isolate flag. Not used by Spring. */
    public HaConnectorRegistry(boolean vendorIsolateEnabled) {
        this(new MicrosoftOAuthClient(), new OktaIdentityClient(), vendorIsolateEnabled);
    }

    /** Test helper — injectable Okta client. Not used by Spring. */
    public HaConnectorRegistry(OktaIdentityClient oktaIdentityClient, boolean vendorIsolateEnabled) {
        this(new MicrosoftOAuthClient(), oktaIdentityClient, vendorIsolateEnabled);
    }

    private void register(HaConnector connector) {
        if (byId.containsKey(connector.connectorId())) {
            throw new IllegalStateException("Duplicate connector id: " + connector.connectorId());
        }
        byId.put(connector.connectorId(), connector);
    }

    public Optional<HaConnector> get(String connectorId) {
        return Optional.ofNullable(byId.get(connectorId));
    }

    public HaConnector require(String connectorId) {
        return get(connectorId)
            .orElseThrow(() -> new IllegalArgumentException("Unknown connector: " + connectorId));
    }

    public Collection<HaConnector> all() {
        return List.copyOf(byId.values());
    }

    public int size() {
        return byId.size();
    }
}
