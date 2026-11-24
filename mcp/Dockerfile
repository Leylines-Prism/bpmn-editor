# Serveur MCP et chat intégré. À construire depuis la racine du dépôt :
# le serveur importe les outils partagés de src/ai/.
FROM node:26.13.1-alpine3.24@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5
WORKDIR /app
COPY mcp/package.json mcp/package-lock.json ./mcp/
RUN cd mcp && npm ci --omit=dev
COPY src/ai ./src/ai
COPY mcp/*.js ./mcp/
COPY LICENSE ./LICENSE
# Les fichiers de src/ai sont des modules ES.
RUN echo '{"type":"module"}' > src/package.json
# Diagrammes enregistrés : dossier monté en volume par docker-compose.
RUN mkdir -p /data/diagrams && chown -R node:node /data
LABEL org.opencontainers.image.licenses="MIT"
ENV MCP_HOST=0.0.0.0 NODE_ENV=production DIAGRAMS_DIR=/data/diagrams
USER node
EXPOSE 3333
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3333/healthz || exit 1
CMD ["node", "mcp/server.js"]
