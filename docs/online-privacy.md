# Your data and API keys in the online version

**English** | [Français](online-privacy.fr.md)

This page sums up a review of the online version (https://bpmn.leylines.fr, the stable page and the `/dev/`
page), done on 2026-11-26 on version v1.2.2. It traces where each piece of data lives and where it can go.
It does not cover the Docker version, which has its own server (see the [README](../README.md)).

## In short

- The online version is only static files served by GitHub Pages. There is no application server, no
  account and no database behind it. Nothing receives your diagrams or your API keys, apart from the AI
  provider you choose.
- Your diagrams stay in your browser. Your API keys stay in your browser and are only sent to the AI
  provider you chose, straight from your browser.
- When you use the AI assistant, your message, your attachments and the diagram it reads go straight to
  that provider, under its own terms.
- The only other request is an audience count without cookies, which never contains a diagram, a
  message or a key.

Entering an API key on this page is safe within the limits listed below. Still, always use an API key
created for this editor alone, with a limited validity period and a spending limit (see
[Good practice](#good-practice)).

## Where each piece of data lives

| Data | Where it is kept | Where it can go |
|---|---|---|
| The open diagram | browser storage (`localStorage`), saved automatically | nowhere, except to the AI provider when you use the assistant |
| "My diagrams" | browser database (IndexedDB) | nowhere: server storage is turned off in the online version |
| Opened files and exports (BPMN, SVG, PNG, PDF) | read and created in the page, downloaded to your computer | nowhere |
| API keys | `sessionStorage` by default (gone when the tab closes), `localStorage` if "Remember API keys on your device" is checked | only in the request headers sent to the provider you chose |
| Provider addresses and models | `localStorage` | nowhere |
| Conversation with the assistant | page memory only, lost on reload | to the provider, with each message |
| Chat attachments (images, PDF, text) | page memory | to the provider, with the message |

## Every request the page makes

1. **The site's own files** (HTML, scripts, styles, images), from GitHub Pages. As with any website, the
   host sees your IP address and the files requested.
2. **The AI provider you chose**, only when you use the assistant or list its models: Anthropic, OpenAI,
   Mistral, xAI, Ollama on your own machine, or the "OpenAI-compatible" address you enter yourself.
3. **Audience measurement** with [Umami](https://umami.is), on the stable page only: the page address
   (without the part after `#`), the referring site, the browser language, the screen size, and the name
   of an action, with at most an export format or a provider name. No cookie, no diagram, no message, no
   key. It is turned off by "Do Not Track", "Global Privacy Control", and by
   `localStorage.setItem('umami.disabled', '1')`. The code is in [src/analytics.js](../src/analytics.js).

The MCP connection, server storage and server exports do not exist in the online version: their server
address is forced to empty when the online version is built ([src/main.js](../src/main.js)).

## What protects your keys and diagrams

- **No third-party script.** The Content Security Policy only allows the site's own scripts
  (`script-src 'self'`, no inline script apart from one small script allowed by its hash). No CDN, no
  tracker script, no external font.
- **No HTML from outside.** The assistant's replies, diagram names and model names are shown as plain
  text, never interpreted as HTML. The code uses no `eval`.
- **No setting read from the address.** The page reads nothing from the URL's query string: a crafted
  link cannot change a provider address to divert a key.
- **No exit through the assistant.** The assistant's tools only read and change the diagram, or offer a
  download. None of them sends data to an address, so instructions hidden in a diagram or a PDF cannot
  make the assistant send your key elsewhere.
- **No display inside another site.** GitHub Pages cannot send the header that forbids it, so the page
  checks it itself: inside a frame of another page, the editor does not start and only shows a link that
  opens it in its own tab ([src/frame-guard.js](../src/frame-guard.js)). Nothing can be clicked without
  you seeing it.
- **Stored for this site only.** Other websites cannot read what this page keeps in your browser.
- **A locked build.** Exact dependency versions (`npm ci` on the lock file), GitHub Actions pinned by
  commit, and no known vulnerability in the bundled dependencies (`npm audit`) on the review date.

## Known limits

- **Your own device.** A malicious browser extension, or someone using your session on the computer, can
  read a stored key. On a shared computer, leave "Remember API keys on your device" unchecked.
- **Stored keys are not encrypted.** Encrypting them in the browser would not help: the key to decrypt
  them would have to sit right next to them.
- **Open connections.** The page may connect to any `https` address, because you can choose any provider.
  Protection against a stolen key therefore rests on the points above (no third-party script, no HTML from
  outside), not on a list of allowed addresses.
- **Stable and `/dev/` pages share one origin.** They keep separate diagrams and settings, but the code
  of one page could technically read what the other stores.

## Good practice

- Use an API key created for this editor alone, with a limited validity period.
- Add a spending limit if your provider allows it. If the key leaks, it only works here, expires on its
  own and can be deleted without affecting anything else you use.
- On a shared computer, do not tick "Remember API keys on your device", and click "Clear API keys" when
  you are done.

## Check it yourself

Open the browser's developer tools on the page: the Network tab lists every request, and the
Application (or Storage) tab shows what is kept in the browser. The Content Security Policy is in the
`<meta http-equiv="Content-Security-Policy">` tag of the page. To report a problem, see
[SECURITY.md](../SECURITY.md).
