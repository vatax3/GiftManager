# Multi-stage build: frontend -> backend with bundled static files

# --- Frontend build ---
FROM node:18-alpine AS frontend
WORKDIR /frontend
COPY frontend/package.json .
RUN npm install
COPY frontend .
# Default to same-origin API when served by backend
ARG VITE_API_URL=
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

# --- Backend runtime ---
FROM python:3.11-slim
WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend .
COPY --from=frontend /frontend/dist ./static

ENV SQLITE_PATH=/app/data/giftmanager.db
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
