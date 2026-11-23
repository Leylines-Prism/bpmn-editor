// Poignées pour régler la largeur des panneaux de droite (assistant IA, Processus).
// La poignée est posée juste avant le panneau, dans l'espace qui le sépare de son
// voisin : on la tire vers la gauche pour élargir, vers la droite pour rétrécir.
// Au clavier : flèches gauche et droite. Double-clic : largeur par défaut.
// La largeur est retenue dans le navigateur, et passe par une variable CSS
// (--<nom>-width) pour que le repli du panneau garde la main sur sa largeur.

import { T } from './i18n/lang.js'

const STEP = 16

export function makeResizable(panel, { name, label, min, max, fallback }) {
  const key = `bpmn-editor-${name}-width`
  const variable = `--${name}-width`
  const limit = (w) => Math.round(Math.min(Math.max(w, min), Math.min(max, window.innerWidth * 0.6)))

  const handle = document.createElement('div')
  handle.className = 'panel-resizer'
  handle.tabIndex = 0
  handle.setAttribute('role', 'separator')
  handle.setAttribute('aria-orientation', 'vertical')
  handle.setAttribute('aria-label', label)
  handle.title = T('Drag to resize, double-click to reset', 'Tirer pour redimensionner, double-clic pour revenir à la largeur par défaut')
  panel.before(handle)

  let width = fallback
  const apply = (w, save = true) => {
    width = limit(w)
    panel.style.setProperty(variable, `${width}px`)
    handle.setAttribute('aria-valuenow', String(width))
    if (save) {
      try { localStorage.setItem(key, String(width)) } catch {}
    }
  }
  let saved = NaN
  try { saved = Number(localStorage.getItem(key)) } catch {}
  apply(Number.isFinite(saved) && saved > 0 ? saved : fallback, false)
  handle.setAttribute('aria-valuemin', String(min))
  handle.setAttribute('aria-valuemax', String(max))

  // La poignée n'existe que si le panneau est affiché.
  const sync = () => { handle.hidden = panel.offsetWidth < 40 }
  new ResizeObserver(sync).observe(panel)
  sync()

  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    handle.setPointerCapture(e.pointerId)
    const startX = e.clientX
    const startWidth = panel.getBoundingClientRect().width
    document.body.classList.add('panel-resizing')
    const move = (ev) => apply(startWidth + (startX - ev.clientX), false)
    const up = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      handle.removeEventListener('pointercancel', up)
      document.body.classList.remove('panel-resizing')
      apply(width)
      window.dispatchEvent(new Event('resize')) // le canevas se recale
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
    handle.addEventListener('pointercancel', up)
  })
  handle.addEventListener('dblclick', () => {
    apply(fallback)
    window.dispatchEvent(new Event('resize'))
  })
  handle.addEventListener('keydown', (e) => {
    const delta = e.key === 'ArrowLeft' ? STEP : e.key === 'ArrowRight' ? -STEP : 0
    if (!delta) return
    e.preventDefault()
    apply(width + delta)
    window.dispatchEvent(new Event('resize'))
  })
  window.addEventListener('resize', () => { if (width !== limit(width)) apply(width, false) })
}
