// Mode expert : un bouton de la barre d'outils affiche les fonctions avancées, masquées
// par défaut pour ne pas encombrer l'éditeur :
//   - carte de chaleur et « Lancer 100 jetons » pendant la simulation (src/heatmap.js) ;
//   - champ Probabilité (%) du panneau Processus (src/probability-panel.js) ;
//   - rapport de processus dans le menu Exporter.
// Tout élément marqué .expert-only, ou ciblé dans leylines.css, disparaît hors du mode.
// Le choix est retenu dans ce navigateur. Les outils MCP et le co-pilote ne changent pas.

import { T } from './i18n/lang.js'

const KEY = 'bpmn-editor-expert'
export const EXPERT_EVENT = 'bpmn-pilot-expert-mode'

function read() {
  try { return localStorage.getItem(KEY) === 'on' } catch { return false }
}

let on = read()
document.documentElement.classList.toggle('expert', on)

export const isExpert = () => on

function apply(button) {
  document.documentElement.classList.toggle('expert', on)
  if (!button) return
  button.setAttribute('aria-pressed', String(on))
  button.classList.toggle('active', on)
  button.title = on
    ? T('Expert mode on: heatmap, branch probabilities and process report (click to hide them)', 'Mode expert activé : carte de chaleur, probabilités des branches et rapport de processus (cliquer pour les masquer)')
    : T('Expert mode: show the heatmap, branch probabilities and process report', 'Mode expert : afficher la carte de chaleur, les probabilités des branches et le rapport de processus')
}

export function setupExpertMode(button) {
  apply(button)
  button?.addEventListener('click', () => {
    on = !on
    try { localStorage.setItem(KEY, on ? 'on' : 'off') } catch { /* stockage indisponible : le choix vaut pour cette page */ }
    apply(button)
    window.dispatchEvent(new CustomEvent(EXPERT_EVENT, { detail: { on } }))
  })
}
