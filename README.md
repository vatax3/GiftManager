# GiftManager / SantaSplit

Simple gift/project expense tracker with a FastAPI backend (SQLite) and a React/Vite frontend bundled with Nginx.

## Structure
- `backend/` – FastAPI app, SQLite DB path configurable with `SQLITE_PATH` (default `/app/data/giftmanager.db`).
- `frontend/` – React/Vite single-page app. API base set via `VITE_API_URL` (defaults to same-origin when served by the backend).
- `Dockerfile` – Single image build: builds the frontend, copies the bundle into the backend image, and serves it from FastAPI.
- `docker-compose.yml` – One service (`app`) that runs the bundled image and mounts a named volume for SQLite.

## Admin Login 
Default Admin login is admin/admin

## Running locally (no Docker)
1) Backend:  
```bash
cd backend
python -m venv .venv && . .venv/Scripts/activate  # or source .venv/bin/activate
pip install -r requirements.txt
SQLITE_PATH=./data/giftmanager.db uvicorn main:app --reload --port 8000
```
2) Frontend (in another shell):  
```bash
cd frontend
npm install
VITE_API_URL=http://localhost:8000 npm run dev
```

## Run with Docker Compose (single image)
```bash
docker compose up --build -d
```
- App + API: http://localhost (served by FastAPI on port 8000, published to 80)
- SQLite data is stored in the `app_data` named volume.

## Building & publishing the single image
1) Log in to GHCR (example with a PAT that has `write:packages`):  
```bash
echo $GHCR_TOKEN | docker login ghcr.io -u <user> --password-stdin
```
2) Build and tag:  
```bash
docker build -t ghcr.io/<user>/giftmanager:latest .
```
3) Push:  
```bash
docker push ghcr.io/<user>/giftmanager:latest
```

### Deploy via Docker Compose using the published image
Update `docker-compose.yml` `image:` value to your tag (e.g., `ghcr.io/<user>/giftmanager:latest`) if you changed it, then:
```bash
docker compose pull
docker compose up -d
```

### Adjusting the API URL
- Default (empty) uses same-origin requests when the SPA is served by FastAPI.  
- For external deployments where the API lives elsewhere, rebuild with `--build-arg VITE_API_URL=https://your-backend-host`.
