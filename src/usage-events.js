// Mesure d'usage des fonctions de l'éditeur, version en ligne seulement (voir src/analytics.js).
// Uniquement des noms d'action et des catégories : jamais le contenu du diagramme, des
// messages, des fichiers ni des clés. La liste complète est dans docs/online-privacy.md.

import { track, range, trackGithubLinks } from './analytics.js'
import { EXPERT_EVENT } from './expert-mode.js'

export function setupUsageEvents(modeler) {
  const on = (id, handler) => document.getElementById(id)?.addEventListener('click', handler)

  // Mode Expert, activé ou quitté (pas l'état retrouvé au chargement).
  window.addEventListener(EXPERT_EVENT, ({ detail }) => track('mode-expert', { etat: detail.on ? 'on' : 'off' }))

  // Simulation de jetons lancée, par le menu Expert, la touche T ou le contrôle du canevas.
  // L'extension émet l'événement plusieurs fois par bascule : seul le passage à l'état actif compte.
  let simulating = false
  modeler.on('tokenSimulation.toggleMode', ({ active }) => {
    if (active && !simulating) track('simulation')
    simulating = !!active
  })

  // Carte de chaleur et « Lancer N jetons » (src/heatmap.js), par délégation : la barre est
  // créée dans le canevas.
  document.addEventListener('click', (e) => {
    // Le bouton a déjà basculé quand le clic arrive ici : « active » veut dire affichée.
    if (e.target.closest?.('.heatmap-toggle')?.classList.contains('active')) track('carte-chaleur')
    if (e.target.closest?.('.heatmap-run')) {
      const runs = Number(document.querySelector('.heatmap-runs')?.value) || 0
      track('jetons-lances', { tranche: range(runs, [1, 10, 100, 1000]) })
    }
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.closest?.('.heatmap-runs')) {
      track('jetons-lances', { tranche: range(Number(e.target.value) || 0, [1, 10, 100, 1000]) })
    }
  })

  on('btn-present', () => track('presentation'))
  on('btn-library', () => track('mes-diagrammes'))
  on('btn-ai-probabilities', () => track('copilote-expert', { action: 'probabilites' }))
  on('btn-ai-analysis', () => track('copilote-expert', { action: 'analyse' }))
  on('btn-lang', () => track('langue-changee'))
  on('btn-theme', () => track('theme-change'))

  trackGithubLinks(document)
}
