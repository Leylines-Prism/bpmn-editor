// Impulsions de lumière sur les lignes du fond d'écran. Charte Leylines : une impulsion
// avance à vitesse constante, prend la couleur de la ligne où elle passe, et arrive en
// halo sur un nœud. Les lignes (tracés en dégradé ou en couleur unie) et les nœuds
// (cercles) sont lus dans le SVG du fond : un nouveau fond s'anime sans réglage.
//
// Animations (champ « motion » de wallpapers.js) :
//   pulses : des impulsions sur les lignes en dégradé, qui allument les nœuds traversés
//   flow   : un flux lent et discret sur toutes les lignes
//   none   : fond immobile

const NS = 'http://www.w3.org/2000/svg'
const SKY = [43, 184, 255], MAGENTA = [210, 78, 142], ORANGE = [255, 126, 26]
const START_AFTER = 2000 // les fonds s'animent quand le logo a fini son entrée

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
const leyline = (t) => {
  t = Math.max(0, Math.min(1, t))
  return t < 0.5 ? mix(SKY, MAGENTA, t * 2) : mix(MAGENTA, ORANGE, (t - 0.5) * 2)
}
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const rgbText = (rgb) => `rgb(${rgb})`
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

// Texte du SVG : les petits fichiers sont intégrés par Vite en adresse data:.
async function svgText(url) {
  if (url.startsWith('data:')) {
    const [head, body] = url.split(',', 2)
    return head.endsWith(';base64') ? atob(body) : decodeURIComponent(body)
  }
  const res = await fetch(url)
  return res.text()
}

