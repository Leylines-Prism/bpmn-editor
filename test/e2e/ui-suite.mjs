// Campagne navigateur : parcourt l'éditeur comme un utilisateur et cherche les artefacts visuels.
//
//   node test/e2e/ui-suite.mjs --url http://localhost:8080 [--out dossier] [--only fr-light-1440]
//
// Pour chaque combinaison langue (fr, en) × thème (clair, sombre) × largeur (1440, 540 px) :
// ouvre l'éditeur avec un diagramme d'exemple, en mode normal puis en mode Expert, ouvre chaque
// menu de la barre et chaque fenêtre qu'il propose, prend une capture et contrôle :
//   - débordement horizontal de la page ;
//   - boutons visibles qui se chevauchent ou sortent de l'écran ;
//   - texte coupé (largeur du contenu plus grande que la boîte, sans points de suspension) ;
//   - contraste du texte sous 3:1 ;
//   - bouton sans nom lisible, image cassée, clé de traduction affichée telle quelle ;
//   - erreur JavaScript ou erreur dans la console ;
//   - fenêtre qui ne se ferme pas à la touche Échap.
// Les captures vont dans --out pour la relecture à l'œil. Un résumé JSON y est écrit aussi.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const { chromium } = createRequire(import.meta.url)('playwright')

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]?.startsWith('--') ? true : all[i + 1] ?? true]] : acc), []),
)
const BASE = String(args.url || 'http://localhost:8080').replace(/\/$/, '')
const OUT = String(args.out || 'test-results/ui')
mkdirSync(OUT, { recursive: true })
const FIXTURE = readFileSync(new URL('./fixtures/commande.bpmn', import.meta.url), 'utf8')

const findings = []
let checks = 0
function finding(where, kind, detail) {
  findings.push({ where, kind, detail })
  console.log(`ÉCHEC [${where}] ${kind} : ${detail}`)
}

