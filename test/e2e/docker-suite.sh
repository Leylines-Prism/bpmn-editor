#!/usr/bin/env bash
# Campagne Docker : démarre les composes publiés avec les images à tester, puis lance la suite MCP.
#
#   test/e2e/docker-suite.sh image      # docker-compose.image.yml, onglet de l'éditeur ouvert
#   test/e2e/docker-suite.sh headless   # docker-compose.headless.yml, sans aucun onglet
#   test/e2e/docker-suite.sh all
#
# Images testées (par défaut, celles construites en local avec le tag « test ») :
#   EDITOR_IMAGE=bpmn-pilot:test MCP_IMAGE=bpmn-pilot-mcp:test RENDERER_IMAGE=bpmn-pilot-renderer:test
# Pour tester une release publiée : EDITOR_IMAGE=ghcr.io/leylines-prism/bpmn-pilot:1.4.6, etc.
set -euo pipefail
cd "$(dirname "$0")/../.."

MODE="${1:-all}"
EDITOR_IMAGE="${EDITOR_IMAGE:-bpmn-pilot:test}"
MCP_IMAGE="${MCP_IMAGE:-bpmn-pilot-mcp:test}"
RENDERER_IMAGE="${RENDERER_IMAGE:-bpmn-pilot-renderer:test}"
PORT="${BPMN_PORT:-18080}"
OUT="${OUT:-test-results}"
WORK="$(mktemp -d)"
STATUS=0

# Le compose publié, avec les images à tester à la place des images de la release.
prepare() {
  sed -E \
    -e "s#image: ghcr.io/leylines-prism/bpmn-pilot:[^ ]+#image: ${EDITOR_IMAGE}#" \
    -e "s#image: ghcr.io/leylines-prism/bpmn-pilot-mcp:[^ ]+#image: ${MCP_IMAGE}#" \
    -e "s#image: ghcr.io/leylines-prism/bpmn-pilot-renderer:[^ ]+#image: ${RENDERER_IMAGE}#" \
    "$1" > "$WORK/compose.yml"
  mkdir -p "$WORK/bpmn-data"
  chmod 777 "$WORK/bpmn-data"
}

wait_up() {
  for _ in $(seq 1 60); do
    # /healthz répond dès que nginx tourne ; GET /mcp répond 405 une fois le serveur MCP prêt.
    if [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/mcp")" = "405" ]; then return 0; fi
    sleep 2
  done
  echo "Le site ne répond pas sur le port ${PORT}" >&2
  docker compose -p "$1" -f "$WORK/compose.yml" logs --tail 50 >&2 || true
  return 1
}

run() {
  local name="$1" file="$2" flags="$3"
  local project="bpmn-e2e-${name}"
  local token
  token="$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 32)"
  echo "=== ${name} (${file}) ==="
  prepare "$file"
  export BPMN_PORT="$PORT" BPMN_DATA_DIR="$WORK/bpmn-data" MCP_TOKEN="$token" PUID="$(id -u)" PGID="$(id -g)"
  docker compose -p "$project" -f "$WORK/compose.yml" up -d
  if wait_up "$project"; then
    node test/e2e/mcp-suite.mjs --url "http://localhost:${PORT}" --token "$token" --out "${OUT}/mcp-${name}" $flags || STATUS=1
    # Les exports rangés par le serveur dans son dossier de données.
    echo "Fichiers du dossier de données :"
    find "$WORK/bpmn-data" -type f | sed "s#$WORK/##" | head -40
    # Un service qui redémarre en boucle ou qui a écrit une erreur se voit ici.
    docker compose -p "$project" -f "$WORK/compose.yml" ps -a
    docker compose -p "$project" -f "$WORK/compose.yml" logs --no-color > "${OUT}/docker-${name}.log" 2>&1 || true
  else
    STATUS=1
  fi
  docker compose -p "$project" -f "$WORK/compose.yml" down -v --remove-orphans
}

mkdir -p "$OUT"
case "$MODE" in
  image) run image docker-compose.image.yml --open-tab ;;
  headless) run headless docker-compose.headless.yml --headless ;;
  all)
    run image docker-compose.image.yml --open-tab
    run headless docker-compose.headless.yml --headless
    ;;
  *) echo "Usage : $0 image|headless|all" >&2; exit 2 ;;
esac
rm -rf "$WORK"
exit "$STATUS"
