// Chat intégré à l'éditeur : boucle d'appels d'outils avec l'API Claude.
//
// L'éditeur envoie un message et l'identifiant de son onglet. Le serveur
// garde la conversation en mémoire, appelle Claude avec les mêmes outils que
// le serveur MCP, les exécute dans cet onglet par le pont WebSocket, et
// renvoie au fil de l'eau le texte et les outils appelés.
//
// La clé d'API reste ici, côté serveur (ANTHROPIC_API_KEY).

import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'node:crypto'
import * as z from 'zod/v4'

import { INSTRUCTIONS, TOOLS } from './tools.js'

const MAX_STEPS = 30 // appels successifs au modèle pour un seul message
const MAX_CONVERSATIONS = 20

const SYSTEM = `${INSTRUCTIONS}

Tu es l'assistant intégré à cet éditeur BPMN. L'utilisateur voit le canevas à côté de la discussion :
chaque outil que tu appelles modifie son diagramme sous ses yeux.
- Réponds en français, brièvement. Ne recopie pas le XML ni la liste des formes dans ta réponse.
- Avant de modifier un diagramme existant, lis-le avec get_shapes.
- Quand tu as fini de dessiner, valide avec validate_diagram et corrige ce qui peut l'être.
- Pour une demande floue, dessine une première version raisonnable plutôt que de poser des questions.
- Pour un grand schéma, procède en plusieurs appels de 10 à 15 formes : l'utilisateur voit le dessin avancer.`

// Schémas zod pour valider les arguments, schémas JSON pour l'API.
const VALIDATORS = Object.fromEntries(TOOLS.map((t) => [t.name, z.object(t.inputSchema)]))
const API_TOOLS = TOOLS.map((t) => {
  const { $schema, ...input_schema } = z.toJSONSchema(VALIDATORS[t.name])
  // Les arguments arrivent au fil de l'eau : le panneau montre leur progression.
  // Ils ne sont plus validés par l'API, d'où la validation zod avant exécution.
  return { name: t.name, description: t.description, input_schema, eager_input_streaming: true }
})
const MAX_JSON_RETRIES = 2

export class ChatService {
  constructor({ bridge, log = console.error }) {
    this.bridge = bridge
    this.log = log
    this.conversations = new Map() // id -> { messages, busy }
    // Lu ici et non à l'import : server.js charge mcp/.env avant de créer le service.
    this.model = process.env.CHAT_MODEL || 'claude-opus-5-5'
    this.effort = process.env.CHAT_EFFORT || 'medium'
    this.client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null
  }

  get enabled() {
    return !!this.client
  }

  status() {
    return { enabled: this.enabled, model: this.enabled ? this.model : null }
  }

