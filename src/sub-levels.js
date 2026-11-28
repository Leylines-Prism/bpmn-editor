// Carte à plusieurs niveaux : une activité appelante (bpmn:CallActivity) se lie à un autre
// diagramme de Mes diagrammes, qui la détaille. On y descend d'un clic, et un fil d'Ariane
// en haut du canevas permet de remonter.
//
//   - Le lien vit dans le .bpmn : bpmnpilot:linkedDiagram (« lieu:identifiant » dans Mes
//     diagrammes) et bpmnpilot:linkedDiagramName (son nom, montré partout, et qui retrouve le
//     diagramme quand l'identifiant ne vaut pas ici, dans un autre navigateur par exemple).
//     calledElement, l'attribut standard, reçoit l'identifiant du processus appelé, que les
//     moteurs d'exécution lisent.
//   - Groupe « Sous-niveau » du panneau Processus : lier un diagramme, en créer un, l'ouvrir,
//     délier. Une tâche devient activité appelante par le menu Changer le type (clé).
//   - Pastille en bas à gauche des activités appelantes (comme celle des tables de décision) : « Ouvrir » si elle est liée (un clic
//     y descend), « + Lier » sinon (un clic choisit l'activité et montre le groupe).
//   - Avant de descendre ou de remonter, le diagramme ouvert est gardé dans Mes diagrammes
//     (mis à jour, ou créé à son nom) : rien ne se perd en changeant de niveau.
//
// Pour tout le monde, pas seulement en mode Expert. En mode Présentation, seules les pastilles
// des activités liées restent : on peut parcourir les niveaux devant un public.

import htm from 'htm'
import { h } from '@bpmn-io/properties-panel/preact'
import { useEffect, useState } from '@bpmn-io/properties-panel/preact/hooks'
import { useService } from 'bpmn-js-properties-panel'
import { getBusinessObject, is } from 'bpmn-js/lib/util/ModelUtil'
import { T } from './i18n/lang.js'
import { UNLINKED_EVENT } from './diagram-library.js'
import { firstProcessId, linkOf, resolveLink, subLevelXml } from './level-links.js'

export { firstProcessId, linkOf, resolveLink, subLevelXml }

const html = htm.bind(h)
const TYPE = 'level-badge'
export const LEVEL_GROUP = 'bpmn-pilot-sub-level'
export const LEVELS_CHANGED = 'bpmn-pilot.levels.changed'
const TRAIL_KEY = 'bpmn-editor-level-trail'
const DOWN_ICON = '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="1" y="1" width="10" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M6 5.5v5M3.8 8.6 6 10.8l2.2-2.2" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>'

// Branché par setupSubLevels.
let actions = null

const isCallActivity = (element) => is(element, 'bpmn:CallActivity') && element.type !== 'label'

function useDiagrams(element) {
  const eventBus = useService('eventBus')
  const [state, setState] = useState(null)
  useEffect(() => {
    let alive = true
    const load = () => { actions?.listing().then((s) => alive && setState(s)).catch(() => alive && setState({ rows: [], current: null })) }
    load()
    eventBus.on(LEVELS_CHANGED, load)
    return () => { alive = false; eventBus.off(LEVELS_CHANGED, load) }
  }, [eventBus, element])
  return state
}

