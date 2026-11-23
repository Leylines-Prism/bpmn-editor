# bpmn-editor

**English** | [Français](README.fr.md)

A BPMN 2.0 editor in the browser (bpmn-js), with an AI assistant that draws the processes you describe.

## Two ways to use it

| | Docker version (self-hosted) | Online version |
|---|---|---|
| Run | `docker compose up -d --build`, or for development `npm run dev` plus the server in `mcp/` | `npm run dev:online`, or `npm run build:online` (`dist-online/` folder) |
| Where the assistant runs | on the `mcp/` server, which runs the tools in the editor tab | in the page itself |
| Providers | environment variables, or the Options window | the Options window |
| API key | on the server, or entered in Options and relayed without being stored | in the visitor's browser, sent straight to the provider |
| MCP server for Claude Code and other clients | yes | no |

The server and the assistant are described in [mcp/README.md](mcp/README.md).

## Docker version

```
docker compose up -d --build
```

Then open http://localhost:8080. Two containers start: the editor, served by nginx, and the MCP
server. nginx relays the server on the same address (`/mcp`, `/bridge`, `/chat`). The
"MCP: connected" badge shows in the toolbar.

- API keys: in `mcp/.env` (copy `mcp/.env.example`; the file is kept out of git and of the image),
  or entered in the Options window. Without a key, the editor and the MCP tools still work.
- MCP clients (Claude Code…): `http://localhost:8080/mcp`. Click the MCP badge in the toolbar to get
  the address of your installation and ready-to-paste settings (see below).
- By default, the site can only be reached from the machine running it (`127.0.0.1`).
  `BPMN_PORT` changes the port (8080 by default).
- Ollama running on the host machine is reachable at `http://host.docker.internal:11434/v1`.
- Diagrams saved on the server are kept in the `diagrams` docker volume (`/data/diagrams` in the
  container, one `.bpmn` file per diagram). `docker compose down -v` deletes them.
- The server has no authentication: do not expose it on a public network.

### Connect an agent

Click the **MCP** badge in the toolbar: the "Connect an agent" window shows the MCP address of this
installation, worked out from the address of the page, with a Copy button and ready-to-paste settings
for Claude Code (`claude mcp add`), Claude Desktop (through `mcp-remote`) and other clients
(Cursor, VS Code, `.mcp.json`). The agent draws in the editor tab used last, so keep it open.

| Install | MCP address |
|---|---|
| docker on this machine | `http://localhost:8080/mcp` (or the port set in `BPMN_PORT`) |
| development (`npm run dev` and `mcp/`) | `http://127.0.0.1:3333/mcp` |
| docker behind a domain name or a reverse proxy | `https://your-domain/mcp` |

To reach the editor from another machine or through a domain name, set these variables in a `.env`
file next to `docker-compose.yml`:

```
BPMN_BIND=0.0.0.0                      # listen on every interface (127.0.0.1 by default)
BPMN_EDITOR_ORIGINS=https://bpmn.example.com
MCP_ALLOWED_HOSTS=bpmn.example.com
```

`BPMN_EDITOR_ORIGINS` lists the addresses of the editor pages (with `http://` or `https://`), and
`MCP_ALLOWED_HOSTS` the host names that MCP clients use. The reverse proxy must pass the `Host` header
and allow WebSocket upgrades on `/bridge`.

The server has no login. Put `MCP_TOKEN=a-long-random-value` in `mcp/.env` so that MCP clients must
send `Authorization: Bearer <token>`, then restart the server. The "Generate a token" button of the
window draws one at random and fills it into the `mcp/.env` line and the settings to copy; the page
cannot write `mcp/.env` itself. The editor
pages and saved diagrams stay open to anyone who reaches the site, so keep it on a trusted network or
behind a proxy that asks for a login.

## Editor features

### Files

- **File name**: the field on the left of the toolbar sets the name used when saving and for every
  export.
- **New** starts from an empty diagram.
- **Open**: ".bpmn or .xml file…" opens a file from disk, "Paste XML…" opens a diagram pasted as
  code. You can also drop a file onto the page.
- **Export**: .bpmn file, .xml file, "XML code to copy…" (a window to copy or download the code),
  then SVG image, PNG image and PDF document.
- The current diagram is kept by the browser and restored when the page is opened again.
- **My diagrams** keeps several diagrams: save the current one under a name, then reopen, rename or
  delete them. They are saved in the browser (on this device only), and in the docker version also
  on the server, where any browser that reaches it can open them. Once a diagram is saved, **Ctrl+S**
  updates it. "Save as new" makes a copy.

### Drawing

- Tool palette on the left, context pad next to the selected element, copy and paste (including
  between tabs) and copying a selection as an image.
- **Colors**: the brush in the context pad offers 18 colors, each with a pale fill and a dark,
  readable stroke, plus "Custom color…" to pick any color. The stroke is then computed to
  stay readable.
- **Text**: the "A" button in the context pad formats the element's label: bold, italic, underline,
  size (10 to 24) and font (Sans serif, Serif, Monospace). "Default text" removes the
  formatting. The style is saved in the .bpmn file as the BPMN standard defines it
  (`bpmndi:BPMNLabelStyle`). Underline does not show in the PDF export.
- **Tidy up** rearranges the diagram layout.
- **Simulation** runs tokens through the process to check how it flows.
- Automatic BPMN rule checking, with problems flagged on the canvas.
- Grid, minimap and properties panel (hidden or shown with the button on the right).
- **Theme**: light, dark, or automatic to follow the system.
- **Language**: the EN/FR button switches the interface between English (default) and French. The
  browser remembers the choice, and the diagram is kept.

### AI assistant

The **AI assistant** button opens the chat panel: describe a process and the assistant draws it, in
the language you write in. The "Options" window sets up providers and keys and picks the model: a
provider's models are offered once its connection has been tested. The panel shows the model in use.

- The input grows with its text. The button in its corner opens a large editor, handy to paste a
  long prompt or load one from a .txt or .md file. Ctrl+Enter sends.
- A message can be up to 100,000 characters long.

## Online version

- Providers: Anthropic, OpenAI, Ollama and any OpenAI-compatible server, set up in the "Options"
  window of the assistant panel. Each visitor uses their own key and pays for their own calls.
- The key stays in the browser: for the tab's session, or on the device if "Remember keys on your
  device" is checked. The site receives neither the key nor the diagram.
- The provider must accept calls from a web page (CORS). Anthropic does. OpenAI does not always:
  the docker version avoids that block. Ollama must be started with `OLLAMA_ORIGINS` set to the
  site's address. A compatible server (LiteLLM…) must allow that address in its CORS settings.
- The page runs no third-party script: a Content Security Policy (CSP) only allows the site's own
  scripts, and the Urbanist font is served by the site.
- No MCP server in this version. My diagrams saves in the browser only.
- Privacy: a "Privacy" link at the bottom of the canvas says what leaves the browser. Nothing is sent
  to the site: diagrams, settings and keys stay in the browser. With the assistant, messages, the
  diagram and the key go straight to the chosen AI provider, which applies its own rules. The host of
  the site keeps technical logs, such as the IP address. Set `VITE_SITE_HOST` at build time to name
  the host (for example `VITE_SITE_HOST="GitHub Pages" npm run build:online`).
