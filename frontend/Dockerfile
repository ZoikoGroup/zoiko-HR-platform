# ---- build ----
FROM node:20-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
# puppeteer is a devDependency not referenced anywhere in src/ — its
# postinstall tries to download a Chrome binary, which fails in this image
# (no unzip, and node:20 doesn't meet its >=22.12 engine requirement).
# Skipping the download is puppeteer's own documented escape hatch; nothing
# in the actual frontend build needs it.
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN npm ci

COPY . .

# VITE_* vars are baked into the bundle at build time, not read at container
# start — pass the real backend URL via `--build-arg VITE_API_BASE_URL=...`
# (or bake a .env.production before building) so it isn't stuck at whatever
# default ships in the repo.
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN npm run build

# ---- serve ----
FROM nginx:1.27-alpine

COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

ENV PORT=8080
EXPOSE 8080

# nginx:alpine's docker-entrypoint.sh already runs envsubst over
# /etc/nginx/templates/*.template into /etc/nginx/conf.d/ on start, so $PORT
# (Cloud Run injects this) reaches the listen directive without a custom
# entrypoint script.
