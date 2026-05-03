# Multi-stage Dockerfile for TanStack Start (Node server target)
# VPS deploy via Easypanel / Dokploy / plain Docker.

# ---------- Stage 1: build ----------
FROM node:22-alpine AS builder

WORKDIR /app
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json* bun.lock* bunfig.toml* ./
RUN npm install --no-audit --no-fund --legacy-peer-deps

COPY . .

# Variáveis públicas do Supabase embutidas no bundle pelo Vite
ENV VITE_SUPABASE_URL=https://xvlvlhwlatclucjzwhld.supabase.co
ENV VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2bHZsaHdsYXRjbHVjanp3aGxkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0MTMyNDUsImV4cCI6MjA5Mjk4OTI0NX0.GjRoK-I0jR_VJBTEgclbRltZpVBbZexIKIoM9K_EchA
ENV VITE_SUPABASE_PROJECT_ID=xvlvlhwlatclucjzwhld

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
