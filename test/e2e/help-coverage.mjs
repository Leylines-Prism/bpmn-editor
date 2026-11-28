// Couverture de l'aide : chaque bouton de la barre et de ses menus, chaque outil et chaque prompt
// MCP doit être cité dans l'aide (aide.html en français, help.html en anglais).
//
//   node test/e2e/help-coverage.mjs --url http://localhost:8080 [--out dossier]
//
// Le libellé de chaque bouton est lu dans l'éditeur, dans la langue de l'aide contrôlée, mode
// Expert allumé pour voir aussi ses commandes. Un libellé absent de l'aide est un manque à combler
// (ou un libellé qui a changé sans que l'aide suive).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const { chromium } = createRequire(import.meta.url)('playwright')
const { buildTools } = await import('../../src/ai/tools.js')
const { buildPrompts } = await import('../../src/ai/prompts.js')
const z = createRequire(new URL('../../mcp/package.json', import.meta.url))('zod/v4')

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]?.startsWith('--') ? true : all[i + 1] ?? true]] : acc), []),
)
const BASE = String(args.url || 'http://localhost:8080').replace(/\/$/, '')
const OUT = String(args.out || 'test-results/help')
mkdirSync(OUT, { recursive: true })

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[…:.]+$/g, '').replace(/\s+/g, ' ').trim().toLowerCase()

// Boutons dont le libellé change avec l'état, ou que l'aide nomme par une forme courte voulue.
const ALIASES = {
  'btn-properties': { fr: 'panneau processus', en: 'process panel' },
  'btn-install': { fr: 'installer', en: 'install' },
}

const browser = await chromium.launch()
const report = {}
let missingTotal = 0
for (const [lang, helpPath] of [['fr', '/aide.html'], ['en', '/help.html']]) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } })
  await context.addInitScript((lang) => {
    try { localStorage.setItem('bpmn-editor-lang', lang); localStorage.setItem('bpmn-editor-expert', 'on') } catch {}
  }, lang)
  const page = await context.newPage()
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await page.waitForSelector('.djs-container')
  // Tous les boutons de la barre et des menus, visibles ou non (un menu fermé cache les siens).
  // Le libellé seul, sans le texte des badges ou des icônes ajoutés dans le bouton.
  const buttons = await page.$$eval('#toolbar button[id], #toolbar [role="menuitem"][id]', (els) =>
    els.map((e) => ({ id: e.id, label: [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').trim() || e.getAttribute('aria-label') || e.getAttribute('title') || '' })))
  await page.goto(BASE + helpPath, { waitUntil: 'networkidle' })
  // textContent : le texte des sections repliées compte aussi.
  const help = norm(await page.evaluate(() => document.body.textContent + ' ' + [...document.querySelectorAll('[title],[aria-label],img[alt]')].map((e) => `${e.title} ${e.getAttribute('aria-label')} ${e.getAttribute('alt')}`).join(' ')))
  const missing = []
  for (const b of buttons) {
    const label = norm(ALIASES[b.id]?.[lang] ?? b.label.split('(')[0])
    if (!label || label.length < 2) continue
    if (!help.includes(label)) missing.push(`${b.id} « ${b.label} »`)
  }
  // Outils et prompts MCP : documentés dans le README du serveur, dans la même langue.
  const readme = readFileSync(new URL(lang === 'fr' ? '../../mcp/README.fr.md' : '../../mcp/README.md', import.meta.url), 'utf8')
  for (const t of buildTools(z)) if (!t.mcpOnly && !readme.includes(t.name)) missing.push(`outil MCP ${t.name} absent de mcp/README`)
  for (const p of buildPrompts(z)) if (!readme.includes(p.name)) missing.push(`prompt MCP ${p.name} absent de mcp/README`)
  report[helpPath] = { buttons: buttons.length, missing }
  missingTotal += missing.length
  console.log(`${helpPath} : ${buttons.length} boutons lus, ${missing.length} absents de l'aide`)
  for (const m of missing) console.log(`  - ${m}`)
  await context.close()
}
await browser.close()
writeFileSync(join(OUT, 'couverture-aide.json'), JSON.stringify(report, null, 2))
process.exit(missingTotal ? 1 : 0)
