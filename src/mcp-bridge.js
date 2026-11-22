// Pont entre l'éditeur et le serveur MCP (dossier mcp/).
//
// L'onglet se connecte au serveur par WebSocket, reçoit les appels d'outils,
// les exécute sur le bpmn-js ouvert et renvoie le résultat. Les modifications
// passent par l'API de modélisation de bpmn-js : elles s'affichent en direct
// et s'annulent avec Ctrl+Z comme une retouche à la main.

import { getBusinessObject, is } from 'bpmn-js/lib/util/ModelUtil'

import { autoLayout } from './auto-layout.js'

const RETRY_MIN_MS = 1000
const RETRY_MAX_MS = 15000

// Renvoie l'état du pont : tabId est l'identifiant que le serveur a donné à
// cet onglet, null tant que le pont n'est pas relié.
export function connectMcpBridge(modeler, url) {
  const tools = createTools(modeler)
  const badge = createBadge()
  const state = { tabId: null }
  let retryDelay = RETRY_MIN_MS
  let ws = null

  function connect() {
    setBadge(badge, 'connecting')
    ws = new WebSocket(url)

    ws.addEventListener('open', () => {
      retryDelay = RETRY_MIN_MS
      setBadge(badge, 'connected')
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
      if (msg.type !== 'call') return
      const tool = tools[msg.tool]
      try {
        if (!tool) throw new Error(`Outil inconnu : ${msg.tool}`)
        const data = await tool(msg.args || {})
        send({ type: 'result', id: msg.id, ok: true, data })
      } catch (err) {
        console.warn(`[MCP] ${msg.tool} :`, err)
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
  const badge = document.createElement('span')
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

function setBadge(badge, state) {
  const states = {
    connecting: ['MCP : connexion…', '#888'],
    connected: ['MCP : connecté', '#4ade80'],
    disconnected: ['MCP : hors ligne', '#888'],
  }
  const [text, color] = states[state]
  badge.textContent = text
  badge.dataset.state = state
  badge.style.color = color
  badge.title =
    state === 'connected'
      ? 'Une IA peut lire et modifier ce diagramme par le serveur MCP'
      : 'Serveur MCP non joignable. Lancez-le avec : cd mcp && npm start'
}

// ── Outils ─────────────────────────────────────────────────────────────────

function createTools(modeler) {
  const canvas = modeler.get('canvas')
  const elementRegistry = modeler.get('elementRegistry')
  const elementFactory = modeler.get('elementFactory')
  const modeling = modeler.get('modeling')
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
      throw new Error(`Élément introuvable : ${id}`)
    }
    return element
  }

  function describe(element) {
    const bo = getBusinessObject(element)
    const out = { id: element.id, type: element.type }
    if (bo.name) out.name = bo.name
    const eventDef = bo.eventDefinitions?.[0]
    if (eventDef) out.eventDefinition = eventDef.$type
    if (element.waypoints) {
      out.source = element.source?.id
      out.target = element.target?.id
    } else {
      out.x = Math.round(element.x + element.width / 2)
      out.y = Math.round(element.y + element.height / 2)
      out.width = element.width
      out.height = element.height
      if (element.parent && element.parent !== canvas.getRootElement()) out.parent = element.parent.id
      const incoming = element.incoming.map((c) => c.id)
      const outgoing = element.outgoing.map((c) => c.id)
      if (incoming.length) out.incoming = incoming
      if (outgoing.length) out.outgoing = outgoing
    }
    return out
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

  function createShape(spec) {
    const attrs = { type: withPrefix(spec.type) }
    if (spec.eventDefinition) attrs.eventDefinitionType = withPrefix(spec.eventDefinition)
    try {
      return elementFactory.createShape(attrs)
    } catch (err) {
      throw new Error(`Type BPMN invalide « ${spec.type} » : ${err.message}`)
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

    async set_diagram_xml({ xml }) {
      // bpmn-js reste inutilisable après l'import d'un XML lisible mais sans
      // partie graphique : on vérifie donc le document avant de l'importer.
      let definitions
      try {
        ;({ rootElement: definitions } = await modeler.get('moddle').fromXML(xml, 'bpmn:Definitions'))
      } catch (err) {
        throw new Error(`XML BPMN illisible, diagramme inchangé : ${err.message}`)
      }
      if (!definitions.diagrams?.some((d) => d.plane?.bpmnElement)) {
        throw new Error('Le XML ne contient aucun diagramme dessiné (BPMNDiagram avec BPMNPlane), diagramme inchangé.')
      }
      const { warnings } = await modeler.importXML(xml)
      canvas.zoom('fit-viewport')
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
          const shape = createShape(spec)
          let element

          if (spec.after) {
            const source = byKey[spec.after] || getElement(spec.after)
            element = modeling.appendShape(source, shape, appendPosition(source, shape), source.parent)
          } else {
            const parent = spec.parent ? getElement(spec.parent) : defaultParent()
            const position =
              spec.x !== undefined && spec.y !== undefined ? { x: spec.x, y: spec.y } : nextFreePosition(parent, shape)
            if (!bpmnRules.canCreate(shape, parent, null, position)) {
              throw new Error(`Impossible de placer ${shape.type} dans ${parent.id}`)
            }
            element = modeling.createShape(shape, position, parent)
          }

          if (spec.name) modeling.updateLabel(element, spec.name)
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
            throw new Error(`Connexion interdite par les règles BPMN : ${spec.source} → ${spec.target}`)
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
            if (!replaced) throw new Error(`Remplacement impossible pour ${spec.id}`)
            element = replaced
          }
          if (spec.name !== undefined) modeling.updateLabel(element, spec.name)
          updated.push({ previousId: spec.id, ...describe(element) })
        }
        return { updated }
      })
    },

    async auto_layout() {
      try {
        await autoLayout(modeler)
      } catch (err) {
        throw new Error(`Mise en page impossible, diagramme inchangé : ${err.message}`)
      }
      const elements = elementRegistry.filter((e) => e.type !== 'label' && e !== canvas.getRootElement())
      return {
        laidOut: true,
        shapes: elements.filter((e) => !e.waypoints).length,
        connections: elements.filter((e) => e.waypoints).length,
      }
    },

    async validate_diagram() {
      const linting = modeler.get('linting', false)
      if (!linting) throw new Error("La validation (bpmnlint) n'est pas chargée dans cet éditeur.")
      const results = await linting.lint()
      const issues = []
      for (const [rule, reports] of Object.entries(results)) {
        for (const report of reports) {
          const element = elementRegistry.get(report.id)
          const name = element ? getBusinessObject(element).name : undefined
          issues.push({
            id: report.id,
            ...(name ? { name } : {}),
            category: report.category,
            rule,
            message: report.message,
          })
        }
      }
      const count = (category) => issues.filter((i) => i.category === category).length
      return { errors: count('error') + count('rule-error'), warnings: count('warn'), infos: count('info'), issues }
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
