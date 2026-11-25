# MCP server and built-in chat for the BPMN editor (prototype)

**English** | [Français](README.fr.md)

This server lets an AI (Claude Code, Claude Desktop, GitHub Copilot in VS Code or any MCP client) read and draw in the BPMN
editor **open in the browser**. Changes show up live on the canvas, as if made by hand, and each tool
call can be undone with a single Ctrl+Z. `set_diagram_xml` and `auto_layout` reload the whole diagram: one
Ctrl+Z brings back the diagram from before them, but earlier steps can no longer be undone one by one.

## How it works

```
MCP client  ──HTTP──▶  MCP server (Node, 127.0.0.1:3333)  ──WebSocket──▶  editor tab (bpmn-js)
             /mcp                                           /bridge
```

- The server validates each tool's arguments, then relays the call to the open tab.
- The tab runs the tool with the bpmn-js modeling API (`src/mcp-bridge.js`) and sends back the result.
- When several tabs are open, the last one used receives calls from MCP clients. The built-in chat
  always draws in the tab where the conversation takes place.
- With no tab open, tools answer with an explicit error.
- An "MCP" badge in the toolbar shows whether the editor is connected to the server.
- Tools, instructions and the chat loop are defined in `src/ai/`, shared with the editor: the server
  runs from the full repository, not from the `mcp/` folder alone.

## Built-in chat

The "AI assistant" button in the toolbar opens a chat panel to the right of the canvas. Describe a
process or a change, and the model draws it in **this tab** with the same tools as the MCP server.
Under each answer, one chip per tool called (✓ succeeded, ✗ failed). The model is picked in
the Options window, among those the server offers and those of the providers set up there; the panel
shows it above the input. Switching provider starts a new conversation, without touching the diagram. The "Stop" button stops the current answer. "New chat" starts over.

```
editor (chat panel) ──HTTP /chat──▶ server ──Claude API──────────────▶ Claude
                                           └─OpenAI-compatible API──▶ Mistral, OpenAI, OpenRouter, Ollama…
                    ◀──WebSocket── tools run in the tab
```

- API keys from environment variables stay on the server. The browser only receives the list of models
  (id and label), neither key nor provider address, and the server rejects any model not in that list.
- A provider set up in the Options window (see below) is sent with each message: address, key and
  model. The server uses it for that call, without storing it or writing it to its log.
- The `/chat` route only accepts editor pages (same list of origins as the WebSocket).
- Conversations are kept in the server's memory (20 at most) and lost when it restarts.
- Images and PDF files attached in the panel are sent with the message (34 MB at most per request,
  with their own content type `application/vnd.bpmn-chat+json`), then passed on to the model.
- If Claude Opus or Sonnet declines a request, the API replays it on a fallback model
  (`fallbacks: "default"`). Haiku has no fallback.
- Each message uses API credits: an API key from an organization with included credits stops when they
  run out, a key with a payment method is billed by usage. The same goes for OpenAI-compatible
  providers, except a local model (Ollama, LM Studio).

### Setting up providers

Copy `mcp/.env.example` to `mcp/.env` (excluded from git) and fill in what you need. A provider only
shows in the menu once it is set up. Several can be set up at the same time.

**Anthropic**: the API key is enough. The menu then offers Claude Opus 5.5, Sonnet 5.5 and Haiku 5.5.

```
ANTHROPIC_API_KEY=sk-ant-...
```

**OpenAI-compatible**: any service that exposes `/chat/completions` with tool calls (`tools`). The list
of models is required, since it depends on the service.

```
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_API_KEY=sk-or-...
OPENAI_MODELS=openai/gpt-5=GPT-5,mistralai/mistral-large=Mistral Large
OPENAI_LABEL=OpenRouter
```

For a local model with Ollama, no API key: `OPENAI_BASE_URL=http://localhost:11434/v1` and
`OPENAI_MODELS=qwen3:14b`. The model must support tool calls, and a small model draws less well than
a large one.

**Mistral**: the API key is enough. The menu then offers Mistral Large and Mistral Small. For
processing in the European Union (billed 10% more), add
`MISTRAL_BASE_URL=https://api.eu.mistral.ai/v1`.

```
MISTRAL_API_KEY=...
```

With no provider at all, the server still starts: the MCP tools work, and the panel suggests setting
up a provider in the Options window.

### Options window

The "Options" button of the panel opens a window with one block per provider: Anthropic, OpenAI,
Mistral, Ollama and "OpenAI-compatible" (LiteLLM, LM Studio, vLLM…). For each one: the address
(prefilled for Anthropic, OpenAI, Mistral and Ollama), the API key, and the models to offer. "List models" asks the provider
for them, "Test" checks the address and the key. Neither button uses any credit. A provider's
models are only offered once "Test" or "List models" has succeeded, and again after its address or
key changes. "Assistant model" picks the model used by the chat.

- Settings stay in the browser. API keys are forgotten when the tab is closed, unless "Remember API keys on
  your device" is checked. "Clear API keys" removes them.
