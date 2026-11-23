// Pages d'aide : le sommaire signale la section en cours de lecture.
// Son lien reçoit aria-current="location", que la CSS dessine comme le trait
// du survol. Le survol continue de marcher par-dessus.

const toc = document.querySelector('.toc')
const links = toc ? [...toc.querySelectorAll('a[href^="#"]')] : []
const entries = links
  .map((link) => ({ link, section: document.getElementById(decodeURIComponent(link.hash.slice(1))) }))
  .filter((entry) => entry.section)

if (entries.length) {
  let current = null
  // Après un clic dans le sommaire, l'entrée cliquée reste la section en cours
  // pendant le défilement, même si elle ne peut jamais atteindre le haut
  // (les dernières, en bas de page).
  let pinned = null
  let pinTimer = 0

  const setCurrent = (entry) => {
    if (entry === current) return
    if (current) current.link.removeAttribute('aria-current')
    current = entry
    if (!entry) return
    entry.link.setAttribute('aria-current', 'location')
    keepVisibleInToc(entry.link)
  }

  // Le sommaire défile seul quand la fenêtre est basse : y ramener le lien
  // en cours sans faire défiler la page.
  const keepVisibleInToc = (link) => {
    if (toc.scrollHeight <= toc.clientHeight) return
    const top = link.offsetTop - toc.offsetTop
    const bottom = top + link.offsetHeight
    if (top < toc.scrollTop) toc.scrollTop = top - 8
    else if (bottom > toc.scrollTop + toc.clientHeight) toc.scrollTop = bottom - toc.clientHeight + 8
  }

  // La section en cours est la dernière dont le titre est passé sous la ligne
  // de l'en-tête (scroll-padding-top). Tout en bas, la dernière section.
  const update = () => {
    if (pinned) return setCurrent(pinned)
    const line = (parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0) + 16
    const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2
    let found = null
    if (atBottom) found = entries[entries.length - 1]
    else for (const entry of entries) {
      if (entry.section.getBoundingClientRect().top <= line) found = entry
      else break
    }
    setCurrent(found)
  }

  let frame = 0
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; update() })
  }

  const unpin = () => {
    if (!pinned) return
    pinned = null
    clearTimeout(pinTimer)
    schedule()
  }

  for (const entry of entries) {
    entry.link.addEventListener('click', () => {
      pinned = entry
      setCurrent(entry)
      clearTimeout(pinTimer)
      // scrollend libère l'entrée, le minuteur couvre les navigateurs sans cet événement
      pinTimer = setTimeout(unpin, 1500)
    })
  }

  addEventListener('scroll', schedule, { passive: true })
  addEventListener('resize', schedule)
  addEventListener('scrollend', () => { if (pinned) setTimeout(unpin, 50) })
  // Un geste du lecteur reprend la main tout de suite
  for (const type of ['wheel', 'touchstart', 'keydown']) addEventListener(type, unpin, { passive: true })
  update()
}
