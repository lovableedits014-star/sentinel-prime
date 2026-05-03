# ─────────────────────────────────────────────────────────────
# Multi-stage Dockerfile for TanStack Start (Node server target)
# Used for VPS deploy via Easypanel / Dokploy / plain Docker.
# ─────────────────────────────────────────────────────────────

# ---------- Stage 1: build ----------
FROM node:20-alpine AS builder

WORKDIR /app

# Install bun (project uses bun.lock-style workflows but npm also works)
RUN apk add --no-cache libc6-compat

# Copy manifests first for better layer caching
COPY package.json package-lock.json* bun.lock* bunfig.toml* ./

# Use npm (works without bun and respects package.json)
RUN npm install --no-audit --no-fund --legacy-peer-deps

# Copy the rest of the source
COPY . .

# Build (produces .output/ for node-server target)
RUN npm run build

# ---------- Stage 2: runtime ----------
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Copy only what we need to run
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
