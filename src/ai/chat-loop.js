// Boucle du chat intégré : le modèle appelle les outils de dessin jusqu'à sa
// réponse finale. Commune au serveur (mcp/chat.js) et, plus tard, à la page.
//
// Ce module n'importe rien. L'appelant fournit :
//   - z : sa copie de zod (v4), pour valider les arguments ;
//   - le client du fournisseur (SDK Anthropic ou OpenAICompatClient) ;
//   - executeTool(name, args) : exécute l'outil dans l'éditeur et renvoie le résultat ;
//   - emit(event) : reçoit le texte et l'état en direct, pour le panneau.
// Une conversation est un objet { messages } que la boucle met à jour.

import { INSTRUCTIONS, buildTools } from './tools.js'

export const MAX_STEPS = 30 // appels successifs au modèle pour un seul message
const MAX_JSON_RETRIES = 2

export const CHAT_SYSTEM = `${INSTRUCTIONS}

Tu es l'assistant intégré à cet éditeur BPMN. L'utilisateur voit le canevas à côté de la discussion :
chaque outil que tu appelles modifie son diagramme sous ses yeux.
- Réponds en français, brièvement. Ne recopie pas le XML ni la liste des formes dans ta réponse.
- Avant de modifier un diagramme existant, lis-le avec get_shapes.
- Quand tu as fini de dessiner, valide avec validate_diagram et corrige ce qui peut l'être.
- Pour une demande floue, dessine une première version raisonnable plutôt que de poser des questions.
- Pour un grand schéma, procède en plusieurs appels de 10 à 15 formes : l'utilisateur voit le dessin avancer.`

// Prépare les outils pour les deux formats d'API, avec le zod fourni.
export function createToolSet(z) {
  const tools = buildTools(z)
  // Schémas zod pour valider les arguments, schémas JSON pour l'API.
  const validators = Object.fromEntries(tools.map((t) => [t.name, z.object(t.inputSchema)]))
  const jsonSchemas = Object.fromEntries(
    tools.map((t) => {
      const { $schema, ...schema } = z.toJSONSchema(validators[t.name])
      return [t.name, schema]
    }),
  )
  return {
    z,
    tools,
    validators,
    // Les arguments arrivent au fil de l'eau : le panneau montre leur progression.
    // Ils ne sont plus validés par l'API, d'où la validation zod avant exécution.
    anthropic: tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: jsonSchemas[t.name],
      eager_input_streaming: true,
    })),
    // Même liste au format des API compatibles OpenAI.
    openai: tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: jsonSchemas[t.name] },
    })),
  }
}

function toolError(name, content, emit, log) {
  log(`[chat] ${name} : ${content}`)
  emit({ type: 'tool', name, ok: false, error: content })
  return { content, isError: true }
}

// Valide les arguments puis exécute l'outil. Renvoie { content, isError }.
export async function runTool({ toolSet, name, input, executeTool, emit, log = console.error }) {
  const validator = toolSet.validators[name]
  if (!validator) return toolError(name, `Outil inconnu : ${name}`, emit, log)
  const parsed = validator.safeParse(input)
  if (!parsed.success) return toolError(name, `Arguments invalides : ${toolSet.z.prettifyError(parsed.error)}`, emit, log)
  try {
    const data = await executeTool(name, parsed.data)
    emit({ type: 'tool', name, ok: true })
    return { content: typeof data === 'string' ? data : JSON.stringify(data), isError: false }
  } catch (err) {
    return toolError(name, `Erreur : ${err.message}`, emit, log)
  }
}

// Un tour avec l'API Claude. client : instance du SDK Anthropic ;
// APIError : sa classe d'erreur (Anthropic.APIError), pour reconnaître les erreurs de l'API.
export async function runAnthropicTurn({ client, APIError, model, effort = 'medium', conv, text, toolSet, executeTool, emit, signal, log = console.error }) {
  // On travaille sur une copie, et on n'enregistre que des étapes complètes :
  // une interruption ne laisse jamais un appel d'outil sans résultat.
  const before = conv.messages
  const messages = [...before, { role: 'user', content: text }]
  conv.messages = messages.slice()

  // Si le modèle décline une demande, l'API la rejoue sur un modèle de repli.
  // Haiku n'a pas de repli côté serveur : le paramètre est omis.
  const fallback = model.startsWith('claude-haiku') ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }
  let jsonRetries = 0
  for (let step = 0; step < MAX_STEPS; step++) {
    const stream = client.beta.messages.stream(
      {
        model,
        max_tokens: 64000,
        output_config: { effort },
        ...fallback,
        cache_control: { type: 'ephemeral' },
        system: CHAT_SYSTEM,
        tools: toolSet.anthropic,
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
      if ((APIError && err instanceof APIError) || signal?.aborted || jsonRetries++ >= MAX_JSON_RETRIES) throw err
      log(`[chat] étape relancée : ${err.message}`)
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
      const { content, isError } = await runTool({ toolSet, name: use.name, input: use.input, executeTool, emit, log })
      results.push({ type: 'tool_result', tool_use_id: use.id, content, ...(isError ? { is_error: true } : {}) })
    }
    messages.push({ role: 'assistant', content: message.content }, { role: 'user', content: results })
    conv.messages = messages.slice()
  }
  throw new Error(`Arrêt après ${MAX_STEPS} étapes sans réponse finale.`)
}

// Même boucle pour une API compatible OpenAI (/chat/completions avec outils).
// client : OpenAICompatClient.
export async function runOpenAITurn({ client, model, reasoningEffort = null, conv, text, toolSet, executeTool, emit, signal, log = console.error }) {
  const before = conv.messages
  const messages = [...before, { role: 'user', content: text }]
  conv.messages = messages.slice()

  for (let step = 0; step < MAX_STEPS; step++) {
    let toolName = null
    let lastStatus = 0
    const result = await client.stream(
      {
        model,
        messages: [{ role: 'system', content: CHAT_SYSTEM }, ...messages],
        tools: toolSet.openai,
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
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
          ? toolError(call.name, 'Arguments illisibles : JSON invalide. Renvoie un objet JSON complet.', emit, log)
          : await runTool({ toolSet, name: call.name, input, executeTool, emit, log })
      results.push({ role: 'tool', tool_call_id: call.id, content })
    }
    messages.push(assistant, ...results)
    conv.messages = messages.slice()
  }
  throw new Error(`Arrêt après ${MAX_STEPS} étapes sans réponse finale.`)
}
