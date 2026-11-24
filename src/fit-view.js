// Ajuste le zoom pour montrer tout le diagramme, sans erreur quand le canevas n'a pas
// encore de taille (page en cours de mise en page, onglet en arrière-plan) : diagram-js
// calculerait alors un zoom infini (« non-finite » dans la console).
export function fitView(canvas) {
  const container = canvas.getContainer()
  const ready = () => container.clientWidth > 0 && container.clientHeight > 0
  const fit = () => {
    const { inner } = canvas.viewbox()
    // Diagramme vide ou sans étendue : on recentre simplement sur l'origine.
    if (!(inner.width > 0 && inner.height > 0)) return canvas.zoom(1, { x: 0, y: 0 })
    // Centré, avec des marges pour que la palette (à gauche), le bouton de
    // simulation (en haut) et le bilan de validation (en bas) ne cachent rien.
    const { clientWidth: w, clientHeight: h } = container
    const palette = container.querySelector('.djs-palette')
    const paletteRight = palette ? palette.getBoundingClientRect().right - container.getBoundingClientRect().left : 0
    const pad = { left: Math.max(100, paletteRight + 30), right: 30, top: 70, bottom: 90 }
    const availW = Math.max(w - pad.left - pad.right, 100)
    const availH = Math.max(h - pad.top - pad.bottom, 100)
    const scale = Math.min(availW / inner.width, availH / inner.height, 1)
    canvas.viewbox({
      x: inner.x - (pad.left + (availW - inner.width * scale) / 2) / scale,
      y: inner.y - (pad.top + (availH - inner.height * scale) / 2) / scale,
      width: w / scale,
      height: h / scale,
    })
  }
  if (ready()) return fit()
  const observer = new ResizeObserver(() => {
    if (!ready()) return
    observer.disconnect()
    fit()
  })
  observer.observe(container)
}
