# syntax=docker/dockerfile:1

# ---------- Stage 1: backend (Node.js + Prisma) ----------
FROM node:20-alpine AS backend-build
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install
COPY backend/prisma ./prisma
RUN npx prisma generate
COPY backend/src ./src
# Ships the ledger repair script, so it can be run against the live database
# over `flyctl ssh console` without a proxy. Dry-run unless given --apply.
COPY backend/scripts ./scripts

# ---------- Stage 1b: WhatsApp content generator ----------
# Its own stage because it is its own package: ESM, its own dependencies, and no
# Prisma. The backend imports it at runtime for POST /api/whatsapp/generate, so
# it has to be in the image — but it stays a separate directory with its own
# node_modules rather than being folded into the backend, which is what lets the
# CLI and the dashboard share one copy of the prompts.
FROM node:20-alpine AS whatsapp-build
WORKDIR /app/whatsapp
COPY whatsapp/package*.json ./
RUN npm ci --omit=dev
COPY whatsapp/lib ./lib
COPY whatsapp/prompts ./prompts
COPY whatsapp/index.js ./index.js
# The 30-day plan. Not used by the CLI, but backend/prisma/seedCalendar.js reads
# it from here — the calendar is seeded by running that script against the
# production database, so the file has to be in the image.
COPY whatsapp/strategy ./strategy
# examples/ is documentation and is deliberately left out.

# ---------- Stage 2: frontend (React + Vite) ----------
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
# No build args: the API base URL is not configurable. src/api/client.js
# hardcodes "/api", which is correct here since Nginx and the backend share
# one origin. Wire up import.meta.env before adding a VITE_* arg back.
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

# Sits beside the backend, not inside it: src/routes/whatsapp.js reaches it as
# ../../../whatsapp, which resolves to /app/whatsapp here and to the repo's own
# whatsapp/ in development. One relative path, both environments.
COPY --from=whatsapp-build /app/whatsapp /app/whatsapp

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
