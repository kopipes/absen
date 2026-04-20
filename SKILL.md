# Deployment Skill Standard

This skill provides a reusable team standard for commit, backup, push, and VPS deploy workflows across repositories.

## Files

- `deploy-protocol-core.md`: global, reusable, generic deployment protocol and gates.
- `deploy-protocol-project-template.md`: per-repository override template with placeholders.

## Design Principles

- Core protocol is generic and must not hardcode project-specific host/branch/path.
- Project values are defined in the project template only.
- Production source of truth is fixed:
  - Code from GitHub production branch.
  - Data from VPS production database.

## How to Use

1. Copy and fill `deploy-protocol-project-template.md` for the current repository.
2. Confirm all identity fields before any push/deploy action.
3. Execute deployment strictly in required order from core protocol.
4. Apply failure policy and rollback policy on any hard-stop event.
5. Create postdeploy stamp and validation records.

## Required Order (Non-Negotiable)

1. Mandatory identity confirmation gate
2. Preflight safety check
3. Backup DB
4. Additive migration (if any)
5. Deploy and restart app
6. Smoke check critical endpoints
7. Postdeploy stamp and validation

## Mandatory Identity Confirmation Gate

Must be explicit and complete before push/deploy:
- Repository name
- Remote URL
- Branch target
- SSH target user@host
- App directory in server
- Restart command or service name

Stop rules:
- If any field is unclear/incomplete: STOP.
- If target changes from earlier context: STOP and reconfirm all fields.
- Never assume same target as previous project.

## Failure Policy

Hard stop on:
- Backup failure
- Migration failure
- Smoke check failure
- Deploy hash mismatch

## Rollback Policy

On eligible failure:
1. Roll back code to previous commit.
2. Restore DB from pre-deploy backup.
3. Restart app/service.
4. Re-run smoke checks.

## Major-Change Explicit Approval

Require explicit operator approval before execution when changing:
- Deploy order
- Migration strategy
- Backup/restore command/path
- Branch strategy
- Production config affecting availability or data integrity

Without explicit approval: STOP.

## Commit/Backup/Push/Deploy Operational Pattern

1. Local commit flow:
   - Run local tests/checks
   - Commit with clear message
2. Push flow:
   - Identity confirmation gate
   - Push to confirmed remote/branch
3. Deploy flow:
   - Follow required order from core protocol
   - Enforce hard-stop and rollback policies
