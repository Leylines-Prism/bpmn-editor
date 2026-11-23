# bpmn-editor

**English** | [Français](README.fr.md)

A BPMN 2.0 editor in the browser (bpmn-js), with an AI assistant that draws the processes you
describe, and an MCP server so that agents such as Claude Code can draw in it too. It runs on your
own machine with Docker.

## Run it with Docker

You need [Docker](https://docs.docker.com/get-docker/) with Docker Compose.

```
git clone https://github.com/Leylines-Prism/bpmn-editor.git
cd bpmn-editor
docker compose up -d --build
```

Then open http://localhost:8080.

- **AI assistant**: copy `mcp/.env.example` to `mcp/.env` and put your API key in it (Anthropic,
  OpenAI, or a local Ollama), then run `docker compose up -d` again. You can also enter a key in the
  assistant's Options window. Without a key, the editor works; only the assistant is off.
- **Your diagrams** saved with "My diagrams" are kept in the `diagrams` Docker volume.
  `docker compose down -v` deletes them.
- **Update**: `git pull`, then `docker compose up -d --build`.

> **Keep it on your machine or a private network.** It has no accounts: anyone who reaches it can
> use your API keys, read and delete your diagrams, and drive the editor. By default it only answers
> on this machine (`127.0.0.1`).

## Serve it over HTTPS

The container serves plain HTTP on `127.0.0.1:8080`. To reach it at `https://bpmn.example.com`, put
a reverse proxy in front of it. [Caddy](https://caddyserver.com/) gets the certificate for your
domain on its own. Point the domain's DNS to the machine, then use this `Caddyfile`:

```
bpmn.example.com {
	# A login for the pages. /mcp is left out: agents use MCP_TOKEN instead.
	@pages not path /mcp
	basic_auth @pages {
		alice <hash given by: caddy hash-password>
	}
	reverse_proxy 127.0.0.1:8080
}
```

Then tell the editor its new name, in a `.env` file next to `docker-compose.yml`, and put a token in
`mcp/.env` (the "Connect an agent" window generates one):

```
BPMN_EDITOR_ORIGINS=https://bpmn.example.com
MCP_ALLOWED_HOSTS=bpmn.example.com
```

Run `docker compose up -d` again. Without a proxy login, anyone who finds the address can use the
editor and your keys, so never publish it without the login and the token.

Other ways to get HTTPS: [Tailscale Serve](https://tailscale.com/kb/1312/serve) (private, for the
machines of your tailnet) or [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
(no open port, with Cloudflare Access for the login). Set the two variables above to the name they
give you. Other proxies work too: they must pass the `Host` header and allow WebSocket on `/bridge`
(details in [mcp/README.md](mcp/README.md#behind-a-domain-name)).

## Connect an agent (MCP)

Click the **MCP** badge in the toolbar. The "Connect an agent" window gives the address to use
(`http://localhost:8080/mcp`, or `https://your-domain/mcp`), and the setting to paste for Claude
Code, Claude Desktop, Cursor or VS Code. The agent draws in the editor tab used last, so keep it open.

An optional token protects this access: the same window generates one and tells you where to put it.

## Where your API keys are kept

**In the Docker version**, the safest place is `mcp/.env`: the key stays on the server and never
reaches the browser. A key typed in the assistant's Options window is kept in the browser as below,
then sent with each message to your server, which passes it on to the provider without storing it.

**In the browser** (the online demo, or keys typed in Options):

- The key stays in your browser, for this site only. Other sites cannot read it.
- "Remember keys on your device" unchecked (the default): the key is kept in `sessionStorage` and
  is gone when you close the tab.
- Checked: the key is kept in `localStorage` and stays on the device until you click "Clear keys".
- It is not encrypted. Encrypting it in the browser would not help: the key to decrypt it would have
  to be stored right next to it.
- What protects it: the page runs no script from another site (Content Security Policy), and the key
  is only sent to the provider you chose.
- The limit: a malicious browser extension, or someone using your session on the computer, can read
  it. On a shared computer, leave the box unchecked.

## Settings

All optional. Put them in a `.env` file next to `docker-compose.yml` (git ignores it), unless the
table says `mcp/.env`. Then run `docker compose up -d --build`.

| Setting | What it does |
|---|---|
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`… (`mcp/.env`) | Keys for the AI assistant. See `mcp/.env.example`. |
| `MCP_TOKEN` (`mcp/.env`) | Token that agents must send. The "Connect an agent" window generates one. |
| `BPMN_PORT` | Port of the site (8080 by default). |
| `BPMN_EDITOR_ORIGINS`, `MCP_ALLOWED_HOSTS` | The address and name of the site when it is served under a domain name (see above). |
| `BPMN_BIND` | Network interface the site listens on (`127.0.0.1` by default). `0.0.0.0` opens it to your network, without HTTPS. |

## What the editor does

- **Files**: name, new, open (file, pasted XML, or drop), export (.bpmn, .xml, SVG, PNG, PDF). The
  current diagram is restored when you come back.
- **My diagrams**: save several diagrams, reopen, rename, delete. Ctrl+S saves.
- **Drawing**: palette, context pad, copy and paste, 18 colors or a custom one, text formatting
  (bold, italic, size, font, color, with "Auto" for readable text on dark fills), tidy up,
  token simulation, BPMN rule checking, grid, minimap, properties panel.
- **AI assistant**: describe a process and it draws it, in your language. You can paste or drop
  images and PDF files. The model is chosen in Options.
- **Interface**: light or dark theme, English or French, resizable side panels.

## Online demo

A demo runs at https://bpmn.leylines.fr (GitHub Pages). Its [user guide](https://bpmn.leylines.fr/help.html)
explains how to draw, save, export and use the AI assistant. The Help (?) button in the toolbar opens it
too.

It is for a quick try only: each visitor enters their own API key, which stays in their browser.
There is no agent connection (MCP) and no saving on a server, and some providers (OpenAI) refuse
calls from a web page. The "Privacy" link on the page says what leaves the browser.

The demo measures its audience without cookies, with [Umami](https://umami.is): visits, referrers and a few actions (assistant opened or used, provider connected, diagram
created, opened or exported, active time by range). No third-party script is loaded: the page sends
these measurements itself ([src/analytics.js](src/analytics.js)), never the content of diagrams,
messages or keys. "Do Not Track" and "Global Privacy Control" turn measurement off, and
`localStorage.setItem('umami.disabled', '1')` in the console excludes your own visits. Neither the
Docker image nor `npm run dev` measure anything. The measurement follows the recommendations of the CNIL (the French data
protection authority) for audience measurement exempt from consent.

## Development

`npm install`, then `npm run dev` for the editor, and `npm start` in `mcp/` for the server.
Details on the server, the assistant and the MCP tools: [mcp/README.md](mcp/README.md).
`npm run build:online` builds the demo as a static site in `dist-online/` (`BASE_PATH` sets its path). Audience measurement is turned on by the GitHub variables `VITE_UMAMI_URL` (Umami address)
and `VITE_UMAMI_WEBSITE_ID` (site ID): without them, nothing is sent.
It is published by [.github/workflows/pages.yml](.github/workflows/pages.yml) on each change to `main`.
