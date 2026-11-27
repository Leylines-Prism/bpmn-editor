// Bouton de thème de l'aide, le même que celui de l'éditeur et de la page de présentation.
// Les libellés suivent la langue de la page d'aide, pas celle choisie dans l'éditeur.

import { setupThemeToggle } from '../theme/theme-toggle.js'

const fr = document.documentElement.lang === 'fr'
setupThemeToggle(document.getElementById('btn-theme'), (en, frText) => (fr ? frText : en))
