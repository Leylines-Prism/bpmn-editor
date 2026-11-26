// Vitesse de la simulation de jetons : une glissière remplace les trois boutons de
// l'extension (lent, normal, rapide). Elle va de 0,25× à 4× et passe par la même
// commande (animation.setAnimationSpeed) : les jetons en route changent d'allure
// aussitôt, et la vitesse choisie vaut pour les suivants.
import { T, num } from './i18n/lang.js'

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4]

export function setupSimulationSpeed(modeler) {
  const animation = modeler.get('animation')
  const container = modeler.get('canvas').getContainer().querySelector('.bts-set-animation-speed')
  if (!container) return

  const box = document.createElement('label')
  box.className = 'sim-speed'
  box.innerHTML = `<input type="range" min="0" max="${SPEEDS.length - 1}" step="1" /><output></output>`
  const input = box.querySelector('input')
  const output = box.querySelector('output')
  input.setAttribute('aria-label', T('Simulation speed', 'Vitesse de la simulation'))
  container.title = T('Simulation speed', 'Vitesse de la simulation')
  container.querySelector('.bts-animation-speed-buttons')?.replaceWith(box)

  // Position la plus proche d'une vitesse donnée.
  const indexOf = (speed) => SPEEDS.reduce((best, s, i) => (Math.abs(s - speed) < Math.abs(SPEEDS[best] - speed) ? i : best), 0)
  const show = (speed) => {
    input.value = String(indexOf(speed))
    output.textContent = `${num(speed)}×`
  }

  input.addEventListener('input', () => animation.setAnimationSpeed(SPEEDS[Number(input.value)]))
  modeler.on('tokenSimulation.animationSpeedChanged', ({ speed }) => show(speed))
  show(animation.getAnimationSpeed())
}
