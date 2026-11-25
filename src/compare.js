// Vue « Avant / après » : deux versions d'un diagramme côte à côte, en lecture seule,
// avec les différences en couleur et leur liste.
//
// La comparaison vient de bpmn-js-differ, sur le modèle BPMN des deux versions :
// ajouté (vert, à droite), supprimé (rouge, à gauche), modifié (orange, des deux
// côtés), et sur demande la disposition (position, taille ou couleur, en bleu).
// Les deux vues défilent et zooment ensemble.
//
// Sert au marquage de l'IA (état d'avant son tour) et au menu Ouvrir (comparer
// avec un fichier). Rien n'est enregistré.

import NavigatedViewer from 'bpmn-js/lib/NavigatedViewer'
import { diff, ChangeHandler } from 'bpmn-js-differ'
import { lang, T, num } from './i18n/lang.js'
import frTexts from './i18n/fr.js'

const KINDS = ['added', 'removed', 'changed', 'layout']

// bpmn-js-differ lit l'id de l'élément visé ; une partie graphique orpheline (forme
// sans élément BPMN) le ferait échouer. On l'ignore.
class SafeChangeHandler extends ChangeHandler {
  _computeChangeId(element) {
    return element?.id ?? '?'
  }
}

// Calcule les différences entre deux définitions bpmn-moddle.
export function compareDefinitions(before, after) {
  const result = diff(before, after, new SafeChangeHandler())
  delete result._added['?']
  delete result._removed['?']
  delete result._changed['?']
  delete result._layoutChanged['?']
  return {
    added: result._added,
    removed: result._removed,
    changed: result._changed,
    // Un élément ajouté ou supprimé a forcément bougé : on ne le répète pas.
    layout: Object.fromEntries(Object.entries(result._layoutChanged).filter(([id]) => !result._added[id] && !result._removed[id])),
  }
}

