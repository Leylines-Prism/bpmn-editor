// Ajuste le zoom pour montrer tout le diagramme, sans erreur quand le canevas n'a pas
// encore de taille (page en cours de mise en page, onglet en arrière-plan) : diagram-js
// calculerait alors un zoom infini (« non-finite » dans la console).
export function fitView(canvas) {
  const container = canvas.getContainer()
  const ready = () => container.clientWidth > 0 && container.clientHeight > 0
  const fit = () => {
    const { inner } = canvas.viewbox()
    // Diagramme vide ou sans étendue : on recentre simplement sur l'origine.
    if (!(inner.width > 0 && inner.height > 0)) canvas.zoom(1, { x: 0, y: 0 })
    else canvas.zoom('fit-viewport')
  }
  if (ready()) return fit()
  const observer = new ResizeObserver(() => {
    if (!ready()) return
    observer.disconnect()
    fit()
  })
  observer.observe(container)
}
