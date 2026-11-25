// Messages d'erreur, en anglais ou en français (lang), pour un fournisseur réglé
// dans la fenêtre Options. Les erreurs du SDK Anthropic, d'OpenAICompatClient et
// de listModels portent toutes un champ status : on s'y fie plutôt qu'à leur classe.
//
// ctx : { label, providerId, browser (appel direct depuis la page), origin, lang ('en' ou 'fr') }

const isConnectionError = (err) => err?.status === null || /ConnectionError|ConnectionTimeoutError/.test(err?.name || '')

export function describeProviderError(err, { label, providerId, browser = false, origin = '', lang = 'en' } = {}) {
  const fr = lang === 'fr'
  const T = (en, frText) => (fr ? frText : en)
  const detail = err?.message ? ` (${err.message})` : ''
  if (isConnectionError(err)) {
    if (!browser) {
      const docker = providerId === 'ollama'
        ? T(' If the server runs in docker, "localhost" means the container: try http://host.docker.internal:11434/v1.',
          ' Si le serveur tourne dans docker, « localhost » désigne le conteneur : essayez http://host.docker.internal:11434/v1.')
        : ''
      return T(`${label} cannot be reached from the server. Check the address in Options${detail}.${docker}`,
        `${label} est injoignable depuis le serveur. Vérifiez l'adresse dans Options${detail}.${docker}`)
    }
    if (providerId === 'ollama') {
      return T(`Ollama does not answer, or refuses calls from this page. Check that it is running, and start it with OLLAMA_ORIGINS=${origin || "this page's address"} to allow this page.`,
        `Ollama ne répond pas, ou refuse les appels de cette page. Vérifiez qu'il tourne, et lancez-le avec la variable OLLAMA_ORIGINS=${origin || "l'adresse de cette page"} pour autoriser cette page.`)
    }
    if (providerId === 'openai') {
      return T('The call to OpenAI did not go through. Check your connection. OpenAI does not always allow calls made straight from a web page: the docker version, which goes through your server, avoids this block.',
        "L'appel à OpenAI n'a pas abouti. Vérifiez votre connexion. OpenAI n'autorise pas toujours les appels faits directement depuis une page : la version docker, qui passe par votre serveur, évite ce blocage.")
    }
    if (providerId === 'mistral') {
      return T(`Mistral cannot be reached from this page. Check your connection and the address in Options${detail}.`,
        `Mistral est injoignable depuis cette page. Vérifiez votre connexion et l'adresse dans Options${detail}.`)
    }
    if (providerId === 'xai') {
      return T(`xAI cannot be reached from this page. Check your connection and the address in Options${detail}.`,
        `xAI est injoignable depuis cette page. Vérifiez votre connexion et l'adresse dans Options${detail}.`)
    }
    if (providerId === 'anthropic') {
      return T(`Anthropic cannot be reached from this page. Check your connection and the address in Options${detail}.`,
        `Anthropic est injoignable depuis cette page. Vérifiez votre connexion et l'adresse dans Options${detail}.`)
    }
    return T(`${label} does not answer, or refuses calls from this page. Check the address, and that this server allows the origin ${origin || 'of this page'} (CORS setting).`,
      `${label} ne répond pas, ou refuse les appels de cette page. Vérifiez l'adresse, et que ce serveur autorise l'origine ${origin || 'de cette page'} (réglage CORS).`)
  }
  // xAI répond 400, et non 401, à une clé API inconnue.
  if (err?.status === 400 && providerId === 'xai' && /api key/i.test(err?.message || '')) {
    return T(`API key rejected by ${label}. Check it in Options.`, `Clé API refusée par ${label}. Vérifiez-la dans Options.`)
  }
  switch (err?.status) {
    case 401:
      return T(`API key rejected by ${label}. Check it in Options.`, `Clé API refusée par ${label}. Vérifiez-la dans Options.`)
    case 403:
      return T(`${label} denies access: invalid API key, or no access to this model. Check it in Options.`,
        `${label} refuse l'accès : clé API invalide, ou sans accès à ce modèle. Vérifiez-la dans Options.`)
    case 404:
      return T(`Model or address not found at ${label}. Check the address and the models in Options${detail}.`,
        `Modèle ou adresse introuvable chez ${label}. Vérifiez l'adresse et les modèles dans Options${detail}.`)
    case 429:
      return T(`${label} usage limit reached, or credits used up. Try again later.`,
        `Limite d'utilisation de ${label} atteinte, ou crédits épuisés. Réessayez plus tard.`)
    case 400:
      return T(`Request rejected by ${label}${detail}.`, `Requête refusée par ${label}${detail}.`)
    case undefined:
      return err?.message || String(err)
    default:
      return T(`${label} error (${err.status})${detail}.`, `Erreur de ${label} (${err.status})${detail}.`)
  }
}
