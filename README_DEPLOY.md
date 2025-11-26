Deployment notes
================

This repository includes a small Node/Express API (`server.js`) and a Vite/Vue frontend.

Goal: make the Node API always-available (not dependent on Codespaces).

Recommended: Render (Web Service) or a Docker host. This repo includes a `Dockerfile` so it can be deployed to most hosts.


Render (recommended)
- Create a new Web Service on Render and connect your GitHub repository.
- Choose the root of the repo as the deploy context. Render will detect the `Dockerfile` and build the container.
- Configure the service to expose port `3000` (the default in `server.js`).
- Optionally set environment variables on Render (none required for the API to run against public LINZ services).

API Deploy via GitHub Actions (automatic)
- The workflow `.github/workflows/deploy-to-render.yml` will attempt to trigger a Render deploy when you push to `main`.
- To enable it, add two repository secrets in GitHub (Settings → Secrets → Actions):
  - `RENDER_API_KEY` — a Render personal API key (Dashboard → Account → API Keys → Create API Key).
  - `RENDER_SERVICE_ID` — the Render service id (format `srv_xxx...`) for your Web Service. You can find this in the service dashboard URL or via the Render API.

How to find the `RENDER_SERVICE_ID`:
- Open the service in Render dashboard; the URL will contain the service id, e.g. `https://dashboard.render.com/web/srv-xxxxxxxx` — the `srv-...` string is the Service ID.
- Or run:

```bash
curl -H "Authorization: Bearer $RENDER_API_KEY" https://api.render.com/v1/services | jq '.'
```

What the workflow does:
- On every push to `main`, Actions will run `npm ci` and then POST to Render's Deploys API to request a new deploy. Render will then build the Dockerfile and start your app.

Manual deploy (if you prefer):
```bash
curl -X POST "https://api.render.com/v1/services/$SERVICE_ID/deploys" \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Verify your service:
- Health: `https://<your-service-domain>/health`
- API: `https://<your-service-domain>/api/search?q=...`


If you prefer Vercel, Railway, Fly.io, or a self-hosted VM, the included `Dockerfile` will work for those platforms too.

How to test locally
- Build and run with Docker:

```bash
docker build -t linz-api:latest .
docker run -p 3000:3000 linz-api:latest
```

- Or run locally (Node):

```bash
npm ci
node server.js
```