// Contrôles faits dans la page. Rend une liste de { kind, detail }.
function inspect() {
  const out = []
  const vw = window.innerWidth
  const vh = window.innerHeight
  const visible = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return false
    const s = getComputedStyle(el)
    if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false
    // Dans un menu fermé ou derrière un élément caché.
    return el.checkVisibility ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : true
  }
  const label = (el) => (el.id ? `#${el.id}` : '') + (el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '') || el.tagName.toLowerCase()
  const name = (el) => (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim()

  if (document.documentElement.scrollWidth > vw + 1) out.push({ kind: 'débordement horizontal', detail: `${document.documentElement.scrollWidth} px pour ${vw}` })

  const controls = [...document.querySelectorAll('button, [role="menuitem"], a.btn, input:not([type="hidden"]), select')].filter(visible)
  for (const el of controls) {
    const r = el.getBoundingClientRect()
    if (!name(el) && !el.labels?.length && el.tagName !== 'INPUT') out.push({ kind: 'bouton sans nom', detail: label(el) })
    // Une page qui défile en hauteur (aide, vitrine) a des boutons plus bas que l'écran : seul le
    // débordement de côté compte, plus le bas de l'écran pour l'éditeur, qui ne défile pas.
    const pageScrolls = document.documentElement.scrollHeight > vh + 1
    if (r.right > vw + 1 || r.left < -1 || (!pageScrolls && (r.bottom > vh + 1 || r.top < -1))) {
      // Les éléments d'un conteneur qui défile ne comptent pas.
      let p = el.parentElement
      let scrolls = false
      while (p && p !== document.body) {
        const s = getComputedStyle(p)
        if (/(auto|scroll)/.test(s.overflow + s.overflowX + s.overflowY)) { scrolls = true; break }
        p = p.parentElement
      }
      if (!scrolls) out.push({ kind: 'hors de l’écran', detail: `${label(el)} « ${name(el).slice(0, 30)} » (${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)})` })
    }
  }
  // Chevauchements entre boutons d'un même niveau (barre, menu ouvert, fenêtre).
  const buttons = controls.filter((el) => el.tagName === 'BUTTON' || el.getAttribute('role') === 'menuitem')
  for (let i = 0; i < buttons.length; i++) {
    for (let j = i + 1; j < buttons.length; j++) {
      const a = buttons[i], b = buttons[j]
      if (a.contains(b) || b.contains(a)) continue
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect()
      const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left)
      const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top)
      if (w > 4 && h > 4) {
        // Un bouton recouvert par un autre plus haut dans l'empilement est un vrai chevauchement ;
        // deux couches distinctes (menu ouvert au-dessus de la barre) ne le sont pas.
        const cx = Math.max(ra.left, rb.left) + w / 2, cy = Math.max(ra.top, rb.top) + h / 2
        const top = document.elementFromPoint(cx, cy)
        if (top && (a.contains(top) || b.contains(top))) {
          const layerA = a.closest('[popover], dialog, .djs-container') , layerB = b.closest('[popover], dialog, .djs-container')
          if (layerA === layerB) out.push({ kind: 'chevauchement', detail: `${label(a)} « ${name(a).slice(0, 20)} » et ${label(b)} « ${name(b).slice(0, 20)} » (${Math.round(w)}×${Math.round(h)} px)` })
        }
      }
    }
  }
  // Texte coupé.
  for (const el of [...document.querySelectorAll('button, label, h1, h2, h3, .menu *, dialog *')].filter(visible)) {
    if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue
    const s = getComputedStyle(el)
    if (s.textOverflow === 'ellipsis') continue
    if (el.scrollWidth > el.clientWidth + 2 && s.overflow !== 'visible' && s.overflowX !== 'visible') out.push({ kind: 'texte coupé', detail: `${label(el)} « ${el.textContent.trim().slice(0, 40)} »` })
  }
  // Clés de traduction ou textes de gabarit restés tels quels.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let n; (n = walker.nextNode());) {
    const t = n.textContent.trim()
    if (!t || !n.parentElement || !visible(n.parentElement) || n.parentElement.closest('script, style, .djs-container, code, pre, textarea')) continue
    if (/^[a-z]+(\.[a-zA-Z0-9_-]+){1,}$/.test(t) && !/^[a-z0-9-]+\.(io|fr|com|org|net|dev)$/.test(t) && !/\.(bpmn|dmn|xml|csv|xes|md|pdf|png|svg|docx|xlsx|html|json|enc)$/.test(t)) out.push({ kind: 'clé de traduction', detail: t })
    if (/undefined|NaN|\[object Object\]|\$\{/.test(t)) out.push({ kind: 'texte de gabarit', detail: t.slice(0, 60) })
  }
  // Images cassées.
  for (const img of document.querySelectorAll('img')) if (visible(img) && img.complete && img.naturalWidth === 0) out.push({ kind: 'image cassée', detail: img.getAttribute('src') })
  // Contraste du texte (couleur du texte contre le premier fond opaque trouvé en remontant).
  const rgb = (c) => (c.match(/[\d.]+/g) || []).map(Number)
  const lum = ([r, g, b]) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const bgOf = (el) => {
    for (let p = el; p; p = p.parentElement) {
      const s = getComputedStyle(p)
      if (s.backgroundImage && s.backgroundImage !== 'none') return null
      const c = rgb(s.backgroundColor)
      if (c.length >= 3 && (c[3] === undefined || c[3] > 0.9)) return c
    }
    return [255, 255, 255]
  }
  const seen = new Set()
  for (const el of [...document.querySelectorAll('button, a, label, p, li, span, h1, h2, h3, td, th, summary')].filter(visible)) {
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue
    if (el.closest('.djs-container, [aria-disabled="true"], :disabled')) continue
    const s = getComputedStyle(el)
    const fg = rgb(s.color)
    const bg = bgOf(el)
    if (!bg || fg.length < 3 || (fg[3] !== undefined && fg[3] < 0.5)) continue
    const [l1, l2] = [lum(fg), lum(bg)].sort((a, b) => b - a)
    const ratio = (l1 + 0.05) / (l2 + 0.05)
    if (ratio < 3) {
      const key = `${s.color}|${bg}|${el.textContent.trim().slice(0, 20)}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ kind: 'contraste faible', detail: `${label(el)} « ${el.textContent.trim().slice(0, 30)} » ${ratio.toFixed(2)}:1` })
    }
  }
  return out
}

async function check(page, where, file) {
  checks++
  await page.waitForTimeout(250)
  if (file) await page.screenshot({ path: join(OUT, `${file}.png`) })
  for (const f of await page.evaluate(inspect)) finding(where, f.kind, f.detail)
}

// Ouvre chaque fenêtre (dialog) apparue, la contrôle, puis vérifie qu'Échap la ferme.
async function checkDialog(page, where, file) {
  const open = page.locator('dialog[open]').last()
  if (!(await open.count())) return false
  await check(page, where, file)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  if (await page.locator('dialog[open]').count()) {
    finding(where, 'Échap ne ferme pas la fenêtre', await open.getAttribute('id').catch(() => '?'))
    // Fermeture de secours, pour continuer.
    await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()))
  }
  return true
}

// Commandes d'un menu qui ouvrent une fenêtre sans rien changer (les exports et les
// commandes d'IA sont couverts par la suite MCP et par les parcours).
const SAFE_MENU = /btn-(import-xml|import-table|import-grid|compare-file|library|expert-modules|ai-potential|ai-stories|mining|dmn-drd|plan)$/

async function sweep(browser, { lang, theme, width }) {
  const tag = `${lang}-${theme}-${width}`
  const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme, locale: lang === 'fr' ? 'fr-FR' : 'en-US' })
  await context.addInitScript(([lang, theme, xml]) => {
    try {
      if (!sessionStorage.getItem('e2e-init')) {
        localStorage.setItem('bpmn-editor-lang', lang)
        localStorage.setItem('bpmn-editor-theme', theme)
        localStorage.setItem('bpmn-editor-autosave', xml)
        localStorage.setItem('bpmn-editor-small-screen-dismissed', '1')
        sessionStorage.setItem('e2e-init', '1')
      }
    } catch {}
  }, [lang, theme, FIXTURE])
  const page = await context.newPage()
  page.on('pageerror', (err) => finding(tag, 'erreur JavaScript', err.message.slice(0, 200)))
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const t = msg.text()
    // Version en ligne : pas de serveur MCP, l'absence du pont est attendue.
    if (/bridge|WebSocket|ERR_CONNECTION_REFUSED/.test(t)) return
    finding(tag, 'erreur console', t.slice(0, 200))
  })
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await page.waitForSelector('.djs-container')
  await page.waitForTimeout(800)

  for (const expert of [false, true]) {
    const mode = expert ? 'expert' : 'normal'
    await page.evaluate((on) => {
      localStorage.setItem('bpmn-editor-expert', on ? 'on' : 'off')
    }, expert)
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForSelector('.djs-container')
    await page.waitForTimeout(800)
    await check(page, `${tag} ${mode}`, `${tag}-${mode}-editeur`)

    // Sélection d'une tâche : panneau des propriétés, menu contextuel, mise en forme.
    const task = page.locator('.djs-element.djs-shape[data-element-id^="Activity"]').first()
    if (await task.count()) {
      await task.click()
      await check(page, `${tag} ${mode} tâche sélectionnée`, `${tag}-${mode}-selection`)
      await page.keyboard.press('Escape')
    }

    // Menus de la barre (popover) et fenêtres qu'ils ouvrent.
    const menus = await page.$$eval('#toolbar [popovertarget]', (els) => els.filter((e) => e.offsetParent).map((e) => ({ id: e.id, target: e.getAttribute('popovertarget') })))
    for (const m of menus) {
      await page.click(`#${m.id}`)
      await page.waitForTimeout(250)
      await check(page, `${tag} ${mode} menu ${m.target}`, `${tag}-${mode}-${m.target}`)
      const items = await page.$$eval(`#${m.target} button[id]`, (els) => els.filter((e) => e.offsetParent && !e.disabled).map((e) => e.id))
      await page.keyboard.press('Escape')
      for (const id of items.filter((i) => SAFE_MENU.test(i))) {
        await page.click(`#${m.id}`)
        await page.waitForTimeout(150)
        await page.click(`#${id}`).catch(() => {})
        await page.waitForTimeout(500)
        if (!(await checkDialog(page, `${tag} ${mode} ${id}`, `${tag}-${mode}-${id}`))) await page.keyboard.press('Escape')
      }
    }

    // Boutons directs de la barre qui ouvrent une fenêtre ou un panneau.
    for (const id of ['btn-library', 'btn-search', 'btn-plan', 'btn-properties']) {
      const b = page.locator(`#${id}:visible`)
      if (!(await b.count())) continue
      await b.click().catch(() => {})
      await page.waitForTimeout(500)
      if (!(await checkDialog(page, `${tag} ${mode} ${id}`, `${tag}-${mode}-${id}`))) {
        await check(page, `${tag} ${mode} ${id}`, `${tag}-${mode}-${id}`)
        await page.keyboard.press('Escape')
        if (id === 'btn-properties') await b.click().catch(() => {})
      }
    }
  }
  await context.close()
}

