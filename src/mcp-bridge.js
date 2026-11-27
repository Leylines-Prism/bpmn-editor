// Pont entre l'éditeur et le serveur MCP (dossier mcp/).
//
// L'onglet se connecte au serveur par WebSocket, reçoit les appels d'outils,
// les exécute sur le bpmn-js ouvert et renvoie le résultat. Les modifications
// passent par l'API de modélisation de bpmn-js : elles s'affichent en direct
// et s'annulent avec Ctrl+Z comme une retouche à la main.

import { getBusinessObject, is } from 'bpmn-js/lib/util/ModelUtil'
import { isBranchFlow } from './probability-panel.js'
import { analysisUpdates, structureFingerprint, getChatModel, AI_SOURCE } from './copilot-analysis.js'

import { autoLayout } from './auto-layout.js'
import { reloadWithCopy } from './history.js'
import { trackAiChanges } from './ai-changes.js'
import { checkDiagram } from './diagram-checks.js'
import { eventTriggerProblem } from './lint/event-triggers.js'
import { renderDiagramPng } from './diagram-image.js'
import { fitView } from './fit-view.js'
import { T } from './i18n/lang.js'
import { FONTS, applyFont, applyTextColor, fontOf, hasText, resetText, textColorOf } from './label-style.js'

const RETRY_MIN_MS = 1000
// Dernier client MCP relié : l'analyse qu'il enregistre porte son nom.
let mcpClientName = ''
const RETRY_MAX_MS = 15000

// Renvoie l'état du pont : tabId est l'identifiant que le serveur a donné à
// cet onglet, null tant que le pont n'est pas relié.
// options.exportDiagram : voir createTools.
export function connectMcpBridge(modeler, url, options = {}) {
  // Version docker : le pont est servi par le même site que la page.
  try {
    servedByDocker = new URL(url, location.href).host === location.host
  } catch {}
  const tools = createTools(modeler, options)
  const badge = createBadge()
  const state = { tabId: null, badge }
  let retryDelay = RETRY_MIN_MS
  let ws = null
  let mcpClient = null
  // Le nom d'un agent ne reste sur le badge que tant qu'il est actif : on le revoit chaque minute.
  setInterval(() => {
    if (badge.dataset.state === 'connected' && mcpClient) setBadge(badge, 'connected', mcpClient)
  }, 60_000)

  function connect() {
    setBadge(badge, 'connecting')
    ws = new WebSocket(url)

    ws.addEventListener('open', () => {
      retryDelay = RETRY_MIN_MS
      setBadge(badge, 'connected', mcpClient)
      send({ type: 'hello', title: document.title })
    })

    ws.addEventListener('message', async (event) => {
      let msg
      try {
        msg = JSON.parse(event.data)
      } catch {
        return
      }
      if (msg.type === 'welcome') {
        state.tabId = msg.id
        return
      }
      if (msg.type === 'mcp-client') {
        mcpClient = { name: String(msg.name || ''), version: String(msg.version || ''), seenAt: Number(msg.seenAt) || null, lastCall: Number(msg.lastCall) || null }
        mcpClientName = mcpClient.name ? clientLabel(mcpClient.name) : ''
        if (badge.dataset.state === 'connected') setBadge(badge, 'connected', mcpClient)
        return
      }
      if (msg.type !== 'call') return
      const tool = tools[msg.tool]
      try {
        if (!tool) throw new Error(`Unknown tool: ${msg.tool}`)
        const data = await tool(msg.args || {})
        send({ type: 'result', id: msg.id, ok: true, data })
      } catch (err) {
        console.warn('[MCP] %s :', String(msg.tool), err)
        send({ type: 'result', id: msg.id, ok: false, error: err.message || String(err) })
      }
    })

    ws.addEventListener('close', () => {
      state.tabId = null
      setBadge(badge, 'disconnected')
      setTimeout(connect, retryDelay)
      retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS)
    })
  }

  function send(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
  }

  // Le serveur pilote l'onglet utilisé le plus récemment.
  const markActive = () => send({ type: 'active' })
  window.addEventListener('focus', markActive)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') markActive()
  })

  connect()
  return state
}

