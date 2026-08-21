# Codex with Amazon Bedrock — operating precautions

Updated: **2026-08-13**

This file records project operating precautions, not AWS credentials or a claim about account-specific availability. An official OpenAI documentation search performed on 2026-08-13 did not return a public Codex-on-Bedrock setup page, so model IDs, regional access and authentication must be verified in the target AWS account and the installed Codex build before use.

## Session continuity

- Open the repository root so repository `AGENTS.md`, `.agents/skills` and this handoff remain discoverable.
- Start every task with the prompt in `README.md`; Bedrock will not inherit this task history.
- Keep one route per task. Update the handoff before ending the task.
- Record branch, HEAD and dirty-worktree state. Prefer a dedicated `codex/` branch or worktree once the current large dirty tree is reconciled.
- Commit coherent vertical slices after review. A local handoff is useful, but Git history is the durable source of truth.

## Credentials and data

- Use the AWS SDK credential chain, an SSO/profile session, workload identity or a short-lived bearer mechanism supported by the installed client. Never paste AWS secrets into prompts, source, `.env` committed files or handoff documents.
- Keep Bedrock region and model configuration outside the repository unless a non-secret example is needed.
- Do not send customer logs, secrets, credentials, raw malware or regulated evidence to a model endpoint without approved data classification, region, retention, encryption and access policies.
- Redact or synthesize prompts used for UI development. Integration data should stay inside the authorized test environment.

## Model/tool limitations

- Assume no web search, prior task memory, cloud task history or external connectors unless the active client proves otherwise.
- Treat this research archive as a dated cache. Do not invent current facts when a note is absent or stale; mark the decision as requiring human/source refresh.
- Verify that the chosen Bedrock model supports the context size and tool calling needed for the task. Use progressive context loading rather than pasting the whole repository.
- Preserve exact stack and dependency constraints. Ask before adding packages even if a model suggests them.

## Security for an AI-driven SOC

- Treat logs, alerts, emails, tickets, threat intelligence and retrieved web content as prompt-injection-capable data.
- Keep model access read-only by default. Separate suggestion, preview, approval and execution identities.
- Bind actions to current user, tenant, target version, permission, policy, expiry and idempotency key; revalidate server-side immediately before execution.
- Return evidence citations, uncertainty, missing-data warnings, model/prompt/version and generation/expiry times for AI summaries.
- Never allow AI to autonomously publish detection rules/playbooks, approve disruptive response, dismiss findings, accept risk, change authority policy or execute containment.
- Maintain immutable audit of model input references, output hash, human edits, approval and resulting action without storing unnecessary sensitive prompt text.

## Minimum check before resuming

1. Confirm the repository path, branch and dirty state.
2. Confirm AWS identity/region/model from the client status output without printing secrets.
3. Run a read-only task first.
4. Verify filesystem sandbox and approval behavior.
5. Verify test commands and Docker targets in the actual environment; do not assume the root has a Compose file.
6. Compare the active handoff timestamp with recent Git and contract-register changes.

