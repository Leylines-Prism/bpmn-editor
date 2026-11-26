// Messages d'erreur, en anglais ou en français (lang), pour un fournisseur réglé
// dans la fenêtre Options. Les erreurs du SDK Anthropic, d'OpenAICompatClient et
// de listModels portent toutes un champ status : on s'y fie plutôt qu'à leur classe.
//
// ctx : { label, providerId, baseUrl, browser (appel direct depuis la page), origin, lang ('en' ou 'fr') }

const isConnectionError = (err) => err?.status === null || /ConnectionError|ConnectionTimeoutError/.test(err?.name || '')

// Adresse en localhost : vue depuis un conteneur, elle désigne le conteneur lui-même.
const isLocalhost = (url) => {
  try {
    return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)
  } catch {
    return false
  }
}

// Pièce jointe refusée (400) : renvoie un message clair, ou null. Trois cas, dans cet ordre :
// une limite (taille, pages, dimensions), un format refusé, puis un modèle qui ne lit pas ce
// type de contenu. Ce sont des limites du fournisseur ou du modèle, pas des réglages.
const ATTACHMENT_WORDS = /image|vision|multimodal|multi-modal|\bpdf\b|document|file_data|document_url|image_url/i
const LIMIT_WORDS = /too large|too big|too long|exceed|maximum|\bmax\b|limit|pages?\b|dimension|pixels?|bytes|\bmb\b/i
const FORMAT_WORDS = /format|media.?type|mime|content.?type|extension|webp|gif/i
const UNSUPPORTED = /not supported|unsupported|does not support|doesn't support|do not support|not enabled|not available|no vision|text[- ]only|only supports? text|cannot (read|process|accept)|not (a )?multimodal/i

export function attachmentRefused(err, lang = 'en') {
  if (err?.status !== 400) return null
  const text = err?.message || ''
  if (!ATTACHMENT_WORDS.test(text)) return null
  const T = (en, fr) => (lang === 'fr' ? fr : en)
  const pdf = /\bpdf\b|document|file_data/i.test(text)
  if (LIMIT_WORDS.test(text)) {
    return T(`An attached file goes beyond the provider's limits (size, number of pages or dimensions). Send a smaller file, or only the useful pages (${text}).`,
      `Un fichier joint dépasse les limites du fournisseur (taille, nombre de pages ou dimensions). Envoyez un fichier plus petit, ou seulement les pages utiles (${text}).`)
  }
  if (!pdf && FORMAT_WORDS.test(text)) {
    return T(`The provider does not accept this file format. Convert the image to PNG or JPEG (${text}).`,
      `Le fournisseur n'accepte pas ce format de fichier. Convertissez l'image en PNG ou JPEG (${text}).`)
  }
  if (!UNSUPPORTED.test(text)) return null
  return pdf
    ? T(`This model cannot read PDF files. Choose a model that reads them, or paste the text of the document (${text}).`,
        `Ce modèle ne sait pas lire les PDF. Choisissez un modèle qui les lit, ou collez le texte du document (${text}).`)
    : T(`This model cannot read images. Choose a model with vision, or describe the image in text (${text}).`,
        `Ce modèle ne sait pas lire les images. Choisissez un modèle avec vision, ou décrivez l'image en texte (${text}).`)
}

export function describeProviderError(err, { label, providerId, baseUrl = '', browser = false, origin = '', lang = 'en' } = {}) {
  const fr = lang === 'fr'
  const T = (en, frText) => (fr ? frText : en)
  const detail = err?.message ? ` (${err.message})` : ''
  if (isConnectionError(err)) {
    if (!browser) {
      const docker = providerId === 'ollama' && isLocalhost(baseUrl)
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
      if (providerId === 'ollama') {
        return T(`Model or address not found at Ollama. The address ends with /v1, for example http://localhost:11434/v1, and the model must be pulled (ollama pull)${detail}.`,
          `Modèle ou adresse introuvable chez Ollama. L'adresse se termine par /v1, par exemple http://localhost:11434/v1, et le modèle doit être téléchargé (ollama pull)${detail}.`)
      }
      return T(`Model or address not found at ${label}. Check the address and the models in Options${detail}.`,
        `Modèle ou adresse introuvable chez ${label}. Vérifiez l'adresse et les modèles dans Options${detail}.`)
    case 429:
      return T(`${label} usage limit reached, or credits used up. Try again later.`,
        `Limite d'utilisation de ${label} atteinte, ou crédits épuisés. Réessayez plus tard.`)
    case 400:
      return attachmentRefused(err, lang) || T(`Request rejected by ${label}${detail}.`, `Requête refusée par ${label}${detail}.`)
    case undefined:
      return err?.message || String(err)
    default:
      return T(`${label} error (${err.status})${detail}.`, `Erreur de ${label} (${err.status})${detail}.`)
  }
}
