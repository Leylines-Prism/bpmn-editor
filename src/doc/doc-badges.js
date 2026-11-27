// Repérage de la documentation sur le canevas.
//
//   - une pastille bleue en haut à droite de chaque élément documenté ; au survol, un
//     aperçu de sa documentation ; au clic, la fenêtre de documentation ;
//   - en mode Expert, une pastille en pointillé sur les activités sans documentation (la
//     même règle que le constat « Documentation absente » du rapport de processus) ;
//   - rien en mode Présentation ni pendant une simulation (doc.css).

import { T } from '../i18n/lang.js'
import { markdownToHtml, escapeHtml } from './markdown.js'
import { docText } from './documentation.js'

const DOC_ICON = '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 3h7M2.5 6h7M2.5 9h4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>'
const TYPE = 'doc-badge'

const is = (bo, type) => !!bo?.$instanceOf?.(type)

// Activité qui devrait être décrite : tâche ou activité d'appel, pas un sous-processus
// (sa documentation est dans ses éléments).
export const needsDoc = (bo) => is(bo, 'bpmn:Activity') && !is(bo, 'bpmn:SubProcess')

const textOf = (element) => docText(element.businessObject)

export function setupDocBadges(modeler, { openEditor }) {
  const overlays = modeler.get('overlays')
  const eventBus = modeler.get('eventBus')
  const elementRegistry = modeler.get('elementRegistry')
  const canvas = modeler.get('canvas')

  const tip = document.createElement('div')
  tip.className = 'doc-tip'
  tip.setAttribute('role', 'tooltip')
  tip.id = 'doc-tip'
  tip.hidden = true
  document.body.append(tip)
  let tipTimer = null

  function showTip(element, badge) {
    const text = textOf(element)
    const name = (element.businessObject.name || '').trim()
    tip.innerHTML = text
      ? `${name ? `<div class="doc-tip-title">${escapeHtml(name)}</div>` : ''}<div class="doc-md">${markdownToHtml(text)}</div><div class="doc-tip-more">${T('Click to open the documentation', 'Clic pour ouvrir la documentation')}</div>`
      : `${name ? `<div class="doc-tip-title">${escapeHtml(name)}</div>` : ''}<div class="doc-tip-more">${T('No documentation yet. Click to write it.', 'Pas encore de documentation. Clic pour la rédiger.')}</div>`
    tip.hidden = false
    const md = tip.querySelector('.doc-md')
    tip.classList.toggle('clipped', !!md && md.scrollHeight > 170)
    const r = badge.getBoundingClientRect()
    const w = tip.offsetWidth
    const h = tip.offsetHeight
    let left = Math.min(r.left, window.innerWidth - w - 12)
    let top = r.bottom + 8
    if (top + h > window.innerHeight - 12) top = Math.max(12, r.top - h - 8)
    tip.style.left = Math.max(12, left) + 'px'
    tip.style.top = top + 'px'
  }
  const hideTip = () => { clearTimeout(tipTimer); tip.hidden = true }

  function badgeFor(element, documented) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = documented ? 'doc-badge' : 'doc-badge missing'
    button.innerHTML = documented ? DOC_ICON : '+'
    const name = (element.businessObject.name || '').trim()
    button.setAttribute('aria-label', documented
      ? T(`Documentation of ${name || element.id}`, `Documentation de ${name || element.id}`)
      : T(`Write the documentation of ${name || element.id}`, `Rédiger la documentation de ${name || element.id}`))
    button.setAttribute('aria-describedby', 'doc-tip')
    // Le canevas ne doit ni sélectionner ni déplacer l'élément sous la pastille.
    for (const type of ['mousedown', 'pointerdown', 'dblclick']) button.addEventListener(type, (e) => e.stopPropagation())
    button.addEventListener('click', (e) => {
      e.stopPropagation()
      hideTip()
      openEditor(element)
    })
    button.addEventListener('mouseenter', () => { clearTimeout(tipTimer); tipTimer = setTimeout(() => showTip(element, button), 250) })
    button.addEventListener('focus', () => showTip(element, button))
    button.addEventListener('mouseleave', hideTip)
    button.addEventListener('blur', hideTip)
    return button
  }

  function refresh(element) {
    overlays.remove({ element, type: TYPE })
    if (!element || element.type === 'label' || element.waypoints || element === canvas.getRootElement()) return
    if (!elementRegistry.get(element.id)) return
    const documented = !!textOf(element).trim()
    if (!documented && !needsDoc(element.businessObject)) return
    const small = element.width <= 60
    overlays.add(element, TYPE, {
      position: small ? { top: -12, right: -8 } : { top: -10, right: 10 },
      html: badgeFor(element, documented),
    })
  }

  function refreshAll() {
    hideTip()
    overlays.remove({ type: TYPE })
    for (const element of elementRegistry.getAll()) refresh(element)
  }

  eventBus.on('import.done', refreshAll)
  eventBus.on('elements.changed', ({ elements }) => {
    hideTip()
    for (const element of elements) refresh(element)
  })
  eventBus.on(['canvas.viewbox.changing', 'selection.changed'], hideTip)
  return { refreshAll }
}
