// Textes de index.html, écrits en anglais dans la page : traduits ici quand
// l'interface est en français. Bouton EN/FR de la barre d'outils.

import { lang, setLang } from './lang.js'

const FR = {
  'h1': { text: 'BPMN-Pilot' },
  '#file-name-field': { title: "Nom du fichier pour l'enregistrement et les exports" },
  '#file-name': { 'aria-label': 'Nom du fichier', placeholder: 'Nom du fichier' },
  '#btn-new': { text: 'Nouveau', title: 'Créer un diagramme vide (remplace la sauvegarde auto)' },
  '#btn-open-menu': { text: 'Ouvrir', title: 'Ouvrir un fichier, coller du XML ou comparer avec un fichier' },
  '#btn-open': { text: 'Fichier .bpmn ou .xml…', title: 'Ouvrir un diagramme BPMN 2.0 depuis votre ordinateur' },
  '#btn-import-xml': { text: 'Coller du XML…', title: 'Coller du XML BPMN ; un processus sans disposition est rangé automatiquement' },
  '#btn-compare-file': { text: 'Comparer avec un fichier…', title: 'Comparer le diagramme ouvert avec un fichier .bpmn, côte à côte' },
  '#history-buttons': { 'aria-label': 'Historique' },
  '#btn-undo': { title: 'Annuler (Ctrl+Z)', 'aria-label': 'Annuler' },
  '#btn-redo': { title: 'Rétablir (Ctrl+Y)', 'aria-label': 'Rétablir' },
  '#btn-export': { text: 'Exporter', title: 'Exporter en BPMN, XML, SVG, PNG ou PDF, ou imprimer' },
  '#btn-save': { text: 'Fichier .bpmn', title: 'Fichier BPMN 2.0, lisible par les autres outils BPMN' },
  '#btn-save-xml': { text: 'Fichier .xml', title: 'Même contenu que le .bpmn, avec l\'extension .xml' },
  '#btn-xml': { text: 'Code XML à copier…', title: 'Afficher le XML BPMN, prêt à copier' },
  '#btn-svg': { text: 'Image SVG', title: 'Image vectorielle, nette à toute taille' },
  '#btn-png': { text: 'Image PNG', title: 'Image bitmap en résolution 2×, fond blanc' },
  '#btn-pdf': { text: 'Document PDF', title: 'Document PDF vectoriel' },
  '#btn-report-pdf': { text: 'Rapport de processus (PDF)', title: 'Rapport de processus : constats, axes d\'amélioration et séquence des éléments, en PDF' },
  '#btn-report-md': { text: 'Rapport de processus (Markdown)', title: 'Le même rapport de processus, en texte Markdown' },
  '#btn-ai-probabilities': { text: 'Proposer les probabilités', title: 'Demander au Co-pilote IA des probabilités réalistes pour les branches, à revoir avant la simulation' },
  '#help-ai-probabilities': { 'aria-label': "Connectez un modèle d'IA au Co-pilote pour utiliser cette fonction" },
  '#help-ai-analysis': { 'aria-label': "Connectez un modèle d'IA au Co-pilote pour utiliser cette fonction" },
  '#btn-ai-analysis': { text: 'Analyse du Co-pilote', title: 'Le Co-pilote IA lance 100 jetons, lit le rapport et y écrit son analyse' },
  '#btn-print': { text: 'Imprimer…', title: 'Imprimer, ou enregistrer en PDF depuis la fenêtre du navigateur' },
  '#btn-library': { text: 'Mes diagrammes', title: 'Enregistrer, rouvrir, renommer ou supprimer des diagrammes (Ctrl+S enregistre)' },
  '#btn-layout': { text: 'Ranger', title: 'Ranger la disposition' },
  '#btn-simulation': { title: 'Faire circuler des jetons dans le processus, avec la carte de chaleur et les probabilités des branches' },
  '#btn-present': { text: 'Présentation', title: 'Présentation : le diagramme seul, en plein écran' },
  '#btn-expert': { text: 'Expert', title: 'Mode Expert : simulation de jetons et rapport de processus' },
  '#btn-expert-off': { text: 'Quitter le mode Expert', title: 'Masquer la simulation, la carte de chaleur et les probabilités des branches' },
  '#autosave-status': { text: 'Sauvegarde auto : —' },
  '#btn-help': { href: 'aide.html', title: "Aide : comment utiliser l'éditeur", 'aria-label': 'Aide' },
  '#btn-properties': { title: 'Masquer le panneau Processus', 'aria-label': 'Masquer le panneau Processus' },
}

export function applyStaticTexts(save) {
  document.documentElement.lang = lang
  if (lang === 'fr') {
    document.title = 'BPMN-Pilot · Leylines'
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
