package com.hivearmor.service.connector;

/**
 * Coarse action verbs an agent or playbook can ask a connector to perform.
 * Mirrors AiSOC {@code Capability} taxonomy (subset for P1).
 */
public enum ConnectorCapability {
    PULL_ALERTS,
    PULL_AUDIT,
    ISOLATE_HOST,
    UNISOLATE_HOST,
    KILL_PROCESS,
    DISABLE_USER,
    BLOCK_IP
}
