# syntax=docker/dockerfile:1
# Contexto de build = RAIZ do repositório (inclui o frontend):
#   docker build -f services/admin/Dockerfile -t cinebridge-admin .

# --- frontend (React + Vite) ---
FROM node:26-alpine AS front
WORKDIR /app
COPY frontend/package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY frontend/ ./
RUN npm run build

# --- BFF (Fastify) ---
FROM node:26-alpine AS build
WORKDIR /usr/src/app
COPY services/admin/package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY services/admin/tsconfig.json ./
COPY services/admin/src ./src
RUN npm run build

# --- runtime ---
FROM node:26-alpine
WORKDIR /usr/src/app
ENV NODE_ENV=production STATIC_DIR=/usr/src/app/public
COPY services/admin/package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev
COPY --from=build --chown=node:node /usr/src/app/dist ./dist
COPY --from=front --chown=node:node /app/dist ./public
USER 1000:1000
EXPOSE 3010
CMD ["node", "dist/main.js"]
