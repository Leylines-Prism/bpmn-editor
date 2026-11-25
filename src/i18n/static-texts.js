// Textes de index.html, écrits en anglais dans la page : traduits ici quand
// l'interface est en français. Bouton EN/FR de la barre d'outils.

import { lang, setLang } from './lang.js'

const FR = {
  'h1': { text: 'BPMN Pilot' },
  '#file-name-field': { title: "Nom du fichier pour l'enregistrement et les exports" },
  '#file-name': { 'aria-label': 'Nom du fichier', placeholder: 'Nom du fichier' },
  '#btn-new': { text: 'Nouveau' },
  '#btn-open-menu': { text: 'Ouvrir' },
  '#btn-open': { text: 'Fichier .bpmn ou .xml…' },
  '#btn-import-xml': { text: 'Coller du XML…' },
  '#btn-export': { text: 'Exporter' },
  '#btn-save': { text: 'Fichier .bpmn' },
  '#btn-save-xml': { text: 'Fichier .xml' },
  '#btn-xml': { text: 'Code XML à copier…' },
  '#btn-svg': { text: 'Image SVG' },
  '#btn-png': { text: 'Image PNG' },
  '#btn-pdf': { text: 'Document PDF' },
  '#btn-print': { text: 'Imprimer…' },
  '#btn-library': { text: 'Mes diagrammes', title: 'Enregistrer, rouvrir, renommer ou supprimer des diagrammes (Ctrl+S enregistre)' },
  '#btn-layout': { text: 'Ranger', title: 'Ranger la disposition' },
  '#btn-simulation': { title: 'Faire circuler des jetons dans le processus' },
  '#autosave-status': { text: 'Sauvegarde auto : —' },
  '#btn-help': { href: 'aide.html', title: "Aide : comment utiliser l'éditeur", 'aria-label': 'Aide' },
  '#btn-properties': { title: 'Masquer le panneau Processus', 'aria-label': 'Masquer le panneau Processus' },
}

export function applyStaticTexts(save) {
  document.documentElement.lang = lang
  if (lang === 'fr') {
    document.title = 'BPMN Pilot · Leylines'
    for (const [selector, attrs] of Object.entries(FR)) {
      const el = document.querySelector(selector)
      if (!el) continue
      for (const [name, value] of Object.entries(attrs)) {
        if (name === 'text') el.textContent = value
        else el.setAttribute(name, value)
      }
    }
  }

  // Bouton de langue : il affiche l'autre langue, et son infobulle est écrite dans celle-ci.
  const button = document.getElementById('btn-lang')
  if (!button) return
  const other = lang === 'fr' ? 'en' : 'fr'
  button.textContent = other.toUpperCase()
  button.title = other === 'fr' ? 'Passer en français' : 'Switch to English'
  button.setAttribute('aria-label', button.title)
  button.setAttribute('lang', other)
  button.addEventListener('click', async () => {
    try { await save?.() } catch {}
    setLang(other)
    location.reload()
  })
}
