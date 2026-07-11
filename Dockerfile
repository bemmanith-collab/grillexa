# syntax=docker/dockerfile:1

# ---------- Stage 1: backend (Node.js + Prisma) ----------
FROM node:20-alpine AS backend-build
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install
COPY backend/prisma ./prisma
RUN npx prisma generate
COPY backend/src ./src

# ---------- Stage 2: frontend (React + Vite) ----------
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
# Relative "/api" is the default and correct value for this image, since
# Nginx and the backend share one origin (see frontend/.env.example).
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ---------- Stage 3: runtime (Nginx serves frontend, proxies /api to backend) ----------
FROM nginx:alpine AS final
# openssl is required at runtime so Prisma's query engine can detect the
# libssl version and load the matching engine binary (built in stage 1
# against linux-musl-openssl-3.0.x) — without it Prisma can't detect any
# OpenSSL version and fails to start.
RUN apk add --no-cache nodejs npm openssl

WORKDIR /app/backend
COPY --from=backend-build /app/backend ./

COPY --from=frontend-build /app/frontend/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV NODE_ENV=production
# Backend listens on an internal-only port; Nginx (below) is the single
# externally exposed port and proxies /api and /health to it.
ENV PORT=4001

EXPOSE 4000

ENTRYPOINT ["/entrypoint.sh"]
