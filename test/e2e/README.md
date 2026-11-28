# End-to-end test campaign

Run before each release, on top of `npm test` (unit tests). These suites drive the real editor,
the real MCP server and the published Docker composes.

| Script | What it covers |
|---|---|
| `mcp-suite.mjs` | Every MCP tool, every MCP prompt and every HTTP route of the server (`/healthz`, `/chat`, `/diagrams`, `/exports`, `/mcp`), with the cases that must fail (bad token, foreign origin, unreadable XML, unknown id, wrong file type). Fails when the server publishes a tool the suite does not call. Writes every exported file to `--out` for a visual check. |
| `docker-suite.sh` | Starts `docker-compose.image.yml` (editor tab open) and `docker-compose.headless.yml` (no tab, headless renderer) with the images under test, then runs `mcp-suite.mjs` against each. |

## Running

```sh
# Images under test, built from the working tree
docker build -t bpmn-pilot:test --build-arg VITE_MCP_BRIDGE_URL=/bridge .
docker build -t bpmn-pilot-mcp:test -f mcp/Dockerfile .
docker build -t bpmn-pilot-renderer:test -f renderer/Dockerfile .
(cd mcp && npm ci)

test/e2e/docker-suite.sh all          # or: image, headless
```

To test published images instead, set `EDITOR_IMAGE`, `MCP_IMAGE` and `RENDERER_IMAGE`.
Results and exported files land in `test-results/`.

`mcp-suite.mjs` also runs on its own against any running server:

```sh
node test/e2e/mcp-suite.mjs --url http://localhost:8080 --token "$MCP_TOKEN" --open-tab
node test/e2e/mcp-suite.mjs --url http://localhost:8080 --token "$MCP_TOKEN" --headless
```

`--open-tab` opens the editor in a Playwright Chromium, like a user keeping the tab open.
Calls are spaced by 250 ms (`--pace`) to stay under the nginx rate limit of the image.
