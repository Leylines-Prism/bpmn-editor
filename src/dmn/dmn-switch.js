// Module « Tables de décision (DMN) » du mode Expert (src/expert-modules.js).
//
// Allumé (et en mode Expert), il montre la pastille des tâches de règle métier, le groupe
// Table de décision (DMN) du panneau et les entrées .dmn des menus Ouvrir et Exporter. Éteint, ces
// commandes disparaissent ; les décisions déjà rangées dans le diagramme restent dans le
// fichier, intactes. Les outils du Co-pilote et du serveur MCP marchent dans les deux cas.
// Le choix est retenu avec les autres modules (éteint par défaut) ; la classe html.dmn
// reste posée pour les feuilles de style du module.

import { isExpert, EXPERT_EVENT } from '../expert-mode.js'
import { isModuleOn, setModule, MODULES_EVENT } from '../expert-modules.js'

export const DMN_EVENT = 'bpmn-pilot-dmn'

const applyClass = () => document.documentElement.classList.toggle('dmn', isModuleOn('dmn'))
applyClass()

// Les commandes DMN sont visibles : module allumé et mode Expert actif.
export const isDmnShown = () => isModuleOn('dmn') && isExpert()

const notify = () => window.dispatchEvent(new CustomEvent(DMN_EVENT, { detail: { on: isDmnShown() } }))

// Allumer le module active aussi le mode Expert (src/expert-modules.js).
export function setDmn(value) {
  setModule('dmn', value)
}

export function setupDmnSwitch() {
  window.addEventListener(MODULES_EVENT, ({ detail }) => {
    if (detail.id !== 'dmn') return
    applyClass()
    notify()
  })
  window.addEventListener(EXPERT_EVENT, notify)
}
