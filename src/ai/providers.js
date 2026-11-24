// Fournisseurs proposés dans la fenêtre Options, et appels qui ne coûtent rien :
// tester une connexion et lister les modèles. Commun à la page et au serveur.
//
// Ce module n'importe rien : il utilise le fetch de l'environnement.

// format : « anthropic » (API Claude) ou « openai » (route /chat/completions).
export const PROVIDERS = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    format: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    needsKey: true,
    keyHint: 'sk-ant-…',
    models: [
      { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
      { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
      { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
    ],
  },
  { id: 'openai', label: 'OpenAI', format: 'openai', baseUrl: 'https://api.openai.com/v1', needsKey: true, keyHint: 'sk-…', models: [] },
  { id: 'ollama', label: 'Ollama', format: 'openai', baseUrl: 'http://localhost:11434/v1', needsKey: false, models: [] },
  { id: 'compat', label: 'OpenAI-compatible', format: 'openai', baseUrl: '', needsKey: false, models: [], customLabel: true },
]

export const providerById = (id) => PROVIDERS.find((p) => p.id === id)

export class ProviderError extends Error {
  // providerJson : le message vient d'une erreur d'API en JSON, ou de ce module. Sinon
  // (page HTML, texte brut), le relais du serveur ne le renvoie pas au navigateur.
  constructor(status, message, { providerJson = true } = {}) {
    super(message)
    this.name = 'ProviderError'
    this.status = status // null si le serveur n'a pas répondu
    this.providerJson = providerJson
  }
}

// Message d'une erreur d'API en JSON, quel que soit son format : OpenAI et Anthropic
// ({ error: { message } }), Ollama ({ error: "..." }), Mistral et les serveurs FastAPI
// ({ detail: "..." } ou, pour une requête invalide, { detail: [{ msg, loc }] }).
export function apiErrorMessage(data) {
  if (!data || typeof data !== 'object') return ''
  if (typeof data.error?.message === 'string' && data.error.message) return data.error.message
  if (typeof data.message === 'string' && data.message) return data.message
  if (typeof data.error === 'string' && data.error) return data.error
  const { detail } = data
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((d) => (typeof d === 'string' ? d : [Array.isArray(d?.loc) ? d.loc.join('.') : '', d?.msg || ''].filter(Boolean).join(': ')))
      .filter(Boolean)
      .join(', ')
  }
  if (typeof detail?.message === 'string') return detail.message
  return ''
}

export const trimUrl = (url) => String(url ?? '').trim().replace(/\/+$/, '')

// Adresse http(s) valide, sans identifiants. Renvoie l'adresse nettoyée ou null.
export function checkBaseUrl(url) {
  const value = trimUrl(url)
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
    if (parsed.username || parsed.password) return null
    return value
  } catch {
    return null
  }
}

// En-têtes d'authentification. browser : appel direct depuis une page.
export function authHeaders({ format, apiKey, browser = false }) {
  if (format === 'anthropic') {
    return {
      'anthropic-version': '2023-06-01',
      ...(apiKey ? { 'x-api-key': apiKey } : {}),
      ...(browser ? { 'anthropic-dangerous-direct-browser-access': 'true' } : {}),
    }
  }
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
}

// Demande la liste des modèles au fournisseur. Renvoie [{ id, label }], triée.
// Sert aussi de test de connexion : la requête ne consomme aucun crédit.
export async function listModels({ format, baseUrl, apiKey, browser = false, signal, fetch: doFetch = fetch }) {
  const base = trimUrl(baseUrl)
  const url = format === 'anthropic' ? `${base}/v1/models?limit=1000` : `${base}/models`
  let res
  try {
    res = await doFetch(url, { headers: { Accept: 'application/json', ...authHeaders({ format, apiKey, browser }) }, signal })
  } catch (err) {
    if (signal?.aborted) throw err
    throw new ProviderError(null, err.cause?.code || err.message)
  }
  const text = await res.text().catch(() => '')
  let data = null
  try {
    data = JSON.parse(text)
  } catch {}
  if (!res.ok) {
    const message = apiErrorMessage(data) || text.slice(0, 300) || res.statusText
    throw new ProviderError(res.status, message, { providerJson: !!data })
  }
  const list = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : null
  if (!list) throw new ProviderError(res.status, 'unexpected response: not a list of models')
  return list
    .map((m) => ({ id: String(m.id ?? m.name ?? ''), label: String(m.display_name || m.id || m.name || '') }))
    .filter((m) => m.id)
    .sort((a, b) => a.label.localeCompare(b.label))
}