// ── Indicateur dans la barre d'outils ──────────────────────────────────────

function createBadge() {
  const badge = document.createElement('button')
  badge.type = 'button'
  badge.id = 'mcp-status'
  badge.style.cssText =
    'font-size:11px;white-space:nowrap;margin-left:auto;padding:2px 8px;border-radius:10px;border:1px solid #0f3460'
  const autosave = document.getElementById('autosave-status')
  if (autosave) {
    autosave.style.marginLeft = '8px'
    autosave.before(badge)
  } else {
    document.getElementById('toolbar')?.append(badge)
  }
  return badge
}

// Noms lisibles des clients MCP courants (clientInfo.name du protocole).
const CLIENT_NAMES = {
  'claude-code': 'Claude Code',
  'claude-ai': 'Claude',
  'cursor-vscode': 'Cursor',
  'visual-studio-code': 'VS Code',
  'mcp-inspector': 'MCP Inspector',
  'gemini-cli-mcp-client': 'Gemini CLI',
  'codex-mcp-client': 'Codex',
  'Zed': 'Zed',
}
export const clientLabel = (name) => CLIENT_NAMES[name] || (name.length > 24 ? name.slice(0, 23) + '…' : name)

const ACTIVE_MS = 15 * 60_000
let servedByDocker = false

function setBadge(badge, state, client = null) {
  const states = {
    connecting: [T('MCP: connecting…', 'MCP : connexion…'), '#888'],
    connected: [T('MCP: ready', 'MCP : prêt'), '#4ade80'],
    disconnected: [T('MCP: offline', 'MCP : hors ligne'), '#888'],
  }
  const [text, color] = states[state]
  const known = state === 'connected' && client?.name
  // Un agent qui n'a rien fait depuis ACTIVE_MS n'est plus affiché : le badge revient à « prêt »,
  // et son nom reste dans l'infobulle.
  const activeAt = Math.max(client?.seenAt || 0, client?.lastCall || 0)
  const active = known && Date.now() - activeAt < ACTIVE_MS
  badge.textContent = active ? T('MCP: ', 'MCP : ') + clientLabel(client.name) : text
  badge.dataset.state = state
  badge.style.color = color
  if (state !== 'connected') {
    badge.title = servedByDocker
      ? T('MCP server unreachable. Check that the mcp container is running (docker compose ps) and read its log (docker compose logs mcp).',
          'Serveur MCP non joignable. Vérifiez que le conteneur mcp tourne (docker compose ps) et lisez son journal (docker compose logs mcp).')
      : T('MCP server unreachable. Start it with: cd mcp && npm start', 'Serveur MCP non joignable. Lancez-le avec : cd mcp && npm start')
    return
  }
  const lines = [T('An AI can read and edit this diagram through the MCP server. Click to connect an agent.', 'Une IA peut lire et modifier ce diagramme par le serveur MCP. Cliquez pour connecter un agent.')]
  if (known) lines.unshift(T('Last client: ', 'Dernier client : ') + [client.name, client.version].filter(Boolean).join(' '))
  if (client?.lastCall) {
    const time = new Date(client.lastCall).toLocaleTimeString(document.documentElement.lang || undefined, { hour: '2-digit', minute: '2-digit' })
    lines.splice(known ? 1 : 0, 0, T('Last tool call at ', 'Dernier appel à ') + time)
  }
  badge.title = lines.join('\n')
}

// ── Outils ─────────────────────────────────────────────────────────────────

// Les outils qui écrivent sont suivis : ce qu'ils changent est marqué sur le canevas.
// options.exportDiagram({ format, name }) : l'export de l'éditeur (src/main.js), pour export_diagram.
// options.processReport({ simulate }) : le rapport de processus en Markdown, pour get_process_report.
export function createTools(modeler, { exportDiagram, processReport } = {}) {
  return trackAiChanges(modeler, buildTools(modeler, exportDiagram, processReport))
}

