// Mode expert : les fonctions avancées, masquées par défaut pour ne pas encombrer l'éditeur.
// Le bouton Expert de la barre, toujours visible, ouvre un menu : Simulation, Rapport de
// processus (PDF ou Markdown) et Quitter le mode Expert. Choisir une entrée active le mode,
// et le bouton reste plein tant qu'il est actif. Le mode montre :
//   - la simulation de jetons, la carte de chaleur et « Lancer N jetons » (src/heatmap.js) ;
//   - le champ Probabilité (%) du panneau Processus (src/probability-panel.js).
// Tout élément marqué .expert-only, ou ciblé dans leylines.css, disparaît hors du mode.
// Le choix est retenu dans ce navigateur. Les outils MCP et le co-pilote ne changent pas.

import { T } from './i18n/lang.js'

const KEY = 'bpmn-editor-expert'
export const EXPERT_EVENT = 'bpmn-pilot-expert-mode'

function read() {
  try { return localStorage.getItem(KEY) === 'on' } catch { return false }
}

let on = read()
let button = null
document.documentElement.classList.toggle('expert', on)

export const isExpert = () => on

function apply() {
  document.documentElement.classList.toggle('expert', on)
  if (!button) return
  button.classList.toggle('active', on)
  button.title = on
    ? T('Expert mode on: token simulation and process report', 'Mode Expert activé : simulation de jetons et rapport de processus')
    : T('Expert mode: token simulation and process report', 'Mode Expert : simulation de jetons et rapport de processus')
}

// Active ou quitte le mode. Sans effet si l'état ne change pas.
export function setExpert(value) {
  if (on === !!value) return
  on = !!value
  try { localStorage.setItem(KEY, on ? 'on' : 'off') } catch { /* stockage indisponible : le choix vaut pour cette page */ }
  apply()
  window.dispatchEvent(new CustomEvent(EXPERT_EVENT, { detail: { on } }))
}

export function setupExpertMode({ button: expertButton, offButton }) {
  button = expertButton
  apply()
  offButton?.addEventListener('click', () => setExpert(false))
}
