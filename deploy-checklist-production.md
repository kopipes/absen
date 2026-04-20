# Production Deploy Checklist (PM2 Runtime)

Use this checklist for each production deploy.

## A) Identity Gate (Must Pass)

- [ ] Repository name confirmed: kopipes/absen
- [ ] Remote URL confirmed: https://github.com/kopipes/absen.git
- [ ] Branch target confirmed: master
- [ ] SSH target confirmed: root@72.62.124.109
- [ ] App directory confirmed: /opt/crew-management
- [ ] Restart command confirmed: pm2 restart crew-api
- [ ] Explicit operator text provided: "CONFIRM DEPLOY"

If any item above fails: STOP.

## B) Preflight

- [ ] Local branch and state checked

```bash
git fetch origin
git status -sb
git rev-parse --short HEAD
```

- [ ] VPS connectivity and tools checked

```bash
ssh -i ~/.ssh/id_ed25519 root@72.62.124.109 "cd /opt/crew-management && pwd && node -v && npm -v && pm2 -v"
```

## C) Backup DB (Mandatory)

- [ ] Backup command executed successfully

```bash
ssh -i ~/.ssh/id_ed25519 root@72.62.124.109 "cd /opt/crew-management && mkdir -p apps/api/backups && sqlite3 apps/api/data/dev.db \".backup 'apps/api/backups/crew-backup-$(date +%Y%m%d-%H%M%S).db'\" && ls -1t apps/api/backups/crew-backup-*.db | head -n 1 | xargs -I {} test -s {} && echo BACKUP_OK"
```

If backup fails: STOP.

## D) Migration Gate

- [ ] Migration needed?
- [ ] If needed, additive-only confirmed?
- [ ] If migration strategy changed, explicit approval text provided:
  "APPROVE MAJOR CHANGE: <description>"

If migration required but command not defined: STOP.

## E) Deploy and Restart

- [ ] Deploy from GitHub source of truth and restart PM2

```bash
ssh -i ~/.ssh/id_ed25519 root@72.62.124.109 "cd /opt/crew-management && git fetch --all --prune && git checkout master && git reset --hard origin/master && npm ci && npm run build && pm2 restart crew-api"
```

- [ ] Collect deployed hash

```bash
ssh -i ~/.ssh/id_ed25519 root@72.62.124.109 "cd /opt/crew-management && git rev-parse --short HEAD"
```

- [ ] Deployed hash equals intended release hash

If hash mismatch: STOP.

## F) Smoke Check (Mandatory)

- [ ] Web smoke check

```bash
curl -i -s https://absen.provaliantgroup.com/
```

- [ ] API smoke check

```bash
curl -i -s https://absen.provaliantgroup.com/api/health
```

Expected:
- Web HTTP 200
- API HTTP 200 and body contains status ok + database sqlite

If smoke fails: STOP and run rollback.

## G) Postdeploy Stamp

- [ ] Stamp appended to VPS log

```bash
ssh -i ~/.ssh/id_ed25519 root@72.62.124.109 "cd /opt/crew-management && printf '%s | commit=%s | operator=%s | target=%s | backup=%s | smoke=%s\n' \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\" \"$(git rev-parse --short HEAD 2>/dev/null || echo unknown)\" \"$USER\" \"root@72.62.124.109:/opt/crew-management\" \"latest-backup-in-apps/api/backups\" \"PASS\" >> apps/api/backups/deploy-stamps.log"
```

## H) Rollback (If Required)

Execute in order:
1. Roll back code to previous known-good commit.
2. Restore DB from the pre-deploy backup.
3. Restart app with pm2 restart crew-api.
4. Re-run smoke checks.
5. Append rollback stamp to deploy-stamps.log.
