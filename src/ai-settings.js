// Réglages des fournisseurs saisis dans la fenêtre Options.
//
// Les adresses et les modèles sont gardés sur l'appareil (localStorage).
// Les clés sont gardées le temps de la session de l'onglet (sessionStorage),
// ou sur l'appareil si « Se souvenir sur cet appareil » est coché.
// Rien de tout cela ne part ailleurs que chez le fournisseur choisi
// (ou, en version docker, vers le serveur qui relaie l'appel).

import { PROVIDERS, providerBaseUrl } from './ai/providers.js'
import { T } from './i18n/lang.js'

const SETTINGS_KEY = 'bpmn-editor-ai-settings'
const KEYS_KEY = 'bpmn-editor-ai-keys'

function read(storage, key) {
  try {
    return JSON.parse(storage.getItem(key) || 'null')
  } catch {
    return null
  }
}
function write(storage, key, value) {
  try {
    if (value === null) storage.removeItem(key)
    else storage.setItem(key, JSON.stringify(value))
  } catch {}
}

// Fournisseur actif : un seul à la fois. « server » désigne les modèles réglés sur le
// serveur (version docker). null : rien de choisi pour l'instant.
const isProviderChoice = (id) => id === 'server' || PROVIDERS.some((p) => p.id === id)

// Réglages par défaut : aucun fournisseur choisi, Anthropic et Mistral préremplis.
export function defaultSettings() {
  return {
    remember: false,
    // Critique de la demande et autocorrection : des appels en plus au modèle, coupables dans Options.
    assist: true,
    active: null,
    defaultModel: null,
    providers: Object.fromEntries(
      PROVIDERS.map((p) => [
        p.id,
        { verified: false, baseUrl: p.baseUrl, label: p.customLabel ? '' : p.label, models: p.models.map((m) => ({ ...m, on: true })), apiKey: '' },
      ]),
    ),
  }
}

export function loadSettings() {
  const settings = defaultSettings()
  const saved = read(localStorage, SETTINGS_KEY)
  if (saved && typeof saved === 'object') {
    settings.remember = !!saved.remember
    settings.assist = saved.assist !== false
    settings.defaultModel = typeof saved.defaultModel === 'string' ? saved.defaultModel : null
    for (const p of PROVIDERS) {
      const s = saved.providers?.[p.id]
      if (!s) continue
      const target = settings.providers[p.id]
      target.verified = !!s.verified
      if (typeof s.baseUrl === 'string') target.baseUrl = s.baseUrl
      if (typeof s.label === 'string' && p.customLabel) target.label = s.label
      if (Array.isArray(s.models)) {
        target.models = s.models
          .filter((m) => m && typeof m.id === 'string' && m.id)
          .map((m) => ({ id: m.id, label: typeof m.label === 'string' && m.label ? m.label : m.id, on: !!m.on }))
      }
    }
    settings.active = isProviderChoice(saved.active) ? saved.active : formerActive(saved)
  }
  const keys = read(settings.remember ? localStorage : sessionStorage, KEYS_KEY) || {}
  for (const p of PROVIDERS) {
    if (typeof keys[p.id] === 'string') settings.providers[p.id].apiKey = keys[p.id]
  }
  return settings
}

// Réglages enregistrés avant le choix unique, où plusieurs fournisseurs pouvaient être
// cochés : le fournisseur actif devient celui du modèle choisi.
function formerActive(saved) {
  const model = typeof saved.defaultModel === 'string' ? saved.defaultModel : ''
  const fromModel = model.match(/^user:([^:]+):/)?.[1]
  if (fromModel && PROVIDERS.some((p) => p.id === fromModel)) return fromModel
  if (model) return 'server'
  return PROVIDERS.find((p) => saved.providers?.[p.id]?.enabled)?.id ?? null
}

export function saveSettings(settings) {
  const providers = {}
  const keys = {}
  for (const p of PROVIDERS) {
    const { apiKey, ...rest } = settings.providers[p.id]
    providers[p.id] = rest
    if (apiKey) keys[p.id] = apiKey
  }
  write(localStorage, SETTINGS_KEY, { remember: settings.remember, assist: settings.assist !== false, active: settings.active, defaultModel: settings.defaultModel, providers })
  // Les clés ne sont écrites qu'à un seul endroit : on efface l'autre.
  const hasKeys = Object.keys(keys).length > 0
  write(settings.remember ? localStorage : sessionStorage, KEYS_KEY, hasKeys ? keys : null)
  write(settings.remember ? sessionStorage : localStorage, KEYS_KEY, null)
}

// Efface toutes les clés, des deux emplacements.
export function forgetKeys(settings) {
  for (const p of PROVIDERS) settings.providers[p.id].apiKey = ''
  write(localStorage, KEYS_KEY, null)
  write(sessionStorage, KEYS_KEY, null)
}

// Un fournisseur est utilisable s'il est le fournisseur actif, a une adresse, une clé si
// besoin, et si sa connexion a été testée avec succès (Tester ou Lister les modèles).
export function isUsable(providerId, settings) {
  const def = PROVIDERS.find((p) => p.id === providerId)
  const s = settings.providers[providerId]
  return !!(settings.active === providerId && s.verified && s.baseUrl.trim() && (!def.needsKey || s.apiKey.trim()))
}

export const providerLabel = (providerId, settings) =>
  settings.providers[providerId]?.label?.trim() ||
  (providerId === 'compat' ? T('OpenAI-compatible', 'Compatible OpenAI') : PROVIDERS.find((p) => p.id === providerId)?.label) ||
  providerId

// Modèles cochés du fournisseur actif, s'il est utilisable.
export function userModels(settings) {
  const list = []
  for (const p of PROVIDERS) {
    if (!isUsable(p.id, settings)) continue
    const label = providerLabel(p.id, settings)
    for (const m of settings.providers[p.id].models) {
      if (!m.on) continue
      list.push({
        id: `user:${p.id}:${m.id}`,
        label: m.label,
        provider: `user:${p.id}`,
        providerLabel: label,
        source: 'user',
        providerId: p.id,
        format: p.format,
        modelId: m.id,
      })
    }
  }
  return list
}

// Ce qu'il faut pour appeler le fournisseur d'un modèle du menu.
export function connectionFor(model, settings) {
  const s = settings.providers[model.providerId]
  return {
    provider: model.providerId,
    label: providerLabel(model.providerId, settings),
    format: model.format,
    baseUrl: providerBaseUrl(model.providerId, s.baseUrl),
    apiKey: s.apiKey.trim() || null,
    model: model.modelId,
  }
}
