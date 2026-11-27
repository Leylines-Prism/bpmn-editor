// Modules du mode Expert : chaque fonction experte s'allume ou s'éteint à part, dans la
// fenêtre « Choisir les modules… » du menu Expert. Le mode Expert reste l'interrupteur
// général (src/expert-mode.js) ; un module ne se montre que s'il est allumé.
//
// Chaque module a un identifiant. Allumé, il pose la classe html.mod-<id> ; tout élément
// marqué .mod-<id>-only disparaît quand il est éteint (règle écrite ici, pour chaque module
// déclaré). Un module peut en demander un autre (la carte de chaleur vit dans la simulation).
// Un nouveau module se déclare avec registerModule() avant setupExpertModules().
//
// Le choix est retenu dans ce navigateur, dans une seule clé. Les outils MCP et le
// Co-pilote ne changent pas : un agent garde tous ses outils, quels que soient les modules.

import { T, lang } from './i18n/lang.js'
import { setExpert } from './expert-mode.js'
import { addDialogClose } from './dialog-close.js'

const KEY = 'bpmn-editor-expert-modules'
export const MODULES_EVENT = 'bpmn-pilot-expert-modules'

// Ordre d'affichage dans la fenêtre. help : ancre de la section d'aide (FR, EN).
const modules = [
  {
    id: 'simulation', icon: 'play', default: true, help: ['simulation', 'simulation'],
    name: () => T('Token simulation', 'Simulation de jetons'),
    detail: () => T('Run tokens through the process, with the branch probabilities.', 'Faire circuler des jetons dans le processus, avec les probabilités des branches.'),
  },
  {
    id: 'heatmap', icon: 'heatmap', default: true, requires: 'simulation', help: ['carte-chaleur', 'heatmap'],
    name: () => T('Heatmap', 'Carte de chaleur'),
    detail: () => T('Color the diagram by the number of tokens, and run up to 10,000 tokens at once.', 'Colorer le diagramme selon le nombre de jetons, et lancer jusqu\'à 10 000 jetons d\'un coup.'),
  },
  {
    id: 'report', icon: 'pdf', default: true, help: ['rapport-processus', 'process-report'],
    name: () => T('Process report', 'Rapport de processus'),
    detail: () => T('Findings, improvement areas and element sequence, as a PDF or Markdown.', 'Constats, axes d\'amélioration et séquence des éléments, en PDF ou en Markdown.'),
  },
  {
    id: 'dmn', icon: 'table', default: false, legacyKey: 'bpmn-editor-dmn', help: ['decisions-dmn', 'dmn-decisions'],
    name: () => T('Decision tables (DMN)', 'Tables de décision (DMN)'),
    detail: () => T('Link business rule tasks to DMN decision tables, edited in the app.', 'Relier les tâches de règle métier à des tables de décision DMN, modifiables dans l\'application.'),
  },
]

export function registerModule(module) {
  if (!modules.some((m) => m.id === module.id)) modules.push(module)
  writeStyle()
  applyClasses()
}

export const listModules = () => modules.map(({ id, requires }) => ({ id, requires }))

function readState() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {} } catch { return {} }
}

let state = readState()

// État d'un module, sans tenir compte de celui qu'il demande.
function ownState(module) {
  if (typeof state[module.id] === 'boolean') return state[module.id]
  if (module.legacyKey) {
    try {
      const legacy = localStorage.getItem(module.legacyKey)
      if (legacy === 'on' || legacy === 'off') return legacy === 'on'
    } catch { /* stockage indisponible */ }
  }
  return !!module.default
}

// Allumé : son propre interrupteur, et celui du module qu'il demande.
export function isModuleOn(id) {
  const module = modules.find((m) => m.id === id)
  if (!module) return false
  if (module.requires && !isModuleOn(module.requires)) return false
  return ownState(module)
}

function applyClasses() {
  const root = document.documentElement
  for (const m of modules) root.classList.toggle(`mod-${m.id}`, isModuleOn(m.id))
  root.classList.toggle('mod-none', !modules.some((m) => isModuleOn(m.id)))
}

