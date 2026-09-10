package com.hivearmor.service.collectors;

import agent.CollectorOuterClass.*;
import com.hivearmor.grpc.client.CollectorServiceClient;
import com.hivearmor.grpc.client.PanelCollectorServiceClient;
import com.hivearmor.multitenancy.TenantScope;
import com.hivearmor.service.grpc.ListRequest;
import io.grpc.ManagedChannel;
import org.springframework.stereotype.Service;

@Service
public class CollectorGrpcService {

    private final CollectorServiceClient collectorClient;
    private final PanelCollectorServiceClient panelClient;

    public CollectorGrpcService(ManagedChannel channel) {
        this.collectorClient = new CollectorServiceClient(channel);
        this.panelClient = new PanelCollectorServiceClient(channel);
    }

    public ListCollectorResponse listCollectors(ListRequest request) {
        // P0A1-T11 — collector inventory is served by the agent-manager (which holds
        // the authoritative Collector.TenantID); stamp the tenant from the authenticated
        // identity here so every collector list — regardless of which builder produced
        // the request — is tenant-scoped by the manager. Never trusts a client tenant.
        ListRequest scoped = request.toBuilder().setTenantId(TenantScope.requireTenant()).build();
        return collectorClient.listCollectors(scoped);
    }

    public CollectorConfig getCollectorConfig(int id, String key, CollectorModule module) {
        return collectorClient.getCollectorConfig(id, key, module);
    }

    public void deleteCollector(int id, String key) {
        collectorClient.deleteCollector(id, key);
    }

    public ConfigKnowledge upsertCollectorConfig(CollectorConfig config) {
        return panelClient.insertCollectorConfig(config);
    }
}
