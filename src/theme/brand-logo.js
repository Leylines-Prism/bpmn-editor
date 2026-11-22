// Logo animé de la barre d'outils : l'impulsion parcourt la ligne trois fois au
// chargement de la page, puis le logo fixe prend le relais (fondu court).
// Rien ne bouge si le système demande de réduire les animations.

import pulseLight from '../../design/leylines/assets/leylines-logo-pulse-light.svg?url'
import pulseDark from '../../design/leylines/assets/leylines-logo-pulse-dark.svg?url'

const CYCLE_MS = 2000 // durée d'un passage, fixée par le fichier de la charte
const CYCLES = 3
// Le fondu commence au calme de la fin du 3e passage : impulsion arrivée, nœuds éteints.
const FADE_AT_MS = (CYCLES - 1) * CYCLE_MS + 1700

export function setupBrandLogo(container = document.querySelector('.brand-logo')) {
  if (!container || matchMedia('(prefers-reduced-motion: reduce)').matches) return
  // Le logo fixe est masqué pendant l'animation, puis revient en fondu.
  container.classList.add('animating')
  let pending = 2
  const settle = () => { if (--pending === 0) container.classList.remove('animating') }
  for (const [src, cls] of [[pulseLight, 'only-light'], [pulseDark, 'only-dark']]) {
    const img = new Image()
    img.alt = ''
    img.className = `${cls} brand-pulse`
    // L'animation démarre au chargement du fichier : le minutage part de là.
    img.addEventListener('load', () => {
      setTimeout(() => {
        img.classList.add('done')
        container.classList.remove('animating')
      }, FADE_AT_MS)
      img.addEventListener('transitionend', () => img.remove(), { once: true })
    }, { once: true })
    img.addEventListener('error', () => { img.remove(); settle() }, { once: true })
    img.src = src
    container.append(img)
  }
}
