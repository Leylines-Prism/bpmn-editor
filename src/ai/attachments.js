// Pièces jointes du chat : images et PDF, envoyés au modèle avec le message.
// Partagé par la page (version en ligne) et le serveur (version docker).
//
// Une pièce jointe : { kind: 'image' | 'pdf', mediaType, name, data } où data est
// le contenu en base64.

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
export const PDF_TYPE = 'application/pdf'
export const MAX_ATTACHMENTS = 5
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // limite de l'API Claude par image
export const MAX_PDF_BYTES = 20 * 1024 * 1024
export const MAX_TOTAL_BYTES = 24 * 1024 * 1024

// Taille réelle d'un contenu en base64.
export const base64Bytes = (data) => Math.floor((data.length * 3) / 4) - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0)

// Vérifie une liste reçue (serveur) : renvoie la liste nettoyée, ou null si elle est invalide.
export function checkAttachments(list) {
  if (list === undefined || list === null) return []
  if (!Array.isArray(list) || list.length > MAX_ATTACHMENTS) return null
  let total = 0
  const clean = []
  for (const a of list) {
    if (!a || typeof a !== 'object' || typeof a.data !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(a.data)) return null
    const kind = a.kind === 'pdf' ? 'pdf' : a.kind === 'image' ? 'image' : null
    if (!kind) return null
    if (kind === 'image' && !IMAGE_TYPES.includes(a.mediaType)) return null
    if (kind === 'pdf' && a.mediaType !== PDF_TYPE) return null
    const bytes = base64Bytes(a.data)
    if (bytes > (kind === 'pdf' ? MAX_PDF_BYTES : MAX_IMAGE_BYTES)) return null
    total += bytes
    const name = typeof a.name === 'string' ? a.name.replace(/[\u0000-\u001f]/g, '').slice(0, 200) : ''
    clean.push({ kind, mediaType: a.mediaType, name, data: a.data })
  }
  return total > MAX_TOTAL_BYTES ? null : clean
}

// Contenu du message utilisateur pour l'API Claude : pièces jointes puis texte.
export function anthropicUserContent(text, attachments = []) {
  if (!attachments.length) return text
  return [
    ...attachments.map((a) =>
      a.kind === 'pdf'
        ? { type: 'document', source: { type: 'base64', media_type: PDF_TYPE, data: a.data }, ...(a.name ? { title: a.name } : {}) }
        : { type: 'image', source: { type: 'base64', media_type: a.mediaType, data: a.data } },
    ),
    { type: 'text', text },
  ]
}

// Même chose pour une API compatible OpenAI : images en data URL. Les PDF partent en
// partie « file » chez OpenAI, et en partie « document_url » chez Mistral (Document QnA).
// providerId : voir supports().
function openaiPdfPart(a, providerId) {
  const dataUrl = `data:${PDF_TYPE};base64,${a.data}`
  if (providerId === 'mistral') return { type: 'document_url', document_url: dataUrl }
  return { type: 'file', file: { filename: a.name || 'document.pdf', file_data: dataUrl } }
}

export function openaiUserContent(text, attachments = [], providerId = null) {
  if (!attachments.length) return text
  return [
    { type: 'text', text },
    ...attachments.map((a) =>
      a.kind === 'pdf'
        ? openaiPdfPart(a, providerId)
        : { type: 'image_url', image_url: { url: `data:${a.mediaType};base64,${a.data}` } },
    ),
  ]
}

// Le fournisseur sait-il lire ce type de pièce jointe ? providerId : anthropic, openai,
// mistral, xai, ollama, compat (Options) ; format : anthropic ou openai. Les PDF ne
// partent que chez Anthropic, OpenAI et Mistral : xAI ne les accepte pas dans un message.
export function supports({ format, providerId }, kind) {
  if (format === 'anthropic') return true
  if (kind === 'image') return true // selon le modèle : l'erreur du fournisseur le dira
  return providerId === 'openai' || providerId === 'mistral'
}
