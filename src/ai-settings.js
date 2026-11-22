// Réglages des fournisseurs saisis dans la fenêtre Options.
//
// Les adresses et les modèles sont gardés sur l'appareil (localStorage).
// Les clés sont gardées le temps de la session de l'onglet (sessionStorage),
// ou sur l'appareil si « Se souvenir sur cet appareil » est coché.
// Rien de tout cela ne part ailleurs que chez le fournisseur choisi
// (ou, en version docker, vers le serveur qui relaie l'appel).

import { PROVIDERS } from './ai/providers.js'

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

// Réglages par défaut : rien d'activé, Anthropic et OpenAI préremplis.
export function defaultSettings() {
  return {
    remember: false,
    defaultModel: null,
    providers: Object.fromEntries(
      PROVIDERS.map((p) => [
        p.id,
        { enabled: false, baseUrl: p.baseUrl, label: p.customLabel ? '' : p.label, models: p.models.map((m) => ({ ...m, on: true })), apiKey: '' },
      ]),
    ),
  }
}

export function loadSettings() {
  const settings = defaultSettings()
  const saved = read(localStorage, SETTINGS_KEY)
  if (saved && typeof saved === 'object') {
    settings.remember = !!saved.remember
    settings.defaultModel = typeof saved.defaultModel === 'string' ? saved.defaultModel : null
    for (const p of PROVIDERS) {
      const s = saved.providers?.[p.id]
      if (!s) continue
      const target = settings.providers[p.id]
      target.enabled = !!s.enabled
      if (typeof s.baseUrl === 'string') target.baseUrl = s.baseUrl
      if (typeof s.label === 'string' && p.customLabel) target.label = s.label
      if (Array.isArray(s.models)) {
        target.models = s.models
          .filter((m) => m && typeof m.id === 'string' && m.id)
          .map((m) => ({ id: m.id, label: typeof m.label === 'string' && m.label ? m.label : m.id, on: !!m.on }))
      }
    }
  }
  const keys = read(settings.remember ? localStorage : sessionStorage, KEYS_KEY) || {}
  for (const p of PROVIDERS) {
    if (typeof keys[p.id] === 'string') settings.providers[p.id].apiKey = keys[p.id]
  }
  return settings
}

export function saveSettings(settings) {
  const providers = {}
  const keys = {}
  for (const p of PROVIDERS) {
    const { apiKey, ...rest } = settings.providers[p.id]
    providers[p.id] = rest
    if (apiKey) keys[p.id] = apiKey
  }
  write(localStorage, SETTINGS_KEY, { remember: settings.remember, defaultModel: settings.defaultModel, providers })
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

// Un bloc est utilisable s'il est activé, a une adresse et, si besoin, une clé.
export function isUsable(providerId, settings) {
  const def = PROVIDERS.find((p) => p.id === providerId)
  const s = settings.providers[providerId]
  return !!(s.enabled && s.baseUrl.trim() && (!def.needsKey || s.apiKey.trim()))
}

export const providerLabel = (providerId, settings) =>
  settings.providers[providerId]?.label?.trim() || PROVIDERS.find((p) => p.id === providerId)?.label || providerId

// Modèles cochés des blocs utilisables, pour le menu du panneau.
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
    baseUrl: s.baseUrl.trim(),
    apiKey: s.apiKey.trim() || null,
    model: model.modelId,
  }
}
