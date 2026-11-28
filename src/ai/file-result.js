// Résultat d'outil qui porte un fichier (export_diagram avec returnFile) :
// { ...métadonnées, file: { name, mimeType, text } } pour un fichier texte (bpmn, svg),
// { ...métadonnées, file: { name, mimeType, data (base64) } } pour un fichier binaire (png, pdf).
// Partagé par la page et le serveur.

export const MAX_RETURNED_FILE_BYTES = 10 * 1024 * 1024

export const isFileResult = (data) =>
  !!data && typeof data === 'object' && !!data.file && typeof data.file.name === 'string' &&
  typeof data.file.mimeType === 'string' && (typeof data.file.text === 'string' || typeof data.file.data === 'string')

// Le résultat sans le contenu du fichier : pour le chat intégré, qui propose déjà le bouton
// Télécharger, et pour la légende jointe au fichier.
export function withoutFile(data) {
  const { file, ...rest } = data
  return { ...rest, fileName: file.name }
}

// Contenu MCP : une image pour le PNG (l'agent la voit), une ressource intégrée pour les autres
// formats (texte pour bpmn et svg, base64 pour pdf), plus les métadonnées en texte.
export function fileContent(data) {
  const { file } = data
  const uri = `bpmn-pilot://exports/${encodeURIComponent(file.name)}`
  const content = []
  if (file.mimeType === 'image/png' && file.data) content.push({ type: 'image', data: file.data, mimeType: file.mimeType })
  else if (file.text !== undefined) content.push({ type: 'resource', resource: { uri, mimeType: file.mimeType, text: file.text } })
  else content.push({ type: 'resource', resource: { uri, mimeType: file.mimeType, blob: file.data } })
  content.push({ type: 'text', text: JSON.stringify(withoutFile(data), null, 2) })
  return content
}
