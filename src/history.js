// Annuler et Rétablir : boutons de la barre d'outils, Ctrl+Z et Ctrl+Y.
//
// Les gestes passent par l'historique de bpmn-js (commandStack), sans limite. Mais
// certaines opérations rechargent tout le diagramme et vident cet historique :
// « Ranger », et la mise en page ou le remplacement du diagramme par l'IA. Avant
// chacune, on garde une copie du diagramme (au plus MAX_COPIES, en mémoire).
// Une fois l'historique remonté jusqu'au rechargement, Annuler recharge cette
// copie, et Rétablir revient en avant.
//
// Ouvrir un fichier ou créer un diagramme change de document : les copies sont oubliées.

import { T } from './i18n/lang.js'

const MAX_COPIES = 20

let current = null

// Recharge le diagramme par fn() en gardant d'abord une copie, pour pouvoir annuler.
export async function reloadWithCopy(modeler, fn) {
  if (current?.modeler !== modeler) return fn()
  return current.reloadWithCopy(fn)
}

// Vrai pendant un rechargement fait par l'historique lui-même (Annuler ou Rétablir).
export function isHistoryReload() {
  return !!current?.restoring
}

export function setupHistory({ modeler, undoButton, redoButton }) {
  const commandStack = modeler.get('commandStack')
  const eventBus = modeler.get('eventBus')
  const editorActions = modeler.get('editorActions')

  let past = [] // copies d'avant chaque rechargement, la plus récente à la fin
  let future = [] // copies défaites par Annuler, pour Rétablir
  let busy = 0 // rechargement en cours, par nous ou par une opération qui a gardé sa copie
  const state = { modeler, restoring: false, reloadWithCopy, undo, redo, canUndo, canRedo, restore, copies: () => past.length }
  current = state

  const getXml = async () => (await modeler.saveXML({ format: true })).xml

  async function reloadWithCopy(fn) {
    const xml = await getXml()
    busy++
    try {
      const result = await fn()
      past.push(xml)
      if (past.length > MAX_COPIES) past.shift()
      future = []
      return result
    } finally {
      busy--
      refresh()
    }
  }

  async function load(xml) {
    busy++
    state.restoring = true
    try {
      const canvas = modeler.get('canvas')
      const viewbox = canvas.viewbox()
      await modeler.importXML(xml)
      // On garde le cadrage : le diagramme ne saute pas d'un bout à l'autre de l'écran.
      canvas.viewbox({ x: viewbox.x, y: viewbox.y, width: viewbox.width, height: viewbox.height })
      eventBus.fire('history.restored')
    } finally {
      state.restoring = false
      busy--
    }
  }

  function canUndo() {
    return commandStack.canUndo() || past.length > 0
  }
  function canRedo() {
    return commandStack.canRedo() || future.length > 0
  }

  let queue = Promise.resolve()
  function enqueue(job) {
    queue = queue.then(job).catch((err) => console.error('History error:', err)).finally(refresh)
    return queue
  }

  function undo() {
    if (commandStack.canUndo()) {
      commandStack.undo()
      return Promise.resolve()
    }
    if (!past.length) return Promise.resolve()
    return enqueue(async () => {
      if (!past.length) return
      const now = await getXml()
      const xml = past.pop()
      future.push(now)
      await load(xml)
    })
  }

  function redo() {
    if (commandStack.canRedo()) {
      commandStack.redo()
      return Promise.resolve()
    }
    if (!future.length) return Promise.resolve()
    return enqueue(async () => {
      if (!future.length) return
      const now = await getXml()
      const xml = future.pop()
      past.push(now)
      await load(xml)
    })
  }

  // Revient à un diagramme donné (début d'un tour de l'IA) : les copies prises depuis
  // sont oubliées, et Rétablir ramène l'état actuel.
  function restore(xml, keepCopies) {
    return enqueue(async () => {
      const now = await getXml()
      past = past.slice(0, keepCopies)
      future = [now]
      await load(xml)
    })
  }

  // Ctrl+Z et Ctrl+Y passent par les mêmes fonctions que les boutons.
  for (const [name, fn] of [['undo', undo], ['redo', redo]]) {
    if (editorActions.isRegistered(name)) editorActions.unregister(name)
    editorActions.register(name, fn)
  }

  function refresh() {
    if (undoButton) undoButton.disabled = !canUndo()
    if (redoButton) redoButton.disabled = !canRedo()
  }

  eventBus.on('commandStack.changed', ({ trigger }) => {
    // Un nouveau geste après un retour en arrière : la suite défaite est abandonnée.
    if (trigger === 'execute' && !busy) future = []
    refresh()
  })
  eventBus.on('import.done', () => {
    if (!busy) {
      past = []
      future = []
    }
    refresh()
  })

  // Les boutons flottent à droite de la bascule de simulation, quelle que soit sa largeur.
  const group = undoButton?.parentElement
  const placeGroup = () => {
    const toggle = modeler.get('canvas').getContainer().querySelector('.bts-toggle-mode')
    if (group && toggle?.offsetWidth) group.style.setProperty('--history-left', `${toggle.offsetLeft + toggle.offsetWidth + 8}px`)
  }
  requestAnimationFrame(placeGroup)
  const toggle = modeler.get('canvas').getContainer().querySelector('.bts-toggle-mode')
  if (toggle && 'ResizeObserver' in window) new ResizeObserver(placeGroup).observe(toggle)

  undoButton?.addEventListener('click', () => undo())
  redoButton?.addEventListener('click', () => redo())
  if (undoButton) undoButton.title = T('Undo (Ctrl+Z)', 'Annuler (Ctrl+Z)')
  if (redoButton) redoButton.title = T('Redo (Ctrl+Y)', 'Rétablir (Ctrl+Y)')
  undoButton?.setAttribute('aria-label', T('Undo', 'Annuler'))
  redoButton?.setAttribute('aria-label', T('Redo', 'Rétablir'))
  refresh()

  return state
}

// Accès pour les autres modules (annulation du tour de l'IA).
export function getHistory() {
  return current
}
