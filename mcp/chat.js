// Chat intégré à l'éditeur : boucle d'appels d'outils avec un LLM.
//
// L'éditeur envoie un message, le modèle choisi dans son menu et l'identifiant
// de son onglet. Le serveur garde la conversation en mémoire, appelle le modèle
// avec les mêmes outils que le serveur MCP, les exécute dans cet onglet par le
// pont WebSocket, et renvoie au fil de l'eau le texte et les outils appelés.
//
// Fournisseurs : Mistral, Anthropic (API Claude) et toute API compatible OpenAI.
// Les clés restent ici, côté serveur (MISTRAL_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY).

import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'node:crypto'
import * as z from 'zod/v4'

import { createToolSet, runAnthropicTurn, runOpenAITurn } from '../src/ai/chat-loop.js'
import { OpenAICompatClient } from '../src/ai/openai-compat.js'
import { relayFetch } from './relay-guard.js'
import { buildCatalog } from './models.js'

const MAX_CONVERSATIONS = 20
const TOOL_SET = createToolSet(z)


// Le SDK 1.12 enverrait la clé dans « Authorization: Bearer », que l'API refuse
// dans certains cas (« x-api-key header is required ») : on la passe en x-api-key.
function anthropicClient({ apiKey, baseURL, fetch }) {
  return new Anthropic({ apiKey: null, authToken: null, ...(baseURL ? { baseURL } : {}), ...(fetch ? { fetch } : {}), ...(apiKey ? { defaultHeaders: { 'x-api-key': apiKey } } : {}) })
}

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
    this.anthropic = process.env.ANTHROPIC_API_KEY ? anthropicClient({ apiKey: process.env.ANTHROPIC_API_KEY }) : null
    this.openai = process.env.OPENAI_MODELS
      ? new OpenAICompatClient({
          baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
          apiKey: process.env.OPENAI_API_KEY,
        })
      : null
    this.openaiEffort = process.env.OPENAI_REASONING_EFFORT || null
    // Mistral passe par le même client : son API suit le format /chat/completions.
    this.mistral = process.env.MISTRAL_API_KEY
      ? new OpenAICompatClient({
          baseUrl: process.env.MISTRAL_BASE_URL || 'https://api.mistral.ai/v1',
          apiKey: process.env.MISTRAL_API_KEY,
        })
      : null
    this.mistralEffort = process.env.MISTRAL_REASONING_EFFORT || null
  }

  get enabled() {
    return this.models.length > 0
  }

  // Ce que voit le navigateur : la liste des modèles, sans clé ni adresse.
  status() {
    return {
      enabled: this.enabled,
      relay: true, // accepte aussi les fournisseurs réglés dans la fenêtre Options
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
  //
  // custom : fournisseur réglé dans la fenêtre Options de l'éditeur,
  // { format, baseUrl, apiKey, model }. La clé sert à cet appel puis est oubliée.
  async send({ conversationId, tabId, model: modelKey, custom, text, attachments = [], emit, signal, lang = 'en' }) {
    const T = (en, fr) => (lang === 'fr' ? fr : en)
    let target
    if (custom) {
      target = { format: custom.format, id: custom.model, client: this.#customClient(custom) }
    } else {
      if (!this.enabled) throw new Error(T('Chat is not set up: no model provider is defined on the server.', "Le chat n'est pas configuré : aucun fournisseur de modèle n'est défini sur le serveur."))
      const model = this.models.find((m) => m.key === (modelKey || this.defaultKey))
      if (!model) throw new Error(T(`Unknown model: ${modelKey}`, `Modèle inconnu : ${modelKey}`))
      target = {
        format: model.provider === 'anthropic' ? 'anthropic' : 'openai',
        provider: model.provider,
        id: model.id,
        client: { anthropic: this.anthropic, openai: this.openai, mistral: this.mistral }[model.provider],
      }
    }
    if (!this.bridge.hasTab(tabId)) throw new Error(T('This tab is not connected to the server. Reload the page.', "Cet onglet n'est pas relié au serveur. Rechargez la page."))

    const { id, conv } = this.#conversation(conversationId, target.provider || target.format)
    if (conv.busy) throw new Error(T('A reply is already in progress in this conversation.', 'Une réponse est déjà en cours dans cette conversation.'))
    conv.busy = true
    emit({ type: 'conversation', id })
    const common = {
      model: target.id,
      conv,
      text,
      attachments,
      toolSet: TOOL_SET,
      executeTool: (name, args) => this.bridge.call(name, args, { tabId }),
      emit,
      signal,
      log: this.log,
      lang,
    }
    try {
      if (target.format === 'openai') {
        const reasoningEffort = custom ? null : target.provider === 'mistral' ? this.mistralEffort : this.openaiEffort
        await runOpenAITurn({ ...common, client: target.client, providerId: custom ? custom.provider : target.provider, reasoningEffort })
      } else {
        await runAnthropicTurn({ ...common, client: target.client, APIError: Anthropic.APIError, effort: this.effort })
      }
    } catch (err) {
      // Pour le message d'erreur : quelles variables du serveur vérifier.
      if (!custom && err && typeof err === 'object') err.provider = target.provider
      throw err
    } finally {
      conv.busy = false
    }
  }

  // Client d'un appel, avec la clé reçue. Rien n'est gardé après la réponse.
  // Ses appels passent par relayFetch : l'adresse vient de la page.
  #customClient({ format, baseUrl, apiKey }) {
    if (format === 'anthropic') return anthropicClient({ apiKey, baseURL: baseUrl, fetch: relayFetch })
    return new OpenAICompatClient({ baseUrl, apiKey, fetch: relayFetch })
  }
}
