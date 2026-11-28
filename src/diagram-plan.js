// Plan du diagramme : un panneau déroulant qui montre l'arborescence du diagramme ouvert,
// pour s'y déplacer sans chercher les pastilles sur le canevas.
//
//   - Racine : le processus, ou chaque participant d'une collaboration.
//   - Dessous, sur autant de niveaux qu'il y en a : les sous-processus (repliés ou dépliés),
//     les activités liées à un sous-niveau d'un autre diagramme de Mes diagrammes, et les
//     tâches liées à une table de décision DMN (quand le module DMN est allumé).
//   - Un clic ouvre l'élément : il entre dans le sous-processus replié, centre la vue sur un
//     sous-processus déplié, descend dans le sous-niveau ou ouvre la table, par les mêmes
//     boutons que ceux du canevas. Le niveau affiché est marqué dans l'arbre.
//
// Le bouton Plan est à côté de Rechercher dans l'éditeur, et dans la barre du mode Présentation.

import { getBusinessObject, is } from 'bpmn-js/lib/util/ModelUtil'
import { T } from './i18n/lang.js'
import { linkOf } from './level-links.js'

const KIND_ICON = {
  process: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="3.5" width="13" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
  sub: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="3" width="13" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M6 10.5h4M8 8.5v4" stroke="currentColor" stroke-width="1.3"/></svg>',
  level: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="1.5" width="9" height="6" rx="1.3" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5 7.5v5h5M8.5 10.5l2 2-2 2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  dmn: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M1.5 6h13M6 6v7.5" stroke="currentColor" stroke-width="1.4"/></svg>',
}

const label = (bo) => (bo.name || '').replace(/\s+/g, ' ').trim()

