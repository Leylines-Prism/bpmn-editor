Leylines comes from network infrastructure and fibre-optic communications. The mark is the word leylines underlined by a fibre: a line of light runs beneath the name, from under its first letter to one bright pulse arriving at the end. The name is a double meaning — ley lines are the legendary energy lines said to connect sacred sites across the world, just as fibre connects places across the network.

Build every surface from that idea: a calm ground — white or night — one path of light, a few connected points that glow. The brand works in both modes, as people now expect from any app.

## Visual foundations

### Color

- **Two modes, one brand.** Light and Dark are equal: every UI token has a value for each, and the user's system setting picks one (`prefers-color-scheme`), with a manual switch where the product allows. Light is listed first; Dark keeps the night-sky character of the wallpaper.
- **Brand grounds per mode:** `brand-ground` (white / `night-900`), `brand-card` (white / `night-850`), `wordmark-ink` (`night-800` / `frost`), `icon-tile` (white / `night-800`). Use these instead of picking `white` or a `night-*` value by hand.
- **The leyline gradient** runs `leyline-sky` → `leyline-magenta` → `leyline-orange` (token `leyline`, 135°): light heating up as it travels the fibre, from a cool source to a warm, bright arrival. Keep that direction — sky where the path starts, orange where it ends. Use it only on the line motif and thin accents (≤ 6px strokes, underlines, progress). Never as a page or card background.
- **Nodes** are the sites the line connects — and the last one is the pulse arriving. They are warm spheres with a white core (`node-ice` → `leyline-orange` → `leyline-orange-deep` rim). Halos are glow only — never text.
- **Text on white is black.** Every heading, paragraph, lead and table cell is set in `ink` (`night-800` #0C1120 in Light). `ink-muted` is only for small metadata — captions, labels, timestamps, table headers, hints — never for paragraphs or intros.
- **UI roles:** text in `ink` on `surface` / `surface-raised`; small metadata in `ink-muted`; actions and links in `accent` with labels in `on-accent`; tinted selections in `accent-soft`. Hairlines in `line`, control borders in `line-strong`.
- `warm` and `magenta` are highlight colors for small text and icons — use them to echo the gradient, never for large fills in UI.
- The brand hues are the same in both modes; only text uses adjusted values. Raw `leyline-orange` (2.6:1) and `leyline-sky` (2.2:1) are too faint as text on white: in Light, use `warm` and `accent`.

### Type

- The brand typeface is **Urbanist** (Google Fonts). The wordmark is Urbanist 600, outlined — the logo files need no font to render.
- Set UI and editorial text in `sans` (Urbanist, with system fallbacks); code and IDs in `mono`. Load Urbanist 400, 500 and 600 from Google Fonts.
- Never retype "leylines" in Urbanist to fake the logo — place the logo files.
- Scale: `display` (one per view), `h1`, `h2`, `h3`, `body`, `body-sm`, `label` for controls, `caption` for metadata, `code`.
- Headings sit at weight 600 (the wordmark's weight) with slight negative tracking; body at 400.

### Spacing, radii, elevation

- 4px base: `space-1` … `space-16`. Card padding `space-4`, gaps between cards `space-6`, sections `space-12`.
- Corners come from the marks: `radius-md` (16px, the logo card) for cards and panels, `radius-lg` (24px, the app icon) for large tiles, `radius-sm` for inputs and tags, `radius-pill` for dots and pills.
- Depth: in Light, surfaces separate with `line` hairlines and `elevation-1`; in Dark, with lighter night steps and light itself. In both, `glow-node` goes on one highlighted element at a time (its Light value is tighter so it still reads on white). Never stack glows.

### Focus

- `focus-ring`: 2px solid outline, 2px offset, on every surface in both themes.

### Imagery and motion

- Wallpapers are a network seen from above: leylines crossing a vignetted ground — night in Dark, white with a cool-grey edge in Light — meeting at sparse orange and sky nodes (the sites), the orange ones brighter. Place content in the calm centre band.
- Diagrams of networks, routes or sequences use the same language: paths in the `leyline` gradient or `line`, connection points as nodes, the destination as the brightest node.
- Motion, if any, is a light pulse: it travels along a path, at constant speed, takes the colour of the path where it is (cool at the start, warm at the end), and arrives as a glow on a node. No bounces, no wobble.

## Glow coherence

- **Black and transparent are the same artwork**: same underline, same pulses, same bloom, same white-cored sphere, amber halo (`node-glow`, `node-glow-light`). Black only adds the rounded dark ground.
- **White keeps exactly the same geometry** of nodes and pulses, but the halo turns a deeper **orange** (`node-glow-day` → `leyline-orange`): a pale amber or white glow would vanish on white. Letters in `night-800` (#0C1120).
- No version uses blur: SVG and PNG are identical to the pixel. Anything new drawn in the brand (illustration, wallpaper, animation) follows the same rule — amber halo on dark, orange halo on white.

## Light and dark modes

| | Light | Dark |
|---|---|---|
| Ground | `brand-ground` = white; UI on `surface` | `brand-ground` = `night-900`; UI on `surface` |
| Logo on a card | `leylines-logo-white` | `leylines-logo-black` |
| Logo without a frame | `leylines-logo-white` (on a light ground, prefer it to any transparent file) | `leylines-logo-transparent.svg` / `leylines-logo-transparent-frost.png` (light letters, over a photo or dark ground) |
| App icon | `leylines-icon-square-white` / `-round-white` | `leylines-icon-square-black` / `-round-black` |
| Favicon | `favicon-white` | `favicon-black` |
| Animated logo | `motion/leylines-logo-pulse-light.svg` | `motion/leylines-logo-pulse-dark.svg` |
| Signal icon | `leylines-icon-signal-white` | `leylines-icon-signal-black` |
| Wallpaper / hero | `leylines-wallpaper-light-*` | `leylines-wallpaper-*` |

- **Where:** light ground or white page → `*-white`; dark ground or app (Authentik, leylines.fr) → `*-black`; over a photo or dark ground without a frame → `*-transparent` (light letters).
- The line, its gradient and the node geometry never change between modes — only the ground, the ink and the halo colour do.
- Swap assets with the mode: in HTML, `<picture>` with `<source media="(prefers-color-scheme: dark)">`; for favicons, two `<link rel="icon">` with `media="(prefers-color-scheme: light)"` and `media="(prefers-color-scheme: dark)"`.
- Never put a transparent (light-letter) file on white: the wordmark disappears. `leylines-logo-transparent.png` is an older dark-ink export outside the reference set; prefer `leylines-logo-white`.

## Logo

- **Lockups:** `leylines-logo-black` (frost wordmark on a `night-850` card), `leylines-logo-white` (`night-800` wordmark on a white card), `leylines-logo-transparent.svg` and `leylines-logo-transparent-frost.png` (light letters, no frame, for photos and dark grounds).
- The wordmark is lowercase **leylines** set in full in Urbanist 600 (outlined). Beneath it runs the **fibre underline** — a separate stroke that never touches the letters:
  - **Weight:** the underline is exactly as thick as the letter stems (the stem of the "l").
  - **Gap:** the space between the letters and the underline equals the space between the letters.
  - **The y:** the underline breaks around the y's descender with that same gap on each side — negative space, the light passes behind the letter.
  - **Course:** it starts under the first "l" in `leyline-sky` (cool) and runs the `leyline` gradient to the arrival pulse in `leyline-orange` (warm). Three smaller nodes trail behind the arrival, evenly spaced (36 units on the 310-wide logo, the same gap again before the arrival), growing and brightening toward it. Never add, remove or bunch them.
- Always write the name as "Leylines" in running text.
- Keep at least the height of the "y" descender clear on every side. Do not recolour, outline, stretch, or remove the nodes.
- Use `leylines-leyline.png` (the underline alone, with its nodes) as a graphic device, never as a substitute for the logo.

## Black-and-white logo

- `leylines-logo-mono-black` (pure black #000000) and `leylines-logo-mono-white` (pure white), transparent background, SVG and 1600px PNG.
- One ink, no gradient, no glow: same word, same underline geometry (stem weight, letter-spacing gap, break around the y); the three trailing nodes become small solid discs and the underline ends in one larger arrival disc.
- For what cannot carry colour or glow: print in one colour, fax, engraving, stamps, embroidery, partner logo walls, invoices and letterheads. Black on light grounds, white on dark grounds or photos. Use the colour logo everywhere else.

## Animated logo and signal icon

- Animated logo — `motion/leylines-logo-pulse-light.svg` / `motion/leylines-logo-pulse-dark.svg`, shown live in the AnimatedLogo card: a pulse travels along the fibre underline from under the first letter, slipping behind the y through its gap, and changes colour with the line it travels — sky at the start, magenta midway, orange at the end; each of the three trailing nodes lights up in the colour of the line at its place as the pulse passes, its halo growing in size and intensity from the first node to the last (the last nearly as wide as the arrival node's), then fades out over about 0.8 s, and the pulse lands on the end node, which swells. 2 s loop; the pulse crosses in 1 s. For splash screens, loaders and email signatures that allow animation; use the static logo everywhere else, and where the viewer asks for reduced motion.
- `leylines-icon-signal-white` / `-black`: the app icon with signal rings spreading from the arrival node — for "connected", "live" or status contexts, not as the everyday app icon.

## Iconography

- The app icon is an L-shaped fibre — sky at the top, orange at the end — ending in one warm node — the monogram of the brand — on a `night-800` (black) or white tile with `radius-lg` corners, or a round tile. Favicons are the same mark simplified (a single halo).
- Web setup: `favicon.ico` (dark medallion) for legacy tabs; `favicon-white.svg` / `favicon-black.svg` swapped by `prefers-color-scheme`; `favicon-black-180.png` as `apple-touch-icon`; `favicon-*-192.png` and `-512.png` in the web app manifest.
- No UI icon set is defined. Pick one outline set at 1.5–2px stroke with round caps and joins (matching the leyline's round ends) and flag it as an addition. No emoji.

## Reference file set

The brand's master export holds `svg/` (editable vector sources), `png/` (logos at 1600px, icons at 512 and 1024px, favicons from 16 to 512px) and `favicon.ico` (16/32/48, dark medallion, readable on every browser tab). Palette, in the order of the line: `leyline-sky` #2BB8FF, `leyline-magenta` #D24E8E, `leyline-orange` #FF7E1A; ink `night-800` #0C1120; light `frost` #EAF0F7.

## Content

- The brand name is "Leylines" in sentences, "leylines" only inside the wordmark.
- The two meanings may meet in copy — the technical (fibre, light, paths, connection) and the evocative (lines joining places, energy along a route) — but keep the evocative side light: one image per piece, grounded in what the network actually does.
