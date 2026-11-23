# ── Stage 1 : build ────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
# « /bridge » (docker-compose) relie l'éditeur au serveur MCP relayé par nginx.
# Vide : l'éditeur seul, sans assistant côté serveur ni badge MCP.
ARG VITE_MCP_BRIDGE_URL=""
ENV VITE_MCP_BRIDGE_URL=$VITE_MCP_BRIDGE_URL
# Lien « Feedback » (voir le README) : adresse des retours et contact de l'auteur.
ARG VITE_FEEDBACK_URL=""
ARG VITE_CONTACT_URL=""
ENV VITE_FEEDBACK_URL=$VITE_FEEDBACK_URL VITE_CONTACT_URL=$VITE_CONTACT_URL
RUN npm run build

# ── Stage 2 : serve statique ───────────────────────────────────────────────
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost/healthz || exit 1
