// Ordre des groupes du panneau de propriétés.
//
// Chaque module ajoute ses groupes de son côté (après Général, ou à la fin).
// Ce fournisseur passe en dernier et range le tout selon une seule règle :
// d'abord ce que tout le monde utilise, puis, sous un filet « Mode Expert »,
// les sections des modules Expert dans l'ordre de leur fenêtre.
// Un groupe inconnu (groupes BPMN standard : minuteur, message, multi-instance…)
// garde sa place relative, entre Agent IA et Documentation.

import htm from 'htm'
import { h } from '@bpmn-io/properties-panel/preact'
import { T } from './i18n/lang.js'
import { isExpert } from './expert-mode.js'
import { isModuleOn } from './expert-modules.js'

const html = htm.bind(h)
const LAST = 1 // priorité la plus basse : passe après tous les autres fournisseurs
const DIVIDER = 'bpmn-pilot-expert-divider'
const UNKNOWN = 30

const RANK = {
  general: 0,
  appearance: 10,
  'bpmn-pilot-sub-level': 20,
  'bpmn-pilot-agent': 25, // Agent IA : pour tout le monde, c'est la nature de l'étape
  documentation: 40,
  'bpmn-pilot-raci': 50,
  // Mode Expert, dans l'ordre de la fenêtre des modules.
  [DIVIDER]: 99,
  'bpmn-pilot-simulation': 100,
  'bpmn-pilot-ai-adoption': 110,
  'bpmn-pilot-identity': 120,
  'bpmn-pilot-compliance': 125,
  'bpmn-pilot-user-stories': 130,
  'bpmn-pilot-decision': 140,
}

// Groupes Expert, et le module qui les montre (certains sont créés puis masqués en CSS).
const EXPERT_GROUPS = {
  'bpmn-pilot-simulation': 'simulation',
  'bpmn-pilot-ai-adoption': 'ai-potential',
  'bpmn-pilot-identity': 'compliance',
  'bpmn-pilot-compliance': 'compliance',
  'bpmn-pilot-user-stories': 'user-stories',
  'bpmn-pilot-decision': 'dmn',
}

const rankOf = (group) => RANK[group.id] ?? UNKNOWN

function Divider() {
  return html`<div class="panel-expert-divider" data-group-id=${'group-' + DIVIDER} role="separator">
    <span>${T('Expert mode', 'Mode Expert')}</span>
  </div>`
}

function PanelOrderProvider(propertiesPanel) {
  propertiesPanel.registerProvider(LAST, this)
}
PanelOrderProvider.$inject = ['propertiesPanel']

PanelOrderProvider.prototype.getGroups = function () {
  return (groups) => {
    const list = groups.filter((g) => g.id !== DIVIDER)
    const shown = isExpert() && list.some((g) => g.id in EXPERT_GROUPS && isModuleOn(EXPERT_GROUPS[g.id]))
    if (shown) list.push({ id: DIVIDER, label: '', entries: [], component: Divider })
    // Tri stable : à rang égal, l'ordre d'arrivée est gardé.
    return list.map((g, i) => [g, i]).sort((a, b) => rankOf(a[0]) - rankOf(b[0]) || a[1] - b[1]).map(([g]) => g)
  }
}

export const PanelOrderModule = {
  __init__: ['panelOrderProvider'],
  panelOrderProvider: ['type', PanelOrderProvider],
}
