package com.hivearmor.service.incident_response.grpc_impl;

import com.hivearmor.service.grpc.CommandResult;
import com.hivearmor.service.grpc.PanelServiceGrpc;
import com.hivearmor.service.grpc.RemoteCommand;
import io.grpc.ManagedChannel;
import io.grpc.stub.StreamObserver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Bridges operator IR / EDR actions to agent-manager {@code ProcessCommand}.
 *
 * <p>Governance (BE-SEC-01): prefer structured {@code EDR_*} / {@code APPLY_POLICY*} commands.
 * Unstructured shell is deny-by-default on the agent ({@code response.allow_shell}). Backend
 * optionally hard-rejects unstructured shell when {@code HIVEARMOR_REJECT_UNSTRUCTURED_SHELL=true}
 * (staging opt-in — no per-agent policy lookup yet).
 *
 * <p>STAGING CANDIDATE — not PRODUCTION READY.
 */
@Service
public class IncidentResponseCommandService {

    private static final Logger log = LoggerFactory.getLogger(IncidentResponseCommandService.class);

    private final PanelServiceGrpc.PanelServiceStub nonBlockingStub;

    public IncidentResponseCommandService(ManagedChannel grpcManagedChannel) {
        this.nonBlockingStub = PanelServiceGrpc.newStub(grpcManagedChannel);
    }

    public void sendCommand(String agentId,
                            String command,
                            String originType,
                            String originId,
                            String reason,
                            String executedBy,
                            String shell,
                            StreamObserver<CommandResult> responseObserver) {

        if (isUnstructuredShell(command, shell)) {
            log.warn(
                "IR unstructured shell for agentId={} originType={} — prefer EDR_* / APPLY_POLICY; "
                    + "agent denies unless response.allow_shell / config / HIVEARMOR_ALLOW_REMOTE_SHELL",
                agentId,
                originType
            );
            if (rejectUnstructuredShellEnabled()) {
                IllegalStateException ex = new IllegalStateException(
                    "Unstructured remote shell rejected by control plane "
                        + "(set HIVEARMOR_REJECT_UNSTRUCTURED_SHELL=false or use EDR_* / enable "
                        + "response.allow_shell on the agent policy). Prefer structured EDR_* commands."
                );
                responseObserver.onError(ex);
                return;
            }
        }

        RemoteCommand.Builder builder = RemoteCommand.newBuilder()
            .setAgentId(agentId)
            .setCommand(command)
            .setOriginId(originId)
            .setOriginType(originType)
            .setReason(reason)
            .setExecutedBy(executedBy);

        if (shell != null && !shell.isEmpty()) {
            builder.setShell(shell);
        }

        RemoteCommand remoteCommand = builder.build();

        StreamObserver<RemoteCommand> requestObserver = nonBlockingStub.processCommand(responseObserver);
        try {
            requestObserver.onNext(remoteCommand);
        } catch (RuntimeException e) {
            requestObserver.onError(e);
            throw e;
        }
    }

    /**
     * Structured agent commands use a typed prefix; IR shell sends raw script with a shell field.
     */
    static boolean isUnstructuredShell(String command, String shell) {
        if (shell != null && !shell.isBlank()) {
            return true;
        }
        if (command == null || command.isBlank()) {
            return false;
        }
        String c = command.trim();
        return !(c.startsWith("EDR_")
            || c.startsWith("APPLY_POLICY")
            || c.startsWith("REPORT_POLICY_STATE")
            || c.startsWith("SYNC_RULES")
            || c.startsWith("UPDATE_"));
    }

    static boolean rejectUnstructuredShellEnabled() {
        String env = System.getenv("HIVEARMOR_REJECT_UNSTRUCTURED_SHELL");
        if (env == null || env.isBlank()) {
            return false;
        }
        return "1".equals(env) || "true".equalsIgnoreCase(env) || "yes".equalsIgnoreCase(env);
    }
}
