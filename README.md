# GiftManager 

Simple gift/project expense tracker with a FastAPI backend (SQLite) and a React/Vite frontend bundled with Nginx.

## Structure
- `backend/` – FastAPI app, SQLite DB path configurable with `SQLITE_PATH` (default `/app/data/giftmanager.db`).
- `frontend/` – React/Vite single-page app. API base set via `VITE_API_URL` (defaults to `/api`, assuming the Nginx reverse proxy defined in the Docker image).
- `docker-compose.yml` – Builds both images, wires Nginx to the backend on `/api`, and mounts a named volume for the SQLite data.

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

## Run with Docker Compose
```bash
docker compose up --build -d
```
- Frontend: http://localhost  
- Backend: http://localhost:8000  
- SQLite data is stored in the `backend_data` named volume (see `docker volume ls`).

## Building & publishing images
1) Tag the images with your registry (Docker Hub or GHCR):  
```bash
docker build -t ghcr.io/<user>/giftmanager-backend:latest -f backend/Dockerfile backend
docker build -t ghcr.io/<user>/giftmanager-frontend:latest --build-arg VITE_API_URL=/api -f frontend/Dockerfile frontend
```
2) Push them:  
```bash
docker push ghcr.io/<user>/giftmanager-backend:latest
docker push ghcr.io/<user>/giftmanager-frontend:latest
```
3) Update `docker-compose.yml` to point to those image tags (or override at runtime):  
```bash
docker compose up -d
```

### Deploy via Docker Compose using published images
If you don’t want to build locally, change the `image` fields in `docker-compose.yml` to your pushed tags (backend and frontend) and run:
```bash
docker compose pull
docker compose up -d
```

### Adjusting the API URL
- Containerized default uses `/api` with Nginx proxying to the backend service (`backend:8000`).  
- For external deployments without that proxy, rebuild the frontend with `--build-arg VITE_API_URL=https://your-backend-host`.
