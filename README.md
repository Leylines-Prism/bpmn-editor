![BPMN-Pilot: draw BPMN 2.0 processes in the browser, by hand, with an AI co-pilot, or from any MCP agent](public/social-preview.png)

# BPMN-Pilot

[![CI](https://github.com/Leylines-Prism/bpmn-pilot/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Leylines-Prism/bpmn-pilot/actions/workflows/ci.yml)
[![Version](https://img.shields.io/github/v/tag/Leylines-Prism/bpmn-pilot?sort=semver&label=version)](https://github.com/Leylines-Prism/bpmn-pilot/tags)
[![ghcr.io](https://img.shields.io/badge/ghcr.io-leylines--prism%2Fbpmn--pilot-blue?logo=docker&logoColor=white)](https://github.com/Leylines-Prism/bpmn-pilot/pkgs/container/bpmn-pilot)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/Leylines-Prism/bpmn-pilot/badge)](https://scorecard.dev/viewer/?uri=github.com/Leylines-Prism/bpmn-pilot)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/17089/badge)](https://www.bestpractices.dev/projects/17089)
[![BPMN-Pilot MCP server on Glama](https://glama.ai/mcp/servers/Leylines-Prism/bpmn-pilot/badges/score.svg)](https://glama.ai/mcp/servers/Leylines-Prism/bpmn-pilot)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-support-FF5E5B?logo=ko-fi&logoColor=white)](https://ko-fi.com/leylines_prism)

**English** | [Français](README.fr.md)

![The AI co-pilot draws an online order process with two pools and four lanes](docs/demo.gif)

**Model every process of your context in seconds, from a few exchanges with your AI agent.**

Connected to an agent and everything it knows (mail, wiki, document base, RAG, knowledge graph or
"second brain"), BPMN-Pilot turns plain conversations into BPMN diagrams: the agent finds the
processes, the editor draws and checks them, and you review the result. No more hours spent on the
BPMN structure and on drawing by hand.

BPMN-Pilot is a BPMN 2.0 editor in the browser (bpmn-js), in English and French:

- **Connect an agent through MCP** (Docker version), such as Claude Code, Claude Desktop or GitHub Copilot in
  VS Code. It drives the editor open in your browser.
- **Ask the built-in AI co-pilot** ([online](https://bpmn.leylines.fr) or Docker): describe a process
  or attach your documents (Word, Excel, PDF, emails…), and it draws it.
- **Draw by hand**, with the bpmn-js modeler and its extensions.

The same conversation also styles the diagram (colors, fonts, names and types, on as many elements at
once as you like) and each answer undoes in one click. You are the pilot, hence the name: the AI
co-pilot and your agents prepare the work, and you keep the final say on every diagram.

Two ways to use it, your choice:

<table>
<tr>
<td width="50%" valign="top">

**Online: [bpmn.leylines.fr](https://bpmn.leylines.fr)**

Nothing to install, no account: open the link and draw. The AI co-pilot works with your own API key,
and your diagrams stay in your browser. [Learn more](#use-it-online)

</td>
<td width="50%" valign="top">

**With Docker: `ghcr.io/leylines-prism/bpmn-pilot`**

At home, on your machine or your server, with the MCP server that connects your agents
(Claude Code, Claude Desktop, GitHub Copilot) to the editor. [Run it](#run-it-with-docker)

</td>
</tr>
</table>

**For BPMN experts**, the **Expert** button of the toolbar opens what you need to test a model and
report on it: the token simulation and the process report. It turns blue while expert mode is on,
and the toolbar stays uncluttered for everyone else (see the
[dedicated help section](https://bpmn.leylines.fr/help.html#bpmn-experts)):

- **Token simulation with a heatmap**: run as many instances as you like at once, following branch probabilities, and see
  which paths are taken, never reached, or looped through.
- **Process report** as PDF or Markdown: key figures, findings by level, improvement areas, end events,
  activities by lane.
- **Checks on every co-pilot answer**, in both modes: a review of the request before drawing (ambiguities, missing
  points), then six checks (XML, BPMN 2.0 metamodel, references and scopes, diagram interchange,
  reimport, bpmnlint), with automatic correction.

**Presentation** (toolbar button): the diagram alone, full screen and read-only, to walk a meeting
through a process. A pointer menu combines a laser pointer, a highlight of the hovered element and its flows,
a ripple on click and a cursor that hides when still (keys 1 to 4). In Expert mode, the token simulation runs there too.

The expert tools on an internal purchase process with four lanes:

<table>
<tr>
<th width="50%">Presentation mode</th>
<th width="50%">Token simulation</th>
</tr>
<tr>
<td><img src="docs/presentation.gif" alt="The purchase process in presentation mode: zoom, move, fit, then a token runs at 2×" width="100%"></td>
<td><img src="docs/token-simulation.gif" alt="A token runs through the purchase process, at 0.5× then 3×" width="100%"></td>
</tr>
<tr>
<th width="50%">Heatmap</th>
<th width="50%">Process report</th>
</tr>
<tr>
<td><img src="docs/heatmap.gif" alt="The branch probability in the Process panel, then the heatmap after 200 tokens" width="100%"></td>
<td><img src="docs/process-report.gif" alt="The process report in PDF from the Expert menu, then its four pages" width="100%"></td>
</tr>
</table>

BPMN 2.0 is the international standard [ISO/IEC 19510](https://www.iso.org/standard/62652.html),
published by the OMG. A diagram made here reads the same in any compliant editor or engine, and the
.bpmn file opens there.

<details>
<summary><b>Why BPMN rather than a flowchart?</b></summary>

General drawing tools such as draw.io, Lucidchart or Visio draw boxes and arrows. A shape means what its
author meant, and every team invents its own conventions. BPMN gives each symbol a defined meaning:

- **Who does what**: pools for organisations, lanes for roles, message flows for what they exchange.
- **What triggers and what waits**: start, timer, message and error events, and events attached to a
  task for deadlines and exceptions.
- **How paths split and join**: exclusive (one branch), parallel (all of them) and inclusive (some)
  gateways, each with its own rule.
- **A file that tools understand**: the .bpmn file describes the process, not a picture of it. It can
  be checked, simulated, turned into a report, read and written by an AI agent, and run by a workflow
  engine. A flowchart image allows none of this.
- **No lock-in**: the same file opens in any compliant editor, today and in ten years.

</details>

> [!TIP]
> **The online version, [bpmn.leylines.fr](https://bpmn.leylines.fr), is safe to use as is.** It is only
> static files served by GitHub Pages: there is no application server, no account and no database
> behind it.
>
> - **Your diagrams stay in your browser.** They are saved in the browser's own storage, and the files
>   you open or download never leave your computer.
> - **Your API keys stay in your browser too.** They are sent only to the AI provider you chose,
>   straight from your browser, never to a server of this project.
> - **When you use the co-pilot**, your message and the diagram go straight to that provider, under
>   its own terms. Nothing goes through a middleman.
> - **The only other request** is anonymous usage statistics without cookies, which never contain a
>   diagram, a message or a key.
>
> Still, use an API key reserved for this editor, one that expires on its own and has a spending cap.
> What is protected, what is not, and how to check it yourself:
> [Your data and API keys in the online version](docs/online-privacy.md).

The MCP connection goes further than drawing on screen. An agent brings its memory, its context and
everything it is connected to, and uses BPMN diagrams in its own workflows:

- it loads a diagram from BPMN XML, or draws one;
- it checks it against the BPMN rules;
- it gets it back as BPMN XML or a PNG image, or exports it as a BPMN, SVG, PNG or PDF file into the server's
  exports folder, for the next step: a document, a ticket, a repository.

The tools run in an editor tab, which only needs to stay open.

> [!WARNING]
> **Docker version only: not made to be exposed on the internet, by design.** This concerns the copy you
> run yourself, not the online version above. Meant for your machine or a private network, the Docker
> version has no login. The risk stays limited, but publishing it means
> a service open to anyone without authentication: your API keys can be used or stolen, and the
> diagrams stored in the container (the BPMN files of "My diagrams") can be read or deleted. By
> default it only answers on this machine (`127.0.0.1`). If you put it on the internet anyway, you
> do so at your own risk.

## Use it online

The editor is open to everyone at https://bpmn.leylines.fr (GitHub Pages): no account, nothing to
install, just a browser. Its [user guide](https://bpmn.leylines.fr/help.html) explains how to draw,
save, export and use the AI co-pilot. The Help (?) button in the toolbar opens it too.

It follows the released versions (the latest `vX.Y.Z` tag) and shows its version in the bottom left corner of the canvas and of the user guide.

For the AI co-pilot, each visitor enters their own API key, which stays in their browser.
Compared with the Docker version, there is no agent connection (MCP) and no saving on a server, and
some providers (OpenAI) refuse calls from a web page. The "Privacy" link on the page says what leaves the browser, and
[Your data and API keys in the online version](docs/online-privacy.md) gives the details.

The stable page measures its audience anonymously, without cookies: visits, referrers and a few actions (co-pilot opened or used, provider connected, diagram
created, opened or exported, active time by range, support link clicked). No third-party script is loaded: the page sends
these measurements itself ([src/analytics.js](src/analytics.js)), never the content of diagrams,
messages or API keys. "Do Not Track" and "Global Privacy Control" turn measurement off, and a
flag in the browser storage excludes your own visits (see [src/analytics.js](src/analytics.js)). Neither the
Docker image nor `npm run dev` measure anything. The measurement is configured according to the
[recommendations of the CNIL](https://www.cnil.fr/fr/cookies-solutions-pour-les-outils-de-mesure-daudience) (the French data protection authority, page in French) for audience measurement exempt from consent.

## Run it with Docker

You need [Docker](https://docs.docker.com/get-docker/) with Docker Compose. Two images are published
on the GitHub Container Registry, for amd64 and arm64:

- `ghcr.io/leylines-prism/bpmn-pilot`: the editor.
- `ghcr.io/leylines-prism/bpmn-pilot-mcp`: its server (AI co-pilot, MCP for agents, "My diagrams").

### From the command line

```
mkdir bpmn-pilot && cd bpmn-pilot
curl -fsSLO https://raw.githubusercontent.com/Leylines-Prism/bpmn-pilot/main/docker-compose.image.yml
docker compose -f docker-compose.image.yml up -d
```

Then open http://localhost:8080. No `curl`? `wget https://raw.githubusercontent.com/Leylines-Prism/bpmn-pilot/main/docker-compose.image.yml` does the same.

- **AI co-pilot**: create a `.env` file in the same folder with your API key (Anthropic, OpenAI,
  Mistral, or a local Ollama), for example `ANTHROPIC_API_KEY=sk-ant-...`, then run the `up -d` command
  again. All the variables are listed in [mcp/.env.example](mcp/.env.example). You can also enter a
  key in the co-pilot's Options window. Without a key, the editor works; only the co-pilot is off.
- **Your files** (My diagrams on the server, exports) are in the `bpmn-data` folder, next to
  `docker-compose.image.yml`: see [Your files](#your-files-docker-version).
- **Showcase page**: the logo in the toolbar opens a showcase page with the author's logo and
  wallpapers. To turn it off, add `SHOWCASE=off` to the `.env` file (or the stack's environment
  variables), then run the `up -d` command again. The logo then opens the Feedback window.
- **Update**: download `docker-compose.image.yml` again with the same `curl` command, so that you
  also get the new services and settings (your `.env` file and `bpmn-data` folder stay as they are).
  To stay on a given version instead, change the version number of the three image lines (see the
  [versions](https://github.com/Leylines-Prism/bpmn-pilot/tags)). Then:

  ```
  docker compose -f docker-compose.image.yml pull
  docker compose -f docker-compose.image.yml up -d
  ```

### With a container manager

In a tool that deploys Compose stacks (Portainer, for example), create a stack, paste the content of
[docker-compose.image.yml](docker-compose.image.yml), and enter the settings below
(`ANTHROPIC_API_KEY`…) as the stack's environment variables. Set `BPMN_DATA_DIR` to an absolute path
on the host, the folder where you will find your files.

### From the source code

To change the code, or to build the images yourself:

```
git clone https://github.com/Leylines-Prism/bpmn-pilot.git
cd bpmn-pilot
docker compose up -d --build
```

Here the API keys go in `mcp/.env` (copy `mcp/.env.example`), the other settings in a `.env` file
next to `docker-compose.yml`. **Update**: `git pull`, then `docker compose up -d --build`.

## Your files (Docker version)

Everything the server keeps is in one folder, `bpmn-data`, next to the compose file. Open it with your
file explorer to get your files back:

- `bpmn-data/diagrams`: the diagrams saved on the server with "My diagrams", one `.bpmn` file per
  diagram, named after it (`Order process.bpmn`). Renaming a diagram in the editor renames its file.
  Two diagrams with the same name give `Order process.bpmn` and `Order process (2).bpmn`. The hidden
  `.index.json` file links the files to the editor: leave it in place. A `.bpmn` file you copy into
  this folder appears in My diagrams, under its file name (10 MB at most).
- `bpmn-data/exports`: the exports (.bpmn, .xml, SVG, PNG, PDF), when the **Destination** at the top
  of the Export menu is "Server" or "Both". "Download", the default, only downloads them in the browser, as before.
  An export never replaces a file: a second `Order process.pdf` becomes `Order process (2).pdf`.
  "XML code to copy" and "Print" do not make files and are not concerned.

Where the folder is:

- It is created at the first start, next to the compose file, on Docker Desktop (Windows, macOS)
  and on Linux alike. A short `data-init` service prepares it before the server starts (creates
  `diagrams/` and `exports/`, gives them to the server's user), then stops: its "Exited (0)" state is
  expected.
- **Linux**: the server runs as user 1000, without root, so that the files belong to you. If `id -u`
  and `id -g` give other numbers, add `PUID=` and `PGID=` with these numbers to the `.env` file. If the
  server still cannot write in the folder, it says so in its log at startup (`docker compose logs mcp`)
  and in the error of the export, with the folder in question.
- **Elsewhere**: set `BPMN_DATA_DIR` to the path of another folder. In a container manager, always
  give an absolute path, and paste the latest `docker-compose.image.yml`: an older copy has no
  `data-init` service.
- **SELinux** (Fedora, RHEL…): if the server is refused access even with the right owner, add `:z`
  after the mount (`${BPMN_DATA_DIR:-./bpmn-data}:/data:z`), only for a folder dedicated to BPMN Pilot.

Security: the files are readable by their owner and group only (0640, folders 0750). The server runs
on a read-only file system except for this folder, without any Linux capability and without privilege
escalation. It only accepts the five export formats, checks that each file matches its format, takes
20 MB at most per export, and cleans file names (no folder, no hidden file, no name reserved by
Windows).

## If something fails (Docker version)

- **The server log** says what it cannot do at startup: `docker compose -f docker-compose.image.yml logs mcp`
  (without `-f …` from the source code, or the container's log in your container manager).
- **An export to the server, or a save in My diagrams, fails**: the server cannot write to its data
  folder, and the error names it. The `data-init` service prepares the folder at each start; if the
  error stays, the folder belongs to another user than `PUID`:`PGID` (1000:1000 by default).
- **An agent gets a 401 error "MCP is closed"**: the editor is served under a name other than
  localhost without `MCP_TOKEN`. Set the token (see [Reach it from other machines](#reach-it-from-other-machines)).
- **What can my model do?** `docker compose -f docker-compose.image.yml exec mcp node mcp/check-providers.js`
  tries each model set on the server with real calls: reply, tool call, image, PDF. It tells a setting
  error (key, address, model name, rejected by the provider) from a limit of the model (no tool calls,
  no vision, no PDF), for a few hundred tokens per model. It does not cover the providers typed in the
  Options window, which stay in the browser.

## AI providers: tests welcome

Anthropic (Claude Opus, Sonnet and Haiku 5.5) is checked with real calls: reply, tool calls, images
and PDFs. OpenAI, Mistral, xAI, Ollama and OpenAI-compatible servers follow their published APIs,
but the maintainers have no key to check them. If you use one of them, a short report helps a lot:
run the check command (see [If something fails](#if-something-fails-docker-version)), then open an
issue with the [AI provider test report](https://github.com/Leylines-Prism/bpmn-pilot/issues/new?template=provider_test.yml)
form. Never paste a key.

## Reach it from other machines

The container serves plain HTTP on `127.0.0.1:8080`, for this machine only. To use it from your
other devices, keep it on a private network: [Tailscale Serve](https://tailscale.com/kb/1312/serve),
for example, gives it an HTTPS address that only the machines of your tailnet can reach. Then tell
the editor its new name, in the `.env` file next to the Compose file, and add a token
`MCP_TOKEN=...` (the "Connect an agent" window generates one; from the source code, it goes in
`mcp/.env`). The token is required here: as soon as `MCP_ALLOWED_HOSTS` holds a name other than
localhost, `/mcp` answers 401 until `MCP_TOKEN` is set. `MCP_AUTH=off` opens it without a token, for
a network you trust or a proxy that already authenticates `/mcp`:

```
BPMN_EDITOR_ORIGINS=https://bpmn.example.com
MCP_ALLOWED_HOSTS=bpmn.example.com
```

Run `docker compose up -d` again. Other proxies work too: they must pass the `Host` header and allow
WebSocket on `/bridge` (details in [mcp/README.md](mcp/README.md#behind-a-domain-name)).

### On the internet, at your own risk

This project is not designed or tested to be exposed on the internet, and gives no guarantee if you
do it. If you still choose to, put a login in front of the pages and set the token. Here is an
example with [Caddy](https://caddyserver.com/), which gets the certificate for your domain on its
own. Point the domain's DNS to the machine, set the two variables and the token above, then use
this `Caddyfile`:

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

Without a proxy login, anyone who finds the address can use the editor and your API keys. A login
and a token reduce the risk, they do not remove it. [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
with Cloudflare Access is another way to put a login in front of it, with no open port.

## Connect an agent (MCP)

Click the **MCP** badge in the toolbar. The "Connect an agent" window gives the address to use
(`http://localhost:8080/mcp`, or `https://your-domain/mcp`), and the setting to paste for Claude
Code, Claude Desktop, GitHub Copilot in VS Code, Cursor or another MCP client. The agent draws in the editor tab used last, so keep it open.

A token protects this access: the same window generates one and tells you where to put it. It is
optional on `localhost`, and required as soon as the editor is served under another name (see
[Reach it from other machines](#reach-it-from-other-machines)). Without it, the window says that
MCP is closed and the agent gets a 401 error that names `MCP_TOKEN`.

## Where your API keys are kept

**In the Docker version**, the safest place is the server: the `.env` file next to
`docker-compose.image.yml` (or `mcp/.env` from the source code). The key stays on the server and never
reaches the browser. A key typed in the co-pilot's Options window is kept in the browser as below,
then sent with each message to your server, which passes it on to the provider without storing it.

**In the browser** (the online version, or keys typed in Options):

- The key stays in your browser, for this site only. Other sites cannot read it.
- "Remember API keys on your device" unchecked (the default): the key is kept in `sessionStorage` and
  is gone when you close the tab.
- Checked: the key is kept in `localStorage` and stays on the device until you click "Clear API keys".
- It is not encrypted. Encrypting it in the browser would not help: the key to decrypt it would have
  to be stored right next to it.
- What protects it: the page runs no script from another site (Content Security Policy), and the key
  is only sent to the provider you chose.
- The limit: a malicious browser extension, or someone using your session on the computer, can read
  it. On a shared computer, leave the box unchecked.

## Settings

All optional. With the published images, put them all in the `.env` file next to
`docker-compose.image.yml`, or in the stack's environment variables, then run the `up -d` command
again. From the source code, put them in a `.env` file next to `docker-compose.yml` (git ignores
it), unless the table says `mcp/.env`, then run `docker compose up -d --build`.

| Setting | What it does |
|---|---|
| `MISTRAL_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`… (`mcp/.env`) | API keys for the AI co-pilot. See `mcp/.env.example`. |
| `MCP_TOKEN` (`mcp/.env`) | Token that agents must send. The "Connect an agent" window generates one. Required when `MCP_ALLOWED_HOSTS` holds a name other than localhost. |
| `MCP_AUTH` (`mcp/.env`) | `off` opens `/mcp` without a token under a name other than localhost. Only on a network you trust, or behind a proxy that authenticates `/mcp`. |
| `BPMN_PORT` | Port of the site (8080 by default). |
| `BPMN_EDITOR_ORIGINS`, `MCP_ALLOWED_HOSTS` | The address and name of the site when it is served under a domain name (see above). |
| `BPMN_BIND` | Network interface the site listens on (`127.0.0.1` by default). `0.0.0.0` opens it to your network, without HTTPS. |
| `BPMN_DATA_DIR` | Folder of the server files, My diagrams and exports (`./bpmn-data` by default). In a container manager, an absolute path. |
| `PUID`, `PGID` | User and group the server runs as, and that own the data folder (1000 by default). |
| `SHOWCASE` | `off` turns off the showcase page (`about.html`) and its wallpapers. The logo in the toolbar then opens the Feedback window. `on` by default. |

## What the editor does

- **Files**: name, new, open (file, pasted XML, or drop), export (.bpmn, .xml, SVG, PNG, PDF), copy
  as an image, print the diagram alone fitted to one page. The current diagram is restored when you
  come back.
- **My diagrams**: save several diagrams, reopen, rename, delete. Ctrl+S saves.
- **Drawing**: palette, context pad, copy and paste, undo and redo buttons, tidy up, BPMN rule
  checking, grid, minimap, and the Process panel for the properties of each
  element.
- **Expert mode: token simulation, heatmap and process report**: run tokens through the
  process, with a speed slider. During the simulation, color the diagram by the number of tokens
  through each element, played by hand or computed from branch probabilities. Export a process report
  (PDF or Markdown) with the findings in three levels, improvement areas, the element sequence and, after a simulation, the heatmap.
- **Compare**: two versions side by side, with what was added, removed or changed in color and the
  list of differences, from a .bpmn file or from before the AI's answer.
- **Colors and text**: any fill, stroke or text color, from ready-made palettes or the system color
  picker, and text formatting (bold, italic, underline, size, font, "Auto" for readable text on dark
  fills). The Process panel copies a style onto other elements and reuses those already in the
  diagram in one click.
- **AI co-pilot**: describe a process and it draws it, in your language. You can paste or drop
  images, PDF files, office documents (Word, Excel, PowerPoint, OpenDocument) and text files (CSV,
  JSON, XML, Markdown…), whose text is read in the browser. The model is chosen in Options. What it adds or changes is outlined on the
  canvas, a pill sums up the changes, and one click shows the before and after or undoes the whole
  answer.
- **Interface**: light or dark theme, English or French, resizable side panels. Made for a computer
  screen: on a phone, it is mostly for viewing a diagram.

## How it differs from draw.io or Lucidchart

They are great for drawing almost anything, as a team. This editor only does BPMN 2.0, on top of
[bpmn-js](https://github.com/bpmn-io/bpmn-js): a diagram is a real BPMN model, so the .bpmn file
opens in other BPMN tools, can be checked and simulated, and what the AI draws is valid BPMN too. It
has no real-time collaboration, share link or templates, though.

## Development

`npm install`, then `npm run dev` for the editor, and `npm start` in `mcp/` for the server.
Details on the server, the co-pilot and the MCP tools: [mcp/README.md](mcp/README.md).
`npm run build:online` builds the online version as a static site in `dist-online/` (`BASE_PATH` sets its path). Audience measurement is turned on by the GitHub variables `VITE_UMAMI_URL` (address of the measurement service)
and `VITE_UMAMI_WEBSITE_ID` (site ID): without them, nothing is sent.
The site is published by [.github/workflows/pages.yml](.github/workflows/pages.yml) on each change to `main`.

## About this project

This is a personal project, maintained in spare time, and **every contribution is welcome**: bug
reports, ideas, translations, documentation or code. If you feel like helping it grow, please do.

In full transparency: its author is not a professional developer. The editor is built with AI
assistance, using Claude Code and other AI models, and each change is tried in the browser before
it is published. Reviews from experienced developers are especially appreciated.

**Testers wanted for AI providers.** The co-pilot is tried day to day with Anthropic models only.
OpenAI, Mistral, xAI (Grok), Ollama and OpenAI-compatible servers are supported from their documentation, but
rarely tried for real. If you use one of them, any report helps, whether it works or not: open an
[issue](https://github.com/Leylines-Prism/bpmn-pilot/issues) or a
[discussion](https://github.com/Leylines-Prism/bpmn-pilot/discussions) with the provider, the model
and what you tried (drawing, images, PDF files).

Start with [CONTRIBUTING.md](CONTRIBUTING.md). Questions and ideas go to
[Discussions](https://github.com/Leylines-Prism/bpmn-pilot/discussions), bugs to the
[issues](https://github.com/Leylines-Prism/bpmn-pilot/issues), and security problems to the private
form described in [SECURITY.md](SECURITY.md). There is no guaranteed response time, but everything
is read.

## Support development

BPMN-Pilot is free, with no subscription. My buddy Claude runs on caffeine. If it saves you time, a coffee on Ko-fi keeps the project going:

[![Support on Ko-fi](https://img.shields.io/badge/Ko--fi-Support%20the%20project-FF5E5B?logo=ko-fi&logoColor=white&style=for-the-badge)](https://ko-fi.com/leylines_prism)

## License

The code is released under the [MIT License](LICENSE).

The Leylines name, logo and brand assets (the files in [src/brand/](src/brand/) and
the logo drawn by [src/theme/brand-logo.js](src/theme/brand-logo.js)) are not covered by this
license. If you publish your own version, replace them with your own.

The editor is built on [bpmn-js](https://github.com/bpmn-io/bpmn-js), whose license requires the
bpmn.io watermark to stay fully visible on the canvas. Keep it if you change the layout.
