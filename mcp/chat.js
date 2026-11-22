// Chat intégré à l'éditeur : boucle d'appels d'outils avec un LLM.
//
// L'éditeur envoie un message, le modèle choisi dans son menu et l'identifiant
// de son onglet. Le serveur garde la conversation en mémoire, appelle le modèle
// avec les mêmes outils que le serveur MCP, les exécute dans cet onglet par le
// pont WebSocket, et renvoie au fil de l'eau le texte et les outils appelés.
//
// Deux fournisseurs : Anthropic (API Claude) et toute API compatible OpenAI.
// Les clés restent ici, côté serveur (ANTHROPIC_API_KEY, OPENAI_API_KEY).

import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'node:crypto'
import * as z from 'zod/v4'

import { buildCatalog } from './models.js'
import { OpenAICompatClient } from './openai-compat.js'
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
const JSON_SCHEMAS = Object.fromEntries(
  TOOLS.map((t) => {
    const { $schema, ...schema } = z.toJSONSchema(VALIDATORS[t.name])
    return [t.name, schema]
  }),
)
// Les arguments arrivent au fil de l'eau : le panneau montre leur progression.
// Ils ne sont plus validés par l'API, d'où la validation zod avant exécution.
const API_TOOLS = TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: JSON_SCHEMAS[t.name],
  eager_input_streaming: true,
}))
// Même liste au format des API compatibles OpenAI.
const OPENAI_TOOLS = TOOLS.map((t) => ({
  type: 'function',
  function: { name: t.name, description: t.description, parameters: JSON_SCHEMAS[t.name] },
}))
const MAX_JSON_RETRIES = 2

export class ChatService {
  constructor({ bridge, log = console.error }) {
    this.bridge = bridge
    this.log = log
    this.conversations = new Map() // id -> { provider, messages, busy }
    // Lu ici et non à l'import : server.js charge mcp/.env avant de créer le service.
    const { models, defaultKey, warnings } = buildCatalog(process.env)
    this.models = models
    this.defaultKey = defaultKey
    this.warnings = warnings
    this.effort = process.env.CHAT_EFFORT || 'medium'
    this.anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null
    this.openai = process.env.OPENAI_MODELS
      ? new OpenAICompatClient({
          baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
          apiKey: process.env.OPENAI_API_KEY,
        })
      : null
    this.openaiEffort = process.env.OPENAI_REASONING_EFFORT || null
  }

  get enabled() {
    return this.models.length > 0
  }

  // Ce que voit le navigateur : la liste des modèles, sans clé ni adresse.
  status() {
    return {
      enabled: this.enabled,
      model: this.defaultKey,
      models: this.models.map(({ key, label, provider, providerLabel }) => ({ id: key, label, provider, providerLabel })),
    }
  }

  hasModel(key) {
    return this.models.some((m) => m.key === key)
  }

  #conversation(id, provider) {
    let conv = id && this.conversations.get(id)
    // Les historiques n'ont pas le même format d'un fournisseur à l'autre :
    // changer de fournisseur ouvre une nouvelle conversation.
    if (conv && conv.provider !== provider && !conv.busy) conv = null
    if (!conv) {
      id = randomUUID()
      conv = { provider, messages: [], busy: false }
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
  async send({ conversationId, tabId, model: modelKey, text, emit, signal }) {
    if (!this.enabled) throw new Error("Le chat n'est pas configuré : aucun fournisseur de modèle n'est défini sur le serveur.")
    const model = this.models.find((m) => m.key === (modelKey || this.defaultKey))
    if (!model) throw new Error(`Modèle inconnu : ${modelKey}`)
    if (!this.bridge.hasTab(tabId)) throw new Error("Cet onglet n'est pas relié au serveur. Rechargez la page.")

    const { id, conv } = this.#conversation(conversationId, model.provider)
    if (conv.busy) throw new Error('Une réponse est déjà en cours dans cette conversation.')
    conv.busy = true
    emit({ type: 'conversation', id })
    try {
      if (model.provider === 'openai') await this.#sendOpenAI({ conv, model, tabId, text, emit, signal })
      else await this.#sendAnthropic({ conv, model, tabId, text, emit, signal })
    } finally {
      conv.busy = false
    }
  }

  async #sendAnthropic({ conv, model, tabId, text, emit, signal }) {
    // On travaille sur une copie, et on n'enregistre que des étapes complètes :
    // une interruption ne laisse jamais un appel d'outil sans résultat.
    const before = conv.messages
    const messages = [...before, { role: 'user', content: text }]
    conv.messages = messages.slice()

    // Si le modèle décline une demande, l'API la rejoue sur un modèle de repli.
    // Haiku n'a pas de repli côté serveur : le paramètre est omis.
    const fallback = model.id.startsWith('claude-haiku') ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }
    let jsonRetries = 0
    for (let step = 0; step < MAX_STEPS; step++) {
      const stream = this.anthropic.beta.messages.stream(
        {
          model: model.id,
          max_tokens: 64000,
          output_config: { effort: this.effort },
          ...fallback,
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
        const { content, isError } = await this.#runTool(use.name, use.input, tabId, emit)
        results.push({ type: 'tool_result', tool_use_id: use.id, content, ...(isError ? { is_error: true } : {}) })
      }
      messages.push({ role: 'assistant', content: message.content }, { role: 'user', content: results })
      conv.messages = messages.slice()
    }
    throw new Error(`Arrêt après ${MAX_STEPS} étapes sans réponse finale.`)
  }

