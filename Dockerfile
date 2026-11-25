# ── Stage 1 : build ────────────────────────────────────────────────────────
# Tourne sur la plateforme de la machine de construction : le résultat est fait de fichiers
# statiques, identiques pour amd64 et arm64, inutile d'émuler l'autre plateforme.
FROM --platform=$BUILDPLATFORM node:26.13.1-alpine3.24@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS builder
WORKDIR /app
COPY package.json package-lock.json ./
# npm ci : exactement les versions du package-lock.json.
RUN npm ci
COPY . .
# « /bridge » (docker-compose) relie l'éditeur au serveur MCP relayé par nginx.
# Vide : l'éditeur seul, sans assistant côté serveur ni badge MCP.
ARG VITE_MCP_BRIDGE_URL=""
ENV VITE_MCP_BRIDGE_URL=$VITE_MCP_BRIDGE_URL
# Version affichée dans Options et l'aide (le tag, donné par le workflow Docker). Vide : le
# numéro de package.json, car le dossier .git n'entre pas dans l'image.
ARG APP_VERSION=""
ENV APP_VERSION=$APP_VERSION
# La fenêtre Feedback propose les Issues GitHub du dépôt : aucun réglage de contact ici.
RUN npm run build

# ── Stage 2 : serve statique ───────────────────────────────────────────────
# Image officielle épinglée (version et empreinte). nginx tourne sans root : utilisateur nginx
# (uid 101), port 8080 dans le conteneur, fichier pid et caches dans des dossiers à lui.
FROM nginx:1.30.7-alpine3.24@sha256:caf4e1e032a20f9c3c5e28fc7f25ffd768ad8677b4975c54193075997b3a97e3
# La configuration du site est un modèle : au démarrage, l'image nginx y remplace ${SHOWCASE}
# et l'écrit dans conf.d, qui doit donc appartenir à l'utilisateur nginx.
RUN sed -i -e '/^user /d' -e 's#^pid .*#pid /tmp/nginx.pid;#' /etc/nginx/nginx.conf \
 && rm -f /etc/nginx/conf.d/default.conf \
 && chown -R nginx:nginx /var/cache/nginx /etc/nginx/conf.d
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
# Page vitrine (about.html) : « off » la coupe au démarrage, avec ses fonds d'écran, et le logo
# de l'éditeur ouvre alors la fenêtre « Votre avis ». Seule SHOWCASE est remplacée dans le modèle.
ENV SHOWCASE=on
ENV NGINX_ENVSUBST_FILTER=^SHOWCASE$
COPY nginx-headers.conf /etc/nginx/snippets/headers.conf
COPY --from=builder /app/dist /usr/share/nginx/html
# Licence du projet, hors des fichiers servis.
COPY LICENSE /usr/share/licenses/bpmn-pilot/LICENSE
LABEL org.opencontainers.image.licenses="MIT"
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/healthz || exit 1
