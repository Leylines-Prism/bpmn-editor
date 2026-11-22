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
  { id: 'compat', label: 'Compatible OpenAI', format: 'openai', baseUrl: '', needsKey: false, models: [], customLabel: true },
]

export const providerById = (id) => PROVIDERS.find((p) => p.id === id)

export class ProviderError extends Error {
  constructor(status, message) {
    super(message)
    this.name = 'ProviderError'
    this.status = status // null si le serveur n'a pas répondu
  }
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
    const message = data?.error?.message || data?.message || (typeof data?.error === 'string' ? data.error : '') || text.slice(0, 300) || res.statusText
    throw new ProviderError(res.status, message)
  }
  const list = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : null
  if (!list) throw new ProviderError(res.status, "réponse inattendue : ce n'est pas une liste de modèles")
  return list
    .map((m) => ({ id: String(m.id ?? m.name ?? ''), label: String(m.display_name || m.id || m.name || '') }))
    .filter((m) => m.id)
    .sort((a, b) => a.label.localeCompare(b.label))
}