// Lignes et nœuds du dessin.
function readGeometry(text) {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
  const firstStop = {}
  doc.querySelectorAll('linearGradient').forEach((g) => {
    firstStop[g.id] = (g.querySelector('stop')?.getAttribute('stop-color') || '').toUpperCase()
  })
  const seen = new Set(), lines = []
  doc.querySelectorAll('path').forEach((p) => {
    const d = p.getAttribute('d'), stroke = p.getAttribute('stroke') || '', fill = p.getAttribute('fill')
    if (!d || seen.has(d) || (fill && fill !== 'none')) return
    seen.add(d)
    const ref = stroke.match(/url\(#([^)]+)\)/)
    // Un dégradé qui commence par l'orange se parcourt à l'envers : du bleu vers l'orange.
    if (ref) lines.push({ d, leyline: true, reversed: firstStop[ref[1]] === '#FF7E1A' })
    else if (/^#[0-9a-f]{6}$/i.test(stroke)) lines.push({ d, leyline: false, color: hex(stroke) })
  })
  const nodes = new Map()
  doc.querySelectorAll('circle').forEach((c) => {
    const r = +c.getAttribute('r')
    if (r > 150) return // grands halos d'ambiance, pas des nœuds
    const x = Math.round(+c.getAttribute('cx')), y = Math.round(+c.getAttribute('cy')), key = `${x},${y}`
    nodes.set(key, { x, y, size: Math.max(r, nodes.get(key)?.size || 0) })
  })
  return { lines, nodes: [...nodes.values()] }
}

export function createPulses(svg, { isDark }) {
  const defs = document.createElementNS(NS, 'defs')
  const measure = document.createElementNS(NS, 'g')
  const flashes = document.createElementNS(NS, 'g')
  const layer = document.createElementNS(NS, 'g')
  measure.setAttribute('visibility', 'hidden')
  svg.append(defs, measure, flashes, layer)

  let routes = [], motion = 'none', items = [], next = 0, serial = 0, startedAt = 0, loadId = 0

  async function use(url, newMotion) {
    const id = ++loadId
    clear()
    routes = []
    motion = newMotion || 'pulses'
    startedAt = performance.now()
    let geometry
    try { geometry = readGeometry(await svgText(url)) } catch { return }
    if (id !== loadId) return // un autre fond a été choisi entre-temps
    measure.replaceChildren()
    routes = geometry.lines.map((line) => {
      const el = document.createElementNS(NS, 'path')
      el.setAttribute('d', line.d)
      measure.append(el)
      const length = el.getTotalLength()
      const at = (s) => { const q = el.getPointAtLength(line.reversed ? length - s : s); return [q.x, q.y] }
      // Nœuds posés sur la ligne, avec leur distance depuis le départ.
      const stops = []
      for (const n of geometry.nodes) {
        let best = Infinity, bestS = 0
        for (let s = 0; s <= length; s += 6) {
          const [x, y] = at(s), dist = Math.hypot(x - n.x, y - n.y)
          if (dist < best) { best = dist; bestS = s }
        }
        if (best < 10) stops.push({ ...n, s: bestS })
      }
      stops.sort((a, b) => a.s - b.s)
      return { ...line, length, at, stops }
    })
  }

  const colorAt = (route, s) => (route.leyline ? leyline(s / route.length) : route.color)

  function gradient(id, stops) {
    const g = document.createElementNS(NS, 'radialGradient')
    g.id = id
    for (const [offset, opacity] of stops) {
      const stop = document.createElementNS(NS, 'stop')
      stop.setAttribute('offset', offset)
      stop.setAttribute('stop-opacity', opacity)
      g.append(stop)
    }
    defs.append(g)
    return g
  }
  const paint = (g, rgb, from = 0) => [...g.children].slice(from).forEach((s) => s.setAttribute('stop-color', rgbText(rgb)))

  function launch(route, { speed = 430, size = 1, opacity = 1 } = {}) {
    const id = `pulse-${++serial}`
    const halo = gradient(`${id}-h`, [[0, 0.9], [0.45, 0.45], [1, 0]])
    const core = gradient(`${id}-c`, [[0, 1], [0.35, 1], [1, 1]])
    core.children[0].setAttribute('stop-color', '#fff')
    const g = document.createElementNS(NS, 'g')
    g.setAttribute('opacity', opacity)
    g.innerHTML = `<circle r="${22 * size}" fill="url(#${id}-h)"/><circle r="${5 * size}" fill="url(#${id}-c)"/>`
    layer.append(g)
    items.push({ route, g, halo, core, speed, start: performance.now(), passed: new Set() })
  }

  function flash(x, y, rgb, { arrival = false, radius } = {}) {
    // Halo d'arrivée : ambre sur fond sombre, orange profond sur fond clair (charte).
    const color = arrival ? (isDark() ? [255, 176, 102] : ORANGE) : rgb
    const id = `flash-${++serial}`
    const g = gradient(id, [[0, 0.9], [0.45, 0.45], [1, 0]])
    paint(g, color)
    const c = document.createElementNS(NS, 'circle')
    c.setAttribute('cx', x)
    c.setAttribute('cy', y)
    c.setAttribute('fill', `url(#${id})`)
    flashes.append(c)
    const t0 = performance.now(), R = radius || (arrival ? 80 : 30), duration = arrival ? 1500 : 900
    const step = (now) => {
      const t = (now - t0) / duration
      if (t >= 1 || !c.isConnected) { c.remove(); g.remove(); return }
      const e = 1 - (1 - t) ** 3
      c.setAttribute('r', 8 + (R - 8) * e)
      c.setAttribute('opacity', (1 - t) * (arrival ? 1 : 0.8))
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }

  function spawn(now) {
    if (motion === 'flow') {
      if (items.length < 8) launch(pick(routes), { speed: 170, size: 0.6, opacity: 0.75 })
      next = now + 500 + Math.random() * 600
    } else {
      const colored = routes.filter((r) => r.leyline)
      if (items.length < 3 && colored.length) launch(pick(colored))
      next = now + 1300 + Math.random() * 1500
    }
  }

  function tick(now) {
    requestAnimationFrame(tick)
    if (motion === 'none' || !routes.length || document.hidden || now - startedAt < START_AFTER) return
    if (now >= next) spawn(now)
    for (const it of [...items]) {
      const s = ((now - it.start) / 1000) * it.speed
      if (s >= it.route.length) { drop(it); continue }
      const [x, y] = it.route.at(s), rgb = colorAt(it.route, s)
      it.g.setAttribute('transform', `translate(${x} ${y})`)
      paint(it.halo, rgb)
      paint(it.core, rgb, 1)
      // Nœuds traversés : le grand nœud d'arrivée s'allume en halo ambre ou orange.
      if (motion === 'pulses') {
        it.route.stops.forEach((st, i) => {
          if (!it.passed.has(i) && s >= st.s - 1) { it.passed.add(i); flash(st.x, st.y, rgb, { arrival: st.size >= 60 && st.s > it.route.length / 2 }) }
        })
      }
    }
  }

  function drop(it) {
    it.g.remove(); it.halo.remove(); it.core.remove()
    items.splice(items.indexOf(it), 1)
  }
  function clear() {
    items = []
    defs.replaceChildren(); flashes.replaceChildren(); layer.replaceChildren()
    next = 0
  }

  // Onglet caché : rien ne tourne, et l'animation repart propre au retour.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) clear() })
  requestAnimationFrame(tick)

  return { use, clear }
}