function buildTools(modeler, exportDiagram, processReport) {
  const canvas = modeler.get('canvas')
  const elementRegistry = modeler.get('elementRegistry')
  const elementFactory = modeler.get('elementFactory')
  const modeling = modeler.get('modeling')
  const bpmnFactory = modeler.get('bpmnFactory')
  const eventBus = modeler.get('eventBus')
  const commandStack = modeler.get('commandStack')

  // Chaque appel d'outil devient une seule commande de bpmn-js : un Ctrl+Z
  // l'annule en entier, et un échec en cours de route annule ce qui a été fait.
  commandStack.register('mcp.batch', {
    preExecute(context) {
      try {
        context.result = context.run()
      } catch (err) {
        context.error = err
      }
    },
    execute: () => [],
    revert: () => [],
  })

  function atomic(run) {
    const context = { run }
    commandStack.execute('mcp.batch', context)
    if (context.error) {
      commandStack.undo()
      throw context.error
    }
    return context.result
  }
  const bpmnRules = modeler.get('bpmnRules')
  const bpmnReplace = modeler.get('bpmnReplace')

  const withPrefix = (type) => (type.startsWith('bpmn:') ? type : 'bpmn:' + type)

  function getElement(id) {
    const element = elementRegistry.get(id)
    if (!element || element.type === 'label' || element === canvas.getRootElement()) {
      throw new Error(`Element not found: ${id}`)
    }
    return element
  }

  function describe(element) {
    const bo = getBusinessObject(element)
    const out = { id: element.id, type: element.type }
    if (bo.name) out.name = bo.name
    const eventDef = bo.eventDefinitions?.[0]
    if (eventDef) out.eventDefinition = eventDef.$type
    if (element.host) out.attachedTo = element.host.id
    if (bo.cancelActivity === false || bo.isInterrupting === false) out.interrupting = false
    const marker = markerOf(bo)
    if (marker) out.marker = marker
    if (bo.triggeredByEvent) out.eventSubProcess = true
    const style = styleOf(element)
    if (style) out.style = style
    // Documentation (Markdown) : le Co-pilote s'appuie dessus pour répondre et rédiger.
    const documentation = (bo.documentation || []).map((d) => d.text || '').join('\n\n').trim()
    if (documentation) out.documentation = documentation.length > 1500 ? documentation.slice(0, 1500) + '…' : documentation
    if (element.waypoints) {
      out.source = element.source?.id
      out.target = element.target?.id
    } else {
      out.x = Math.round(element.x + element.width / 2)
      out.y = Math.round(element.y + element.height / 2)
      out.width = element.width
      out.height = element.height
      if (element.parent && element.parent !== canvas.getRootElement()) out.parent = element.parent.id
      const lane = laneOf(element)
      if (lane) out.lane = lane.id
      const incoming = element.incoming.map((c) => c.id)
      const outgoing = element.outgoing.map((c) => c.id)
      if (incoming.length) out.incoming = incoming
      if (outgoing.length) out.outgoing = outgoing
    }
    return out
  }

  // Couleurs et mise en forme du texte réglées sur l'élément, ou null s'il n'y en a pas.
  function styleOf(element) {
    const di = element.di
    const out = {}
    const fill = di?.get?.('color:background-color') || di?.get?.('bioc:fill')
    const stroke = di?.get?.('color:border-color') || di?.get?.('bioc:stroke')
    if (fill && !element.waypoints) out.fill = fill.toUpperCase()
    if (stroke) out.stroke = stroke.toUpperCase()
    const text = textColorOf(element)
    if (text) out.textColor = text.toUpperCase()
    const font = fontOf(element)
    if (font?.isBold) out.bold = true
    if (font?.isItalic) out.italic = true
    if (font?.isUnderline) out.underline = true
    if (font?.size) out.fontSize = font.size
    if (font?.name) out.font = font.name
    return Object.keys(out).length ? out : null
  }

  // #RGB ou #RRGGBB, avec ou sans dièse, en #RRGGBB. Chaîne vide : null (réglage retiré).
  function hexColor(value) {
    if (!value) return null
    const hex = value.replace('#', '')
    return '#' + (hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex).toUpperCase()
  }

  // Conteneur par défaut : le processus, ou le premier participant d'une collaboration.
  function defaultParent() {
    const root = canvas.getRootElement()
    if (is(root, 'bpmn:Collaboration')) {
      const participant = root.children.find((c) => is(c, 'bpmn:Participant'))
      if (participant) return participant
    }
    return root
  }

  // Lane qui contient une forme (la plus profonde), d'après les flowNodeRef du modèle.
  function laneOf(element) {
    if (is(element, 'bpmn:Lane') || is(element, 'bpmn:Participant')) return null
    const bo = getBusinessObject(element)
    const lanes = elementRegistry.filter((e) => is(e, 'bpmn:Lane') && (e.businessObject.flowNodeRef || []).includes(bo))
    return lanes.find((l) => !lanes.some((o) => o !== l && o.parent === l)) || null
  }

  // Participant qui porte une lane, éventuellement imbriquée.
  function laneParticipant(lane) {
    let p = lane.parent
    while (p && !is(p, 'bpmn:Participant')) p = p.parent
    return p
  }

  const laneCenterY = (lane) => lane.y + lane.height / 2

  // Ajoute une lane en bas d'un participant. La première lane d'un pool vide
  // ramène le pool à la hauteur d'une lane, pour que toutes aient la même taille.
  function addLaneTo(participant) {
    const lanes = participant.children.filter((c) => is(c, 'bpmn:Lane'))
    if (!lanes.length) {
      const hasContent = participant.children.some((c) => c.type !== 'label')
      if (!hasContent) modeling.resizeShape(participant, { x: participant.x, y: participant.y, width: participant.width, height: 120 })
      modeling.splitLane(participant, 1)
      return participant.children.find((c) => is(c, 'bpmn:Lane'))
    }
    const last = lanes.reduce((a, b) => (a.y + a.height >= b.y + b.height ? a : b))
    return modeling.addLane(last, 'bottom')
  }

  // Décale une position vers la droite tant qu'elle chevauche une forme du conteneur.
  function freeInRow(parent, shape, position) {
    const others = (parent.children || []).filter(
      (c) => !c.waypoints && c.type !== 'label' && !is(c, 'bpmn:Lane') && !is(c, 'bpmn:Participant'),
    )
    const margin = 30
    const hit = (pos) =>
      others.find(
        (s) =>
          pos.x - shape.width / 2 < s.x + s.width + margin &&
          pos.x + shape.width / 2 > s.x - margin &&
          pos.y - shape.height / 2 < s.y + s.height + margin &&
          pos.y + shape.height / 2 > s.y - margin,
      )
    for (let i = 0, s; i < 50 && (s = hit(position)); i++) position.x = s.x + s.width + margin + shape.width / 2
    return position
  }

  // Marqueur d'une activité : boucle, multi-instance parallèle ou séquentielle, compensation.
  function markerOf(bo) {
    const loop = bo.loopCharacteristics
    if (loop && loop.$type === 'bpmn:StandardLoopCharacteristics') return 'loop'
    if (loop && loop.$type === 'bpmn:MultiInstanceLoopCharacteristics') return loop.isSequential ? 'sequential' : 'parallel'
    if (bo.isForCompensation) return 'compensation'
    return null
  }

  function setMarker(element, marker) {
    if (!is(element, 'bpmn:Activity')) throw new Error(`A marker applies only to a task, subprocess or call activity: ${element.id}`)
    if (marker === 'compensation') return modeling.updateProperties(element, { isForCompensation: true })
    let loopCharacteristics
    if (marker === 'loop') loopCharacteristics = bpmnFactory.create('bpmn:StandardLoopCharacteristics')
    else if (marker === 'parallel' || marker === 'sequential') {
      loopCharacteristics = bpmnFactory.create('bpmn:MultiInstanceLoopCharacteristics', { isSequential: marker === 'sequential' })
    }
    modeling.updateProperties(element, { loopCharacteristics, ...(marker === 'none' ? { isForCompensation: false } : {}) })
  }

  // Après création ou modification : options propres aux événements et aux activités,
  // puis refus d'une combinaison d'événement et de déclencheur que la norme n'admet pas.
  function finishElement(element, spec) {
    const bo = getBusinessObject(element)
    if (spec.interrupting !== undefined) {
      if (is(element, 'bpmn:BoundaryEvent')) modeling.updateProperties(element, { cancelActivity: spec.interrupting })
      else if (is(element, 'bpmn:StartEvent') && bo.$parent?.triggeredByEvent) modeling.updateProperties(element, { isInterrupting: spec.interrupting })
      else throw new Error(`interrupting applies only to a boundary event or to the start event of an event subprocess: ${element.id}`)
    }
    if (spec.marker) setMarker(element, spec.marker)
    // Un événement de lien se repère à son nom : la définition prend celui de l'événement.
    const link = (bo.eventDefinitions || []).find((d) => d.$type === 'bpmn:LinkEventDefinition')
    if (link && bo.name && link.name !== bo.name) modeling.updateModdleProperties(element, link, { name: bo.name })
    const problem = eventTriggerProblem(bo)
    if (problem) {
      throw new Error(`${problem} (BPMN 2.0): ${element.id}, ${element.type.replace('bpmn:', '')} with ${bo.eventDefinitions?.[0]?.$type.replace('bpmn:', '') || 'no event definition'}. Nothing was changed.`)
    }
  }

  function createShape(spec) {
    const attrs = { type: withPrefix(spec.type) }
    if (spec.eventDefinition) attrs.eventDefinitionType = withPrefix(spec.eventDefinition)
    if (spec.eventSubProcess) {
      if (attrs.type !== 'bpmn:SubProcess') throw new Error('eventSubProcess applies only to a SubProcess.')
      attrs.triggeredByEvent = true
      attrs.isExpanded = true
    } else if (spec.expanded !== undefined && ['bpmn:SubProcess', 'bpmn:Transaction', 'bpmn:AdHocSubProcess'].includes(attrs.type)) {
      attrs.isExpanded = spec.expanded
    }
    try {
      // Un pool reçoit son propre processus, pour pouvoir contenir des lanes et des formes.
      if (attrs.type === 'bpmn:Participant') return elementFactory.createParticipantShape({})
      return elementFactory.createShape(attrs)
    } catch (err) {
      throw new Error(`Invalid BPMN type "${spec.type}": ${err.message}`, { cause: err })
    }
  }

  // Position libre à droite des formes existantes du conteneur.
  function nextFreePosition(parent, shape) {
    const shapes = (parent.children || []).filter((c) => !c.waypoints && c.type !== 'label' && !is(c, 'bpmn:Lane'))
    if (!shapes.length) {
      return { x: (parent.x ?? 100) + 150, y: parent.y !== undefined ? parent.y + parent.height / 2 : 200 }
    }
    const right = Math.max(...shapes.map((s) => s.x + s.width))
    const last = shapes.reduce((a, b) => (a.x + a.width >= b.x + b.width ? a : b))
    return { x: right + 80 + shape.width / 2, y: last.y + last.height / 2 }
  }

  // Position calculée par bpmn-js (comme le menu « ajouter à la suite »),
  // décalée vers le bas tant qu'elle chevauche une forme existante. bpmn-js
  // ne tient compte que des formes déjà reliées à la source.
  function appendPosition(source, shape) {
    const position = eventBus.fire('autoPlace', { source, shape }) || {
      x: source.x + source.width + 80 + shape.width / 2,
      y: source.y + source.height / 2,
    }
    const siblings = (source.parent?.children || []).filter(
      (c) => !c.waypoints && c.type !== 'label' && !is(c, 'bpmn:Lane') && !is(c, 'bpmn:Participant'),
    )
    const margin = 20
    const overlaps = (pos) =>
      siblings.some(
        (s) =>
          pos.x - shape.width / 2 < s.x + s.width + margin &&
          pos.x + shape.width / 2 > s.x - margin &&
          pos.y - shape.height / 2 < s.y + s.height + margin &&
          pos.y + shape.height / 2 > s.y - margin,
      )
    for (let i = 0; i < 50 && overlaps(position); i++) position.y += shape.height + margin * 2
    return position
  }

  return {
    get_shapes() {
      const root = canvas.getRootElement()
      const elements = elementRegistry.filter((e) => e.type !== 'label' && e !== root)
      return {
        root: { id: root.id, type: root.type },
        shapes: elements.filter((e) => !e.waypoints).map(describe),
        connections: elements.filter((e) => e.waypoints).map(describe),
      }
    },

    async get_diagram_xml() {
      const { xml } = await modeler.saveXML({ format: true })
      return xml
    },

    // { image: { mediaType, data (base64), width, height } }
    get_diagram_image() {
      return renderDiagramPng(modeler)
    },

    // Produit le fichier comme le menu Exporter. Rien ne se télécharge sans clic de l'utilisateur.
    export_diagram({ format, name }) {
      if (!exportDiagram) throw new Error('Exporting is not available in this editor.')
      return exportDiagram({ format, name })
    },

    async set_diagram_xml({ xml }) {
      // bpmn-js reste inutilisable après l'import d'un XML lisible mais sans
      // partie graphique : on vérifie donc le document avant de l'importer.
      let definitions
      try {
        ;({ rootElement: definitions } = await modeler.get('moddle').fromXML(xml, 'bpmn:Definitions'))
      } catch (err) {
        throw new Error(`Unreadable BPMN XML, diagram unchanged: ${err.message}`, { cause: err })
      }
      if (!definitions.diagrams?.some((d) => d.plane?.bpmnElement)) {
        throw new Error('The XML contains no drawn diagram (BPMNDiagram with a BPMNPlane), diagram unchanged.')
      }
      const { warnings } = await reloadWithCopy(modeler, () => modeler.importXML(xml))
      fitView(canvas)
      return {
        imported: true,
        elements: elementRegistry.filter((e) => e.type !== 'label').length,
        warnings: warnings.map((w) => w.message),
      }
    },

    add_shapes({ shapes }) {
      return atomic(() => {
        const byKey = {}
        const created = []
        for (const spec of shapes) {
          if (withPrefix(spec.type) === 'bpmn:Lane') {
            const target = spec.parent ? byKey[spec.parent] || getElement(spec.parent) : defaultParent()
            if (!is(target, 'bpmn:Participant')) {
              throw new Error('A lane goes in a participant (pool): create the Participant first, then give its id as "parent".')
            }
            const lane = addLaneTo(target)
            if (spec.name) modeling.updateLabel(lane, spec.name)
            if (spec.key) byKey[spec.key] = lane
            const entry = describe(lane)
            if (spec.key) entry.key = spec.key
            created.push(entry)
            continue
          }

          if (spec.attachTo) {
            // Événement de bordure : posé sur le bord bas de l'activité, à droite des autres.
            const host = byKey[spec.attachTo] || getElement(spec.attachTo)
            if (!is(host, 'bpmn:Activity')) {
              throw new Error(`An event can only be attached to a task, subprocess or call activity, not ${host.type}.`)
            }
            const shape = createShape({ ...spec, type: 'BoundaryEvent' })
            const count = host.attachers.length
            const position = { x: host.x + host.width - 20 - count * 60, y: host.y + host.height }
            if (position.x < host.x + 18) position.x = host.x + 18
            if (!bpmnRules.canAttach([shape], host, null, position)) {
              throw new Error(`Cannot attach the event to ${host.id}`)
            }
            const element = modeling.createShape(shape, position, host, { attach: true })
            if (spec.name) modeling.updateLabel(element, spec.name)
            finishElement(element, spec)
            if (spec.key) byKey[spec.key] = element
            const entry = describe(element)
            if (spec.key) entry.key = spec.key
            created.push(entry)
            continue
          }

          const shape = createShape(spec)
          let element
          const target = spec.parent ? byKey[spec.parent] || getElement(spec.parent) : null
          const lane = target && is(target, 'bpmn:Lane') ? target : null

          if (lane) {
            // Dans une lane : la forme appartient au participant, à la hauteur de la lane.
            const participant = laneParticipant(lane)
            const source = spec.after ? byKey[spec.after] || getElement(spec.after) : null
            let position
            if (spec.x !== undefined && spec.y !== undefined) position = { x: spec.x, y: spec.y }
            else {
              const base = source ? appendPosition(source, shape) : nextFreePosition(participant, shape)
              position = freeInRow(participant, shape, { x: base.x, y: laneCenterY(lane) })
            }
            if (!bpmnRules.canCreate(shape, participant, null, position)) {
              throw new Error(`Cannot place ${shape.type} in ${lane.id}`)
            }
            element = source
              ? modeling.appendShape(source, shape, position, participant)
              : modeling.createShape(shape, position, participant)
          } else if (spec.after) {
            const source = byKey[spec.after] || getElement(spec.after)
            element = modeling.appendShape(source, shape, appendPosition(source, shape), source.parent)
          } else {
            // Un nouveau pool va dans la collaboration, pas dans le premier pool.
            const parent = target || (is(shape, 'bpmn:Participant') ? canvas.getRootElement() : defaultParent())
            const position =
              spec.x !== undefined && spec.y !== undefined ? { x: spec.x, y: spec.y } : nextFreePosition(parent, shape)
            if (!bpmnRules.canCreate(shape, parent, null, position)) {
              throw new Error(`Cannot place ${shape.type} in ${parent.id}`)
            }
            element = modeling.createShape(shape, position, parent)
          }

          if (spec.name) modeling.updateLabel(element, spec.name)
          finishElement(element, spec)
          if (spec.key) byKey[spec.key] = element
          const entry = describe(element)
          if (spec.key) entry.key = spec.key
          created.push(entry)
        }
        return { created }
      })
    },

    connect_shapes({ connections }) {
      return atomic(() => {
        const created = []
        for (const spec of connections) {
          const source = getElement(spec.source)
          const target = getElement(spec.target)
          const connection = modeling.connect(source, target)
          if (!connection) {
            throw new Error(`Connection not allowed by the BPMN rules: ${spec.source} → ${spec.target}`)
          }
          if (spec.name) modeling.updateLabel(connection, spec.name)
          created.push(describe(connection))
        }
        return { created }
      })
    },

    update_elements({ elements }) {
      return atomic(() => {
        const updated = []
        for (const spec of elements) {
          let element = getElement(spec.id)
          if (spec.type || spec.eventDefinition) {
            const target = { type: withPrefix(spec.type || element.type) }
            if (spec.eventDefinition) target.eventDefinitionType = withPrefix(spec.eventDefinition)
            const replaced = bpmnReplace.replaceElement(element, target)
            if (!replaced) throw new Error(`Cannot replace ${spec.id}`)
            element = replaced
          }
          if (spec.name !== undefined) modeling.updateLabel(element, spec.name)
          if (spec.documentation !== undefined) {
            const bo = getBusinessObject(element)
            const text = spec.documentation.trim()
            modeling.updateModdleProperties(element, bo, {
              documentation: text ? [bpmnFactory.create('bpmn:Documentation', { text })] : [],
            })
          }
          if (spec.probability !== undefined) {
            if (!isBranchFlow(element)) throw new Error(`probability applies only to a sequence flow leaving an exclusive, inclusive, complex or event-based gateway: ${spec.id}`)
            const bo = getBusinessObject(element)
            // Valeur proposée par l'IA : marquée jusqu'à sa revue dans le panneau Probabilité.
            modeling.updateModdleProperties(element, bo, {
              'bpmnpilot:probability': spec.probability === null ? undefined : spec.probability,
              'bpmnpilot:probabilitySource': spec.probability === null ? undefined : AI_SOURCE,
            })
          }
          finishElement(element, spec)
          updated.push({ previousId: spec.id, ...describe(element) })
        }
        return { updated }
      })
    },

    // Mêmes commandes que les groupes Forme et Texte du panneau : Ctrl+Z les annule avec le reste.
    style_elements({ elements }) {
      return atomic(() => {
        const styled = []
        for (const spec of elements) {
          const element = getElement(spec.id)
          const wantsText = spec.textColor !== undefined || ['bold', 'italic', 'underline', 'fontSize', 'font'].some((k) => spec[k] !== undefined)
          if (wantsText && !hasText(element)) throw new Error(`Element has no label to format: ${spec.id}`)
          if (spec.reset) {
            modeling.setColor([element], { fill: null, stroke: null })
            if (hasText(element)) resetText(commandStack, [element])
          }
          const colors = {}
          if (spec.fill !== undefined && !element.waypoints) colors.fill = hexColor(spec.fill)
          if (spec.stroke !== undefined) colors.stroke = hexColor(spec.stroke)
          if (Object.keys(colors).length) modeling.setColor([element], colors)
          const font = {}
          if (spec.bold !== undefined) font.isBold = spec.bold
          if (spec.italic !== undefined) font.isItalic = spec.italic
          if (spec.underline !== undefined) font.isUnderline = spec.underline
          if (spec.fontSize !== undefined) font.size = spec.fontSize
          if (spec.font !== undefined) font.name = FONTS.find((f) => f.name === spec.font)?.name || spec.font
          if (Object.keys(font).length) applyFont(commandStack, [element], font)
          // Après le fond : « auto » choisit le noir ou le blanc d'après le nouveau fond.
          if (spec.textColor !== undefined) applyTextColor(commandStack, [element], spec.textColor === 'auto' ? 'auto' : hexColor(spec.textColor))
          styled.push({ id: element.id, style: styleOf(element) || {} })
        }
        return { styled }
      })
    },

    async auto_layout() {
      try {
        var warnings = await autoLayout(modeler)
      } catch (err) {
        throw new Error(`Layout failed, diagram unchanged: ${err.message}`, { cause: err })
      }
      const elements = elementRegistry.filter((e) => e.type !== 'label' && e !== canvas.getRootElement())
      return {
        laidOut: true,
        ...(warnings.length ? { warnings } : {}),
        shapes: elements.filter((e) => !e.waypoints).length,
        connections: elements.filter((e) => e.waypoints).length,
      }
    },

    // Rapport complet (src/diagram-checks.js) : compteurs, six contrôles, et le détail de bpmnlint.
    async validate_diagram() {
      const report = await checkDiagram(modeler)
      const issues = (report.lint?.issues || []).map((issue) => {
        const element = elementRegistry.get(issue.id)
        const name = element ? getBusinessObject(element).name : undefined
        return { id: issue.id, ...(name ? { name } : {}), category: issue.category, rule: issue.rule, message: issue.message }
      })
      // Erreurs : celles de bpmnlint, plus chaque problème des autres contrôles.
      const structural = report.checks.filter((c) => c.id !== 'lint' && !c.ok).reduce((n, c) => n + c.problems.length + (c.more || 0), 0)
      return {
        errors: (report.lint?.errors || 0) + structural,
        warnings: report.lint?.warnings || 0,
        infos: report.lint?.infos || 0,
        counts: report.counts,
        checks: report.checks
          .filter((c) => !c.skipped)
          .map((c) => (c.ok ? { check: c.id, ok: true } : { check: c.id, ok: false, problems: c.problems, ...(c.more ? { more: c.more } : {}) })),
        issues,
      }
    },

    async get_process_report({ simulate } = {}) {
      if (!processReport) throw new Error('The process report is not available in this editor.')
      return processReport({ simulate: !!simulate })
    },

    // Analyse du processus, enregistrée dans le .bpmn pour le rapport (src/copilot-analysis.js).
    set_report_commentary({ summary = '', points = [] }) {
      const definitions = modeler.getDefinitions()
      const root = canvas.getRootElement()
      for (const p of points) for (const id of p.elements || []) getElement(id)
      const text = String(summary).trim()
      const data = text || points.length
        ? {
            author: getChatModel() || mcpClientName || 'MCP',
            date: new Date().toISOString(),
            fingerprint: structureFingerprint(definitions),
            summary: text,
            points: points.map((p) => ({ kind: p.kind, elements: [...new Set(p.elements || [])], text: String(p.text).trim() })),
          }
        : null
      return atomic(() => {
        for (const { bo, extensionElements } of analysisUpdates(modeler.get('moddle'), definitions, getBusinessObject(root), data)) {
          modeling.updateModdleProperties(root, bo, { extensionElements })
        }
        return data ? { saved: true, points: data.points.length, author: data.author } : { removed: true }
      })
    },

    remove_elements({ ids }) {
      return atomic(() => {
        const elements = ids.map(getElement)
        modeling.removeElements(elements)
        return { removed: ids }
      })
    },
  }
}
