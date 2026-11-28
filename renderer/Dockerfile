# Navigateur sans écran du mode sans navigateur (MCP_HEADLESS=on, docker-compose.headless.yml).
# Le serveur MCP y ouvre l'éditeur dans un onglet invisible quand aucun onglet n'est ouvert, pour
# que les outils marchent sans navigateur, images et PDF compris.
#
# Base : Chromium « headless shell » de chromedp (mis à jour à chaque version de Chrome), qui
# expose l'interface DevTools sur le port 9222. On y ajoute les polices Liberation, de mêmes
# dimensions qu'Arial, Times New Roman et Courier New : les libellés se coupent comme dans
# l'éditeur ouvert sous Windows ou macOS.
FROM chromedp/headless-shell:159.0.8154.34@sha256:5bb2432d550896f4cb4266c367c48d82e6e2ed61f71ced68687bb175d62ce312
RUN apt-get update -y \
  && apt-get install --no-install-recommends -y fonts-liberation \
  && apt-get clean && rm -rf /var/lib/apt/lists/* \
  && useradd --uid 1000 --user-group --home-dir /tmp --no-create-home --shell /usr/sbin/nologin chrome
COPY LICENSE /usr/share/licenses/bpmn-pilot/LICENSE
# Profil du navigateur dans /tmp (en mémoire dans le compose), jamais sur disque.
ENV HOME=/tmp XDG_CONFIG_HOME=/tmp XDG_CACHE_HOME=/tmp
USER chrome
EXPOSE 9222
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bash -c 'exec 3<>/dev/tcp/127.0.0.1/9222' || exit 1
# run.sh de l'image de base : socat relaie 9222 vers DevTools. Options en plus : pas de
# mémoire partagée (/dev/shm vaut 64 Mo dans Docker), pas de mises à jour ni de services Google.
ENTRYPOINT ["/headless-shell/run.sh", "--disable-dev-shm-usage", "--disable-background-networking", "--disable-component-update", "--disable-sync", "--no-first-run", "--user-data-dir=/tmp/profile"]
