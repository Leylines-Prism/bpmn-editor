// Fonds d'écran de la page vitrine, dans l'ordre du carrousel.
// Ajouter un fond : déposer ses deux versions SVG (claire et sombre, 1920 x 1080) dans
// design/leylines/assets/wallpapers/, puis ajouter une ligne ici. Les impulsions lisent
// les lignes et les nœuds directement dans le dessin : rien d'autre à relever.
// « motion » choisit l'animation du fond (voir pulses.js) : « pulses » par défaut,
// « flow » pour un flux lent, « none » pour un fond immobile.

import courbesLight from '../../design/leylines/assets/wallpapers/courbes-light.svg?url'
import courbesDark from '../../design/leylines/assets/wallpapers/courbes-dark.svg?url'
import impulsionLight from '../../design/leylines/assets/wallpapers/impulsion-light.svg?url'
import impulsionDark from '../../design/leylines/assets/wallpapers/impulsion-dark.svg?url'
import metroLight from '../../design/leylines/assets/wallpapers/metro-light.svg?url'
import metroDark from '../../design/leylines/assets/wallpapers/metro-dark.svg?url'
import champLight from '../../design/leylines/assets/wallpapers/champ-light.svg?url'
import champDark from '../../design/leylines/assets/wallpapers/champ-dark.svg?url'

export const WALLPAPERS = [
  { id: 'courbes', light: courbesLight, dark: courbesDark, motion: 'flow' },
  { id: 'impulsion', light: impulsionLight, dark: impulsionDark, motion: 'none' },
  { id: 'metro', light: metroLight, dark: metroDark, motion: 'pulses' },
  { id: 'champ', light: champLight, dark: champDark, motion: 'pulses' },
]
