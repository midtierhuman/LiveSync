# syntax=docker/dockerfile:1

FROM node:24-alpine AS builder
WORKDIR /app

# Install dependencies first for better build cache usage with BuildKit cache mount
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

# Build the Angular app using standard npm build script
COPY . .
RUN npm run build -- --configuration production

FROM nginx:1.27-alpine AS runner

# Configure Nginx for Angular client-side routing.
RUN printf 'server {\n  listen 80;\n  server_name _;\n  root /usr/share/nginx/html;\n  index index.html;\n\n  location / {\n    try_files $uri $uri/ /index.html;\n  }\n}\n' > /etc/nginx/conf.d/default.conf

# Copy from the actual location where index.html lives
COPY --from=builder /app/dist/LiveSync/browser/ /usr/share/nginx/html/

RUN sed -i 's|<head>|<head><script>window.__LIVE_SYNC_CONFIG__ = { apiBaseUrl: "http://localhost:5038", realtimeBaseUrl: "http://localhost:5038" };</script>|g' /usr/share/nginx/html/index.html

EXPOSE 80
STOPSIGNAL SIGQUIT
CMD ["nginx", "-g", "daemon off;"]