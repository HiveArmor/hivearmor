package com.hivearmor.service.grpc;

import static io.grpc.MethodDescriptor.generateFullMethodName;

/**
 */
@javax.annotation.Generated(
    value = "by gRPC proto compiler (version 1.65.1)",
    comments = "Source: agent.proto")
@io.grpc.stub.annotations.GrpcGenerated
public final class AgentServiceGrpc {

  private AgentServiceGrpc() {}

  public static final java.lang.String SERVICE_NAME = "agent.AgentService";

  // Static method descriptors that strictly reflect the proto.
  private static volatile io.grpc.MethodDescriptor<com.hivearmor.service.grpc.AgentRequest,
      com.hivearmor.service.grpc.AuthResponse> getRegisterAgentMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "RegisterAgent",
      requestType = com.hivearmor.service.grpc.AgentRequest.class,
      responseType = com.hivearmor.service.grpc.AuthResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hivearmor.service.grpc.AgentRequest,
      com.hivearmor.service.grpc.AuthResponse> getRegisterAgentMethod() {
    io.grpc.MethodDescriptor<com.hivearmor.service.grpc.AgentRequest, com.hivearmor.service.grpc.AuthResponse> getRegisterAgentMethod;
    if ((getRegisterAgentMethod = AgentServiceGrpc.getRegisterAgentMethod) == null) {
      synchronized (AgentServiceGrpc.class) {
        if ((getRegisterAgentMethod = AgentServiceGrpc.getRegisterAgentMethod) == null) {
          AgentServiceGrpc.getRegisterAgentMethod = getRegisterAgentMethod =
              io.grpc.MethodDescriptor.<com.hivearmor.service.grpc.AgentRequest, com.hivearmor.service.grpc.AuthResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "RegisterAgent"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hivearmor.service.grpc.AgentRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hivearmor.service.grpc.AuthResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AgentServiceMethodDescriptorSupplier("RegisterAgent"))
              .build();
        }
      }
    }
    return getRegisterAgentMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hivearmor.service.grpc.AgentRequest,
      com.hivearmor.service.grpc.AuthResponse> getUpdateAgentMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "UpdateAgent",
      requestType = com.hivearmor.service.grpc.AgentRequest.class,
      responseType = com.hivearmor.service.grpc.AuthResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hivearmor.service.grpc.AgentRequest,
      com.hivearmor.service.grpc.AuthResponse> getUpdateAgentMethod() {
    io.grpc.MethodDescriptor<com.hivearmor.service.grpc.AgentRequest, com.hivearmor.service.grpc.AuthResponse> getUpdateAgentMethod;
    if ((getUpdateAgentMethod = AgentServiceGrpc.getUpdateAgentMethod) == null) {
      synchronized (AgentServiceGrpc.class) {
        if ((getUpdateAgentMethod = AgentServiceGrpc.getUpdateAgentMethod) == null) {
          AgentServiceGrpc.getUpdateAgentMethod = getUpdateAgentMethod =
              io.grpc.MethodDescriptor.<com.hivearmor.service.grpc.AgentRequest, com.hivearmor.service.grpc.AuthResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "UpdateAgent"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hivearmor.service.grpc.AgentRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hivearmor.service.grpc.AuthResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AgentServiceMethodDescriptorSupplier("UpdateAgent"))
              .build();
        }
      }
    }
    return getUpdateAgentMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hivearmor.service.grpc.DeleteRequest,
      com.hivearmor.service.grpc.AuthResponse> getDeleteAgentMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "DeleteAgent",
      requestType = com.hivearmor.service.grpc.DeleteRequest.class,
      responseType = com.hivearmor.service.grpc.AuthResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hivearmor.service.grpc.DeleteRequest,
      com.hivearmor.service.grpc.AuthResponse> getDeleteAgentMethod() {
    io.grpc.MethodDescriptor<com.hivearmor.service.grpc.DeleteRequest, com.hivearmor.service.grpc.AuthResponse> getDeleteAgentMethod;
    if ((getDeleteAgentMethod = AgentServiceGrpc.getDeleteAgentMethod) == null) {
      synchronized (AgentServiceGrpc.class) {
        if ((getDeleteAgentMethod = AgentServiceGrpc.getDeleteAgentMethod) == null) {
          AgentServiceGrpc.getDeleteAgentMethod = getDeleteAgentMethod =
              io.grpc.MethodDescriptor.<com.hivearmor.service.grpc.DeleteRequest, com.hivearmor.service.grpc.AuthResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "DeleteAgent"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hivearmor.service.grpc.DeleteRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hivearmor.service.grpc.AuthResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AgentServiceMethodDescriptorSupplier("DeleteAgent"))
              .build();
        }
      }
    }
    return getDeleteAgentMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hivearmor.service.grpc.ListRequest,
      com.hivearmor.service.grpc.ListAgentsResponse> getListAgentsMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListAgents",
      requestType = com.hivearmor.service.grpc.ListRequest.class,
      responseType = com.hivearmor.service.grpc.ListAgentsResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hivearmor.service.grpc.ListRequest,
      com.hivearmor.service.grpc.ListAgentsResponse> getListAgentsMethod() {
    io.grpc.MethodDescriptor<com.hivearmor.service.grpc.ListRequest, com.hivearmor.service.grpc.ListAgentsResponse> getListAgentsMethod;
    if ((getListAgentsMethod = AgentServiceGrpc.getListAgentsMethod) == null) {
      synchronized (AgentServiceGrpc.class) {
        if ((getListAgentsMethod = AgentServiceGrpc.getListAgentsMethod) == null) {
          AgentServiceGrpc.getListAgentsMethod = getListAgentsMethod =
              io.grpc.MethodDescriptor.<com.hivearmor.service.grpc.ListRequest, com.hivearmor.service.grpc.ListAgentsResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListAgents"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hivearmor.service.grpc.ListRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hivearmor.service.grpc.ListAgentsResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AgentServiceMethodDescriptorSupplier("ListAgents"))
              .build();
        }
      }
    }
    return getListAgentsMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hivearmor.service.grpc.BidirectionalStream,
      com.hivearmor.service.grpc.BidirectionalStream> getAgentStreamMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "AgentStream",
      requestType = com.hivearmor.service.grpc.BidirectionalStream.class,
      responseType = com.hivearmor.service.grpc.BidirectionalStream.class,
      methodType = io.grpc.MethodDescriptor.MethodType.BIDI_STREAMING)
  public static io.grpc.MethodDescriptor<com.hivearmor.service.grpc.BidirectionalStream,
      com.hivearmor.service.grpc.BidirectionalStream> getAgentStreamMethod() {
    io.grpc.MethodDescriptor<com.hivearmor.service.grpc.BidirectionalStream, com.hivearmor.service.grpc.BidirectionalStream> getAgentStreamMethod;
    if ((getAgentStreamMethod = AgentServiceGrpc.getAgentStreamMethod) == null) {
      synchronized (AgentServiceGrpc.class) {
        if ((getAgentStreamMethod = AgentServiceGrpc.getAgentStreamMethod) == null) {
          AgentServiceGrpc.getAgentStreamMethod = getAgentStreamMethod =
              io.grpc.MethodDescriptor.<com.hivearmor.service.grpc.BidirectionalStream, com.hivearmor.service.grpc.BidirectionalStream>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.BIDI_STREAMING)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "AgentStream"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hivearmor.service.grpc.BidirectionalStream.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hivearmor.service.grpc.BidirectionalStream.getDefaultInstance()))
              .setSchemaDescriptor(new AgentServiceMethodDescriptorSupplier("AgentStream"))
              .build();
        }
      }
    }
    return getAgentStreamMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hivearmor.service.grpc.ListRequest,
      com.hivearmor.service.grpc.ListAgentsCommandsResponse> getListAgentCommandsMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListAgentCommands",
      requestType = com.hivearmor.service.grpc.ListRequest.class,
      responseType = com.hivearmor.service.grpc.ListAgentsCommandsResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hivearmor.service.grpc.ListRequest,
      com.hivearmor.service.grpc.ListAgentsCommandsResponse> getListAgentCommandsMethod() {
    io.grpc.MethodDescriptor<com.hivearmor.service.grpc.ListRequest, com.hivearmor.service.grpc.ListAgentsCommandsResponse> getListAgentCommandsMethod;
    if ((getListAgentCommandsMethod = AgentServiceGrpc.getListAgentCommandsMethod) == null) {
      synchronized (AgentServiceGrpc.class) {
        if ((getListAgentCommandsMethod = AgentServiceGrpc.getListAgentCommandsMethod) == null) {
          AgentServiceGrpc.getListAgentCommandsMethod = getListAgentCommandsMethod =
              io.grpc.MethodDescriptor.<com.hivearmor.service.grpc.ListRequest, com.hivearmor.service.grpc.ListAgentsCommandsResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListAgentCommands"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hivearmor.service.grpc.ListRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hivearmor.service.grpc.ListAgentsCommandsResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AgentServiceMethodDescriptorSupplier("ListAgentCommands"))
              .build();
        }
      }
    }
    return getListAgentCommandsMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hivearmor.service.grpc.CreateEnrollmentTokenRequest,
      com.hivearmor.service.grpc.CreateEnrollmentTokenResponse> getCreateEnrollmentTokenMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "CreateEnrollmentToken",
      requestType = com.hivearmor.service.grpc.CreateEnrollmentTokenRequest.class,
      responseType = com.hivearmor.service.grpc.CreateEnrollmentTokenResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hivearmor.service.grpc.CreateEnrollmentTokenRequest,
      com.hivearmor.service.grpc.CreateEnrollmentTokenResponse> getCreateEnrollmentTokenMethod() {
    io.grpc.MethodDescriptor<com.hivearmor.service.grpc.CreateEnrollmentTokenRequest, com.hivearmor.service.grpc.CreateEnrollmentTokenResponse> getCreateEnrollmentTokenMethod;
    if ((getCreateEnrollmentTokenMethod = AgentServiceGrpc.getCreateEnrollmentTokenMethod) == null) {
      synchronized (AgentServiceGrpc.class) {
        if ((getCreateEnrollmentTokenMethod = AgentServiceGrpc.getCreateEnrollmentTokenMethod) == null) {
          AgentServiceGrpc.getCreateEnrollmentTokenMethod = getCreateEnrollmentTokenMethod =
              io.grpc.MethodDescriptor.<com.hivearmor.service.grpc.CreateEnrollmentTokenRequest, com.hivearmor.service.grpc.CreateEnrollmentTokenResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "CreateEnrollmentToken"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hivearmor.service.grpc.CreateEnrollmentTokenRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hivearmor.service.grpc.CreateEnrollmentTokenResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AgentServiceMethodDescriptorSupplier("CreateEnrollmentToken"))
              .build();
        }
      }
    }
    return getCreateEnrollmentTokenMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hivearmor.service.grpc.ListEnrollmentTokensRequest,
      com.hivearmor.service.grpc.ListEnrollmentTokensResponse> getListEnrollmentTokensMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListEnrollmentTokens",
      requestType = com.hivearmor.service.grpc.ListEnrollmentTokensRequest.class,
      responseType = com.hivearmor.service.grpc.ListEnrollmentTokensResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hivearmor.service.grpc.ListEnrollmentTokensRequest,
      com.hivearmor.service.grpc.ListEnrollmentTokensResponse> getListEnrollmentTokensMethod() {
    io.grpc.MethodDescriptor<com.hivearmor.service.grpc.ListEnrollmentTokensRequest, com.hivearmor.service.grpc.ListEnrollmentTokensResponse> getListEnrollmentTokensMethod;
    if ((getListEnrollmentTokensMethod = AgentServiceGrpc.getListEnrollmentTokensMethod) == null) {
      synchronized (AgentServiceGrpc.class) {
        if ((getListEnrollmentTokensMethod = AgentServiceGrpc.getListEnrollmentTokensMethod) == null) {
          AgentServiceGrpc.getListEnrollmentTokensMethod = getListEnrollmentTokensMethod =
              io.grpc.MethodDescriptor.<com.hivearmor.service.grpc.ListEnrollmentTokensRequest, com.hivearmor.service.grpc.ListEnrollmentTokensResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListEnrollmentTokens"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hivearmor.service.grpc.ListEnrollmentTokensRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hivearmor.service.grpc.ListEnrollmentTokensResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AgentServiceMethodDescriptorSupplier("ListEnrollmentTokens"))
              .build();
        }
      }
    }
    return getListEnrollmentTokensMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hivearmor.service.grpc.RevokeEnrollmentTokenRequest,
      com.hivearmor.service.grpc.EnrollmentToken> getRevokeEnrollmentTokenMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "RevokeEnrollmentToken",
      requestType = com.hivearmor.service.grpc.RevokeEnrollmentTokenRequest.class,
      responseType = com.hivearmor.service.grpc.EnrollmentToken.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hivearmor.service.grpc.RevokeEnrollmentTokenRequest,
      com.hivearmor.service.grpc.EnrollmentToken> getRevokeEnrollmentTokenMethod() {
    io.grpc.MethodDescriptor<com.hivearmor.service.grpc.RevokeEnrollmentTokenRequest, com.hivearmor.service.grpc.EnrollmentToken> getRevokeEnrollmentTokenMethod;
    if ((getRevokeEnrollmentTokenMethod = AgentServiceGrpc.getRevokeEnrollmentTokenMethod) == null) {
      synchronized (AgentServiceGrpc.class) {
        if ((getRevokeEnrollmentTokenMethod = AgentServiceGrpc.getRevokeEnrollmentTokenMethod) == null) {
          AgentServiceGrpc.getRevokeEnrollmentTokenMethod = getRevokeEnrollmentTokenMethod =
              io.grpc.MethodDescriptor.<com.hivearmor.service.grpc.RevokeEnrollmentTokenRequest, com.hivearmor.service.grpc.EnrollmentToken>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "RevokeEnrollmentToken"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hivearmor.service.grpc.RevokeEnrollmentTokenRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hivearmor.service.grpc.EnrollmentToken.getDefaultInstance()))
              .setSchemaDescriptor(new AgentServiceMethodDescriptorSupplier("RevokeEnrollmentToken"))
              .build();
        }
      }
    }
    return getRevokeEnrollmentTokenMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hivearmor.service.grpc.AgentCredentialRequest,
      com.hivearmor.service.grpc.AgentCredentialResponse> getRotateAgentCredentialMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "RotateAgentCredential",
      requestType = com.hivearmor.service.grpc.AgentCredentialRequest.class,
      responseType = com.hivearmor.service.grpc.AgentCredentialResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hivearmor.service.grpc.AgentCredentialRequest,
      com.hivearmor.service.grpc.AgentCredentialResponse> getRotateAgentCredentialMethod() {
    io.grpc.MethodDescriptor<com.hivearmor.service.grpc.AgentCredentialRequest, com.hivearmor.service.grpc.AgentCredentialResponse> getRotateAgentCredentialMethod;
    if ((getRotateAgentCredentialMethod = AgentServiceGrpc.getRotateAgentCredentialMethod) == null) {
      synchronized (AgentServiceGrpc.class) {
        if ((getRotateAgentCredentialMethod = AgentServiceGrpc.getRotateAgentCredentialMethod) == null) {
          AgentServiceGrpc.getRotateAgentCredentialMethod = getRotateAgentCredentialMethod =
              io.grpc.MethodDescriptor.<com.hivearmor.service.grpc.AgentCredentialRequest, com.hivearmor.service.grpc.AgentCredentialResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "RotateAgentCredential"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hivearmor.service.grpc.AgentCredentialRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hivearmor.service.grpc.AgentCredentialResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AgentServiceMethodDescriptorSupplier("RotateAgentCredential"))
              .build();
        }
      }
    }
    return getRotateAgentCredentialMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hivearmor.service.grpc.AgentCredentialRequest,
      com.hivearmor.service.grpc.AgentCredentialResponse> getRevokeAgentCredentialMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "RevokeAgentCredential",
      requestType = com.hivearmor.service.grpc.AgentCredentialRequest.class,
      responseType = com.hivearmor.service.grpc.AgentCredentialResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hivearmor.service.grpc.AgentCredentialRequest,
      com.hivearmor.service.grpc.AgentCredentialResponse> getRevokeAgentCredentialMethod() {
    io.grpc.MethodDescriptor<com.hivearmor.service.grpc.AgentCredentialRequest, com.hivearmor.service.grpc.AgentCredentialResponse> getRevokeAgentCredentialMethod;
    if ((getRevokeAgentCredentialMethod = AgentServiceGrpc.getRevokeAgentCredentialMethod) == null) {
      synchronized (AgentServiceGrpc.class) {
        if ((getRevokeAgentCredentialMethod = AgentServiceGrpc.getRevokeAgentCredentialMethod) == null) {
          AgentServiceGrpc.getRevokeAgentCredentialMethod = getRevokeAgentCredentialMethod =
              io.grpc.MethodDescriptor.<com.hivearmor.service.grpc.AgentCredentialRequest, com.hivearmor.service.grpc.AgentCredentialResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "RevokeAgentCredential"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hivearmor.service.grpc.AgentCredentialRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hivearmor.service.grpc.AgentCredentialResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AgentServiceMethodDescriptorSupplier("RevokeAgentCredential"))
              .build();
        }
      }
    }
    return getRevokeAgentCredentialMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hivearmor.service.grpc.ListEnrollmentAuditEventsRequest,
      com.hivearmor.service.grpc.ListEnrollmentAuditEventsResponse> getListEnrollmentAuditEventsMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListEnrollmentAuditEvents",
      requestType = com.hivearmor.service.grpc.ListEnrollmentAuditEventsRequest.class,
      responseType = com.hivearmor.service.grpc.ListEnrollmentAuditEventsResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hivearmor.service.grpc.ListEnrollmentAuditEventsRequest,
      com.hivearmor.service.grpc.ListEnrollmentAuditEventsResponse> getListEnrollmentAuditEventsMethod() {
    io.grpc.MethodDescriptor<com.hivearmor.service.grpc.ListEnrollmentAuditEventsRequest, com.hivearmor.service.grpc.ListEnrollmentAuditEventsResponse> getListEnrollmentAuditEventsMethod;
    if ((getListEnrollmentAuditEventsMethod = AgentServiceGrpc.getListEnrollmentAuditEventsMethod) == null) {
      synchronized (AgentServiceGrpc.class) {
        if ((getListEnrollmentAuditEventsMethod = AgentServiceGrpc.getListEnrollmentAuditEventsMethod) == null) {
          AgentServiceGrpc.getListEnrollmentAuditEventsMethod = getListEnrollmentAuditEventsMethod =
              io.grpc.MethodDescriptor.<com.hivearmor.service.grpc.ListEnrollmentAuditEventsRequest, com.hivearmor.service.grpc.ListEnrollmentAuditEventsResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListEnrollmentAuditEvents"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hivearmor.service.grpc.ListEnrollmentAuditEventsRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hivearmor.service.grpc.ListEnrollmentAuditEventsResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AgentServiceMethodDescriptorSupplier("ListEnrollmentAuditEvents"))
              .build();
        }
      }
    }
    return getListEnrollmentAuditEventsMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hivearmor.service.grpc.VerifyConnectorIdentityRequest,
      com.hivearmor.service.grpc.VerifyConnectorIdentityResponse> getVerifyConnectorIdentityMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "VerifyConnectorIdentity",
      requestType = com.hivearmor.service.grpc.VerifyConnectorIdentityRequest.class,
      responseType = com.hivearmor.service.grpc.VerifyConnectorIdentityResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hivearmor.service.grpc.VerifyConnectorIdentityRequest,
      com.hivearmor.service.grpc.VerifyConnectorIdentityResponse> getVerifyConnectorIdentityMethod() {
    io.grpc.MethodDescriptor<com.hivearmor.service.grpc.VerifyConnectorIdentityRequest, com.hivearmor.service.grpc.VerifyConnectorIdentityResponse> getVerifyConnectorIdentityMethod;
    if ((getVerifyConnectorIdentityMethod = AgentServiceGrpc.getVerifyConnectorIdentityMethod) == null) {
      synchronized (AgentServiceGrpc.class) {
        if ((getVerifyConnectorIdentityMethod = AgentServiceGrpc.getVerifyConnectorIdentityMethod) == null) {
          AgentServiceGrpc.getVerifyConnectorIdentityMethod = getVerifyConnectorIdentityMethod =
              io.grpc.MethodDescriptor.<com.hivearmor.service.grpc.VerifyConnectorIdentityRequest, com.hivearmor.service.grpc.VerifyConnectorIdentityResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "VerifyConnectorIdentity"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hivearmor.service.grpc.VerifyConnectorIdentityRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hivearmor.service.grpc.VerifyConnectorIdentityResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AgentServiceMethodDescriptorSupplier("VerifyConnectorIdentity"))
              .build();
        }
      }
    }
    return getVerifyConnectorIdentityMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hivearmor.service.grpc.ListConnectorAuthorizationRequest,
      com.hivearmor.service.grpc.ListConnectorAuthorizationResponse> getListConnectorAuthorizationMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListConnectorAuthorization",
      requestType = com.hivearmor.service.grpc.ListConnectorAuthorizationRequest.class,
      responseType = com.hivearmor.service.grpc.ListConnectorAuthorizationResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hivearmor.service.grpc.ListConnectorAuthorizationRequest,
      com.hivearmor.service.grpc.ListConnectorAuthorizationResponse> getListConnectorAuthorizationMethod() {
    io.grpc.MethodDescriptor<com.hivearmor.service.grpc.ListConnectorAuthorizationRequest, com.hivearmor.service.grpc.ListConnectorAuthorizationResponse> getListConnectorAuthorizationMethod;
    if ((getListConnectorAuthorizationMethod = AgentServiceGrpc.getListConnectorAuthorizationMethod) == null) {
      synchronized (AgentServiceGrpc.class) {
        if ((getListConnectorAuthorizationMethod = AgentServiceGrpc.getListConnectorAuthorizationMethod) == null) {
          AgentServiceGrpc.getListConnectorAuthorizationMethod = getListConnectorAuthorizationMethod =
              io.grpc.MethodDescriptor.<com.hivearmor.service.grpc.ListConnectorAuthorizationRequest, com.hivearmor.service.grpc.ListConnectorAuthorizationResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListConnectorAuthorization"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hivearmor.service.grpc.ListConnectorAuthorizationRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hivearmor.service.grpc.ListConnectorAuthorizationResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AgentServiceMethodDescriptorSupplier("ListConnectorAuthorization"))
              .build();
        }
      }
    }
    return getListConnectorAuthorizationMethod;
  }

  /**
   * Creates a new async stub that supports all call types for the service
   */
  public static AgentServiceStub newStub(io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<AgentServiceStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<AgentServiceStub>() {
        @java.lang.Override
        public AgentServiceStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new AgentServiceStub(channel, callOptions);
        }
      };
    return AgentServiceStub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports unary and streaming output calls on the service
   */
  public static AgentServiceBlockingStub newBlockingStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<AgentServiceBlockingStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<AgentServiceBlockingStub>() {
        @java.lang.Override
        public AgentServiceBlockingStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new AgentServiceBlockingStub(channel, callOptions);
        }
      };
    return AgentServiceBlockingStub.newStub(factory, channel);
  }

  /**
   * Creates a new ListenableFuture-style stub that supports unary calls on the service
   */
  public static AgentServiceFutureStub newFutureStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<AgentServiceFutureStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<AgentServiceFutureStub>() {
        @java.lang.Override
        public AgentServiceFutureStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new AgentServiceFutureStub(channel, callOptions);
        }
      };
    return AgentServiceFutureStub.newStub(factory, channel);
  }

  /**
   */
  public interface AsyncService {

    /**
     */
    default void registerAgent(com.hivearmor.service.grpc.AgentRequest request,
        io.grpc.stub.StreamObserver<com.hivearmor.service.grpc.AuthResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getRegisterAgentMethod(), responseObserver);
    }

    /**
     */
    default void updateAgent(com.hivearmor.service.grpc.AgentRequest request,
        io.grpc.stub.StreamObserver<com.hivearmor.service.grpc.AuthResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getUpdateAgentMethod(), responseObserver);
    }

    /**
     */
    default void deleteAgent(com.hivearmor.service.grpc.DeleteRequest request,
        io.grpc.stub.StreamObserver<com.hivearmor.service.grpc.AuthResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getDeleteAgentMethod(), responseObserver);
    }

    /**
     */
    default void listAgents(com.hivearmor.service.grpc.ListRequest request,
        io.grpc.stub.StreamObserver<com.hivearmor.service.grpc.ListAgentsResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListAgentsMethod(), responseObserver);
    }

    /**
     */
    default io.grpc.stub.StreamObserver<com.hivearmor.service.grpc.BidirectionalStream> agentStream(
        io.grpc.stub.StreamObserver<com.hivearmor.service.grpc.BidirectionalStream> responseObserver) {
      return io.grpc.stub.ServerCalls.asyncUnimplementedStreamingCall(getAgentStreamMethod(), responseObserver);
    }

    /**
     */
    default void listAgentCommands(com.hivearmor.service.grpc.ListRequest request,
        io.grpc.stub.StreamObserver<com.hivearmor.service.grpc.ListAgentsCommandsResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListAgentCommandsMethod(), responseObserver);
    }

    /**
     */
    default void createEnrollmentToken(com.hivearmor.service.grpc.CreateEnrollmentTokenRequest request,
        io.grpc.stub.StreamObserver<com.hivearmor.service.grpc.CreateEnrollmentTokenResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getCreateEnrollmentTokenMethod(), responseObserver);
    }

    /**
     */
    default void listEnrollmentTokens(com.hivearmor.service.grpc.ListEnrollmentTokensRequest request,
        io.grpc.stub.StreamObserver<com.hivearmor.service.grpc.ListEnrollmentTokensResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListEnrollmentTokensMethod(), responseObserver);
    }

    /**
     */
    default void revokeEnrollmentToken(com.hivearmor.service.grpc.RevokeEnrollmentTokenRequest request,
        io.grpc.stub.StreamObserver<com.hivearmor.service.grpc.EnrollmentToken> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getRevokeEnrollmentTokenMethod(), responseObserver);
    }

    /**
     */
    default void rotateAgentCredential(com.hivearmor.service.grpc.AgentCredentialRequest request,
        io.grpc.stub.StreamObserver<com.hivearmor.service.grpc.AgentCredentialResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getRotateAgentCredentialMethod(), responseObserver);
    }

    /**
     */
    default void revokeAgentCredential(com.hivearmor.service.grpc.AgentCredentialRequest request,
        io.grpc.stub.StreamObserver<com.hivearmor.service.grpc.AgentCredentialResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getRevokeAgentCredentialMethod(), responseObserver);
    }

    /**
     */
    default void listEnrollmentAuditEvents(com.hivearmor.service.grpc.ListEnrollmentAuditEventsRequest request,
        io.grpc.stub.StreamObserver<com.hivearmor.service.grpc.ListEnrollmentAuditEventsResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListEnrollmentAuditEventsMethod(), responseObserver);
    }

    /**
     */
    default void verifyConnectorIdentity(com.hivearmor.service.grpc.VerifyConnectorIdentityRequest request,
        io.grpc.stub.StreamObserver<com.hivearmor.service.grpc.VerifyConnectorIdentityResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getVerifyConnectorIdentityMethod(), responseObserver);
    }

    /**
     */
    default void listConnectorAuthorization(com.hivearmor.service.grpc.ListConnectorAuthorizationRequest request,
        io.grpc.stub.StreamObserver<com.hivearmor.service.grpc.ListConnectorAuthorizationResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListConnectorAuthorizationMethod(), responseObserver);
    }
  }

  /**
   * Base class for the server implementation of the service AgentService.
   */
  public static abstract class AgentServiceImplBase
      implements io.grpc.BindableService, AsyncService {

    @java.lang.Override public final io.grpc.ServerServiceDefinition bindService() {
      return AgentServiceGrpc.bindService(this);
    }
  }

  /**
   * A stub to allow clients to do asynchronous rpc calls to service AgentService.
   */
  public static final class AgentServiceStub
      extends io.grpc.stub.AbstractAsyncStub<AgentServiceStub> {
    private AgentServiceStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected AgentServiceStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new AgentServiceStub(channel, callOptions);
    }

    /**
     */
    public void registerAgent(com.hivearmor.service.grpc.AgentRequest request,
        io.grpc.stub.StreamObserver<com.hivearmor.service.grpc.AuthResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getRegisterAgentMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void updateAgent(com.hivearmor.service.grpc.AgentRequest request,
        io.grpc.stub.StreamObserver<com.hivearmor.service.grpc.AuthResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getUpdateAgentMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void deleteAgent(com.hivearmor.service.grpc.DeleteRequest request,
        io.grpc.stub.StreamObserver<com.hivearmor.service.grpc.AuthResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getDeleteAgentMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void listAgents(com.hivearmor.service.grpc.ListRequest request,
        io.grpc.stub.StreamObserver<com.hivearmor.service.grpc.ListAgentsResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListAgentsMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public io.grpc.stub.StreamObserver<com.hivearmor.service.grpc.BidirectionalStream> agentStream(
        io.grpc.stub.StreamObserver<com.hivearmor.service.grpc.BidirectionalStream> responseObserver) {
      return io.grpc.stub.ClientCalls.asyncBidiStreamingCall(
          getChannel().newCall(getAgentStreamMethod(), getCallOptions()), responseObserver);
    }

    /**
     */
    public void listAgentCommands(com.hivearmor.service.grpc.ListRequest request,
        io.grpc.stub.StreamObserver<com.hivearmor.service.grpc.ListAgentsCommandsResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListAgentCommandsMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void createEnrollmentToken(com.hivearmor.service.grpc.CreateEnrollmentTokenRequest request,
        io.grpc.stub.StreamObserver<com.hivearmor.service.grpc.CreateEnrollmentTokenResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getCreateEnrollmentTokenMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void listEnrollmentTokens(com.hivearmor.service.grpc.ListEnrollmentTokensRequest request,
        io.grpc.stub.StreamObserver<com.hivearmor.service.grpc.ListEnrollmentTokensResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListEnrollmentTokensMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void revokeEnrollmentToken(com.hivearmor.service.grpc.RevokeEnrollmentTokenRequest request,
        io.grpc.stub.StreamObserver<com.hivearmor.service.grpc.EnrollmentToken> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getRevokeEnrollmentTokenMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void rotateAgentCredential(com.hivearmor.service.grpc.AgentCredentialRequest request,
        io.grpc.stub.StreamObserver<com.hivearmor.service.grpc.AgentCredentialResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getRotateAgentCredentialMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void revokeAgentCredential(com.hivearmor.service.grpc.AgentCredentialRequest request,
        io.grpc.stub.StreamObserver<com.hivearmor.service.grpc.AgentCredentialResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getRevokeAgentCredentialMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void listEnrollmentAuditEvents(com.hivearmor.service.grpc.ListEnrollmentAuditEventsRequest request,
        io.grpc.stub.StreamObserver<com.hivearmor.service.grpc.ListEnrollmentAuditEventsResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListEnrollmentAuditEventsMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void verifyConnectorIdentity(com.hivearmor.service.grpc.VerifyConnectorIdentityRequest request,
        io.grpc.stub.StreamObserver<com.hivearmor.service.grpc.VerifyConnectorIdentityResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getVerifyConnectorIdentityMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void listConnectorAuthorization(com.hivearmor.service.grpc.ListConnectorAuthorizationRequest request,
        io.grpc.stub.StreamObserver<com.hivearmor.service.grpc.ListConnectorAuthorizationResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListConnectorAuthorizationMethod(), getCallOptions()), request, responseObserver);
    }
  }

  /**
   * A stub to allow clients to do synchronous rpc calls to service AgentService.
   */
  public static final class AgentServiceBlockingStub
      extends io.grpc.stub.AbstractBlockingStub<AgentServiceBlockingStub> {
    private AgentServiceBlockingStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected AgentServiceBlockingStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new AgentServiceBlockingStub(channel, callOptions);
    }

    /**
     */
    public com.hivearmor.service.grpc.AuthResponse registerAgent(com.hivearmor.service.grpc.AgentRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getRegisterAgentMethod(), getCallOptions(), request);
    }

    /**
     */
    public com.hivearmor.service.grpc.AuthResponse updateAgent(com.hivearmor.service.grpc.AgentRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getUpdateAgentMethod(), getCallOptions(), request);
    }

    /**
     */
    public com.hivearmor.service.grpc.AuthResponse deleteAgent(com.hivearmor.service.grpc.DeleteRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getDeleteAgentMethod(), getCallOptions(), request);
    }

    /**
     */
    public com.hivearmor.service.grpc.ListAgentsResponse listAgents(com.hivearmor.service.grpc.ListRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListAgentsMethod(), getCallOptions(), request);
    }

    /**
     */
    public com.hivearmor.service.grpc.ListAgentsCommandsResponse listAgentCommands(com.hivearmor.service.grpc.ListRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListAgentCommandsMethod(), getCallOptions(), request);
    }

    /**
     */
    public com.hivearmor.service.grpc.CreateEnrollmentTokenResponse createEnrollmentToken(com.hivearmor.service.grpc.CreateEnrollmentTokenRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getCreateEnrollmentTokenMethod(), getCallOptions(), request);
    }

    /**
     */
    public com.hivearmor.service.grpc.ListEnrollmentTokensResponse listEnrollmentTokens(com.hivearmor.service.grpc.ListEnrollmentTokensRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListEnrollmentTokensMethod(), getCallOptions(), request);
    }

    /**
     */
    public com.hivearmor.service.grpc.EnrollmentToken revokeEnrollmentToken(com.hivearmor.service.grpc.RevokeEnrollmentTokenRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getRevokeEnrollmentTokenMethod(), getCallOptions(), request);
    }

    /**
     */
    public com.hivearmor.service.grpc.AgentCredentialResponse rotateAgentCredential(com.hivearmor.service.grpc.AgentCredentialRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getRotateAgentCredentialMethod(), getCallOptions(), request);
    }

    /**
     */
    public com.hivearmor.service.grpc.AgentCredentialResponse revokeAgentCredential(com.hivearmor.service.grpc.AgentCredentialRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getRevokeAgentCredentialMethod(), getCallOptions(), request);
    }

    /**
     */
    public com.hivearmor.service.grpc.ListEnrollmentAuditEventsResponse listEnrollmentAuditEvents(com.hivearmor.service.grpc.ListEnrollmentAuditEventsRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListEnrollmentAuditEventsMethod(), getCallOptions(), request);
    }

    /**
     */
    public com.hivearmor.service.grpc.VerifyConnectorIdentityResponse verifyConnectorIdentity(com.hivearmor.service.grpc.VerifyConnectorIdentityRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getVerifyConnectorIdentityMethod(), getCallOptions(), request);
    }

    /**
     */
    public com.hivearmor.service.grpc.ListConnectorAuthorizationResponse listConnectorAuthorization(com.hivearmor.service.grpc.ListConnectorAuthorizationRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListConnectorAuthorizationMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do ListenableFuture-style rpc calls to service AgentService.
   */
  public static final class AgentServiceFutureStub
      extends io.grpc.stub.AbstractFutureStub<AgentServiceFutureStub> {
    private AgentServiceFutureStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected AgentServiceFutureStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new AgentServiceFutureStub(channel, callOptions);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hivearmor.service.grpc.AuthResponse> registerAgent(
        com.hivearmor.service.grpc.AgentRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getRegisterAgentMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hivearmor.service.grpc.AuthResponse> updateAgent(
        com.hivearmor.service.grpc.AgentRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getUpdateAgentMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hivearmor.service.grpc.AuthResponse> deleteAgent(
        com.hivearmor.service.grpc.DeleteRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getDeleteAgentMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hivearmor.service.grpc.ListAgentsResponse> listAgents(
        com.hivearmor.service.grpc.ListRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListAgentsMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hivearmor.service.grpc.ListAgentsCommandsResponse> listAgentCommands(
        com.hivearmor.service.grpc.ListRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListAgentCommandsMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hivearmor.service.grpc.CreateEnrollmentTokenResponse> createEnrollmentToken(
        com.hivearmor.service.grpc.CreateEnrollmentTokenRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getCreateEnrollmentTokenMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hivearmor.service.grpc.ListEnrollmentTokensResponse> listEnrollmentTokens(
        com.hivearmor.service.grpc.ListEnrollmentTokensRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListEnrollmentTokensMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hivearmor.service.grpc.EnrollmentToken> revokeEnrollmentToken(
        com.hivearmor.service.grpc.RevokeEnrollmentTokenRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getRevokeEnrollmentTokenMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hivearmor.service.grpc.AgentCredentialResponse> rotateAgentCredential(
        com.hivearmor.service.grpc.AgentCredentialRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getRotateAgentCredentialMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hivearmor.service.grpc.AgentCredentialResponse> revokeAgentCredential(
        com.hivearmor.service.grpc.AgentCredentialRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getRevokeAgentCredentialMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hivearmor.service.grpc.ListEnrollmentAuditEventsResponse> listEnrollmentAuditEvents(
        com.hivearmor.service.grpc.ListEnrollmentAuditEventsRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListEnrollmentAuditEventsMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hivearmor.service.grpc.VerifyConnectorIdentityResponse> verifyConnectorIdentity(
        com.hivearmor.service.grpc.VerifyConnectorIdentityRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getVerifyConnectorIdentityMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hivearmor.service.grpc.ListConnectorAuthorizationResponse> listConnectorAuthorization(
        com.hivearmor.service.grpc.ListConnectorAuthorizationRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListConnectorAuthorizationMethod(), getCallOptions()), request);
    }
  }

  private static final int METHODID_REGISTER_AGENT = 0;
  private static final int METHODID_UPDATE_AGENT = 1;
  private static final int METHODID_DELETE_AGENT = 2;
  private static final int METHODID_LIST_AGENTS = 3;
  private static final int METHODID_LIST_AGENT_COMMANDS = 4;
  private static final int METHODID_CREATE_ENROLLMENT_TOKEN = 5;
  private static final int METHODID_LIST_ENROLLMENT_TOKENS = 6;
  private static final int METHODID_REVOKE_ENROLLMENT_TOKEN = 7;
  private static final int METHODID_ROTATE_AGENT_CREDENTIAL = 8;
  private static final int METHODID_REVOKE_AGENT_CREDENTIAL = 9;
  private static final int METHODID_LIST_ENROLLMENT_AUDIT_EVENTS = 10;
  private static final int METHODID_VERIFY_CONNECTOR_IDENTITY = 11;
  private static final int METHODID_LIST_CONNECTOR_AUTHORIZATION = 12;
  private static final int METHODID_AGENT_STREAM = 13;

  private static final class MethodHandlers<Req, Resp> implements
      io.grpc.stub.ServerCalls.UnaryMethod<Req, Resp>,
      io.grpc.stub.ServerCalls.ServerStreamingMethod<Req, Resp>,
      io.grpc.stub.ServerCalls.ClientStreamingMethod<Req, Resp>,
      io.grpc.stub.ServerCalls.BidiStreamingMethod<Req, Resp> {
    private final AsyncService serviceImpl;
    private final int methodId;

    MethodHandlers(AsyncService serviceImpl, int methodId) {
      this.serviceImpl = serviceImpl;
      this.methodId = methodId;
    }

    @java.lang.Override
    @java.lang.SuppressWarnings("unchecked")
    public void invoke(Req request, io.grpc.stub.StreamObserver<Resp> responseObserver) {
      switch (methodId) {
        case METHODID_REGISTER_AGENT:
          serviceImpl.registerAgent((com.hivearmor.service.grpc.AgentRequest) request,
              (io.grpc.stub.StreamObserver<com.hivearmor.service.grpc.AuthResponse>) responseObserver);
          break;
        case METHODID_UPDATE_AGENT:
          serviceImpl.updateAgent((com.hivearmor.service.grpc.AgentRequest) request,
              (io.grpc.stub.StreamObserver<com.hivearmor.service.grpc.AuthResponse>) responseObserver);
          break;
        case METHODID_DELETE_AGENT:
          serviceImpl.deleteAgent((com.hivearmor.service.grpc.DeleteRequest) request,
              (io.grpc.stub.StreamObserver<com.hivearmor.service.grpc.AuthResponse>) responseObserver);
          break;
        case METHODID_LIST_AGENTS:
          serviceImpl.listAgents((com.hivearmor.service.grpc.ListRequest) request,
              (io.grpc.stub.StreamObserver<com.hivearmor.service.grpc.ListAgentsResponse>) responseObserver);
          break;
        case METHODID_LIST_AGENT_COMMANDS:
          serviceImpl.listAgentCommands((com.hivearmor.service.grpc.ListRequest) request,
              (io.grpc.stub.StreamObserver<com.hivearmor.service.grpc.ListAgentsCommandsResponse>) responseObserver);
          break;
        case METHODID_CREATE_ENROLLMENT_TOKEN:
          serviceImpl.createEnrollmentToken((com.hivearmor.service.grpc.CreateEnrollmentTokenRequest) request,
              (io.grpc.stub.StreamObserver<com.hivearmor.service.grpc.CreateEnrollmentTokenResponse>) responseObserver);
          break;
        case METHODID_LIST_ENROLLMENT_TOKENS:
          serviceImpl.listEnrollmentTokens((com.hivearmor.service.grpc.ListEnrollmentTokensRequest) request,
              (io.grpc.stub.StreamObserver<com.hivearmor.service.grpc.ListEnrollmentTokensResponse>) responseObserver);
          break;
        case METHODID_REVOKE_ENROLLMENT_TOKEN:
          serviceImpl.revokeEnrollmentToken((com.hivearmor.service.grpc.RevokeEnrollmentTokenRequest) request,
              (io.grpc.stub.StreamObserver<com.hivearmor.service.grpc.EnrollmentToken>) responseObserver);
          break;
        case METHODID_ROTATE_AGENT_CREDENTIAL:
          serviceImpl.rotateAgentCredential((com.hivearmor.service.grpc.AgentCredentialRequest) request,
              (io.grpc.stub.StreamObserver<com.hivearmor.service.grpc.AgentCredentialResponse>) responseObserver);
          break;
        case METHODID_REVOKE_AGENT_CREDENTIAL:
          serviceImpl.revokeAgentCredential((com.hivearmor.service.grpc.AgentCredentialRequest) request,
              (io.grpc.stub.StreamObserver<com.hivearmor.service.grpc.AgentCredentialResponse>) responseObserver);
          break;
        case METHODID_LIST_ENROLLMENT_AUDIT_EVENTS:
          serviceImpl.listEnrollmentAuditEvents((com.hivearmor.service.grpc.ListEnrollmentAuditEventsRequest) request,
              (io.grpc.stub.StreamObserver<com.hivearmor.service.grpc.ListEnrollmentAuditEventsResponse>) responseObserver);
          break;
        case METHODID_VERIFY_CONNECTOR_IDENTITY:
          serviceImpl.verifyConnectorIdentity((com.hivearmor.service.grpc.VerifyConnectorIdentityRequest) request,
              (io.grpc.stub.StreamObserver<com.hivearmor.service.grpc.VerifyConnectorIdentityResponse>) responseObserver);
          break;
        case METHODID_LIST_CONNECTOR_AUTHORIZATION:
          serviceImpl.listConnectorAuthorization((com.hivearmor.service.grpc.ListConnectorAuthorizationRequest) request,
              (io.grpc.stub.StreamObserver<com.hivearmor.service.grpc.ListConnectorAuthorizationResponse>) responseObserver);
          break;
        default:
          throw new AssertionError();
      }
    }

    @java.lang.Override
    @java.lang.SuppressWarnings("unchecked")
    public io.grpc.stub.StreamObserver<Req> invoke(
        io.grpc.stub.StreamObserver<Resp> responseObserver) {
      switch (methodId) {
        case METHODID_AGENT_STREAM:
          return (io.grpc.stub.StreamObserver<Req>) serviceImpl.agentStream(
              (io.grpc.stub.StreamObserver<com.hivearmor.service.grpc.BidirectionalStream>) responseObserver);
        default:
          throw new AssertionError();
      }
    }
  }

  public static final io.grpc.ServerServiceDefinition bindService(AsyncService service) {
    return io.grpc.ServerServiceDefinition.builder(getServiceDescriptor())
        .addMethod(
          getRegisterAgentMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hivearmor.service.grpc.AgentRequest,
              com.hivearmor.service.grpc.AuthResponse>(
                service, METHODID_REGISTER_AGENT)))
        .addMethod(
          getUpdateAgentMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hivearmor.service.grpc.AgentRequest,
              com.hivearmor.service.grpc.AuthResponse>(
                service, METHODID_UPDATE_AGENT)))
        .addMethod(
          getDeleteAgentMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hivearmor.service.grpc.DeleteRequest,
              com.hivearmor.service.grpc.AuthResponse>(
                service, METHODID_DELETE_AGENT)))
        .addMethod(
          getListAgentsMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hivearmor.service.grpc.ListRequest,
              com.hivearmor.service.grpc.ListAgentsResponse>(
                service, METHODID_LIST_AGENTS)))
        .addMethod(
          getAgentStreamMethod(),
          io.grpc.stub.ServerCalls.asyncBidiStreamingCall(
            new MethodHandlers<
              com.hivearmor.service.grpc.BidirectionalStream,
              com.hivearmor.service.grpc.BidirectionalStream>(
                service, METHODID_AGENT_STREAM)))
        .addMethod(
          getListAgentCommandsMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hivearmor.service.grpc.ListRequest,
              com.hivearmor.service.grpc.ListAgentsCommandsResponse>(
                service, METHODID_LIST_AGENT_COMMANDS)))
        .addMethod(
          getCreateEnrollmentTokenMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hivearmor.service.grpc.CreateEnrollmentTokenRequest,
              com.hivearmor.service.grpc.CreateEnrollmentTokenResponse>(
                service, METHODID_CREATE_ENROLLMENT_TOKEN)))
        .addMethod(
          getListEnrollmentTokensMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hivearmor.service.grpc.ListEnrollmentTokensRequest,
              com.hivearmor.service.grpc.ListEnrollmentTokensResponse>(
                service, METHODID_LIST_ENROLLMENT_TOKENS)))
        .addMethod(
          getRevokeEnrollmentTokenMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hivearmor.service.grpc.RevokeEnrollmentTokenRequest,
              com.hivearmor.service.grpc.EnrollmentToken>(
                service, METHODID_REVOKE_ENROLLMENT_TOKEN)))
        .addMethod(
          getRotateAgentCredentialMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hivearmor.service.grpc.AgentCredentialRequest,
              com.hivearmor.service.grpc.AgentCredentialResponse>(
                service, METHODID_ROTATE_AGENT_CREDENTIAL)))
        .addMethod(
          getRevokeAgentCredentialMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hivearmor.service.grpc.AgentCredentialRequest,
              com.hivearmor.service.grpc.AgentCredentialResponse>(
                service, METHODID_REVOKE_AGENT_CREDENTIAL)))
        .addMethod(
          getListEnrollmentAuditEventsMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hivearmor.service.grpc.ListEnrollmentAuditEventsRequest,
              com.hivearmor.service.grpc.ListEnrollmentAuditEventsResponse>(
                service, METHODID_LIST_ENROLLMENT_AUDIT_EVENTS)))
        .addMethod(
          getVerifyConnectorIdentityMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hivearmor.service.grpc.VerifyConnectorIdentityRequest,
              com.hivearmor.service.grpc.VerifyConnectorIdentityResponse>(
                service, METHODID_VERIFY_CONNECTOR_IDENTITY)))
        .addMethod(
          getListConnectorAuthorizationMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hivearmor.service.grpc.ListConnectorAuthorizationRequest,
              com.hivearmor.service.grpc.ListConnectorAuthorizationResponse>(
                service, METHODID_LIST_CONNECTOR_AUTHORIZATION)))
        .build();
  }

  private static abstract class AgentServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoFileDescriptorSupplier, io.grpc.protobuf.ProtoServiceDescriptorSupplier {
    AgentServiceBaseDescriptorSupplier() {}

    @java.lang.Override
    public com.google.protobuf.Descriptors.FileDescriptor getFileDescriptor() {
      return com.hivearmor.service.grpc.AgentManagerGrpc.getDescriptor();
    }

    @java.lang.Override
    public com.google.protobuf.Descriptors.ServiceDescriptor getServiceDescriptor() {
      return getFileDescriptor().findServiceByName("AgentService");
    }
  }

  private static final class AgentServiceFileDescriptorSupplier
      extends AgentServiceBaseDescriptorSupplier {
    AgentServiceFileDescriptorSupplier() {}
  }

  private static final class AgentServiceMethodDescriptorSupplier
      extends AgentServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoMethodDescriptorSupplier {
    private final java.lang.String methodName;

    AgentServiceMethodDescriptorSupplier(java.lang.String methodName) {
      this.methodName = methodName;
    }

    @java.lang.Override
    public com.google.protobuf.Descriptors.MethodDescriptor getMethodDescriptor() {
      return getServiceDescriptor().findMethodByName(methodName);
    }
  }

  private static volatile io.grpc.ServiceDescriptor serviceDescriptor;

  public static io.grpc.ServiceDescriptor getServiceDescriptor() {
    io.grpc.ServiceDescriptor result = serviceDescriptor;
    if (result == null) {
      synchronized (AgentServiceGrpc.class) {
        result = serviceDescriptor;
        if (result == null) {
          serviceDescriptor = result = io.grpc.ServiceDescriptor.newBuilder(SERVICE_NAME)
              .setSchemaDescriptor(new AgentServiceFileDescriptorSupplier())
              .addMethod(getRegisterAgentMethod())
              .addMethod(getUpdateAgentMethod())
              .addMethod(getDeleteAgentMethod())
              .addMethod(getListAgentsMethod())
              .addMethod(getAgentStreamMethod())
              .addMethod(getListAgentCommandsMethod())
              .addMethod(getCreateEnrollmentTokenMethod())
              .addMethod(getListEnrollmentTokensMethod())
              .addMethod(getRevokeEnrollmentTokenMethod())
              .addMethod(getRotateAgentCredentialMethod())
              .addMethod(getRevokeAgentCredentialMethod())
              .addMethod(getListEnrollmentAuditEventsMethod())
              .addMethod(getVerifyConnectorIdentityMethod())
              .addMethod(getListConnectorAuthorizationMethod())
              .build();
        }
      }
    }
    return result;
  }
}
