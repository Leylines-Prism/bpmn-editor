// Boutons de zoom du canevas, à côté d'Annuler, Rétablir et Rechercher : Dézoomer,
// le niveau de zoom, Zoomer, et Ajuster à l'écran. Un clic sur le niveau ouvre une
// glissière de zoom, avec un bouton pour revenir à 100 %.
// Dézoomer, Zoomer et 100 % passent par les mêmes actions que Ctrl+−, Ctrl++ et Ctrl+0.

import { fitView } from './fit-view.js'
import { T } from './i18n/lang.js'

// Mêmes bornes que le zoom de bpmn-js (molette et Ctrl++/−).
const MIN = 0.2
const MAX = 4
const STEPS = 1000
// La glissière suit une échelle logarithmique : de 20 % à 100 % prend autant de place
// que de 100 % à 400 %, à peu près, et chaque cran change le zoom dans la même proportion.
const toSlider = (zoom) => Math.round((Math.log(zoom / MIN) / Math.log(MAX / MIN)) * STEPS)
const toZoom = (value) => MIN * Math.pow(MAX / MIN, value / STEPS)

export function setupZoomButtons(modeler, group) {
  const canvas = modeler.get('canvas')
  const editorActions = modeler.get('editorActions')
  const eventBus = modeler.get('eventBus')
  const container = canvas.getContainer()
  const level = group.querySelector('[data-zoom="level"]')

  const pop = document.createElement('div')
  pop.id = 'zoom-slider'
  pop.hidden = true
  pop.innerHTML = `
    <span class="zoom-slider-end" aria-hidden="true">20 %</span>
    <input type="range" min="0" max="${STEPS}" step="1" list="zoom-slider-ticks" aria-label="${T('Zoom level', 'Niveau de zoom')}" />
    <span class="zoom-slider-end" aria-hidden="true">400 %</span>
    <datalist id="zoom-slider-ticks"><option value="${toSlider(1)}"></option></datalist>
    <button type="button" class="zoom-slider-reset" title="${T('Back to 100 % (Ctrl+0)', 'Revenir à 100 % (Ctrl+0)')}">100 %</button>`
  group.after(pop)
  const range = pop.querySelector('input')

  function setOpen(open) {
    pop.hidden = !open
    level.setAttribute('aria-expanded', String(open))
    if (open) {
      pop.style.left = `${group.offsetLeft}px`
      refresh()
      range.focus()
    }
  }

  group.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-zoom]')
    if (!button) return
    const act = button.dataset.zoom
    if (act === 'in') editorActions.trigger('stepZoom', { value: 1 })
    else if (act === 'out') editorActions.trigger('stepZoom', { value: -1 })
    else if (act === 'level') setOpen(pop.hidden)
    else if (act === 'fit') fitView(canvas)
  })

  // Zoom autour du centre du canevas, comme les boutons.
  range.addEventListener('input', () => {
    canvas.zoom(toZoom(Number(range.value)), { x: container.clientWidth / 2, y: container.clientHeight / 2 })
  })
  pop.querySelector('.zoom-slider-reset').addEventListener('click', () => editorActions.trigger('zoom', { value: 1 }))

  // Fermée par Échap, ou par un clic en dehors d'elle et du niveau de zoom.
  pop.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    e.stopPropagation()
    setOpen(false)
    level.focus()
  })
  document.addEventListener('pointerdown', (e) => {
    if (!pop.hidden && !pop.contains(e.target) && !level.contains(e.target)) setOpen(false)
  })

  function refresh() {
    const zoom = canvas.zoom()
    if (!Number.isFinite(zoom)) return
    level.textContent = `${Math.round(zoom * 100)} %`
    if (!pop.hidden && document.activeElement !== range) range.value = String(toSlider(zoom))
  }
  eventBus.on(['canvas.viewbox.changed', 'import.done'], refresh)
  refresh()
}
