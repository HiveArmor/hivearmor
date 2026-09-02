package com.hivearmor.service.incident_response.grpc_impl;

import com.hivearmor.service.grpc.CommandResult;
import com.hivearmor.service.grpc.PanelServiceGrpc;
import com.hivearmor.service.grpc.RemoteCommand;
import io.grpc.ManagedChannel;
import io.grpc.stub.StreamObserver;
import org.springframework.stereotype.Service;

@Service
public class IncidentResponseCommandService {

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
}
