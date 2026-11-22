// Messages d'erreur en français pour un fournisseur réglé dans la fenêtre Options.
// Les erreurs du SDK Anthropic, d'OpenAICompatClient et de listModels portent
// toutes un champ status : on s'y fie plutôt qu'à leur classe.
//
// ctx : { label, providerId, browser (appel direct depuis la page), origin }

const isConnectionError = (err) => err?.status === null || /ConnectionError|ConnectionTimeoutError/.test(err?.name || '')

export function describeProviderError(err, { label, providerId, browser = false, origin = '' } = {}) {
  const detail = err?.message ? ` (${err.message})` : ''
  if (isConnectionError(err)) {
    if (!browser) {
      const docker = providerId === 'ollama' ? ' Si le serveur tourne dans docker, « localhost » désigne le conteneur : essayez http://host.docker.internal:11434/v1.' : ''
      return `${label} est injoignable depuis le serveur. Vérifiez l'adresse dans Options${detail}.${docker}`
    }
    if (providerId === 'ollama') {
      return `Ollama ne répond pas, ou refuse les appels de cette page. Vérifiez qu'il tourne, et lancez-le avec la variable OLLAMA_ORIGINS=${origin || "l'adresse de cette page"} pour autoriser cette page.`
    }
    if (providerId === 'openai') {
      return "L'appel à OpenAI n'a pas abouti. Vérifiez votre connexion. OpenAI n'autorise pas toujours les appels faits directement depuis une page : la version docker, qui passe par votre serveur, évite ce blocage."
    }
    if (providerId === 'anthropic') return `Anthropic est injoignable depuis cette page. Vérifiez votre connexion et l'adresse dans Options${detail}.`
    return `${label} ne répond pas, ou refuse les appels de cette page. Vérifiez l'adresse, et que ce serveur autorise l'origine ${origin || 'de cette page'} (réglage CORS).`
  }
  switch (err?.status) {
    case 401:
      return `Clé refusée par ${label}. Vérifiez-la dans Options.`
    case 403:
      return `${label} refuse l'accès : clé invalide, ou sans accès à ce modèle. Vérifiez-la dans Options.`
    case 404:
      return `Modèle ou adresse introuvable chez ${label}. Vérifiez l'adresse et les modèles dans Options${detail}.`
    case 429:
      return `Limite d'utilisation de ${label} atteinte, ou crédits épuisés. Réessayez plus tard.`
    case 400:
      return `Requête refusée par ${label}${detail}.`
    case undefined:
      return err?.message || String(err)
    default:
      return `Erreur de ${label} (${err.status})${detail}.`
  }
}
