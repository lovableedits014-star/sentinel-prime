# Multi-stage Dockerfile for TanStack Start (Node server target)
# VPS deploy via Easypanel / Dokploy / plain Docker.

# ---------- Stage 1: build ----------
FROM node:22-alpine AS builder

WORKDIR /app
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json* bun.lock* bunfig.toml* ./
RUN npm install --no-audit --no-fund --legacy-peer-deps

COPY . .

# Vite substitui VITE_* em tempo de build. Passe via --build-arg no Easypanel.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID

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
COPY --from=builder /app/server-entry.mjs ./server-entry.mjs

EXPOSE 3000

CMD ["node", "server-entry.mjs"]