function writeStyle() {
  // Tests sous Node : document réduit, sans feuille de style à écrire.
  if (typeof document.getElementById !== 'function') return
  let style = document.getElementById('expert-modules-style')
  if (!style) {
    style = document.createElement('style')
    style.id = 'expert-modules-style'
    document.head.append(style)
  }
  style.textContent = modules.map((m) => `html:not(.mod-${m.id}) .mod-${m.id}-only`).join(',\n') + ' { display: none !important; }'
}

// Allume ou éteint un module. Allumer un module active aussi le mode Expert.
export function setModule(id, value) {
  const module = modules.find((m) => m.id === id)
  if (!module) return
  state = { ...state, [id]: !!value }
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* stockage indisponible : le choix vaut pour cette page */ }
  if (module.legacyKey) {
    try { localStorage.setItem(module.legacyKey, value ? 'on' : 'off') } catch { /* idem */ }
  }
  if (value) setExpert(true)
  applyClasses()
  window.dispatchEvent(new CustomEvent(MODULES_EVENT, { detail: { id, on: isModuleOn(id) } }))
}

writeStyle()
applyClasses()

// ── Fenêtre « Choisir les modules… » ──
let dialog = null

function helpLink(module) {
  const fr = lang === 'fr'
  const anchor = module.help ? module.help[fr ? 0 : 1] : ''
  return anchor ? `${fr ? 'aide.html' : 'help.html'}#${anchor}` : ''
}

function render() {
  const list = dialog.querySelector('.mod-list')
  list.replaceChildren()
  for (const m of modules) {
    const parentOff = m.requires && !isModuleOn(m.requires)
    const row = document.createElement('label')
    row.className = 'mod-row' + (parentOff ? ' disabled' : '')
    const parent = parentOff ? modules.find((p) => p.id === m.requires) : null
    row.innerHTML = `
      <span class="mod-icon" data-icon="${m.icon || 'expert'}" aria-hidden="true"></span>
      <span class="mod-text"><strong></strong><span class="mod-detail"></span></span>
      <input type="checkbox" class="mod-switch" role="switch">`
    row.querySelector('strong').textContent = m.name()
    const detail = row.querySelector('.mod-detail')
    detail.textContent = parent ? `${m.detail()} ${T(`Needs ${parent.name()}.`, `Demande ${parent.name()}.`)}` : m.detail()
    const link = helpLink(m)
    if (link) {
      const a = document.createElement('a')
      a.href = link
      a.target = '_blank'
      a.rel = 'noopener'
      a.className = 'mod-help'
      a.textContent = T('Help', 'Aide')
      detail.append(' ', a)
    }
    const input = row.querySelector('input')
    input.checked = ownState(m) && !parentOff
    input.disabled = !!parentOff
    input.setAttribute('aria-label', m.name())
    input.addEventListener('change', () => { setModule(m.id, input.checked); render() })
    list.append(row)
  }
}

export function openModulesDialog() {
  if (!dialog) {
    dialog = document.createElement('dialog')
    dialog.id = 'modules-dialog'
    dialog.innerHTML = `
      <form method="dialog">
        <h2>${T('Expert modules', 'Modules experts')}</h2>
        <p class="hint">${T('Turn on only the functions you use. Each one shows its commands in the Expert menu and the Process panel. Diagrams keep their data, and AI agents keep all their tools.',
          'Allumez seulement les fonctions dont vous vous servez. Chacune ajoute ses commandes au menu Expert et au panneau Processus. Les diagrammes gardent leurs données, et les agents IA gardent tous leurs outils.')}</p>
        <div class="mod-list"></div>
        <div class="actions">
          <span class="grow"></span>
          <button type="submit" class="btn" value="close">${T('Close', 'Fermer')}</button>
        </div>
      </form>`
    addDialogClose(dialog)
    document.body.append(dialog)
  }
  render()
  if (!dialog.open) dialog.showModal()
}

export function setupExpertModules(button) {
  button?.addEventListener('click', openModulesDialog)
}