function SubLevelEntry({ element, id }) {
  const modeling = useService('modeling')
  const listing = useDiagrams(element)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  if (!actions) return null
  const run = async (fn) => {
    setBusy(true)
    setMessage('')
    try {
      const msg = await fn()
      if (msg) setMessage(msg)
    } catch (err) {
      setMessage(T('Failed: ', 'Échec : ') + err.message)
    } finally {
      setBusy(false)
    }
  }

  if (!listing) return html`<div class="bio-properties-panel-entry level-entry" data-entry-id=${id}>…</div>`
  const bo = getBusinessObject(element)
  const link = linkOf(bo)
  const target = resolveLink(link, listing.rows)
  const choices = listing.rows.filter((r) => !listing.current || r.key !== `${listing.current.place}:${listing.current.id}`)
  const select = html`<select id=${id + '-select'} class="level-select" disabled=${busy}
      onChange=${(e) => { const row = listing.rows.find((r) => r.key === e.target.value); run(() => (row ? actions.link(element, row, modeling) : actions.unlink(element, modeling))) }}>
      <option value="">${link.key || link.name ? T('Unlink', 'Délier') : T('Choose a diagram of My diagrams…', 'Choisir un diagramme de Mes diagrammes…')}</option>
      ${choices.map((r) => html`<option value=${r.key} selected=${target?.key === r.key}>${r.name}</option>`)}
      ${(link.key || link.name) && !target ? html`<option value=${link.key} selected>${T('Missing: ', 'Introuvable : ')}${link.name || link.key}</option>` : null}
    </select>`

  if (link.key || link.name) {
    return html`<div class="bio-properties-panel-entry level-entry" data-entry-id=${id}>
      <label class="bio-properties-panel-label" for=${id + '-select'}>${T('Linked diagram', 'Diagramme lié')}</label>
      ${select}
      ${target ? null : html`<p class="level-warning">${T(`“${link.name || link.key}” is not in My diagrams of this browser or server. Choose another one, or save it there under this name.`,
        `« ${link.name || link.key} » n'est pas dans Mes diagrammes de ce navigateur ou de ce serveur. Choisissez-en un autre, ou enregistrez-le sous ce nom.`)}</p>`}
      <div class="level-actions">
        ${target ? html`<button type="button" class="level-button primary" disabled=${busy} onClick=${() => run(() => actions.descend(element))}>
          <span class="level-ico" dangerouslySetInnerHTML=${{ __html: DOWN_ICON }}></span>${T('Open this level', 'Ouvrir ce niveau')}</button>` : null}
        <button type="button" class="level-button" disabled=${busy} onClick=${() => run(() => actions.unlink(element, modeling))}>${T('Unlink', 'Délier')}</button>
      </div>
      ${message ? html`<p class="level-message">${message}</p>` : null}
    </div>`
  }

  return html`<div class="bio-properties-panel-entry level-entry" data-entry-id=${id}>
    <p class="level-hint">${T('Link the diagram that details this activity: one click on the canvas then opens it, and a trail at the top brings you back.',
      'Liez le diagramme qui détaille cette activité : un clic sur le canevas l\'ouvre ensuite, et un fil en haut ramène au niveau du dessus.')}</p>
    <div class="level-actions column">
      <button type="button" class="level-button primary" disabled=${busy} onClick=${() => run(() => actions.create(element, modeling))}>
        ${T('+ Create the diagram of this level', '+ Créer le diagramme de ce niveau')}</button>
      ${choices.length ? html`<label class="bio-properties-panel-label" for=${id + '-select'}>${T('Or link a saved diagram', 'Ou lier un diagramme enregistré')}</label>${select}` : null}
    </div>
    ${message ? html`<p class="level-message">${message}</p>` : null}
  </div>`
}

function SubLevelPropertiesProvider(propertiesPanel) {
  propertiesPanel.registerProvider(410, this)
}
SubLevelPropertiesProvider.$inject = ['propertiesPanel']
SubLevelPropertiesProvider.prototype.getGroups = function (element) {
  return (groups) => {
    if (!isCallActivity(element)) return groups
    const group = {
      id: LEVEL_GROUP,
      label: T('Sub-level', 'Sous-niveau'),
      shouldOpen: true,
      entries: [{ id: 'bpmn-pilot-sub-level-link', component: SubLevelEntry, isEdited: () => !!(isCallActivity(element) && (linkOf(getBusinessObject(element)).key || linkOf(getBusinessObject(element)).name)) }],
    }
    const general = groups.findIndex((g) => g.id === 'general')
    groups.splice(general + 1, 0, group)
    return groups
  }
}

export const SubLevelPanelModule = {
  __init__: ['subLevelPropertiesProvider'],
  subLevelPropertiesProvider: ['type', SubLevelPropertiesProvider],
}

// ── Fil d'Ariane ──

function readTrail() {
  try {
    const t = JSON.parse(sessionStorage.getItem(TRAIL_KEY) || '[]')
    return Array.isArray(t) ? t.filter((s) => s && typeof s.id === 'string' && typeof s.place === 'string') : []
  } catch { return [] }
}
function writeTrail(trail) {
  try {
    if (trail.length) sessionStorage.setItem(TRAIL_KEY, JSON.stringify(trail))
    else sessionStorage.removeItem(TRAIL_KEY)
  } catch { /* stockage indisponible : le fil vaut pour cette page */ }
}

