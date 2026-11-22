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
"MCP : connecté" badge shows in the toolbar.

- API keys: in `mcp/.env` (copy `mcp/.env.example`; the file is kept out of git and of the image),
  or entered in the Options window. Without a key, the editor and the MCP tools still work.
- MCP clients (Claude Code…): `http://localhost:8080/mcp`.
- By default, the site can only be reached from the machine running it (`127.0.0.1`).
  `BPMN_PORT` changes the port (8080 by default).
- Ollama running on the host machine is reachable at `http://host.docker.internal:11434/v1`.
- The server has no authentication: do not expose it on a public network.

## Editor features

### Files

- **File name**: the field on the left of the toolbar sets the name used when saving and for every
  export.
- **Nouveau** (New) starts from an empty diagram.
- **Ouvrir** (Open): "Fichier .bpmn ou .xml…" opens a file from disk, "Coller du XML…" opens a
  diagram pasted as code. You can also drop a file onto the page.
- **Exporter** (Export): .bpmn file, .xml file, "Code XML à copier…" (a window to copy or download
  the code), then SVG image, PNG image and PDF.
- The current diagram is kept by the browser and restored when the page is opened again.

### Drawing

- Tool palette on the left, context pad next to the selected element, copy and paste (including
  between tabs) and copying a selection as an image.
- **Colors**: the brush in the context pad offers 18 colors, each with a pale fill and a dark,
  readable stroke, plus "Couleur personnalisée…" to pick any color. The stroke is then computed to
  stay readable.
- **Text**: the "A" button in the context pad formats the element's label: bold, italic, underline,
  size (10 to 24) and font (Sans serif, Serif, Monospace). "Texte par défaut" removes the
  formatting. The style is saved in the .bpmn file as the BPMN standard defines it
  (`bpmndi:BPMNLabelStyle`). Underline does not show in the PDF export.
- **Ranger** (Tidy up) rearranges the diagram layout.
- **Simulation** runs tokens through the process to check how it flows.
- Automatic BPMN rule checking, with problems flagged on the canvas.
- Grid, minimap and properties panel (hidden or shown with the button on the right).
- **Theme**: light, dark, or automatic to follow the system.

### AI assistant

The **Assistant IA** button opens the chat panel: describe a process and the assistant draws it.
The "Modèle" menu picks the model, and the "Options" window sets up providers and keys.

- The input grows with its text. The button in its corner opens a large editor, handy to paste a
  long prompt or load one from a .txt or .md file. Ctrl+Enter sends.
- A message can be up to 100,000 characters long.

## Online version

- Providers: Anthropic, OpenAI, Ollama and any OpenAI-compatible server, set up in the "Options"
  window of the assistant panel. Each visitor uses their own key and pays for their own calls.
- The key stays in the browser: for the tab's session, or on the device if "Se souvenir des clés"
  is checked. The site receives neither the key nor the diagram.
- The provider must accept calls from a web page (CORS). Anthropic does. OpenAI does not always:
  the docker version avoids that block. Ollama must be started with `OLLAMA_ORIGINS` set to the
  site's address. A compatible server (LiteLLM…) must allow that address in its CORS settings.
- The page runs no third-party script: a Content Security Policy (CSP) only allows the site's own
  scripts, and the Urbanist font is served by the site.
- No MCP server in this version.
