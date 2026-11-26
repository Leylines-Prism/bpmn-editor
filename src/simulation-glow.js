// Mode « Sapin de Noël » de la simulation : quand un jeton entre dans une étape, son
// contour s'allume du dégradé Leylines (bleu ciel, magenta, orange) qui tourne
// rapidement autour de la forme, avec une lueur douce, et un trait de lumière en fait
// le tour, comme une impulsion dans la fibre. Puis tout s'éteint. Désactivé par
// défaut, l'état est retenu dans le navigateur. Une petite case marquée d'un sapin, au
// bout du cadre de la vitesse de simulation, l'active.
import { T } from './i18n/lang.js'

const TRACE_EVENT = 'tokenSimulation.simulator.trace'
const STORAGE_KEY = 'bpmn-editor-simulation-glow'
const SVG_NS = 'http://www.w3.org/2000/svg'
const GRADIENT_ID = 'sim-glow-gradient'
const BLUR_ID = 'sim-glow-blur'
const DURATION = 2800 // durée de vie d'un contour allumé, en millisecondes
const TURN = '2.4s' // durée d'un tour du dégradé

const isFlowNode = (el) => el.businessObject?.$instanceOf?.('bpmn:FlowNode') && el.type !== 'label'

function readStored() {
  try { return localStorage.getItem(STORAGE_KEY) === 'on' } catch { return false }
}
function store(on) {
  try { localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off') } catch { /* stockage indisponible */ }
}

// Dégradé partagé, rapporté à la boîte de chaque forme, qui tourne sur lui-même.
function ensureDefs(svg, reduceMotion) {
  if (svg.querySelector(`#${GRADIENT_ID}`)) return
  let defs = svg.querySelector(':scope > defs')
  if (!defs) {
    defs = document.createElementNS(SVG_NS, 'defs')
    svg.prepend(defs)
  }
  const spin = reduceMotion ? '' :
    `<animateTransform attributeName="gradientTransform" type="rotate" from="0 0.5 0.5" to="360 0.5 0.5" dur="${TURN}" repeatCount="indefinite" />`
  defs.insertAdjacentHTML('beforeend', `
    <linearGradient xmlns="${SVG_NS}" id="${GRADIENT_ID}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2BB8FF" /><stop offset="0.5" stop-color="#D24E8E" /><stop offset="1" stop-color="#FF7E1A" />
      ${spin}
    </linearGradient>
    <filter xmlns="${SVG_NS}" id="${BLUR_ID}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5" /></filter>`)
}

export function setupSimulationGlow(modeler) {
  const eventBus = modeler.get('eventBus')
  const elementRegistry = modeler.get('elementRegistry')
  const canvas = modeler.get('canvas')
  const container = canvas.getContainer()
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const timers = new Map()
  let on = readStored()

  // Petite case discrète, marquée d'un sapin, au bout du cadre de la vitesse.
  const box = document.createElement('label')
  box.className = 'sim-glow-toggle'
  box.title = T('Christmas tree: light up each step a token goes through', 'Sapin de Noël : allumer chaque étape que traverse un jeton')
  box.innerHTML = '<input type="checkbox" /><span aria-hidden="true">🎄</span>'
  const input = box.querySelector('input')
  input.setAttribute('aria-label', T('Christmas tree', 'Sapin de Noël'))
  input.checked = on
  const bar = container.querySelector('.bts-set-animation-speed') || container
  bar.append(box)
  input.addEventListener('change', () => {
    on = input.checked
    store(on)
  })

  function light(element) {
    const gfx = elementRegistry.getGraphics(element)
    const visual = gfx?.querySelector(':scope > .djs-visual')
    const outline = visual?.querySelector(':scope > rect, :scope > circle, :scope > polygon, :scope > path')
    if (!outline) return
    ensureDefs(canvas._svg, reduceMotion)
    visual.querySelector(':scope > .sim-glow')?.remove()
    clearTimeout(timers.get(element.id))

    const ring = document.createElementNS(SVG_NS, 'g')
    ring.setAttribute('class', 'sim-glow')
    for (const cls of ['sim-glow-blur', 'sim-glow-line', 'sim-glow-comet']) {
      const copy = outline.cloneNode(false)
      copy.removeAttribute('style')
      copy.setAttribute('class', cls)
      copy.setAttribute('pathLength', '1')
      ring.append(copy)
    }
    visual.append(ring)
    timers.set(element.id, setTimeout(() => {
      ring.remove()
      timers.delete(element.id)
    }, DURATION))
  }

  eventBus.on(TRACE_EVENT, ({ action, element }) => {
    if (on && action === 'enter' && element && isFlowNode(element)) light(element)
  })
}