  #conversation(id) {
    let conv = id && this.conversations.get(id)
    if (!conv) {
      id = randomUUID()
      conv = { messages: [], busy: false }
      this.conversations.set(id, conv)
      // Les plus anciennes sont oubliées au-delà de MAX_CONVERSATIONS.
      while (this.conversations.size > MAX_CONVERSATIONS) {
        this.conversations.delete(this.conversations.keys().next().value)
      }
    }
    return { id, conv }
  }

  // Traite un message de l'utilisateur. emit(event) reçoit :
  //   { type: 'conversation', id }    identifiant à renvoyer au message suivant
  //   { type: 'text', text }          morceau de la réponse
  //   { type: 'tool', name, ok, error? }  outil exécuté dans l'éditeur
  // Lève une erreur en cas d'échec. signal permet d'interrompre.
  async send({ conversationId, tabId, text, emit, signal }) {
    if (!this.client) throw new Error("Le chat n'est pas configuré : ANTHROPIC_API_KEY n'est pas définie sur le serveur.")
    if (!this.bridge.hasTab(tabId)) throw new Error("Cet onglet n'est pas relié au serveur. Rechargez la page.")

    const { id, conv } = this.#conversation(conversationId)
    if (conv.busy) throw new Error('Une réponse est déjà en cours dans cette conversation.')
    conv.busy = true
    emit({ type: 'conversation', id })

    // On travaille sur une copie, et on n'enregistre que des étapes complètes :
    // une interruption ne laisse jamais un appel d'outil sans résultat.
    const before = conv.messages
    const messages = [...before, { role: 'user', content: text }]
    conv.messages = messages.slice()

    let jsonRetries = 0
    try {
      for (let step = 0; step < MAX_STEPS; step++) {
        const stream = this.client.beta.messages.stream(
          {
            model: this.model,
            max_tokens: 64000,
            output_config: { effort: this.effort },
            // Si le modèle décline une demande, l'API la rejoue sur un modèle de repli.
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            cache_control: { type: 'ephemeral' },
            system: SYSTEM,
            tools: API_TOOLS,
            messages,
          },
          { signal },
        )
        stream.on('text', (delta) => emit({ type: 'text', text: delta }))
        // État en direct pour le panneau : réflexion, puis outil en préparation
        // avec la taille de ses arguments (au plus une mise à jour par 300 ms).
        let toolName = null
        let inputSize = 0
        let lastStatus = 0
        stream.on('streamEvent', (event) => {
          if (event.type !== 'content_block_start') return
          const block = event.content_block
          if (block.type === 'thinking' || block.type === 'redacted_thinking') emit({ type: 'status', phase: 'thinking' })
          if (block.type === 'tool_use') {
            toolName = block.name
            inputSize = 0
            emit({ type: 'status', phase: 'preparing', tool: toolName, size: 0 })
          }
        })
        stream.on('inputJson', (partial) => {
          inputSize += partial.length
          const now = Date.now()
          if (now - lastStatus < 300) return
          lastStatus = now
          emit({ type: 'status', phase: 'preparing', tool: toolName, size: inputSize })
        })

        let message
        try {
          message = await stream.finalMessage()
          jsonRetries = 0
        } catch (err) {
          // Arguments d'outil illisibles : on relance l'étape. Les erreurs de l'API
          // et l'interruption par l'utilisateur remontent telles quelles.
          if (err instanceof Anthropic.APIError || signal?.aborted || jsonRetries++ >= MAX_JSON_RETRIES) throw err
          this.log(`[chat] étape relancée : ${err.message}`)
          step--
          continue
        }

        if (message.stop_reason === 'refusal') {
          // La demande est retirée de l'historique pour ne pas bloquer la suite.
          conv.messages = before
          throw new Error('La demande a été refusée par le modèle.')
        }

        const toolUses = message.content.filter((b) => b.type === 'tool_use')
        if (message.stop_reason === 'max_tokens' && toolUses.length) {
          // Arguments tronqués : on n'exécute rien et on n'enregistre pas cette étape.
          throw new Error("Réponse interrompue : l'appel d'outil dépassait la longueur maximale. Demandez un schéma plus petit, en plusieurs fois.")
        }
        if (toolUses.length === 0 || message.stop_reason !== 'tool_use') {
          messages.push({ role: 'assistant', content: message.content })
          conv.messages = messages.slice()
          if (message.stop_reason === 'max_tokens') throw new Error('Réponse interrompue : longueur maximale atteinte.')
          return
        }

        const results = []
        for (const use of toolUses) {
          emit({ type: 'status', phase: 'running', tool: use.name })
          results.push(await this.#runTool(use, tabId, emit))
        }
        messages.push({ role: 'assistant', content: message.content }, { role: 'user', content: results })
        conv.messages = messages.slice()
      }
      throw new Error(`Arrêt après ${MAX_STEPS} étapes sans réponse finale.`)
    } finally {
      conv.busy = false
    }
  }

  async #runTool(use, tabId, emit) {
    const validator = VALIDATORS[use.name]
    const parsed = validator?.safeParse(use.input)
    let content
    let isError = false
    if (!validator) {
      content = `Outil inconnu : ${use.name}`
      isError = true
    } else if (!parsed.success) {
      content = `Arguments invalides : ${z.prettifyError(parsed.error)}`
      isError = true
    } else {
      try {
        const data = await this.bridge.call(use.name, parsed.data, { tabId })
        content = typeof data === 'string' ? data : JSON.stringify(data)
      } catch (err) {
        content = `Erreur : ${err.message}`
        isError = true
      }
    }
    if (isError) this.log(`[chat] ${use.name} : ${content}`)
    emit({ type: 'tool', name: use.name, ok: !isError, ...(isError ? { error: content } : {}) })
    return { type: 'tool_result', tool_use_id: use.id, content, ...(isError ? { is_error: true } : {}) }
  }
}
