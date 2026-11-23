// Résultat d'outil qui porte une image (get_diagram_image) : { image: { mediaType,
// data (base64), width, height } }. Partagé par la page et le serveur.

export const isImageResult = (data) =>
  !!data && typeof data === 'object' && data.image?.mediaType === 'image/png' && typeof data.image.data === 'string'

export const imageCaption = (image) => `PNG image of the diagram, ${image.width}×${image.height} px.`
