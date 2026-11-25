// Client minimal pour les API compatibles OpenAI (route /chat/completions) :
// OpenAI, OpenRouter, Ollama, LM Studio, vLLM, Mistral…
//
// Requête en flux (SSE). Le texte et les appels d'outils arrivent par morceaux :
// on les assemble ici, et on signale au fil de l'eau ce qui se passe.

import { apiErrorMessage } from './providers.js'

export class OpenAICompatError extends Error {
  // providerJson : le message vient d'une erreur d'API en JSON. Sinon (page HTML, texte
  // brut), le relais du serveur ne le renvoie pas au navigateur.
  constructor(status, message, { providerJson = true } = {}) {
    super(message)
    this.name = 'OpenAICompatError'
    this.status = status // null si le serveur n'a pas répondu
    this.providerJson = providerJson
  }
}

export class OpenAICompatClient {
  // fetch : fonction d'appel, celle du navigateur ou de Node par défaut.
  constructor({ baseUrl, apiKey, fetch: doFetch }) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.apiKey = apiKey || null
    this.fetch = doFetch || ((...args) => globalThis.fetch(...args))
  }

  // Envoie une requête en flux. Rappels facultatifs :
  //   onText(delta)                texte de la réponse
  //   onReasoning()                le modèle réfléchit (reasoning, reasoning_content ou morceau thinking)
  //   onToolStart(name)            un appel d'outil commence
  //   onToolArgs(totalLength)      taille cumulée des arguments
  // Renvoie { content, toolCalls: [{ id, name, arguments }], finishReason }.
  async stream(body, { signal, onText, onReasoning, onToolStart, onToolArgs } = {}) {
    let res
    try {
      res = await this.fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({ ...body, stream: true }),
        signal,
      })
    } catch (err) {
      if (signal?.aborted) throw err
      throw new OpenAICompatError(null, err.cause?.code || err.message)
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      let message = text.slice(0, 500) || res.statusText
      let providerJson = false
      try {
        const data = JSON.parse(text)
        message = apiErrorMessage(data) || message
        providerJson = true
      } catch {}
      throw new OpenAICompatError(res.status, message, { providerJson })
    }

    let content = ''
    let finishReason = null
    let reasoning = false
    const calls = [] // par index : { id, name, arguments }
    let argsLength = 0

    const handle = (chunk) => {
      if (chunk.error) throw new OpenAICompatError(res.status, chunk.error.message || JSON.stringify(chunk.error))
      const choice = chunk.choices?.[0]
      if (!choice) return
      const delta = choice.delta ?? {}
      const addText = (text) => {
        if (typeof text !== 'string' || !text) return
        content += text
        onText?.(text)
      }
      const signalReasoning = () => {
        if (reasoning) return
        reasoning = true
        onReasoning?.()
      }
      if (delta.reasoning || delta.reasoning_content) signalReasoning()
      if (Array.isArray(delta.content)) {
        // Mistral, quand le modèle réfléchit : une liste de morceaux « thinking »
        // (non affichés) puis « text ».
        for (const part of delta.content) {
          if (part?.type === 'thinking') signalReasoning()
          else if (part?.type === 'text') addText(part.text)
        }
      } else {
        addText(delta.content)
      }
      for (const part of delta.tool_calls ?? []) {
        const index = part.index ?? calls.length
        let call = calls[index]
        if (!call) {
          call = calls[index] = { id: part.id || null, name: '', arguments: '' }
        }
        if (part.id) call.id = part.id
        if (part.function?.name) {
          const starting = !call.name
          call.name += part.function.name
          if (starting) onToolStart?.(call.name)
        }
        if (part.function?.arguments) {
          call.arguments += part.function.arguments
          argsLength += part.function.arguments.length
          onToolArgs?.(argsLength)
        }
      }
      if (choice.finish_reason) finishReason = choice.finish_reason
    }

    // Flux SSE : des lignes « data: {json} », terminé par « data: [DONE] ».
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
    let buffer = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += value
      let cut
      while ((cut = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, cut).trim()
        buffer = buffer.slice(cut + 1)
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (data === '[DONE]') continue
        let chunk
        try {
          chunk = JSON.parse(data)
        } catch {
          continue // ligne incomplète ou commentaire : ignorée
        }
        handle(chunk)
      }
    }

    const toolCalls = calls
      .filter(Boolean)
      .map((c, i) => ({ id: c.id || `call_${Date.now().toString(36)}_${i}`, name: c.name, arguments: c.arguments }))
    return { content, toolCalls, finishReason }
  }
}
