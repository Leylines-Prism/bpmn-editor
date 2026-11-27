// Mode présentation : le diagramme seul, en plein écran, en lecture. Plus de barre
// d'outils, de panneaux, de palette, de grille ni de pastilles : seulement le schéma.
// On le déplace en le faisant glisser et on zoome à la molette avec Ctrl (ou au pincement),
// mais rien ne se modifie : clic, double-clic, clavier et coller sont neutralisés.
// Échap, la croix ou la sortie du plein écran du navigateur ramènent à l'éditeur, avec
// la vue d'avant. Les changements d'un agent MCP restent visibles en direct.
// La simulation de jetons s'y lance aussi, depuis la barre : ses commandes (départ,
// pause, choix aux passerelles, journal, vitesse) restent alors à l'écran. Elle ne
// modifie pas le diagramme, et elle continue si l'on quitte la présentation.
// Le menu Pointeur de la barre (src/presentation-pointer.js) cumule laser, surbrillance,
// onde au clic et curseur masqué à l'arrêt, avec les touches 1 à 4.
import { T } from './i18n/lang.js'
import { setupPresentationPointer } from './presentation-pointer.js'
import { setupPresentationDoc } from './doc/presentation-doc.js'

const PRIORITY = 3000

export function setupPresentation({ button, modeler, onExit }) {
  const canvas = modeler.get('canvas')
  const eventBus = modeler.get('eventBus')
  const handTool = modeler.get('handTool')
  const selection = modeler.get('selection')
  const container = canvas.getContainer()
  let active = false
  let savedViewbox = null

  const bar = document.createElement('div')
  bar.id = 'presentation-bar'
  bar.hidden = true
  bar.innerHTML = `
    <button type="button" class="btn expert-only" data-act="sim" data-icon="play" title="${T('Run tokens through the process', 'Faire circuler des jetons dans le processus')}">Simulation</button>
    <button type="button" class="btn icon-only" data-act="out" title="${T('Zoom out (−)', 'Dézoomer (−)')}" aria-label="${T('Zoom out', 'Dézoomer')}">−</button>
    <button type="button" class="btn icon-only" data-act="in" title="${T('Zoom in (+)', 'Zoomer (+)')}" aria-label="${T('Zoom in', 'Zoomer')}">+</button>
    <button type="button" class="btn" data-act="fit" title="${T('Fit the diagram to the screen (0)', 'Ajuster le diagramme à l\'écran (0)')}">${T('Fit', 'Ajuster')}</button>
    <button type="button" class="btn icon-only pres-close" data-act="close" title="${T('Exit (Esc)', 'Quitter (Échap)')}" aria-label="${T('Exit presentation', 'Quitter la présentation')}">×</button>`
  // Le bouton Simulation de la barre suit l'état réel de la simulation, quelle que
  // soit la commande qui l'a lancée ou arrêtée.
  const simButton = bar.querySelector('[data-act="sim"]')
  eventBus.on('tokenSimulation.toggleMode', ({ active: simulating }) => {
    simButton.textContent = simulating ? T('Stop simulation', 'Arrêter la simulation') : 'Simulation'
    simButton.classList.toggle('active', !!simulating)
  })
  const hint = document.createElement('div')
  hint.id = 'presentation-hint'
  hint.hidden = true
  hint.textContent = T('Drag to move · Ctrl + wheel or pinch to zoom · Click an element: its sheet (D) · 1 to 4: pointer effects · Esc to exit', 'Glisser pour déplacer · Ctrl + molette ou pincement pour zoomer · Clic sur un élément : sa fiche (D) · 1 à 4 : effets du pointeur · Échap pour quitter')
  document.body.append(bar, hint)
  const hintText = hint.textContent
  let flashTimer = null
  // Rappel bref d'un réglage, dans la bulle d'aide du haut.
  function flash(message) {
    clearTimeout(flashTimer)
    hint.textContent = message
    hint.classList.remove('fade')
    flashTimer = setTimeout(() => hint.classList.add('fade'), 1500)
  }
  const pointer = setupPresentationPointer({ modeler, bar, flash })
  const sheets = setupPresentationDoc({ modeler, bar, flash })

  function fit() {
    const { inner } = canvas.viewbox()
    const w = container.clientWidth
    const h = container.clientHeight
    if (!(inner.width > 0 && inner.height > 0) || !w || !h) return
    const pad = 48
    const scale = Math.min((w - 2 * pad) / inner.width, (h - 2 * pad) / inner.height, 1.5)
    canvas.viewbox({
      x: inner.x + inner.width / 2 - w / scale / 2,
      y: inner.y + inner.height / 2 - h / scale / 2,
      width: w / scale,
      height: h / scale,
    })
  }

  function zoomBy(factor) {
    canvas.zoom(canvas.zoom() * factor, { x: container.clientWidth / 2, y: container.clientHeight / 2 })
  }

  // Tout geste de souris sur le schéma déplace la vue, comme l'outil Main, sans jamais
  // déplacer un élément. Le clic et le double-clic (sélection, saisie du nom) sont bloqués.
  // Un appui relâché sans déplacement vaut un clic : il ouvre la fiche de l'élément
  // (src/doc/presentation-doc.js), sans le sélectionner. Le déplacement de la vue
  // empêche le navigateur d'émettre le clic lui-même.
  let press = null
  eventBus.on('element.mousedown', PRIORITY, (event) => {
    if (!active) return
    const { clientX: x, clientY: y } = event.originalEvent || {}
    press = { element: event.element, x, y }
    handTool.activateMove(event.originalEvent, true)
    return false
  })
  window.addEventListener('mouseup', (e) => {
    const p = press
    press = null
    if (!active || !p || e.button !== 0) return
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 4) return
    sheets.onElementClick(p.element)
  }, true)
  for (const name of ['element.click', 'element.dblclick', 'element.contextmenu', 'contextPad.open', 'directEditing.activate', 'popupMenu.open']) {
    eventBus.on(name, PRIORITY, () => (active ? false : undefined))
  }

  // Clavier et coller : rien n'atteint l'éditeur pendant la présentation, sauf Échap.
  const onKey = (e) => {
    if (!active) return
    if (pointer.onKey(e) || sheets.onKey(e)) {
      e.stopImmediatePropagation()
      e.preventDefault()
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      exit()
      return
    }
    if (e.key === '+' || e.key === '=') zoomBy(1.2)
    else if (e.key === '-') zoomBy(1 / 1.2)
    else if (e.key === '0') fit()
    e.stopImmediatePropagation()
    e.preventDefault()
  }
  const block = (e) => {
    if (!active) return
    e.stopImmediatePropagation()
    e.preventDefault()
  }

  async function enter() {
    if (active) return
    active = true
    savedViewbox = canvas.viewbox()
    selection.select(null)
    document.body.classList.add('presenting')
    bar.hidden = false
    hint.hidden = false
    window.addEventListener('keydown', onKey, true)
    for (const type of ['paste', 'cut', 'copy', 'drop']) window.addEventListener(type, block, true)
    // Plein écran du navigateur quand il est permis (pas sur iPhone) : sinon la fenêtre suffit.
    try {
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) await document.documentElement.requestFullscreen()
    } catch {}
    canvas.resized()
    fit()
    pointer.enter()
    // L'aide disparaît d'elle-même après quelques secondes.
    hint.textContent = hintText
    clearTimeout(flashTimer)
    flashTimer = setTimeout(() => hint.classList.add('fade'), 4000)
  }

  function exit() {
    if (!active) return
    active = false
    document.body.classList.remove('presenting')
    bar.hidden = true
    hint.hidden = true
    hint.classList.remove('fade')
    clearTimeout(flashTimer)
    pointer.exit()
    sheets.exit()
    window.removeEventListener('keydown', onKey, true)
    for (const type of ['paste', 'cut', 'copy', 'drop']) window.removeEventListener(type, block, true)
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    canvas.resized()
    if (savedViewbox) canvas.viewbox(savedViewbox)
    onExit?.()
    button.focus()
  }

  // Sortie du plein écran par le navigateur (Échap, F11) : on quitte aussi la présentation.
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && active) exit()
  })

  bar.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act
    if (act === 'in') zoomBy(1.2)
    else if (act === 'out') zoomBy(1 / 1.2)
    else if (act === 'fit') fit()
    else if (act === 'close') exit()
    else if (act === 'sim') modeler.get('toggleMode').toggleMode()
  })
  button.addEventListener('click', enter)
  return { enter, exit }
}
