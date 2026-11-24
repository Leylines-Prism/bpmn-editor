// Erreurs de validation du processus lui-même (début ou fin manquant…).
//
// Le processus n'a pas de forme à l'écran : bpmn-js-bpmnlint accroche son badge
// à l'élément racine, à une position fixe du diagramme. Sur un canevas vide ou
// après un déplacement, ce badge paraît orphelin. Ce module le retire du
// diagramme et l'affiche dans un coin fixe du canevas, titré « Processus »,
// sans suivre le zoom ni le déplacement.

import { is } from 'bpmn-js/lib/util/ModelUtil'
import { T } from './i18n/lang.js'

function labelFor(root) {
  if (is(root, 'bpmn:SubProcess')) return T('Sub-process', 'Sous-processus')
  if (is(root, 'bpmn:Collaboration')) return T('Collaboration', 'Collaboration')
  return T('Process', 'Processus')
}

function LintProcessBadge(eventBus, canvas, linting, overlays, elementRegistry) {
  const holder = document.createElement('div')
  holder.className = 'lint-process-badge'
  canvas.getContainer().appendChild(holder)

  // Un badge par racine : le processus, et chaque sous-processus ouvert en vue dédiée.
  const badges = new Map()

  function render() {
    const root = canvas.getRootElement()
    const badge = root && badges.get(root.id)
    holder.replaceChildren(...(badge ? [badge] : []))
  }

  const createElementIssues = linting._createElementIssues
  linting._createElementIssues = function (elementId, elementIssues) {
    createElementIssues.call(this, elementId, elementIssues)

    const element = elementRegistry.get(elementId)
    const overlayId = this._overlayIds[elementId]
    if (!element || element.parent || !overlayId) return

    const overlay = overlays.get(overlayId)
    const html = overlay && overlay.html
    overlays.remove(overlayId)
    delete this._overlayIds[elementId]
    if (!html) return

    html.classList.remove('bjsl-issues-bottom-right')
    html.classList.add('bjsl-issues-top-right')

    const label = document.createElement('span')
    label.className = 'lint-process-label'
    label.textContent = labelFor(element)
    html.insertBefore(label, html.querySelector('.bjsl-dropdown'))

    badges.set(elementId, html)
    render()
  }

  const clearOverlays = linting._clearOverlays
  linting._clearOverlays = function () {
    clearOverlays.call(this)
    badges.clear()
    render()
  }

  eventBus.on('root.set', render)
}

LintProcessBadge.$inject = ['eventBus', 'canvas', 'linting', 'overlays', 'elementRegistry']

export const LintProcessBadgeModule = {
  __init__: ['lintProcessBadge'],
  lintProcessBadge: ['type', LintProcessBadge],
}
