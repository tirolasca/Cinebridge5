# syntax=docker/dockerfile:1
# --- build ---
FROM node:26-alpine AS build
WORKDIR /usr/src/app
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- runtime (somente dependências de produção, usuário não-privilegiado) ---
FROM node:26-alpine
WORKDIR /usr/src/app
ENV NODE_ENV=production
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
  npm ci --omit=dev \
  && rm -rf \
  /usr/local/lib/node_modules/npm \
  /usr/local/bin/npm \
  /usr/local/bin/npx

COPY --from=build --chown=node:node /usr/src/app/dist ./dist
USER 1000:1000
EXPOSE 3003
# O encerramento limpo (SIGTERM) é tratado pelo próprio processo; o compose usa init: true (tini) como PID 1.
CMD ["node", "dist/main.js"]
