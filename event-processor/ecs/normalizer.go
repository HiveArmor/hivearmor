package ecs

import "fmt"

// NormalizeWindowsEvent maps raw Windows event fields to ECS dot-notation keys.
// Every (k, v) from raw is preserved in the returned map; ECS keys are written on top.
// The input map is never mutated. The function cannot fail — missing source keys are
// silently skipped.
func NormalizeWindowsEvent(raw map[string]any) map[string]any {
	out := copyMap(raw)

	// EventID → event.code  (transform: fmt.Sprintf("%v", v))
	if v, ok := raw["EventID"]; ok {
		out["event.code"] = fmt.Sprintf("%v", v)
	}
	// TimeCreated → @timestamp
	if v, ok := raw["TimeCreated"]; ok {
		out["@timestamp"] = v
	}
	// Computer → host.name
	if v, ok := raw["Computer"]; ok {
		out["host.name"] = v
	}
	// CommandLine → process.command_line
	if v, ok := raw["CommandLine"]; ok {
		out["process.command_line"] = v
	}
	// Image → process.executable
	if v, ok := raw["Image"]; ok {
		out["process.executable"] = v
	}
	// ParentImage → process.parent.executable
	if v, ok := raw["ParentImage"]; ok {
		out["process.parent.executable"] = v
	}
	// ParentCommandLine → process.parent.command_line
	if v, ok := raw["ParentCommandLine"]; ok {
		out["process.parent.command_line"] = v
	}
	// ProcessId → process.pid
	if v, ok := raw["ProcessId"]; ok {
		out["process.pid"] = v
	}
	// ParentProcessId → process.parent.pid
	if v, ok := raw["ParentProcessId"]; ok {
		out["process.parent.pid"] = v
	}
	// SourceIp → source.ip  (may be overwritten by IpAddress below)
	if v, ok := raw["SourceIp"]; ok {
		out["source.ip"] = v
	}
	// IpAddress → source.ip  (overwrites SourceIp when both present)
	if v, ok := raw["IpAddress"]; ok {
		out["source.ip"] = v
	}
	// DestinationIp → destination.ip
	if v, ok := raw["DestinationIp"]; ok {
		out["destination.ip"] = v
	}
	// DestinationPort → destination.port
	if v, ok := raw["DestinationPort"]; ok {
		out["destination.port"] = v
	}
	// User → user.name  (may be overwritten by SubjectUserName below)
	if v, ok := raw["User"]; ok {
		out["user.name"] = v
	}
	// SubjectUserName → user.name  (overwrites User when both present)
	if v, ok := raw["SubjectUserName"]; ok {
		out["user.name"] = v
	}
	// TargetUserName → user.target.name
	if v, ok := raw["TargetUserName"]; ok {
		out["user.target.name"] = v
	}
	// SubjectDomainName → user.domain
	if v, ok := raw["SubjectDomainName"]; ok {
		out["user.domain"] = v
	}
	// LogonType → winlog.logon.type
	if v, ok := raw["LogonType"]; ok {
		out["winlog.logon.type"] = v
	}
	// Channel → winlog.channel
	if v, ok := raw["Channel"]; ok {
		out["winlog.channel"] = v
	}
	// TargetFilename → file.path
	if v, ok := raw["TargetFilename"]; ok {
		out["file.path"] = v
	}
	// QueryName → dns.question.name
	if v, ok := raw["QueryName"]; ok {
		out["dns.question.name"] = v
	}
	// TargetObject → registry.path
	if v, ok := raw["TargetObject"]; ok {
		out["registry.path"] = v
	}

	return out
}

// NormalizeLinuxEvent maps raw syslog/auditd fields to ECS dot-notation keys.
// Every (k, v) from raw is preserved in the returned map; ECS keys are written on top.
// The input map is never mutated. The function cannot fail — missing source keys are
// silently skipped.
func NormalizeLinuxEvent(raw map[string]any) map[string]any {
	out := copyMap(raw)

	// hostname → host.name
	if v, ok := raw["hostname"]; ok {
		out["host.name"] = v
	}
	// program → process.name  (may be overwritten by comm below)
	if v, ok := raw["program"]; ok {
		out["process.name"] = v
	}
	// pid → process.pid
	if v, ok := raw["pid"]; ok {
		out["process.pid"] = v
	}
	// uid → user.id
	if v, ok := raw["uid"]; ok {
		out["user.id"] = v
	}
	// gid → group.id
	if v, ok := raw["gid"]; ok {
		out["group.id"] = v
	}
	// auid → user.audit.id
	if v, ok := raw["auid"]; ok {
		out["user.audit.id"] = v
	}
	// comm → process.name  (overwrites program when both present)
	if v, ok := raw["comm"]; ok {
		out["process.name"] = v
	}
	// exe → process.executable
	if v, ok := raw["exe"]; ok {
		out["process.executable"] = v
	}
	// syscall → event.syscall
	if v, ok := raw["syscall"]; ok {
		out["event.syscall"] = v
	}
	// msg → message
	if v, ok := raw["msg"]; ok {
		out["message"] = v
	}
	// key → event.audit.key
	if v, ok := raw["key"]; ok {
		out["event.audit.key"] = v
	}
	// ppid → process.parent.pid
	if v, ok := raw["ppid"]; ok {
		out["process.parent.pid"] = v
	}

	return out
}

