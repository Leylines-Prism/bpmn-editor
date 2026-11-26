// Carte de chaleur de la simulation : chaque élément et chaque flux de séquence est
// coloré selon le nombre de jetons qui l'ont traversé, du bleu pâle au rouge. Les
// éléments jamais atteints restent en gris pointillé.
//
// Deux sources :
//   - les jetons joués à la main pendant la simulation, comptés en direct par
//     l'événement de trace de bpmn-js-token-simulation ;
//   - « Lancer 100 jetons », calculé d'un coup (src/simulation-stats.js) selon les
//     probabilités saisies sur les flux sortants des passerelles.
// La carte est dessinée dans une couche du canevas, au-dessus des formes, sans toucher
// au diagramme. Le dernier résultat reste disponible pour le rapport de processus tant
// que le diagramme ne change pas, et le rapport en tire une page Carte de chaleur.

import { T, num } from './i18n/lang.js'
import { runBatch } from './simulation-stats.js'

const TRACE_EVENT = 'tokenSimulation.simulator.trace'
const TOGGLE_MODE_EVENT = 'tokenSimulation.toggleMode'
const RESET_SIMULATION_EVENT = 'tokenSimulation.resetSimulation'
const BATCH_RUNS = 100
const SVG_NS = 'http://www.w3.org/2000/svg'

// Du bleu pâle au rouge, en passant par le jaune et l'orange.
const STOPS = [
  [0, [191, 219, 254]],
  [0.35, [253, 224, 71]],
  [0.7, [249, 115, 22]],
  [1, [220, 38, 38]],
]
export function heatColor(t) {
  const x = Math.max(0, Math.min(1, t))
  for (let i = 1; i < STOPS.length; i++) {
    if (x <= STOPS[i][0]) {
      const [a, ca] = STOPS[i - 1]
      const [b, cb] = STOPS[i]
      const k = (x - a) / (b - a)
      return `rgb(${ca.map((v, j) => Math.round(v + (cb[j] - v) * k)).join(',')})`
    }
  }
  return `rgb(${STOPS[STOPS.length - 1][1].join(',')})`
}

// Texte de la pastille : passages, et pour une série calculée la part des instances, ou
// le nombre d'exécutions par instance au-delà de une. Repris par le rapport de processus.
export function heatBadge(n, result) {
  if (result.source !== 'batch') return num(n)
  if (n > result.runs) return `${num(n)} · ${num(Math.round((n / result.runs) * 10) / 10)}×`
  return `${num(n)} · ${Math.round((n / result.runs) * 100)} %`
}

const isFlowNode = (el) => el.businessObject?.$instanceOf?.('bpmn:FlowNode') && el.type !== 'label'
const isSequenceFlow = (el) => el.type === 'bpmn:SequenceFlow'