- Calls go through the server (`/chat` and `/chat/models` routes): the address is reached from the
  server. When it runs in docker, Ollama on the host machine is reachable at
  `http://host.docker.internal:11434/v1`.
- Models from environment variables are still offered, under their own group.

### With docker compose

The `docker-compose.yml` file at the root of the repository starts the editor and this server (see
the [main README](../README.md#run-it-with-docker)). The server reads `mcp/.env` when it exists.
Variables can also be passed through `environment`, API keys preferably through a `.env` file next to the
compose file, never written in the compose file itself:

```yaml
services:
  mcp:
    environment:
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      CHAT_MODEL: anthropic:claude-sonnet-5-5
```

### Behind a domain name

By default, the compose file publishes the site on `127.0.0.1` of the host only. To serve it under
a domain name or from another machine, set these variables in a `.env` file next to
`docker-compose.yml`:

| Variable | Example | Purpose |
|---|---|---|
| `CHAT_RELAY` | `off` | `off` turns off the providers set in the Options window: the server then only offers its own models and never calls an address sent by a page |
| `BPMN_EDITOR_ORIGINS` | `https://bpmn.example.com` | addresses of the editor pages, with `http://` or `https://`, separated by commas. The WebSocket and the chat only accept them |
| `MCP_ALLOWED_HOSTS` | `bpmn.example.com` | host names that MCP clients use |
| `BPMN_BIND` | `0.0.0.0` | interface the site listens on (`127.0.0.1` by default). Only needed when the proxy runs on another machine |

| Install | MCP address |
|---|---|
| docker on this machine | `http://localhost:8080/mcp` (or the port set in `BPMN_PORT`) |
| development (`npm run dev` and `mcp/`) | `http://127.0.0.1:3333/mcp` |
| docker behind a domain name or a reverse proxy | `https://your-domain/mcp` |

The reverse proxy must pass the `Host` header, allow WebSocket upgrades on `/bridge`, and not buffer
the answers of `/mcp` and `/chat` (Caddy does all of this by default). Set `MCP_TOKEN` so that MCP
clients must send `Authorization: Bearer <token>`. The editor pages and saved diagrams stay open to
anyone who reaches the site: put a login in front of them at the proxy, as in the
[main README](../README.md#on-the-internet-at-your-own-risk).

## Running

With docker: `docker compose up -d --build` at the root of the repository, then open
http://localhost:8080. MCP clients connect to `http://localhost:8080/mcp`.

For development, in two terminals, at the root of the repository:

```
npm install && npm run dev
cd mcp && npm install && npm start
```

Then open http://localhost:5173. The badge switches to "MCP: connected".

For Claude Code, the `.mcp.json` file at the root already declares the server
(`http://127.0.0.1:3333/mcp`).

## Tools

| Tool | Purpose |
|---|---|
| `get_shapes` | lists the diagram's shapes and connections (id, type, name, position, links) |
| `get_diagram_xml` | returns the diagram as BPMN 2.0 XML |
| `get_diagram_image` | returns a PNG image of the diagram, as drawn on the canvas, so the model can check the layout or show it (with OpenAI-compatible providers, Mistral included, the built-in assistant cannot receive it) |
| `set_diagram_xml` | replaces the whole diagram. Unreadable XML, or XML without a drawn diagram, is rejected and the diagram stays unchanged |
| `add_shapes` | adds shapes, after an element (`after`, automatic placement and connection), at a position, or to the right of the diagram. Also adds pools (`Participant`) and their lanes (`Lane`), and places a shape in a lane with `parent`. With `attachTo`, adds a boundary event (timer, error…) on a task |
| `connect_shapes` | connects two shapes. The connection type follows the bpmn-js BPMN rules |
| `update_elements` | renames elements or changes their type (Task to UserTask, timer event…) |
| `remove_elements` | removes shapes or connections |
| `auto_layout` | tidies up the whole diagram, like the "Tidy up" button. One Ctrl+Z brings back the previous layout |
| `validate_diagram` | checks the diagram with bpmnlint and returns errors and warnings, element by element |

A call that fails halfway is undone entirely: the diagram is never left half changed.

What the tools add, change or remove is marked on the editor's canvas (`src/ai-changes.js`), for the built-in assistant and MCP agents alike.

## Saved diagrams

The "My diagrams" window of the editor can save diagrams on this server, besides the browser. The
`/diagrams` routes list, read, save (`PUT`, BPMN XML body, 10 MB at most), rename and delete them.
They only accept editor pages, like `/chat`. Each diagram is a `.bpmn` file named after the diagram
(`Order process.bpmn`, then `Order process (2).bpmn`), in `DIAGRAMS_DIR` (`mcp/data/diagrams` by
default, excluded from git, `/data/diagrams` in docker). The hidden `.index.json` file links each id to
its file, name and date. Files of older versions (`<id>.bpmn` and `<id>.json`) are renamed at startup. A `.bpmn` file copied
into the folder by hand is added to the list under its file name. Size and date come from the file.

`POST /exports?format=pdf&name=Order%20process` saves an export (body `application/octet-stream`,
20 MB at most) in `EXPORTS_DIR` (`mcp/data/exports`, `/data/exports` in docker), for the "Server" and
"Both" destinations of the Export menu. Formats: `bpmn`, `xml`, `svg`, `png`, `pdf`, with a check that
the content matches. A file is never replaced: the answer gives the name chosen, such as
`{"file": "Order process (2).pdf"}`.

## Security

- The server only listens on `127.0.0.1`. In its docker container it listens on all of the
  container's interfaces, but the site is only published on `127.0.0.1` of the host machine.
- With `MCP_TOKEN` set, `/mcp` answers 401 to any request without `Authorization: Bearer <token>`.
  The editor tab (`/bridge`) and the chat do not use it: they are limited to the editor origins.
- MCP requests whose `Host` header is not local are rejected (DNS rebinding protection, provided by
  the SDK). In docker, the accepted names are those in `MCP_ALLOWED_HOSTS`.
- MCP clients send no `Origin` header. A request to `/mcp` that carries one comes from a web page
  and is rejected unless that origin is listed in `BPMN_EDITOR_ORIGINS`.
- Only editor pages can connect to the WebSocket: the origin must be listed in `BPMN_EDITOR_ORIGINS`
  (`http://localhost:5173` and `http://127.0.0.1:5173` by default).
- The bridge and the chat through the server are only active in the editor during development, in
  the docker image built by the compose file, or when `VITE_MCP_BRIDGE_URL` is set at build time. The
  online build has no bridge: its chat runs in the page.
- The `/chat` and `/chat/models` routes call the address they are given: they only accept editor
  pages, and the server must not be exposed on a public network.
- The `/diagrams` routes have no authentication either: anyone who reaches an editor page served by
  the server can read and change the saved diagrams.

## Environment variables

They can also be placed in `mcp/.env`.

| Variable | Default | Purpose |
|---|---|---|
| `MCP_PORT` | `3333` | server port |
| `MCP_HOST` | `127.0.0.1` (`0.0.0.0` in the docker image) | listening address |
| `MCP_TOKEN` | none | token MCP clients must send (`Authorization: Bearer <token>`). Without it, `/mcp` asks for nothing, and the server warns at startup when `MCP_ALLOWED_HOSTS` holds a name other than localhost |
| `MCP_ALLOWED_HOSTS` | `localhost,127.0.0.1` | host names accepted when `MCP_HOST` is not local |
| `BPMN_EDITOR_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | origins allowed for the WebSocket and the chat |
| `ANTHROPIC_API_KEY` | none | Anthropic API key. Without it, no Claude model in the menu |
| `ANTHROPIC_MODELS` | `claude-opus-5-5=Claude Opus 5.5,claude-sonnet-5-5=Claude Sonnet 5.5,claude-haiku-5-5=Claude Haiku 5.5` | Claude models offered, `id=Label` separated by commas (label optional) |
| `CHAT_EFFORT` | `medium` | thinking effort of Claude models: `low`, `medium`, `high`, `xhigh` or `max` |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | address of the OpenAI-compatible API, without `/chat/completions` |
| `OPENAI_API_KEY` | none | API key for that provider. Optional for a local server |
| `OPENAI_MODELS` | none | models offered, same format as `ANTHROPIC_MODELS`. Without it, no OpenAI-compatible provider |
| `OPENAI_LABEL` | `OpenAI-compatible` | provider name in the menu (OpenRouter, Ollama…) |
| `OPENAI_REASONING_EFFORT` | none | sent as is as `reasoning_effort`, for models that accept it |
| `MISTRAL_API_KEY` | none | Mistral API key. Without it, no Mistral model in the menu |
| `MISTRAL_MODELS` | `mistral-large-latest=Mistral Large,mistral-small-latest=Mistral Small` | Mistral models offered, same format as `ANTHROPIC_MODELS` |
| `MISTRAL_BASE_URL` | `https://api.mistral.ai/v1` | Mistral API address. `https://api.eu.mistral.ai/v1` keeps processing in the European Union |
| `MISTRAL_REASONING_EFFORT` | none | sent as is as `reasoning_effort` (`low`, `medium`, `high`…). Without it, each model uses its own default |
| `CHAT_MODEL` | the first in the list | model selected by default in the menu: `anthropic:claude-sonnet-5-5`, `openai:qwen3:14b`, or the id alone |
| `CHAT_RELAY` | `on` | `off` turns off the providers set in the Options window: the server then only offers its own models (above) and never calls an address sent by a page |
| `DIAGRAMS_DIR` | `mcp/data/diagrams` (`/data/diagrams` in the docker image) | folder of the diagrams saved on the server |
| `VITE_MCP_BRIDGE_URL` (editor side) | `ws://127.0.0.1:3333/bridge` in development, `/bridge` in the compose file | bridge address. A relative address points to the site itself |

## Prototype limits

- The editor tab must be open for the AI to draw.
- `auto_layout` uses bpmn-auto-layout 2.0.0-alpha.2, which lays out pools, lanes, message flows
  and boundary events. It is still an alpha version: the result can change with its next releases.