// Pages annexes : aide (FR et EN), vitrine.
async function pages(browser) {
  for (const [path, lang] of [['/aide.html', 'fr'], ['/help.html', 'en'], ['/about.html', 'fr']]) {
    for (const theme of ['light', 'dark']) {
      for (const width of [1440, 540]) {
        const tag = `${path.slice(1, -5)}-${theme}-${width}`
        const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme })
        await context.addInitScript(([lang, theme]) => {
          try { localStorage.setItem('bpmn-editor-lang', lang); localStorage.setItem('bpmn-editor-theme', theme) } catch {}
        }, [lang, theme])
        const page = await context.newPage()
        page.on('pageerror', (err) => finding(tag, 'erreur JavaScript', err.message.slice(0, 200)))
        const res = await page.goto(BASE + path, { waitUntil: 'networkidle' })
        if (!res || res.status() >= 400) { finding(tag, 'page absente', String(res?.status())); await context.close(); continue }
        // Toutes les sections repliables ouvertes, pour tout contrôler.
        await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)))
        await page.waitForTimeout(600)
        await check(page, tag, null)
        await page.screenshot({ path: join(OUT, `${tag}.png`), fullPage: true })
        // Liens internes et ancres.
        const broken = await page.evaluate(async () => {
          const bad = []
          for (const a of document.querySelectorAll('a[href]')) {
            const href = a.getAttribute('href')
            if (href.startsWith('#')) {
              if (href.length > 1 && !document.getElementById(decodeURIComponent(href.slice(1)))) bad.push(href)
            } else if (!/^(https?:|mailto:)/.test(href)) {
              const r = await fetch(new URL(href, location.href), { method: 'HEAD' }).catch(() => null)
              if (!r || r.status >= 400) bad.push(href)
            }
          }
          return bad
        })
        for (const b of broken) finding(tag, 'lien interne cassé', b)
        await context.close()
      }
    }
  }
}

const browser = await chromium.launch()
const only = args.only && args.only !== true ? String(args.only) : null
for (const lang of ['fr', 'en']) {
  for (const theme of ['light', 'dark']) {
    for (const width of [1440, 540]) {
      if (only && only !== `${lang}-${theme}-${width}`) continue
      console.log(`=== ${lang} ${theme} ${width}px`)
      await sweep(browser, { lang, theme, width })
    }
  }
}
if (!only) await pages(browser)
await browser.close()

// Regroupement : un même défaut vu dans plusieurs combinaisons n'est listé qu'une fois.
const grouped = {}
for (const f of findings) {
  const key = `${f.kind} : ${f.detail}`
  ;(grouped[key] ||= []).push(f.where)
}
writeFileSync(join(OUT, 'resultats.json'), JSON.stringify({ base: BASE, date: new Date().toISOString(), checks, findings: grouped }, null, 2))
console.log(`\n${checks} écrans contrôlés, ${Object.keys(grouped).length} défauts distincts. Captures dans ${OUT}`)
process.exit(findings.length ? 1 : 0)
