// Fonds d'écran de la page vitrine, dans l'ordre du carrousel.
// Ajouter un fond : déposer ses deux versions SVG (claire et sombre, 1920 x 1080) dans
// src/brand/wallpapers/, puis ajouter une ligne ici. Les impulsions lisent
// les lignes et les nœuds directement dans le dessin : rien d'autre à relever.
// « motion » choisit l'animation du fond (voir pulses.js) : « pulses » par défaut,
// « flow » pour un flux lent, « scroll » pour un dégradé qui défile, « none » pour un fond immobile.

import courbesLight from '../brand/wallpapers/courbes-light.svg?url'
import courbesDark from '../brand/wallpapers/courbes-dark.svg?url'
import impulsionLight from '../brand/wallpapers/impulsion-light.svg?url'
import impulsionDark from '../brand/wallpapers/impulsion-dark.svg?url'
import metroLight from '../brand/wallpapers/metro-light.svg?url'
import metroDark from '../brand/wallpapers/metro-dark.svg?url'
import champLight from '../brand/wallpapers/champ-light.svg?url'
import champDark from '../brand/wallpapers/champ-dark.svg?url'

export const WALLPAPERS = [
  { id: 'courbes', light: courbesLight, dark: courbesDark, motion: 'flow' },
  { id: 'impulsion', light: impulsionLight, dark: impulsionDark, motion: 'scroll' },
  { id: 'metro', light: metroLight, dark: metroDark, motion: 'pulses' },
  { id: 'champ', light: champLight, dark: champDark, motion: 'pulses' },
]
