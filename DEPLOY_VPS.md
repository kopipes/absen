# Deploy to VPS (Current Production: PM2)

Current production runtime is PM2 on VPS.

Production domain:
- https://absen.provaliantgroup.com/

## 1) Identity Confirmation Gate (Mandatory)

Before push/deploy, confirm all values below:
- Repository: kopipes/absen
- Remote URL: https://github.com/kopipes/absen.git
- Branch: master
- SSH target: root@72.62.124.109
- App directory: /opt/crew-management
- Restart command: pm2 restart crew-api

If one value is missing or changes from previous context: STOP and reconfirm all values.

## 2) Preflight Safety Check

Local:

```bash
git fetch origin
git status -sb
git rev-parse --short HEAD
```

VPS:

```bash
ssh -i ~/.ssh/id_ed25519 root@72.62.124.109 "cd /opt/crew-management && pwd && node -v && npm -v && pm2 -v"
```

## 3) Backup DB (Mandatory)

Run backup on VPS before deploy:

```bash
ssh -i ~/.ssh/id_ed25519 root@72.62.124.109 "cd /opt/crew-management && mkdir -p apps/api/backups && sqlite3 apps/api/data/dev.db \".backup 'apps/api/backups/crew-backup-$(date +%Y%m%d-%H%M%S).db'\" && ls -1t apps/api/backups/crew-backup-*.db | head -n 1 | xargs -I {} test -s {} && echo BACKUP_OK"
```

If backup step fails: STOP.

## 4) Migration (Additive Only)

This project currently has no formal migration command.

Policy:
- Only additive schema changes are allowed by default.
- If migration is required and command is not defined: STOP.

## 5) Deploy and Restart App

Deploy from GitHub branch source of truth:

```bash
ssh -i ~/.ssh/id_ed25519 root@72.62.124.109 "cd /opt/crew-management && git fetch --all --prune && git checkout master && git reset --hard origin/master && npm ci && npm run build && pm2 restart crew-api"
```

Collect deployed hash:

```bash
ssh -i ~/.ssh/id_ed25519 root@72.62.124.109 "cd /opt/crew-management && git rev-parse --short HEAD"
```

If deployed hash does not match intended hash: STOP.

## 6) Smoke Check (Mandatory)

```bash
curl -i -s https://absen.provaliantgroup.com/
curl -i -s https://absen.provaliantgroup.com/api/health
```

Expected:
- Web returns HTTP 200
- API health returns HTTP 200 with JSON containing status ok and database sqlite

If smoke check fails: STOP and execute rollback.

## 7) Postdeploy Stamp and Validation

Store stamp on VPS:

```bash
ssh -i ~/.ssh/id_ed25519 root@72.62.124.109 "cd /opt/crew-management && printf '%s | commit=%s | operator=%s | target=%s | backup=%s | smoke=%s\n' \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\" \"$(git rev-parse --short HEAD 2>/dev/null || echo unknown)\" \"$USER\" \"root@72.62.124.109:/opt/crew-management\" \"latest-backup-in-apps/api/backups\" \"PASS\" >> apps/api/backups/deploy-stamps.log"
```

## Rollback Policy

If deploy fails after backup:
1. Roll back code to previous known-good commit.
2. Restore DB from pre-deploy backup artifact.
3. Restart PM2 app.
4. Re-run smoke checks.

## Major-Change Confirmation (Mandatory)

Require explicit confirmation before executing any of:
- Deploy order changes
- Migration strategy changes
- Backup/restore command or path changes
- Branch strategy changes
- Production config changes affecting availability or data integrity

Without explicit confirmation: STOP.

## Note on Docker Compose

Repository still includes Docker artifacts (`docker-compose.vps.yml`, Dockerfiles), but current production runtime is PM2. If switching runtime to Docker Compose, treat it as major change and require explicit approval.
