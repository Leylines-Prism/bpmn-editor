// Image PNG du diagramme ouvert, pour l'outil get_diagram_image : le modèle voit
// le rendu réel (mise en page, couleurs, chevauchements), et un agent MCP peut
// l'afficher tel quel. Même rendu que l'export PNG : le SVG de bpmn-js dessiné
// sur un fond blanc.

// Côté le plus long : 1568 px, la taille au-delà de laquelle l'API Claude réduit l'image.
const MAX_SIDE = 1568
const MAX_SCALE = 2

export async function renderDiagramPng(modeler, { maxSide = MAX_SIDE } = {}) {
  const root = modeler.get('canvas').getRootElement()
  if (!modeler.get('elementRegistry').filter((el) => el !== root && !el.labelTarget).length) {
    throw new Error('The diagram is empty: nothing to show.')
  }
  const { svg } = await modeler.saveSVG()
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('The browser could not draw the diagram as an image.'))
      image.src = url
    })
    const w = img.naturalWidth || 800
    const h = img.naturalHeight || 600
    const scale = Math.min(MAX_SCALE, maxSide / Math.max(w, h))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(w * scale))
    canvas.height = Math.max(1, Math.round(h * scale))
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const data = canvas.toDataURL('image/png').split(',')[1]
    return { image: { mediaType: 'image/png', data, width: canvas.width, height: canvas.height } }
  } finally {
    URL.revokeObjectURL(url)
  }
}