// copyMap returns a shallow copy of m. It is used to ensure normalizers never mutate
// the caller's input map.
func copyMap(m map[string]any) map[string]any {
	out := make(map[string]any, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}

// nestedGet traverses a map[string]any along the given path segments and returns
// the value at the deepest key. Returns (nil, false) if any segment is absent or
// if an intermediate value is not a map[string]any.
func nestedGet(m map[string]any, path ...string) (any, bool) {
	var cur any = m
	for _, seg := range path {
		cm, ok := cur.(map[string]any)
		if !ok {
			return nil, false
		}
		cur, ok = cm[seg]
		if !ok {
			return nil, false
		}
	}
	return cur, true
}

// NormalizeAWSEvent maps raw AWS CloudTrail fields to ECS dot-notation keys.
// Every (k, v) from raw is preserved in the returned map; ECS keys are written on top.
// The input map is never mutated. The function cannot fail — missing or non-resolvable
// source keys are silently skipped.
func NormalizeAWSEvent(raw map[string]any) map[string]any {
	out := copyMap(raw)

	// eventSource → event.provider
	if v, ok := raw["eventSource"]; ok {
		out["event.provider"] = v
	}
	// eventName → event.action
	if v, ok := raw["eventName"]; ok {
		out["event.action"] = v
	}
	// awsRegion → cloud.region
	if v, ok := raw["awsRegion"]; ok {
		out["cloud.region"] = v
	}
	// sourceIPAddress → source.ip
	if v, ok := raw["sourceIPAddress"]; ok {
		out["source.ip"] = v
	}
	// eventTime → @timestamp
	if v, ok := raw["eventTime"]; ok {
		out["@timestamp"] = v
	}
	// userAgent → user_agent.original
	if v, ok := raw["userAgent"]; ok {
		out["user_agent.original"] = v
	}
	// requestID → event.id
	if v, ok := raw["requestID"]; ok {
		out["event.id"] = v
	}
	// errorCode → event.outcome
	if v, ok := raw["errorCode"]; ok {
		out["event.outcome"] = v
	}
	// userIdentity.arn → user.id
	if v, ok := nestedGet(raw, "userIdentity", "arn"); ok {
		out["user.id"] = v
	}
	// userIdentity.type → user.type
	if v, ok := nestedGet(raw, "userIdentity", "type"); ok {
		out["user.type"] = v
	}
	// userIdentity.accountId → cloud.account.id
	if v, ok := nestedGet(raw, "userIdentity", "accountId"); ok {
		out["cloud.account.id"] = v
	}
	// userIdentity.userName → user.name
	if v, ok := nestedGet(raw, "userIdentity", "userName"); ok {
		out["user.name"] = v
	}

	return out
}

// NormalizeAzureEvent maps raw Azure Activity Log fields to ECS dot-notation keys.
// Every (k, v) from raw is preserved in the returned map; ECS keys are written on top.
// The input map is never mutated. The function cannot fail — missing source keys are
// silently skipped.
func NormalizeAzureEvent(raw map[string]any) map[string]any {
	out := copyMap(raw)

	// operationName → event.action
	if v, ok := raw["operationName"]; ok {
		out["event.action"] = v
	}
	// resourceType → azure.resource.type
	if v, ok := raw["resourceType"]; ok {
		out["azure.resource.type"] = v
	}
	// resourceGroup → azure.resource.group
	if v, ok := raw["resourceGroup"]; ok {
		out["azure.resource.group"] = v
	}
	// subscriptionId → cloud.account.id
	if v, ok := raw["subscriptionId"]; ok {
		out["cloud.account.id"] = v
	}
	// resourceId → azure.resource.id
	if v, ok := raw["resourceId"]; ok {
		out["azure.resource.id"] = v
	}
	// resultType → event.outcome
	if v, ok := raw["resultType"]; ok {
		out["event.outcome"] = v
	}
	// eventTimestamp → @timestamp
	if v, ok := raw["eventTimestamp"]; ok {
		out["@timestamp"] = v
	}
	// correlationId → event.id
	if v, ok := raw["correlationId"]; ok {
		out["event.id"] = v
	}
	// caller → dual write to user.name AND user.id
	if v, ok := raw["caller"]; ok {
		out["user.name"] = v
		out["user.id"] = v
	}

	return out
}

// NormalizeGCPEvent maps raw GCP Audit Log fields to ECS dot-notation keys.
// Every (k, v) from raw is preserved in the returned map; ECS keys are written on top.
// The input map is never mutated. The function cannot fail — missing or non-resolvable
// source keys are silently skipped.
func NormalizeGCPEvent(raw map[string]any) map[string]any {
	out := copyMap(raw)

	// serviceName → event.provider
	if v, ok := raw["serviceName"]; ok {
		out["event.provider"] = v
	}
	// methodName → event.action
	if v, ok := raw["methodName"]; ok {
		out["event.action"] = v
	}
	// timestamp → @timestamp
	if v, ok := raw["timestamp"]; ok {
		out["@timestamp"] = v
	}
	// severity → log.level
	if v, ok := raw["severity"]; ok {
		out["log.level"] = v
	}
	// protoPayload.authenticationInfo.principalEmail → dual write to user.email AND user.name
	if v, ok := nestedGet(raw, "protoPayload", "authenticationInfo", "principalEmail"); ok {
		out["user.email"] = v
		out["user.name"] = v
	}
	// protoPayload.requestMetadata.callerIp → source.ip
	if v, ok := nestedGet(raw, "protoPayload", "requestMetadata", "callerIp"); ok {
		out["source.ip"] = v
	}
	// resource.type → cloud.service.name
	if v, ok := nestedGet(raw, "resource", "type"); ok {
		out["cloud.service.name"] = v
	}
	// resource.labels.project_id → cloud.account.id
	if v, ok := nestedGet(raw, "resource", "labels", "project_id"); ok {
		out["cloud.account.id"] = v
	}

	return out
}
