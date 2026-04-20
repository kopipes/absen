# Deploy Protocol Core (Reusable)

Purpose: reusable production deployment protocol that can be applied across repositories without hardcoded environment details.

## 1) Mandatory Identity Confirmation Gate (Hard Stop)

Do not run push/deploy commands before all identity fields are explicitly confirmed.

Required identity fields:
- Repository name
- Remote URL
- Target branch
- SSH target (`user@host`)
- Application directory on server
- Restart command or service name

Decision rules:
- If one or more fields are missing or ambiguous: STOP.
- If any target field changes from previously confirmed context in the same session: STOP and request reconfirmation of all identity fields.
- Never assume the target is the same as a previous project/repository.

Suggested confirmation block:
- Repo: <repo-name>
- Remote: <remote-url>
- Branch: <branch>
- SSH: <user@host>
- App dir: <server-path>
- Restart: <restart-command-or-service>
- Operator explicit approval: "CONFIRM DEPLOY"

## 2) Required Deployment Order

Always execute in this order:
1. Mandatory identity confirmation gate
2. Preflight safety check
3. Backup DB
4. Additive migration (if any)
5. Deploy and restart app
6. Smoke check critical endpoints
7. Postdeploy stamp and validation

## 3) Preflight Safety Check

Minimum checks:
- Local repo clean enough for deploy flow (no unintended uncommitted changes for release artifacts).
- Branch is exactly target branch.
- Current local HEAD is known and will be compared after deploy.
- Remote reachable.
- SSH connectivity to target host works.
- Server app directory exists and is writable by deploy user.
- Required runtime/tooling available on server.

If any preflight check fails: STOP.

## 4) Backup DB (Mandatory)

Requirements:
- Must run before migration/deploy steps that can affect data/state.
- Backup artifact must include timestamp and unique identifier.
- Backup must be stored in a restore-accessible location.
- Backup integrity check must run (at minimum: file exists and non-zero size).

Failure policy:
- If backup fails or integrity check fails: STOP.

## 5) Migration Policy (Additive Only by Default)

Rules:
- Prefer additive, backward-compatible migration strategy.
- Non-additive/destructive migrations require explicit major-change confirmation before execution.
- Migrations must be versioned and logged.

Failure policy:
- If migration fails: STOP.
- Do not continue to restart/smoke steps on migration failure.

## 6) Deploy and Restart

Requirements:
- Deploy from GitHub source of truth for production branch.
- Validate deployed commit hash equals expected commit hash.
- Run restart command/service as confirmed in identity gate.
- Wait for app to be healthy enough for smoke checks.

Failure policy:
- If deploy hash mismatch occurs: STOP.
- If restart fails: STOP.

## 7) Smoke Check Critical Endpoints

Requirements:
- Run smoke checks against agreed critical endpoints.
- Validate expected status codes and minimal response content.

Failure policy:
- If any critical smoke check fails: STOP and trigger rollback policy.

## 8) Postdeploy Stamp and Validation

Record at minimum:
- Timestamp (UTC)
- Deployed commit hash
- Operator identity
- Target host + app directory
- Backup artifact name/path
- Migration result
- Smoke check result summary

Validation:
- Confirm deployed commit hash on server matches expected hash.
- Confirm app reports healthy state after restart.

## 9) Failure Policy (Global)

Hard-stop conditions:
- Identity confirmation incomplete/changed without reconfirmation
- Backup failure
- Migration failure
- Smoke check failure
- Deploy hash mismatch

When hard-stop triggers:
- Do not continue remaining steps.
- Log exact failing step and error summary.
- Decide rollback applicability and execute rollback if needed.

## 10) Rollback Policy

Rollback sequence:
1. Roll back code to previous known-good commit.
2. Restore DB using pre-deploy backup artifact.
3. Restart app/service.
4. Re-run smoke checks.
5. Record rollback stamp (reason, commit, backup used, result).

## 11) Major-Change Explicit Confirmation Gate

Require explicit confirmation before execution for any of:
- Deploy order changes
- Migration strategy changes
- Backup/restore command or path changes
- Branch strategy changes
- Production config changes that impact availability or data integrity

Suggested approval text:
- "APPROVE MAJOR CHANGE: <short description>"

Without explicit approval: STOP.

## 12) Source of Truth Rules

Production source of truth:
- Code: GitHub production branch
- Data: Production DB on VPS

Operational implications:
- Never promote local-only state as production truth.
- Never replace production DB without validated backup + approved restore intent.
