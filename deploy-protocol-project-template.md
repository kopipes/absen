# Deploy Protocol Project Template (Fill Per Repository)

Use this file as a project-specific override/config for the reusable core protocol.

## A) Project Identity (Must Fill)

- project_name: crew management
- repository_name: kopipes/absen
- remote_url: https://github.com/kopipes/absen.git
- production_branch: master
- default_base_branch: master

## B) Deployment Target Identity (Must Fill)

- ssh_target: root@72.62.124.109
- ssh_port: 22
- app_directory: /opt/crew-management
- runtime_user: root
- environment_name: production

## C) Process Commands (Must Fill)

- deploy_fetch_command: git fetch --all --prune
- deploy_checkout_command: git checkout master
- deploy_reset_command: git reset --hard origin/master
- dependency_install_command: npm ci
- build_command: npm run build
- restart_command_or_service: pm2 restart crew-api
- status_check_command: pm2 describe crew-api

## D) Database Settings (Must Fill)

- db_engine: sqlite
- db_identifier: /opt/crew-management/apps/api/data/dev.db
- backup_command: sqlite3 /opt/crew-management/apps/api/data/dev.db ".backup '/opt/crew-management/apps/api/backups/crew-backup-$(date +%Y%m%d-%H%M%S).db'"
- backup_output_directory: /opt/crew-management/apps/api/backups
- backup_filename_pattern: crew-backup-YYYYmmdd-HHMMSS.db
- backup_integrity_check_command: ls -1t /opt/crew-management/apps/api/backups/crew-backup-*.db | head -n 1 | xargs -I {} test -s {}
- restore_command: sqlite3 /opt/crew-management/apps/api/data/dev.db ".restore /opt/crew-management/apps/api/backups/<backup-file>.db"

## E) Migration Settings (Must Fill)

- migration_strategy: additive-by-default
- migration_command: not-configured (hard stop if migration is required)
- migration_validation_command: not-configured
- destructive_migration_requires_explicit_approval: true

## F) Smoke Test Settings (Must Fill)

- base_url: https://absen.provaliantgroup.com
- critical_endpoints:
  - GET / 200 response contains html
  - GET /api/health 200 response contains {"status":"ok","database":"sqlite"}
- smoke_timeout_seconds: 30
- smoke_retry_policy: 3 retries with 5s interval

## G) Postdeploy Stamp (Must Fill)

- log_destination: /opt/crew-management/apps/api/backups/deploy-stamps.log
- stamp_fields:
  - timestamp_utc
  - deployed_commit
  - operator
  - target
  - backup_artifact
  - migration_status
  - smoke_status
  - rollback_status_if_any

## H) Identity Confirmation Checklist (Run-Time)

Before push/deploy, operator must confirm all:
- [ ] repository_name matches active repo
- [ ] remote_url matches intended GitHub target
- [ ] production_branch confirmed
- [ ] ssh_target confirmed
- [ ] app_directory confirmed
- [ ] restart_command_or_service confirmed

Runtime gate text (must be explicit):
- "CONFIRM DEPLOY"

If any item is unchecked or changed: STOP.

## I) Major-Change Confirmation Checklist (Run-Time)

Explicit approval required if any apply:
- [ ] Deploy order changed
- [ ] Migration strategy changed
- [ ] Backup/restore command or path changed
- [ ] Branch strategy changed
- [ ] Production config changed affecting availability/data integrity

Runtime gate text:
- "APPROVE MAJOR CHANGE: <description>"

Without explicit approval: STOP.

## J) Execution Runbook Skeleton

1. Identity gate confirmation
2. Preflight checks
3. Backup DB + verify artifact
4. Run additive migration (if exists)
5. Deploy code + restart
6. Smoke checks critical endpoints
7. Postdeploy stamp + final validation
8. If failure: rollback code + restore DB + smoke checks again