// Libellé lisible d'un type BPMN : « bpmn:UserTask » → « User task » / « Tâche utilisateur ».
export function typeLabel(type) {
  const words = String(type || '').replace(/^\w+:/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
  const en = words.charAt(0).toUpperCase() + words.slice(1)
  return lang === 'fr' ? frTexts[en] || en : en
}

const ATTR_LABELS = {
  name: ['Name', 'Nom'],
  documentation: ['Documentation', 'Documentation'],
  eventDefinitions: ['Event type', "Type d'événement"],
  sourceRef: ['Source', 'Source'],
  targetRef: ['Target', 'Cible'],
  conditionExpression: ['Condition', 'Condition'],
  default: ['Default flow', 'Flux par défaut'],
  cancelActivity: ['Interrupting', 'Interrompant'],
  attachedToRef: ['Attached to', 'Attaché à'],
  isExecutable: ['Executable', 'Exécutable'],
  processRef: ['Process', 'Processus'],
  $type: ['Type', 'Type'],
}

function attrLabel(path) {
  const key = path.replace(/\[\d+\]$/, '').split('.')[0]
  const label = ATTR_LABELS[key]
  return label ? T(label[0], label[1]) : key
}

function formatValue(value, names) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? T('yes', 'oui') : T('no', 'non')
  if (typeof value === 'string') {
    const ref = value.match(/^#ref:(.+)$/)
    if (ref) return names.get(ref[1]) || ref[1]
    return value
  }
  if (typeof value === 'object') {
    if (value.$type === 'bpmn:Documentation' || value.$type === 'bpmn:FormalExpression') return value.text || value.body || '—'
    if (value.$type) return typeLabel(value.$type)
  }
  return String(value)
}

// Disposition comparée forme par forme : position, taille, tracé et couleurs. bpmn-js-differ
// ne la voit pas quand la partie graphique a été régénérée (« Ranger » change ses ids).
function layoutDiff(regBefore, regAfter, changes) {
  const r = Math.round
  const look = (el) => {
    const di = el.di || {}
    const colors = [di.get?.('color:background-color'), di.get?.('color:border-color'), di.get?.('bioc:fill'), di.get?.('bioc:stroke'), di.label?.get?.('color:color')]
    const geometry = el.waypoints ? el.waypoints.map((p) => `${r(p.x)},${r(p.y)}`).join(' ') : `${r(el.x)},${r(el.y)},${r(el.width)},${r(el.height)}`
    const label = el.label ? `${r(el.label.x)},${r(el.label.y)}` : ''
    return JSON.stringify([geometry, label, colors])
  }
  const moved = {}
  regAfter.forEach((el) => {
    if (el.type === 'label' || !el.businessObject || el.labelTarget) return
    const old = regBefore.get(el.id)
    if (!old || old.type === 'label' || changes.added[el.id] || changes.removed[el.id]) return
    if (!el.parent) return // racine
    if (look(old) !== look(el)) moved[el.id] = el.businessObject
  })
  return moved
}

function elementName(el) {
  return el?.name || ''
}

// Ouvre la vue. before et after : { xml, title }. Renvoie une promesse résolue à la fermeture.
export async function openCompare({ before, after, actions = [], title = T('Before and after', 'Avant / après') }) {
  const dialog = document.createElement('dialog')
  dialog.id = 'compare-dialog'
  dialog.setAttribute('aria-label', title)
  dialog.innerHTML = `
    <header class="cmp-head">
      <h2></h2>
      <div class="cmp-legend" role="group" aria-label="${T('Differences', 'Différences')}"></div>
      <div class="cmp-grow"></div>
      <div class="cmp-actions"></div>
      <button type="button" class="btn icon-only cmp-close" aria-label="${T('Close', 'Fermer')}" title="${T('Close (Esc)', 'Fermer (Échap)')}">×</button>
    </header>
    <div class="cmp-body">
      <section class="cmp-pane cmp-before">
        <div class="cmp-label"></div>
        <div class="cmp-canvas"></div>
      </section>
      <section class="cmp-pane cmp-after">
        <div class="cmp-label"></div>
        <div class="cmp-canvas"></div>
      </section>
      <aside class="cmp-list" aria-label="${T('List of differences', 'Liste des différences')}"></aside>
    </div>`
  dialog.querySelector('h2').textContent = title
  document.body.appendChild(dialog)

  const paneBefore = dialog.querySelector('.cmp-before')
  const paneAfter = dialog.querySelector('.cmp-after')
  paneBefore.querySelector('.cmp-label').textContent = before.title
  paneAfter.querySelector('.cmp-label').textContent = after.title

  const viewerBefore = new NavigatedViewer({ container: paneBefore.querySelector('.cmp-canvas') })
  const viewerAfter = new NavigatedViewer({ container: paneAfter.querySelector('.cmp-canvas') })

  const closed = new Promise((resolve) => {
    dialog.addEventListener('close', () => {
      viewerBefore.destroy()
      viewerAfter.destroy()
      dialog.remove()
      resolve(dialog.returnValue)
    })
  })
  dialog.querySelector('.cmp-close').addEventListener('click', () => dialog.close())
  for (const action of actions) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'btn' + (action.primary ? ' primary' : '')
    b.textContent = action.label
    if (action.title) b.title = action.title
    b.addEventListener('click', async () => {
      if ((await action.run()) !== false) dialog.close(action.id)
    })
    dialog.querySelector('.cmp-actions').append(b)
  }
  dialog.showModal()

  try {
    await viewerBefore.importXML(before.xml)
    await viewerAfter.importXML(after.xml)
  } catch (err) {
    dialog.querySelector('.cmp-body').innerHTML = ''
    const p = document.createElement('p')
    p.className = 'cmp-error'
    p.textContent = T('Comparison impossible: ', 'Comparaison impossible : ') + err.message.split('\n')[0]
    dialog.querySelector('.cmp-body').append(p)
    return closed
  }

  const changes = compareDefinitions(viewerBefore.getDefinitions(), viewerAfter.getDefinitions())
  Object.assign(changes.layout, layoutDiff(viewerBefore.get('elementRegistry'), viewerAfter.get('elementRegistry'), changes))

  // Noms des éléments, des deux côtés, pour les références (« Cible : Valider »).
  const names = new Map()
  for (const viewer of [viewerBefore, viewerAfter]) {
    viewer.get('elementRegistry').forEach((el) => {
      const n = elementName(el.businessObject)
      if (n && !names.has(el.id)) names.set(el.id, n)
    })
  }

  const canvasBefore = viewerBefore.get('canvas')
  const canvasAfter = viewerAfter.get('canvas')
  const regBefore = viewerBefore.get('elementRegistry')
  const regAfter = viewerAfter.get('elementRegistry')

  // Marques sur les deux vues. La disposition est masquée tant qu'on ne la demande pas.
  const shown = { added: true, removed: true, changed: true, layout: false }
  function paint() {
    for (const [canvas, reg] of [[canvasBefore, regBefore], [canvasAfter, regAfter]]) {
      reg.forEach((el) => {
        for (const k of KINDS) canvas.removeMarker(el, 'cmp-' + k)
      })
    }
    const mark = (canvas, reg, id, kind) => {
      const el = reg.get(id)
      if (el && el !== canvas.getRootElement() && el.type !== 'label') canvas.addMarker(el, 'cmp-' + kind)
    }
    if (shown.added) for (const id of Object.keys(changes.added)) mark(canvasAfter, regAfter, id, 'added')
    if (shown.removed) for (const id of Object.keys(changes.removed)) mark(canvasBefore, regBefore, id, 'removed')
    if (shown.changed) {
      for (const id of Object.keys(changes.changed)) {
        mark(canvasBefore, regBefore, id, 'changed')
        mark(canvasAfter, regAfter, id, 'changed')
      }
    }
    if (shown.layout) {
      for (const id of Object.keys(changes.layout)) {
        if (changes.changed[id]) continue
        mark(canvasBefore, regBefore, id, 'layout')
        mark(canvasAfter, regAfter, id, 'layout')
      }
    }
    renderList()
  }

  // Légende : une pastille par type de différence, cliquable pour l'afficher ou la masquer.
  const LEGEND = {
    added: [T('added', 'ajouté'), T('added', 'ajoutés')],
    removed: [T('removed', 'supprimé'), T('removed', 'supprimés')],
    changed: [T('changed', 'modifié'), T('changed', 'modifiés')],
    layout: [T('moved or restyled', 'déplacé ou restylé'), T('moved or restyled', 'déplacés ou restylés')],
  }
  const legend = dialog.querySelector('.cmp-legend')
  for (const kind of KINDS) {
    const n = Object.keys(changes[kind]).length
    const chip = document.createElement('button')
    chip.type = 'button'
    chip.className = `cmp-chip cmp-chip-${kind}`
    chip.setAttribute('aria-pressed', String(shown[kind]))
    chip.innerHTML = '<span class="cmp-swatch" aria-hidden="true"></span>'
    chip.append(`${num(n)} ${LEGEND[kind][n > 1 ? 1 : 0]}`)
    chip.title = shown[kind] ? T('Click to hide', 'Cliquer pour masquer') : T('Click to show', 'Cliquer pour afficher')
    chip.disabled = n === 0
    chip.addEventListener('click', () => {
      shown[kind] = !shown[kind]
      chip.setAttribute('aria-pressed', String(shown[kind]))
      chip.title = shown[kind] ? T('Click to hide', 'Cliquer pour masquer') : T('Click to show', 'Cliquer pour afficher')
      paint()
    })
    legend.append(chip)
  }

  // Liste des différences, à droite. Un clic centre les deux vues sur l'élément.
  const list = dialog.querySelector('.cmp-list')
  function renderList() {
    list.innerHTML = ''
    const rows = []
    // Une liaison sans nom se désigne par ses deux bouts : « Tâche → Fin ».
    const ends = (model) => {
      const end = (ref) => ref && (elementName(ref) || names.get(ref.id) || typeLabel(ref.$type))
      const a = end(model?.sourceRef)
      const b = end(model?.targetRef)
      return a && b ? `${a} → ${b}` : ''
    }
    const label = (model, id) => elementName(model) || ends(model) || typeLabel(model?.$type) || id
    for (const [id, model] of Object.entries(changes.added)) rows.push({ id, kind: 'added', title: label(model, id), type: model.$type })
    for (const [id, model] of Object.entries(changes.removed)) rows.push({ id, kind: 'removed', title: label(model, id), type: model.$type })
    for (const [id, { model, attrs }] of Object.entries(changes.changed)) {
      const show = (path, v) => (path === '$type' ? typeLabel(v) : formatValue(v, names))
      const lines = Object.entries(attrs).map(([path, { oldValue, newValue }]) => ({
        attr: attrLabel(path), from: show(path, oldValue), to: show(path, newValue),
      }))
      rows.push({ id, kind: 'changed', title: label(model, id), type: model.$type, lines })
    }
    if (shown.layout) {
      for (const [id, model] of Object.entries(changes.layout)) {
        if (!changes.changed[id]) rows.push({ id, kind: 'layout', title: label(model, id), type: model?.$type })
      }
    }
    const visible = rows.filter((r) => shown[r.kind])
    if (!visible.length) {
      const p = document.createElement('p')
      p.className = 'cmp-empty'
      p.textContent = rows.length || Object.keys(changes.layout).length
        ? T('No difference shown. Use the buttons above to show them.', 'Aucune différence affichée. Les boutons du haut les font apparaître.')
        : T('The two versions are identical.', 'Les deux versions sont identiques.')
      list.append(p)
      return
    }
    for (const row of visible) {
      const item = document.createElement('button')
      item.type = 'button'
      item.className = `cmp-item cmp-item-${row.kind}`
      const head = document.createElement('span')
      head.className = 'cmp-item-head'
      head.innerHTML = '<span class="cmp-swatch" aria-hidden="true"></span>'
      const strong = document.createElement('strong')
      strong.textContent = row.title
      head.append(strong)
      item.append(head)
      const type = document.createElement('span')
      type.className = 'cmp-item-type'
      type.textContent = typeLabel(row.type)
      item.append(type)
      for (const line of row.lines || []) {
        const l = document.createElement('span')
        l.className = 'cmp-item-line'
        const from = document.createElement('del')
        from.textContent = line.from
        const to = document.createElement('ins')
        to.textContent = line.to
        l.append(`${line.attr} : `.replace(' :', lang === 'fr' ? ' :' : ':'), from, ' → ', to)
        item.append(l)
      }
      item.addEventListener('click', () => focusOn(row.id))
      list.append(item)
    }
  }

  // Défilement et zoom liés : ce qu'on fait dans une vue se reproduit dans l'autre.
  let syncing = false
  function link(from, to) {
    from.get('eventBus').on('canvas.viewbox.changed', ({ viewbox }) => {
      if (syncing) return
      syncing = true
      to.get('canvas').viewbox({ x: viewbox.x, y: viewbox.y, width: viewbox.width, height: viewbox.height })
      syncing = false
    })
  }
  link(viewerBefore, viewerAfter)
  link(viewerAfter, viewerBefore)

  function fitBoth() {
    // Cadre commun aux deux versions, pour que rien ne sorte de l'une ou de l'autre.
    const a = canvasBefore.viewbox().inner
    const b = canvasAfter.viewbox().inner
    const boxes = [a, b].filter((r) => r.width > 0 && r.height > 0)
    if (!boxes.length) return
    const x = Math.min(...boxes.map((r) => r.x))
    const y = Math.min(...boxes.map((r) => r.y))
    const w = Math.max(...boxes.map((r) => r.x + r.width)) - x
    const h = Math.max(...boxes.map((r) => r.y + r.height)) - y
    const c = canvasAfter.getContainer()
    const pad = 30
    const scale = Math.min((c.clientWidth - pad * 2) / w, (c.clientHeight - pad * 2) / h, 1)
    if (!(scale > 0) || !Number.isFinite(scale)) return
    canvasAfter.viewbox({
      x: x - (c.clientWidth / scale - w) / 2,
      y: y - (c.clientHeight / scale - h) / 2,
      width: c.clientWidth / scale,
      height: c.clientHeight / scale,
    })
  }

  function focusOn(id) {
    const el = regAfter.get(id) || regBefore.get(id)
    if (!el) return
    const box = el.waypoints
      ? (() => {
        const xs = el.waypoints.map((p) => p.x)
        const ys = el.waypoints.map((p) => p.y)
        return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }
      })()
      : el
    const vb = canvasAfter.viewbox()
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    canvasAfter.viewbox({ x: cx - vb.width / 2, y: cy - vb.height / 2, width: vb.width, height: vb.height })
    for (const [canvas, reg] of [[canvasBefore, regBefore], [canvasAfter, regAfter]]) {
      const target = reg.get(id)
      if (!target) continue
      canvas.addMarker(target, 'cmp-flash')
      setTimeout(() => canvas.removeMarker(target, 'cmp-flash'), 1200)
    }
  }

  paint()
  // La taille des vues n'est connue qu'une fois la fenêtre posée.
  requestAnimationFrame(() => {
    viewerBefore.get('canvas').resized()
    viewerAfter.get('canvas').resized()
    fitBoth()
  })
  return closed
}
