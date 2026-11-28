# End-to-end test campaign

Run before each release, on top of `npm test` (unit tests). These suites drive the real editor,
the real MCP server and the published Docker composes.

| Script | What it covers |
|---|---|
| `mcp-suite.mjs` | Every MCP tool, every MCP prompt and every HTTP route of the server (`/healthz`, `/chat`, `/diagrams`, `/exports`, `/mcp`), with the cases that must fail (bad token, foreign origin, unreadable XML, unknown id, wrong file type). Fails when the server publishes a tool the suite does not call. Writes every exported file to `--out` for a visual check. |
| `ui-suite.mjs` | Visual sweep of the editor: French and English, light and dark, 1440 and 540 px, normal and Expert mode. Opens every toolbar menu and the dialogs they lead to, screenshots each screen and flags page overflow, overlapping or off-screen buttons, clipped text, low contrast, unnamed buttons, broken images, raw translation keys, console errors and dialogs that Escape does not close. Also checks the help and showcase pages and their internal links. |
| `journeys.mjs` | User journeys by BPMN level and goal, in French and English: P1 first-time user (draw, check, tidy, colour, undo, reload, export, present), P2 business analyst (co-pilot without provider, process from a table, documentation, RACI, Word and HTML exports), P3 BPMN expert (Expert modules, token simulation, DMN, event log, reports, AI agent step), P4 Camunda developer (Camunda 8 and 7 exports, DMN file), P7 presenter (Presentation mode and pointer keys). A screenshot per step. P5 (MCP agent) and P6 (Docker administrator) are covered by `mcp-suite.mjs` and `docker-suite.sh`. |
| `help-coverage.mjs` | Every toolbar and menu button must be named in the help (French and English), and every MCP tool and prompt in `mcp/README`. |
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

The browser suites run against any editor:

```sh
node test/e2e/ui-suite.mjs --url http://localhost:8080      # --only fr-dark-540 for one combination
node test/e2e/help-coverage.mjs --url http://localhost:8080
node test/e2e/journeys.mjs --url http://localhost:8080      # --only P1,P3 --lang fr
```

`mcp-suite.mjs` also runs on its own against any running server:

```sh
node test/e2e/mcp-suite.mjs --url http://localhost:8080 --token "$MCP_TOKEN" --open-tab
node test/e2e/mcp-suite.mjs --url http://localhost:8080 --token "$MCP_TOKEN" --headless
```

`--open-tab` opens the editor in a Playwright Chromium, like a user keeping the tab open.
Calls are spaced by 250 ms (`--pace`) to stay under the nginx rate limit of the image.