export function setupDiagramPlan(modeler, { button }) {
  const canvas = modeler.get('canvas')
  const elementRegistry = modeler.get('elementRegistry')
  const overlays = modeler.get('overlays')
  const eventBus = modeler.get('eventBus')

  const panel = document.createElement('div')
  panel.id = 'plan-panel'
  panel.setAttribute('popover', '')
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-label', T('Diagram map', 'Plan du diagramme'))
  document.body.append(panel)
  let anchor = button

  // ── Arbre ──
  function shapeOf(bo) { return elementRegistry.get(bo.id) }

  function nodeFor(bo) {
    if (is(bo, 'bpmn:SubProcess')) {
      const shape = shapeOf(bo)
      const children = childrenOf(bo)
      return { kind: 'sub', bo, shape, name: label(bo) || T('Subprocess', 'Sous-processus'), children, collapsed: !!shape?.collapsed }
    }
    if (is(bo, 'bpmn:CallActivity')) {
      const link = linkOf(bo)
      if (!link.key && !link.name) return null
      return { kind: 'level', bo, shape: shapeOf(bo), name: label(bo) || link.name, detail: link.name, children: [] }
    }
    if (is(bo, 'bpmn:BusinessRuleTask') && bo.get('bpmnpilot:decisionRef')) {
      const shape = shapeOf(bo)
      // Seulement si la pastille de la table existe, c'est-à-dire module DMN allumé.
      if (!shape || !overlays.get({ element: shape, type: 'dmn-badge' }).length) return null
      return { kind: 'dmn', bo, shape, name: label(bo) || bo.get('bpmnpilot:decisionRef'), children: [] }
    }
    return null
  }

  function childrenOf(container) {
    return (container.flowElements || []).map(nodeFor).filter(Boolean)
  }

  function roots() {
    const definitions = modeler.getDefinitions?.()
    if (!definitions) return []
    const out = []
    for (const root of definitions.rootElements || []) {
      if (is(root, 'bpmn:Collaboration')) {
        for (const p of root.participants || []) {
          if (!p.processRef) continue
          out.push({ kind: 'process', bo: p, shape: shapeOf(p), name: label(p) || label(p.processRef) || T('Participant', 'Participant'), children: childrenOf(p.processRef) })
        }
        return out
      }
    }
    for (const root of definitions.rootElements || []) {
      if (is(root, 'bpmn:Process')) out.push({ kind: 'process', bo: root, shape: null, name: label(root) || T('Main process', 'Processus principal'), children: childrenOf(root) })
    }
    return out
  }

  // Plan affiché : le sous-processus replié dont on regarde l'intérieur, sinon la racine.
  function currentPlaneId() {
    const root = canvas.getRootElement()
    const bo = root && getBusinessObject(root)
    return bo && is(bo, 'bpmn:SubProcess') ? bo.id : null
  }

  function render() {
    const tree = roots()
    const current = currentPlaneId()
    const count = (nodes) => nodes.reduce((n, x) => n + 1 + count(x.children), 0)
    const total = tree.reduce((n, r) => n + count(r.children), 0)
    panel.innerHTML = `<p class="plan-title">${T('Diagram map', 'Plan du diagramme')}</p>`
    const list = document.createElement('ul')
    list.setAttribute('role', 'tree')
    for (const r of tree) list.append(item(r, current, 1))
    panel.append(list)
    if (!total) {
      const p = document.createElement('p')
      p.className = 'plan-empty'
      p.textContent = T('No subprocess, sub-level or decision table in this diagram.', 'Aucun sous-processus, sous-niveau ni table de décision dans ce diagramme.')
      panel.append(p)
    }
  }

  function item(node, current, level) {
    const li = document.createElement('li')
    li.setAttribute('role', 'treeitem')
    li.setAttribute('aria-level', String(level))
    const b = document.createElement('button')
    b.type = 'button'
    b.className = `plan-node plan-${node.kind}`
    const here = node.kind === 'process' ? current === null : node.kind === 'sub' && node.bo.id === current
    if (here) {
      b.classList.add('current')
      b.setAttribute('aria-current', 'true')
    }
    b.innerHTML = `<span class="plan-icon">${KIND_ICON[node.kind]}</span><span class="plan-name"></span>`
    b.querySelector('.plan-name').textContent = node.name
    if (node.kind === 'level' && node.detail && node.detail !== node.name) {
      const d = document.createElement('span')
      d.className = 'plan-detail'
      d.textContent = `→ ${node.detail}`
      b.append(d)
    }
    b.title = {
      process: T('Show this process', 'Afficher ce processus'),
      sub: node.collapsed ? T('Open this subprocess', 'Ouvrir ce sous-processus') : T('Show this subprocess', 'Afficher ce sous-processus'),
      level: T('Open the linked sub-level', 'Ouvrir le sous-niveau lié'),
      dmn: T('Open the decision table', 'Ouvrir la table de décision'),
    }[node.kind]
    b.addEventListener('click', () => go(node))
    li.append(b)
    if (node.children.length) {
      li.setAttribute('aria-expanded', 'true')
      const ul = document.createElement('ul')
      ul.setAttribute('role', 'group')
      for (const c of node.children) ul.append(item(c, current, level + 1))
      li.append(ul)
    }
    return li
  }

  // ── Navigation ──
  function showPlaneOf(shape) {
    // Remonte jusqu'à la racine qui contient la forme (un sous-processus replié a son propre plan).
    let root = shape
    while (root.parent) root = root.parent
    if (root !== canvas.getRootElement()) canvas.setRootElement(root)
  }

  function go(node) {
    panel.hidePopover()
    if (node.kind === 'process') {
      const main = canvas.getRootElements().find((r) => !is(getBusinessObject(r), 'bpmn:SubProcess'))
      if (main && main !== canvas.getRootElement()) canvas.setRootElement(main)
      if (node.shape) canvas.scrollToElement(node.shape)
      return
    }
    if (node.kind === 'sub' && node.collapsed) {
      const plane = canvas.findRoot(`${node.bo.id}_plane`)
      if (plane) return canvas.setRootElement(plane)
    }
    if (!node.shape) return
    showPlaneOf(node.shape)
    if (node.kind === 'sub') return canvas.scrollToElement(node.shape)
    // Sous-niveau et table : le bouton du canevas fait le travail (garder le diagramme, descendre,
    // ouvrir la fenêtre de la table).
    const type = node.kind === 'level' ? 'level-badge' : 'dmn-badge'
    const overlay = overlays.get({ element: node.shape, type })[0]
    const badge = overlay?.htmlContainer?.querySelector('button')
    if (badge) badge.click()
    else canvas.scrollToElement(node.shape)
  }

  // ── Ouverture ──
  panel.addEventListener('beforetoggle', (e) => {
    if (e.newState !== 'open') return
    render()
    const r = anchor.getBoundingClientRect()
    const right = window.innerWidth - r.right
    if (r.left + 320 > window.innerWidth) {
      panel.style.left = 'auto'
      panel.style.right = `${Math.max(8, right)}px`
    } else {
      panel.style.right = 'auto'
      panel.style.left = `${Math.max(8, r.left)}px`
    }
    panel.style.top = `${Math.round(r.bottom + 6)}px`
  })
  function attach(b) {
    b.setAttribute('aria-haspopup', 'dialog')
    b.setAttribute('aria-controls', 'plan-panel')
    for (const type of ['mousedown', 'pointerdown']) b.addEventListener(type, (e) => e.stopPropagation())
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      anchor = b
      panel.togglePopover()
    })
  }
  attach(button)
  eventBus.on(['root.set', 'import.done'], () => { if (panel.matches(':popover-open')) render() })

  return { attach }
}