  // Même boucle pour une API compatible OpenAI (/chat/completions avec outils).
  async #sendOpenAI({ conv, model, tabId, text, emit, signal }) {
    const before = conv.messages
    const messages = [...before, { role: 'user', content: text }]
    conv.messages = messages.slice()

    for (let step = 0; step < MAX_STEPS; step++) {
      let toolName = null
      let lastStatus = 0
      const result = await this.openai.stream(
        {
          model: model.id,
          messages: [{ role: 'system', content: SYSTEM }, ...messages],
          tools: OPENAI_TOOLS,
          ...(this.openaiEffort ? { reasoning_effort: this.openaiEffort } : {}),
        },
        {
          signal,
          onText: (delta) => emit({ type: 'text', text: delta }),
          onReasoning: () => emit({ type: 'status', phase: 'thinking' }),
          onToolStart: (name) => {
            toolName = name
            emit({ type: 'status', phase: 'preparing', tool: name, size: 0 })
          },
          onToolArgs: (size) => {
            const now = Date.now()
            if (now - lastStatus < 300) return
            lastStatus = now
            emit({ type: 'status', phase: 'preparing', tool: toolName, size })
          },
        },
      )

      if (result.finishReason === 'content_filter') {
        conv.messages = before
        throw new Error('La demande a été refusée par le filtre du fournisseur.')
      }
      if (result.finishReason === 'length' && result.toolCalls.length) {
        throw new Error("Réponse interrompue : l'appel d'outil dépassait la longueur maximale. Demandez un schéma plus petit, en plusieurs fois.")
      }
      // Certains serveurs (Ollama notamment) terminent par « stop » même avec
      // des appels d'outils : on se fie à leur présence, pas à finish_reason.
      if (result.toolCalls.length === 0) {
        messages.push({ role: 'assistant', content: result.content })
        conv.messages = messages.slice()
        if (result.finishReason === 'length') throw new Error('Réponse interrompue : longueur maximale atteinte.')
        return
      }

      const assistant = {
        role: 'assistant',
        content: result.content || null,
        tool_calls: result.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments } })),
      }
      const results = []
      for (const call of result.toolCalls) {
        emit({ type: 'status', phase: 'running', tool: call.name })
        let input
        try {
          input = call.arguments.trim() ? JSON.parse(call.arguments) : {}
        } catch {
          input = undefined
        }
        const { content } =
          input === undefined
            ? this.#toolError(call.name, 'Arguments illisibles : JSON invalide. Renvoie un objet JSON complet.', emit)
            : await this.#runTool(call.name, input, tabId, emit)
        results.push({ role: 'tool', tool_call_id: call.id, content })
      }
      messages.push(assistant, ...results)
      conv.messages = messages.slice()
    }
    throw new Error(`Arrêt après ${MAX_STEPS} étapes sans réponse finale.`)
  }

  #toolError(name, content, emit) {
    this.log(`[chat] ${name} : ${content}`)
    emit({ type: 'tool', name, ok: false, error: content })
    return { content, isError: true }
  }

  // Valide les arguments puis exécute l'outil dans l'onglet. Renvoie { content, isError }.
  async #runTool(name, input, tabId, emit) {
    const validator = VALIDATORS[name]
    if (!validator) return this.#toolError(name, `Outil inconnu : ${name}`, emit)
    const parsed = validator.safeParse(input)
    if (!parsed.success) return this.#toolError(name, `Arguments invalides : ${z.prettifyError(parsed.error)}`, emit)
    try {
      const data = await this.bridge.call(name, parsed.data, { tabId })
      emit({ type: 'tool', name, ok: true })
      return { content: typeof data === 'string' ? data : JSON.stringify(data), isError: false }
    } catch (err) {
      return this.#toolError(name, `Erreur : ${err.message}`, emit)
    }
  }
}
