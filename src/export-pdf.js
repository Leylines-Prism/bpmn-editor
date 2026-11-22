// Export PDF vectoriel du diagramme, entièrement dans le navigateur :
// le SVG de bpmn-js est redessiné en PDF par svg2pdf.js sur jsPDF.
// Les deux bibliothèques ne sont chargées qu'au premier export.

// 1 px CSS = 0,75 pt : le PDF garde la taille réelle du diagramme à l'écran.
const PX_TO_PT = 0.75
const MARGIN_PT = 18

export async function exportPdf(modeler) {
  const canvas = modeler.get('canvas')
  const root = canvas.getRootElement()
  if (!modeler.get('elementRegistry').filter((el) => el !== root && !el.labelTarget).length) {
    throw new Error('le diagramme est vide')
  }
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import('jspdf'), import('svg2pdf.js')])
  const { svg } = await modeler.saveSVG()

  // svg2pdf lit les styles calculés : le SVG doit être dans la page le temps de l'export.
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden'
  host.innerHTML = svg
  document.body.appendChild(host)
  try {
    const el = host.querySelector('svg')
    const width = parseFloat(el.getAttribute('width')) || 800
    const height = parseFloat(el.getAttribute('height')) || 600
    const w = width * PX_TO_PT
    const h = height * PX_TO_PT
    const pageW = w + 2 * MARGIN_PT
    const pageH = h + 2 * MARGIN_PT
    const doc = new jsPDF({
      orientation: pageW >= pageH ? 'landscape' : 'portrait',
      unit: 'pt',
      format: [pageW, pageH],
    })
    await svg2pdf(el, doc, { x: MARGIN_PT, y: MARGIN_PT, width: w, height: h })
    return doc.output('blob')
  } finally {
    host.remove()
  }
}