// library : src/diagram-library.js. getName() : nom du diagramme ouvert. showPanelGroup() :
// ouvre le panneau Processus sur le groupe Sous-niveau.
export function setupSubLevels(modeler, { library, getName, setStatus, showPanelGroup }) {
  const overlays = modeler.get('overlays')
  const eventBus = modeler.get('eventBus')
  const elementRegistry = modeler.get('elementRegistry')
  const selection = modeler.get('selection')
  const canvas = modeler.get('canvas')
  let rows = []
  let trail = readTrail()
  let navigating = false

  const bar = document.createElement('nav')
  bar.id = 'level-trail'
  bar.setAttribute('aria-label', T('Levels of the map', 'Niveaux de la carte'))
  bar.hidden = true
  canvas.getContainer().closest('#canvas')?.append(bar)

  async function listing() {
    const [all, current] = await Promise.all([library.listDiagrams(), library.current()])
    rows = all
    return { rows: all, current }
  }

  function changed() { eventBus.fire(LEVELS_CHANGED) }

  async function link(element, row, modeling) {
    const bo = getBusinessObject(element)
    let processId = ''
    try { processId = firstProcessId((await library.getItem(row))?.xml) } catch { /* lien gardé sans calledElement */ }
    modeling.updateModdleProperties(element, bo, { 'bpmnpilot:linkedDiagram': row.key, 'bpmnpilot:linkedDiagramName': row.name, calledElement: processId || bo.calledElement || undefined })
    changed()
    return T(`Linked to “${row.name}”.`, `Lié à « ${row.name} ».`)
  }

  function unlink(element, modeling) {
    const bo = getBusinessObject(element)
    modeling.updateModdleProperties(element, bo, { 'bpmnpilot:linkedDiagram': undefined, 'bpmnpilot:linkedDiagramName': undefined })
    changed()
    return T('Unlinked. The other diagram is kept in My diagrams.', 'Délié. L\'autre diagramme reste dans Mes diagrammes.')
  }

  async function create(element, modeling) {
    const bo = getBusinessObject(element)
    const name = (bo.name || '').replace(/\s+/g, ' ').trim() || T('Sub-process', 'Sous-processus')
    const processId = `Process_${Math.random().toString(36).slice(2, 9)}`
    const ref = await library.createDiagram(name, subLevelXml(name, processId))
    const key = `${ref.place}:${ref.id}`
    modeling.updateModdleProperties(element, bo, { 'bpmnpilot:linkedDiagram': key, 'bpmnpilot:linkedDiagramName': ref.name, calledElement: processId })
    changed()
    return T(`“${ref.name}” created in My diagrams and linked. Open this level to draw it.`, `« ${ref.name} » créé dans Mes diagrammes et lié. Ouvrez ce niveau pour le dessiner.`)
  }

  async function descend(element) {
    const target = resolveLink(linkOf(getBusinessObject(element)), rows.length ? rows : (await listing()).rows)
    if (!target) throw new Error(T('the linked diagram is not in My diagrams', 'le diagramme lié n\'est pas dans Mes diagrammes'))
    const parentName = getName()
    const parent = await library.keepCurrent()
    if (!parent) throw new Error(T('the open diagram could not be kept in My diagrams', 'le diagramme ouvert n\'a pas pu être gardé dans Mes diagrammes'))
    navigating = true
    try {
      const child = await library.openRef(target)
      trail = [...trail, { place: parent.place, id: parent.id, name: parentName, element: element.id }]
      writeTrail(trail)
      setStatus(T(`Level opened: “${child.name}”`, `Niveau ouvert : « ${child.name} »`))
    } finally {
      navigating = false
    }
    render()
    return ''
  }

  async function ascend(index) {
    const target = trail[index]
    if (!target) return
    const kept = await library.keepCurrent()
    if (!kept) {
      alert(T('The open diagram could not be kept in My diagrams.', 'Le diagramme ouvert n\'a pas pu être gardé dans Mes diagrammes.'))
      return
    }
    navigating = true
    try {
      const parent = await library.openRef(target)
      trail = trail.slice(0, index)
      writeTrail(trail)
      setStatus(T(`Back to “${parent.name}”`, `Retour à « ${parent.name} »`))
      const el = target.element && elementRegistry.get(target.element)
      if (el) {
        selection.select(el)
        canvas.scrollToElement?.(el)
      }
    } catch (err) {
      alert(T('Cannot go back up: ', 'Impossible de remonter : ') + err.message)
    } finally {
      navigating = false
    }
    render()
  }

  function render() {
    bar.replaceChildren()
    bar.hidden = !trail.length
    if (!trail.length) return
    const up = document.createElement('button')
    up.type = 'button'
    up.className = 'level-up'
    up.textContent = T('↑ Up', '↑ Remonter')
    up.title = T(`Back to “${trail[trail.length - 1].name}”`, `Revenir à « ${trail[trail.length - 1].name} »`)
    up.addEventListener('click', () => ascend(trail.length - 1))
    bar.append(up)
    trail.forEach((step, i) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'level-crumb'
      b.textContent = step.name
      b.title = T(`Open “${step.name}”`, `Ouvrir « ${step.name} »`)
      b.addEventListener('click', () => ascend(i))
      bar.append(b, Object.assign(document.createElement('span'), { className: 'level-sep', textContent: '›', ariaHidden: 'true' }))
    })
    const here = document.createElement('span')
    here.className = 'level-here'
    here.textContent = getName()
    here.setAttribute('aria-current', 'page')
    bar.append(here)
  }

  // Un diagramme ouvert autrement (Nouveau, fichier, Mes diagrammes) quitte la carte.
  window.addEventListener(UNLINKED_EVENT, () => {
    if (navigating || !trail.length) return
    trail = []
    writeTrail(trail)
    render()
  })

  // ── Pastilles ──

  function badgeFor(element) {
    const link = linkOf(getBusinessObject(element))
    const target = resolveLink(link, rows)
    const button = document.createElement('button')
    button.type = 'button'
    const linked = !!(link.key || link.name)
    button.className = linked ? (target ? 'level-badge' : 'level-badge broken') : 'level-badge empty'
    button.innerHTML = linked ? `${DOWN_ICON}<span>${T('Open', 'Ouvrir')}</span>` : `<span>+ ${T('Link', 'Lier')}</span>`
    const label = (getBusinessObject(element).name || element.id).trim()
    button.title = linked
      ? target
        ? T(`Open the linked diagram “${target.name}”`, `Ouvrir le diagramme lié « ${target.name} »`)
        : T(`“${link.name || link.key}” is missing from My diagrams`, `« ${link.name || link.key} » manque dans Mes diagrammes`)
      : T(`Link a diagram that details “${label}”`, `Lier un diagramme qui détaille « ${label} »`)
    button.setAttribute('aria-label', button.title)
    for (const type of ['mousedown', 'pointerdown', 'dblclick']) button.addEventListener(type, (e) => e.stopPropagation())
    button.addEventListener('click', (e) => {
      e.stopPropagation()
      if (target) descend(element).catch((err) => alert(T('Cannot open this level: ', 'Impossible d\'ouvrir ce niveau : ') + err.message))
      else {
        selection.select(element)
        showPanelGroup?.()
      }
    })
    return button
  }

  function refresh(element) {
    overlays.remove({ element, type: TYPE })
    if (!element || !isCallActivity(element) || !elementRegistry.get(element.id)) return
    overlays.add(element, TYPE, { position: { bottom: -11, left: 8 }, html: badgeFor(element) })
  }

  async function refreshAll() {
    try { await listing() } catch { rows = [] }
    overlays.remove({ type: TYPE })
    for (const element of elementRegistry.getAll()) refresh(element)
    render()
  }

  actions = { listing, link, unlink, create, descend }
  eventBus.on(['import.done', LEVELS_CHANGED], () => { refreshAll() })
  eventBus.on('elements.changed', ({ elements }) => { for (const element of elements) refresh(element) })
  render()
  return { refreshAll, descend, ascend, trail: () => trail.slice() }
}
