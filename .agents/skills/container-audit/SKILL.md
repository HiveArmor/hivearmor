---
name: container-audit
description: Container security audit — Dockerfile best practices, Kubernetes manifest review (RBAC/PSS/NetworkPolicy), image scanning (Trivy/Grype), Falco runtime detection, etcd encryption. Triggered by "container security", "Dockerfile audit", "Kubernetes security", "RBAC review", "container hardening".
---

# Container Security Audit

Audits container images, Dockerfiles, and Kubernetes manifests across four domains.

## Dockerfile Audit

```dockerfile
# ❌ Floating tag — no reproducibility
FROM node:20

# ✅ Pinned digest — immutable
FROM node:20@sha256:abc123...

# ❌ Build-time secrets in ARG (end up in image layer history)
ARG DB_PASSWORD
RUN setup.sh --password=$DB_PASSWORD

# ✅ BuildKit secrets (never in layers)
RUN --mount=type=secret,id=db_password setup.sh --password=$(cat /run/secrets/db_password)

# ❌ Root user
USER root

# ✅ Non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser
```

### Dockerfile Checklist

- [ ] Base image pinned to digest hash
- [ ] Multi-stage build — no build tools in final image
- [ ] Non-root user in final stage
- [ ] No `--build-arg` for secrets (use BuildKit `--secret`)
- [ ] No `SUID` binaries in final image
- [ ] `HEALTHCHECK` instruction present

## Kubernetes Manifest Audit

### Pod Security Context

```yaml
# ✅ Hardened pod security context
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    fsGroup: 2000
    seccompProfile:
      type: RuntimeDefault
  containers:
  - name: app
    securityContext:
      allowPrivilegeEscalation: false
      readOnlyRootFilesystem: true
      capabilities:
        drop: ["ALL"]
        add: []  # only add if absolutely needed
```

### Host Namespace Checks

```bash
# Find pods sharing host namespaces (should all be false)
kubectl get pods -A -o json | jq '
  .items[] | select(
    .spec.hostNetwork == true or
    .spec.hostPID == true or
    .spec.hostIPC == true
  ) | {namespace: .metadata.namespace, name: .metadata.name}'
```

### RBAC Audit

```bash
# Find cluster-admin bindings (should be minimal)
kubectl get clusterrolebindings -o json | jq '
  .items[] | select(.roleRef.name == "cluster-admin") | 
  {name: .metadata.name, subjects: .subjects}'

# Find wildcard verb bindings
kubectl get clusterroles -o json | jq '
  .items[] | select(
    .rules[]? | (.verbs[]? == "*") or (.resources[]? == "*")
  ) | .metadata.name'
```

### NetworkPolicy

```yaml
# ✅ Default deny all — then allow only needed traffic
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
```

"Missing NetworkPolicy = every pod can talk to every other pod on every port."

### Secrets Management

```bash
# K8s Secrets are base64 — NOT encrypted at rest by default
# Enable etcd encryption
kubectl get secret -n kube-system | grep encryption-config

# Prefer projected volume mounts over env vars
# env vars leak via /proc/<pid>/environ
```

## Image Scanning

```bash
# Scan with Trivy
trivy image --severity HIGH,CRITICAL hivearmor/backend:latest

# Scan with Grype
grype hivearmor/backend:latest --fail-on high

# Scan Dockerfile
trivy config Dockerfile
```

## Runtime Detection (Falco)

```yaml
# Falco rule — detect exec in running container
- rule: Terminal shell in container
  desc: Alert on shell spawned in running container
  condition: >
    spawned_process and container
    and shell_procs and proc.tty != 0
    and container_entrypoint
  output: >
    Shell spawned (user=%user.name container=%container.name 
    image=%container.image.repository)
  priority: WARNING
```

## Read-Only Operations

This skill only performs `get`, `describe`, `auth can-i` operations — no modifications to clusters. Findings reported as Fixed / Deferred / Accepted Risk.
