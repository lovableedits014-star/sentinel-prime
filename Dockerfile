# Multi-stage Dockerfile for TanStack Start (Node server target)
# VPS deploy via Easypanel / Dokploy / plain Docker.

# ---------- Stage 1: build ----------
FROM node:22-alpine AS builder

WORKDIR /app
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json* bun.lock* bunfig.toml* ./
RUN npm install --no-audit --no-fund --legacy-peer-deps

COPY . .
RUN npm run build

# ---------- Stage 2: runtime ----------
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# TanStack Start (node-server target) outputs to dist/
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000

CMD ["node", "dist/server/server.js"]