export function setupHeatmap(modeler) {
  const canvas = modeler.get('canvas')
  const eventBus = modeler.get('eventBus')
  const elementRegistry = modeler.get('elementRegistry')
  const overlays = modeler.get('overlays')
  const container = canvas.getContainer()

  let simulating = false
  let shown = false
  let live = empty('live')
  let batch = null
  let frame = 0
  let lastResult = null

  function empty(source) {
    return { nodes: {}, flows: {}, runs: 0, truncated: 0, source }
  }
  const current = () => batch || live
  const hasData = (r) => r && r.runs > 0

  // ── Commandes, dans le cadre de la vitesse de simulation ──
  const bar = document.createElement('div')
  bar.className = 'heatmap-bar'
  bar.innerHTML = `
    <button type="button" class="heatmap-toggle" aria-pressed="false" title="${T('Color the diagram by the number of tokens that went through each element', 'Colorer le diagramme selon le nombre de jetons passés par chaque élément')}">${T('Heatmap', 'Carte de chaleur')}</button>
    <button type="button" class="heatmap-run" title="${T('Compute 100 tokens at once, following the probabilities set on the gateway flows', 'Calculer 100 jetons d\'un coup, selon les probabilités des flux sortants des passerelles')}">${T('Run 100 tokens', 'Lancer 100 jetons')}</button>`
  const toggleButton = bar.querySelector('.heatmap-toggle')
  const runButton = bar.querySelector('.heatmap-run')
  const speed = container.querySelector('.bts-set-animation-speed')
  if (speed) speed.append(bar)
  else container.append(bar)

  const legend = document.createElement('div')
  legend.className = 'heatmap-legend'
  legend.hidden = true
  container.append(legend)

  toggleButton.addEventListener('click', () => setShown(!shown))
  runButton.addEventListener('click', () => {
    batch = runBatch(modeler.getDefinitions(), BATCH_RUNS)
    setShown(true)
  })

  function setShown(value) {
    shown = value
    toggleButton.setAttribute('aria-pressed', String(shown))
    toggleButton.classList.toggle('active', shown)
    render()
  }

  // ── Comptage en direct ──
  eventBus.on(TRACE_EVENT, ({ action, element }) => {
    if (!element) return
    if (action === 'createScope' && (element.type === 'bpmn:Process' || element.type === 'bpmn:Participant')) {
      live.runs++
    } else if (action === 'enter') {
      const map = isSequenceFlow(element) ? live.flows : isFlowNode(element) ? live.nodes : null
      if (!map) return
      map[element.id] = (map[element.id] || 0) + 1
    } else return
    if (!batch) scheduleRender()
  })

  eventBus.on(RESET_SIMULATION_EVENT, () => {
    live = empty('live')
    batch = null
    render()
  })
  eventBus.on(TOGGLE_MODE_EVENT, ({ active }) => {
    simulating = !!active
    if (simulating) {
      live = empty('live')
      batch = null
    }
    render()
  })
  // Un diagramme modifié ou remplacé rend les comptes caducs.
  eventBus.on(['commandStack.changed', 'import.done'], () => {
    if (simulating) return
    live = empty('live')
    batch = null
    lastResult = null
    render()
  })

  // ── Dessin ──
  function layer() {
    return canvas.getLayer('bpmn-pilot-heatmap', 1)
  }

  function scheduleRender() {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      render()
    })
  }


  function render() {
    const g = layer()
    g.replaceChildren()
    overlays.remove({ type: 'heatmap' })
    const result = current()
    if (hasData(result)) lastResult = structuredClone(result)
    const visible = simulating && shown && hasData(result)
    legend.hidden = !visible
    container.classList.toggle('heatmap-on', visible)
    if (!visible) {
      // Rien à compter : on le dit plutôt que de laisser le bouton sans effet.
      if (simulating && shown) {
        legend.hidden = false
        legend.innerHTML = `<strong>${T('Heatmap', 'Carte de chaleur')}</strong><span class="heatmap-note"></span>`
        legend.querySelector('.heatmap-note').textContent = batch
          ? T('No start event: nothing to simulate.', 'Aucun événement de début : rien à simuler.')
          : T('Send a token, or click Run 100 tokens.', 'Faites partir un jeton, ou cliquez sur Lancer 100 jetons.')
      }
      return
    }

    const max = Math.max(1, ...Object.values(result.nodes))
    const flowMax = Math.max(1, ...Object.values(result.flows))

    for (const el of elementRegistry.getAll()) {
      if (isSequenceFlow(el)) drawFlow(g, el, result.flows[el.id] || 0, flowMax)
    }
    for (const el of elementRegistry.getAll()) {
      if (!isFlowNode(el) || !el.width) continue
      const n = result.nodes[el.id] || 0
      drawShape(g, el, n, max)
      if (n && !el.type.endsWith('Gateway')) {
        const badge = document.createElement('div')
        badge.className = 'heatmap-badge'
        badge.textContent = heatBadge(n, result)
        overlays.add(el, 'heatmap', { position: { top: -11, right: el.width > 60 ? 8 : -12 }, html: badge })
      }
    }
    renderLegend(result, max)
  }

  function drawShape(g, el, n, max) {
    const { x, y, width: w, height: h } = el
    let node
    if (el.type.endsWith('Gateway')) {
      node = document.createElementNS(SVG_NS, 'polygon')
      node.setAttribute('points', `${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}`)
    } else if (el.type.endsWith('Event')) {
      node = document.createElementNS(SVG_NS, 'circle')
      node.setAttribute('cx', x + w / 2)
      node.setAttribute('cy', y + h / 2)
      node.setAttribute('r', w / 2)
    } else {
      node = document.createElementNS(SVG_NS, 'rect')
      Object.entries({ x, y, width: w, height: h, rx: 10, ry: 10 }).forEach(([k, v]) => node.setAttribute(k, v))
    }
    node.setAttribute('class', n ? 'heat-shape' : 'heat-shape cold')
    if (n) {
      const color = heatColor(n / max)
      node.style.fill = color
      node.style.stroke = color
    }
    g.append(node)
  }

  function drawFlow(g, el, n, max) {
    if (!el.waypoints?.length) return
    const line = document.createElementNS(SVG_NS, 'polyline')
    line.setAttribute('points', el.waypoints.map((p) => `${p.x},${p.y}`).join(' '))
    line.setAttribute('class', n ? 'heat-flow' : 'heat-flow cold')
    if (n) {
      line.style.stroke = heatColor(n / max)
      line.style.strokeWidth = String(2 + 5 * (n / max))
    }
    g.append(line)
  }

  function renderLegend(result, max) {
    const gradient = STOPS.map(([t]) => `${heatColor(t)} ${t * 100}%`).join(', ')
    const source = result.source === 'batch'
      ? T(`${num(result.runs)} tokens computed from the gateway probabilities`, `${num(result.runs)} jetons calculés selon les probabilités des passerelles`)
      : T(`${num(result.runs)} token(s) played`, `${num(result.runs)} jeton(s) joué(s)`)
    legend.innerHTML = `
      <strong>${T('Heatmap', 'Carte de chaleur')}</strong>
      <span class="heatmap-source"></span>
      <span class="heatmap-scale" style="background: linear-gradient(90deg, ${gradient})"></span>
      <span class="heatmap-ticks"><span>1</span><span>${num(max)}</span></span>
      <span class="heatmap-note">${T('Flow width follows the count. Dashed grey: never reached.', 'Épaisseur des flux selon le nombre de passages. Gris pointillé : jamais atteint.')}</span>
      ${result.truncated ? `<span class="heatmap-note warn">${T(`${num(result.truncated)} instance(s) stopped after 5,000 steps: check for a loop without exit.`, `${num(result.truncated)} instance(s) arrêtée(s) après 5 000 étapes : vérifiez qu'aucune boucle n'est sans sortie.`)}</span>` : ''}`
    legend.querySelector('.heatmap-source').textContent = source
  }

  return {
    // Dernier résultat (série calculée, sinon jetons joués), pour le rapport de processus.
    getResult: () => (lastResult && lastResult.runs ? structuredClone(lastResult) : null),
    runBatch: (runs = BATCH_RUNS) => {
      lastResult = runBatch(modeler.getDefinitions(), runs)
      return structuredClone(lastResult)
    },
  }
}
