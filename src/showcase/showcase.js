// Page vitrine Leylines (about.html) : carrousel plein écran des fonds d'écran,
// logo animé au centre, icônes de contact, bouton de thème et retour à l'éditeur.

import { T, lang } from '../i18n/lang.js'
import { setupThemeToggle } from '../theme/theme-toggle.js'
import { contactChoices, openSealed } from '../feedback.js'
import { WALLPAPERS } from './wallpapers.js'
import { createPulses } from './pulses.js'
import { SUPPORT_URL, CUP_ICON, trackSupportClicks } from '../support.js'
import introLight from '../brand/leylines-logo-intro-light.svg?url'
import introDark from '../brand/leylines-logo-intro-dark.svg?url'

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
const systemDark = matchMedia('(prefers-color-scheme: dark)')
const root = document.documentElement
const isDark = () => root.dataset.theme === 'dark' || (root.dataset.theme !== 'light' && systemDark.matches)

// Textes de la page
document.title = T('Leylines · BPMN Editor', 'Leylines · Éditeur BPMN')
document.querySelector('#open-editor').textContent = T('Open the editor', "Ouvrir l'éditeur")
document.querySelector('#prev').setAttribute('aria-label', T('Previous wallpaper', 'Fond précédent'))
document.querySelector('#next').setAttribute('aria-label', T('Next wallpaper', 'Fond suivant'))
document.querySelector('#contacts').setAttribute('aria-label', T('Contact', 'Contact'))
if (lang === 'fr') document.querySelector('meta[name="description"]').content = 'Fonds d’écran Leylines, avec le logo Leylines animé.'

setupThemeToggle(document.getElementById('btn-theme'))

// Logo : la ligne se remplit de lumière, puis l'impulsion repasse toutes les 5 secondes.
// Les deux versions jouent ensemble : changer de thème ne relance pas l'animation.
if (!reduceMotion) {
  document.getElementById('logo-light').src = introLight
  document.getElementById('logo-dark').src = introDark
}

// Icônes de contact : les mêmes choix que la fenêtre « Votre avis ».
const contacts = document.getElementById('contacts')
for (const c of contactChoices()) {
  const el = c.sealed ? document.createElement('button') : document.createElement('a')
  if (c.sealed) {
    el.type = 'button'
    el.addEventListener('click', async () => {
      if (el.dataset.state === 'busy') return
      // L'infobulle suit l'état de la vérification (preuve de travail, voir feedback.js).
      el.title = c.busy
      el.setAttribute('aria-label', c.busy)
      await openSealed(el, c)
      const label = el.dataset.state === 'error' ? c.error : c.title
      el.title = label
      el.setAttribute('aria-label', label)
    })
  } else {
    Object.assign(el, { href: c.url, target: '_blank', rel: 'noopener' })
  }
  el.className = 'contact'
  el.title = c.title
  el.setAttribute('aria-label', c.title)
  el.innerHTML = c.svg
  contacts.append(el)
}

// Dernière icône : soutenir le projet sur Ko-fi (clic compté, voir src/support.js).
const support = document.createElement('a')
Object.assign(support, { href: SUPPORT_URL, target: '_blank', rel: 'noopener', className: 'contact', innerHTML: CUP_ICON })
support.dataset.support = 'vitrine'
support.title = T('Thanks for the coffee! (Ko-fi)', 'Merci pour le café ! (Ko-fi)')
support.setAttribute('aria-label', support.title)
contacts.append(support)
trackSupportClicks(contacts)

// Carrousel
const slidesBox = document.getElementById('slides')
const slides = WALLPAPERS.map((w) => {
  const el = document.createElement('div')
  el.className = 'slide'
  el.dataset.id = w.id
  el.setAttribute('role', 'img')
  slidesBox.append(el)
  return el
})
const pulses = reduceMotion ? null : createPulses(document.getElementById('pulses'), { isDark })
let index = 0

function paintSlides() {
  const mode = isDark() ? 'dark' : 'light'
  WALLPAPERS.forEach((w, i) => {
    // Seuls le fond affiché et ses voisins sont chargés.
    const near = Math.abs(i - index) <= 1 || Math.abs(i - index) === WALLPAPERS.length - 1
    if (near) slides[i].style.backgroundImage = `url("${w[mode]}")`
  })
}

function show(i) {
  index = (i + WALLPAPERS.length) % WALLPAPERS.length
  slides.forEach((s, k) => {
    s.classList.toggle('active', k === index)
    s.setAttribute('aria-hidden', String(k !== index))
    s.setAttribute('aria-label', T(`Wallpaper ${k + 1} of ${WALLPAPERS.length}`, `Fond ${k + 1} sur ${WALLPAPERS.length}`))
  })
  paintSlides()
  animate()
}

// Animation du fond affiché, lue dans sa version claire ou sombre.
function animate() {
  const w = WALLPAPERS[index]
  pulses?.use(w[isDark() ? 'dark' : 'light'], w.motion)
}

const arrows = document.querySelectorAll('.arrow')
arrows.forEach((a) => { a.hidden = WALLPAPERS.length < 2 })
document.getElementById('prev').addEventListener('click', () => show(index - 1))
document.getElementById('next').addEventListener('click', () => show(index + 1))
addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey) return
  if (e.key === 'ArrowLeft') show(index - 1)
  if (e.key === 'ArrowRight') show(index + 1)
})

// Glissé du doigt (écrans tactiles)
let startX = null, startY = null
const stage = document.getElementById('stage')
stage.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') { startX = e.clientX; startY = e.clientY } })
stage.addEventListener('pointerup', (e) => {
  if (startX === null) return
  const dx = e.clientX - startX, dy = e.clientY - startY
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) show(index + (dx < 0 ? 1 : -1))
  startX = null
})
stage.addEventListener('pointercancel', () => { startX = null })

// Le thème change (bouton ou système) : les fonds suivent.
const themeChanged = () => { paintSlides(); animate() }
new MutationObserver(themeChanged).observe(root, { attributes: true, attributeFilter: ['data-theme'] })
systemDark.addEventListener('change', themeChanged)

show(0)
