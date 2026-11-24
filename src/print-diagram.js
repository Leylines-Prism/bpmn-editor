// Impression du diagramme seul, sans l'interface autour.
// Le SVG de bpmn-js est placé dans un cadre invisible, mis à l'échelle de la page,
// puis la fenêtre d'impression du navigateur s'ouvre sur ce cadre.
//
// Cadrage :
//   - orientation de la page selon la forme du diagramme (paysage s'il est plus
//     large que haut). Chrome, Edge et Firefox appliquent @page size, Safari
//     laisse le choix dans sa fenêtre d'impression.
//   - le diagramme est réduit pour tenir sur une page, jamais agrandi : un petit
//     diagramme garde sa taille à l'écran (1 px CSS = 1/96 de pouce), comme l'export PDF.
//   - centré sur la page, marges de 10 mm.

const MARGIN_MM = 10

export async function printDiagram(modeler, { title = '' } = {}) {
  const root = modeler.get('canvas').getRootElement()
  if (!modeler.get('elementRegistry').filter((el) => el !== root && !el.labelTarget).length) {
    throw new Error('empty')
  }
  const { svg } = await modeler.saveSVG()

  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement
  const width = parseFloat(parsed.getAttribute('width')) || 800
  const height = parseFloat(parsed.getAttribute('height')) || 600
  if (!parsed.getAttribute('viewBox')) parsed.setAttribute('viewBox', `0 0 ${width} ${height}`)
  parsed.removeAttribute('width')
  parsed.removeAttribute('height')
  parsed.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  const orientation = width >= height ? 'landscape' : 'portrait'

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  @page { size: ${orientation}; margin: ${MARGIN_MM}mm; }
  html, body { margin: 0; padding: 0; height: 100%; background: #fff; }
  body { display: flex; align-items: center; justify-content: center; }
  svg {
    display: block;
    width: 100%; height: 100%;
    max-width: ${width}px; max-height: ${height}px;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
</style></head><body>${new XMLSerializer().serializeToString(parsed)}</body></html>`

  document.getElementById('print-frame')?.remove()
  const frame = document.createElement('iframe')
  frame.id = 'print-frame'
  frame.setAttribute('aria-hidden', 'true')
  frame.tabIndex = -1
  // Pas de display:none : certains navigateurs impriment alors une page blanche.
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
  document.body.appendChild(frame)

  await new Promise((resolve) => {
    frame.addEventListener('load', resolve, { once: true })
    frame.srcdoc = html
  })

  const win = frame.contentWindow
  // Retrait du cadre une fois la fenêtre d'impression fermée. Sur certains
  // navigateurs print() rend la main tout de suite : afterprint fait foi, avec
  // un délai de secours.
  const cleanup = () => setTimeout(() => frame.remove(), 500)
  win.addEventListener('afterprint', cleanup, { once: true })
  win.focus()
  win.print()
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}
