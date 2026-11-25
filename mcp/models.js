// Catalogue des modèles proposés dans le menu du chat intégré.
//
// Il est construit au démarrage à partir des variables d'environnement :
// un fournisseur n'apparaît que s'il est configuré. Le navigateur reçoit
// la liste (identifiants et libellés), jamais les clés ni les adresses.

const DEFAULT_ANTHROPIC_MODELS = 'claude-opus-5-5=Claude Opus 5.5,claude-sonnet-5-5=Claude Sonnet 5.5,claude-haiku-5-5=Claude Haiku 5.5'
const DEFAULT_MISTRAL_MODELS = 'mistral-large-latest=Mistral Large,mistral-small-latest=Mistral Small'

// « id=Libellé,id2,id3=Libellé 3 » -> [{ id, label }]. Le libellé est facultatif.
export function parseModelList(value) {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const cut = item.indexOf('=')
      const id = (cut === -1 ? item : item.slice(0, cut)).trim()
      const label = (cut === -1 ? '' : item.slice(cut + 1)).trim()
      return { id, label: label || id }
    })
    .filter((m) => m.id)
}

// Renvoie { models, defaultKey, warnings }. Chaque modèle a une clé unique
// « fournisseur:identifiant », celle qu'envoie le navigateur.
export function buildCatalog(env = process.env) {
  const models = []
  const warnings = []
  const add = (provider, providerLabel, list) => {
    for (const { id, label } of list) {
      const key = `${provider}:${id}`
      if (!models.some((m) => m.key === key)) models.push({ key, id, label, provider, providerLabel })
    }
  }

  // Ordre du menu : Anthropic, OpenAI, Mistral. Sans CHAT_MODEL, le premier
  // fournisseur configuré donne le modèle par défaut.
  if (env.ANTHROPIC_API_KEY) add('anthropic', 'Anthropic', parseModelList(env.ANTHROPIC_MODELS || DEFAULT_ANTHROPIC_MODELS))
  if (env.OPENAI_MODELS) add('openai', env.OPENAI_LABEL || 'OpenAI-compatible', parseModelList(env.OPENAI_MODELS))
  if (env.MISTRAL_API_KEY) add('mistral', 'Mistral', parseModelList(env.MISTRAL_MODELS || DEFAULT_MISTRAL_MODELS))

  // CHAT_MODEL choisit le modèle par défaut, par sa clé ou par son identifiant.
  let defaultKey = models[0]?.key ?? null
  const wanted = env.CHAT_MODEL?.trim()
  if (wanted && models.length) {
    const found = models.find((m) => m.key === wanted) || models.find((m) => m.id === wanted)
    if (found) defaultKey = found.key
    else if (env.ANTHROPIC_API_KEY && wanted.startsWith('claude-')) {
      // Un modèle Claude absent de la liste y est ajouté, pour rester compatible
      // avec les réglages qui ne donnaient que CHAT_MODEL.
      add('anthropic', 'Anthropic', [{ id: wanted, label: wanted }])
      defaultKey = `anthropic:${wanted}`
    } else {
      warnings.push(`CHAT_MODEL=${wanted} ne correspond à aucun modèle configuré : ${defaultKey} est utilisé par défaut`)
    }
  }
  return { models, defaultKey, warnings }
}
