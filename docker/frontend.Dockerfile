# React app built with Vite, served by nginx, which also proxies the APIs.
# Build context: project root.

# --- Build ---
FROM node:24-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ .
# "/" = same origin: nginx serves the app and proxies both APIs on one address.
ARG VITE_DJANGO_API_URL=/
ARG VITE_FASTAPI_URL=/
ENV VITE_DJANGO_API_URL=${VITE_DJANGO_API_URL} \
    VITE_FASTAPI_URL=${VITE_FASTAPI_URL}
RUN npm run build

# --- Serve (non-root nginx, listens on 8080) ---
FROM nginxinc/nginx-unprivileged:1.29-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=5 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
