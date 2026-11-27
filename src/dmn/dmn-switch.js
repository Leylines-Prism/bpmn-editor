// Interrupteur « Tables de décision (DMN) » du menu Expert.
//
// Allumé (et en mode Expert), il montre la pastille des tâches de règle métier, le groupe
// Décision (DMN) du panneau et les entrées .dmn des menus Ouvrir et Exporter. Éteint, ces
// commandes disparaissent ; les décisions déjà rangées dans le diagramme restent dans le
// fichier, intactes. Les outils du Co-pilote et du serveur MCP marchent dans les deux cas.
// Le choix est retenu dans ce navigateur (éteint par défaut).

import { T } from '../i18n/lang.js'
import { isExpert, setExpert, EXPERT_EVENT } from '../expert-mode.js'

const KEY = 'bpmn-editor-dmn'
export const DMN_EVENT = 'bpmn-pilot-dmn'

function read() {
  try { return localStorage.getItem(KEY) === 'on' } catch { return false }
}

let on = read()
document.documentElement.classList.toggle('dmn', on)

// Les commandes DMN sont visibles : interrupteur allumé et mode Expert actif.
export const isDmnShown = () => on && isExpert()

function apply(button) {
  document.documentElement.classList.toggle('dmn', on)
  button?.setAttribute('aria-checked', String(on))
  if (button) {
    button.title = on
      ? T('Decision tables are shown on business rule tasks. Click to hide them; the decisions stay in the file.', 'Les tables de décision sont affichées sur les tâches de règle métier. Cliquer pour les masquer ; les décisions restent dans le fichier.')
      : T('Link business rule tasks to DMN decision tables, edited in the app', 'Lier les tâches de règle métier à des tables de décision DMN, modifiables dans l\'application')
  }
}

export function setDmn(value, button = document.getElementById('btn-dmn')) {
  on = !!value
  try { localStorage.setItem(KEY, on ? 'on' : 'off') } catch { /* stockage indisponible : le choix vaut pour cette page */ }
  if (on) setExpert(true)
  apply(button)
  window.dispatchEvent(new CustomEvent(DMN_EVENT, { detail: { on: isDmnShown() } }))
}

export function setupDmnSwitch(button) {
  apply(button)
  button.addEventListener('click', (e) => {
    // Le menu reste ouvert : on voit l'interrupteur basculer.
    e.stopPropagation()
    setDmn(!on, button)
  })
  window.addEventListener(EXPERT_EVENT, () => window.dispatchEvent(new CustomEvent(DMN_EVENT, { detail: { on: isDmnShown() } })))
}
