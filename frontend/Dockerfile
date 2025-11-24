FROM node:18-alpine as build
WORKDIR /app

# Build-time API target (default to nginx reverse proxy path)
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}

COPY package.json .
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html

# Simple reverse proxy so the frontend can call the backend via /api
RUN cat <<'EOF' > /etc/nginx/conf.d/default.conf
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    location /api/ {
        proxy_pass http://backend:8000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
