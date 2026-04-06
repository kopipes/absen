# Deploy to VPS

This project can run on a VPS with Docker Compose.

## 1) Install Docker on VPS

Use Docker Engine + Docker Compose plugin.

## 2) Upload project to VPS

Example with Git:

```bash
git clone <your-repo-url> crew-management
cd crew-management
```

## 3) Set environment values

Create `.env` from the provided example and set your public URL:

```bash
cp .env.vps.example .env
```

Edit `.env`:

```env
PUBLIC_WEB_URL=https://your-domain.com
```

If you only use IP temporarily:

```env
PUBLIC_WEB_URL=http://YOUR_VPS_IP
```

## 4) Build and run containers

```bash
docker compose -f docker-compose.vps.yml up -d --build
```

## 5) Check running services

```bash
docker compose -f docker-compose.vps.yml ps
docker compose -f docker-compose.vps.yml logs -f
```

## 6) Open app

- Web: `http://YOUR_VPS_IP`
- API health: `http://YOUR_VPS_IP/api/health`

## Update deployment

```bash
git pull
docker compose -f docker-compose.vps.yml up -d --build
```

## Notes

- SQLite database and uploads are persisted via mapped folders:
  - `apps/api/data`
  - `apps/api/uploads`
  - `apps/api/backups`
- For HTTPS, place this stack behind your TLS reverse proxy, or attach a domain and TLS at your edge layer.
