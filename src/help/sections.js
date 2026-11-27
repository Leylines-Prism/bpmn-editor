// Pages d'aide : chaque section se replie sous son titre, pour que la page se parcoure
// par ses titres. Sans JavaScript, tout reste affiché.
//   - Le titre devient un bouton (aria-expanded), le reste de la section un bloc
//     hidden="until-found" : la recherche du navigateur (Ctrl+F) y trouve le texte
//     et ouvre la section (événement beforematch).
//   - Un lien vers une section ou vers un titre qu'elle contient l'ouvre d'abord,
//     depuis le sommaire comme depuis le texte, et à l'arrivée sur la page (#ancre).
//   - « Tout déplier » / « Tout replier » dans le sommaire, et tout s'ouvre à l'impression.
// Premiers pas est ouverte par défaut.

const FR = document.documentElement.lang === 'fr'
const OPEN_BY_DEFAULT = ['premiers-pas', 'getting-started']
const sections = [...document.querySelectorAll('main > section[id]')].filter((s) => s.querySelector(':scope > h2'))

function setOpen(section, open) {
  const button = section._toggle
  if (!button) return
  button.setAttribute('aria-expanded', String(open))
  if (open) section._body.removeAttribute('hidden')
  else section._body.setAttribute('hidden', 'until-found')
  section.classList.toggle('is-open', open)
  updateAllButton()
}

for (const section of sections) {
  const h2 = section.querySelector(':scope > h2')
  const body = document.createElement('div')
  body.className = 'sec-body'
  body.id = `${section.id}-contenu`
  while (h2.nextSibling) body.append(h2.nextSibling)
  section.append(body)
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'sec-toggle'
  button.setAttribute('aria-controls', body.id)
  while (h2.firstChild) button.append(h2.firstChild)
  h2.append(button)
  section.classList.add('sec')
  section._toggle = button
  section._body = body
  button.addEventListener('click', () => setOpen(section, button.getAttribute('aria-expanded') !== 'true'))
  body.addEventListener('beforematch', () => setOpen(section, true))
}

// Ouvre la section qui contient la cible d'une ancre. Renvoie la cible.
function reveal(hash) {
  let id
  try {
    id = decodeURIComponent(hash.slice(1))
  } catch {
    return null
  }
  const target = id && document.getElementById(id)
  const section = target?.closest('section.sec')
  if (section) setOpen(section, true)
  return target
}

// Tout déplier / Tout replier, en tête du sommaire.
let allButton = null
const nav = document.querySelector('.toc nav')
if (nav && sections.length) {
  allButton = document.createElement('button')
  allButton.type = 'button'
  allButton.className = 'toc-all'
  allButton.addEventListener('click', () => {
    const open = !sections.every((s) => s.classList.contains('is-open'))
    for (const s of sections) setOpen(s, open)
  })
  nav.querySelector('ol')?.before(allButton)
}
function updateAllButton() {
  if (!allButton) return
  const allOpen = sections.every((s) => s.classList.contains('is-open'))
  allButton.textContent = allOpen ? (FR ? 'Tout replier' : 'Collapse all') : FR ? 'Tout déplier' : 'Expand all'
}

const fromHash = location.hash && reveal(location.hash)
for (const s of sections) if (!s.classList.contains('is-open')) setOpen(s, OPEN_BY_DEFAULT.includes(s.id) || (fromHash && s.contains(fromHash)))
if (fromHash) requestAnimationFrame(() => fromHash.scrollIntoView())

// Un lien interne ouvre sa section avant que le navigateur n'y défile (même ancre répétée comprise).
document.addEventListener('click', (event) => {
  const link = event.target.closest?.('a[href^="#"]')
  if (link) reveal(link.hash)
})
addEventListener('hashchange', () => reveal(location.hash))

let printed = null
addEventListener('beforeprint', () => {
  printed = sections.filter((s) => !s.classList.contains('is-open'))
  for (const s of printed) setOpen(s, true)
})
addEventListener('afterprint', () => {
  for (const s of printed || []) setOpen(s, false)
  printed = null
})
