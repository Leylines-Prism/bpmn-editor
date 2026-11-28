// Boutons de zoom du canevas, à côté d'Annuler, Rétablir et Rechercher : Dézoomer,
// le niveau de zoom (un clic revient à 100 %), Zoomer, et Ajuster à l'écran.
// Dézoomer, Zoomer et 100 % passent par les mêmes actions que Ctrl+−, Ctrl++ et Ctrl+0.

import { fitView } from './fit-view.js'

export function setupZoomButtons(modeler, group) {
  const canvas = modeler.get('canvas')
  const editorActions = modeler.get('editorActions')
  const eventBus = modeler.get('eventBus')
  const level = group.querySelector('[data-zoom="reset"]')

  group.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-zoom]')
    if (!button) return
    const act = button.dataset.zoom
    if (act === 'in') editorActions.trigger('stepZoom', { value: 1 })
    else if (act === 'out') editorActions.trigger('stepZoom', { value: -1 })
    else if (act === 'reset') editorActions.trigger('zoom', { value: 1 })
    else if (act === 'fit') fitView(canvas)
  })

  function refresh() {
    const zoom = canvas.zoom()
    if (Number.isFinite(zoom)) level.textContent = `${Math.round(zoom * 100)} %`
  }
  eventBus.on(['canvas.viewbox.changed', 'import.done'], refresh)
  refresh()
}
