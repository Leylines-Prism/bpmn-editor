// Langue de l'interface : anglais par défaut, français au choix (bouton EN/FR de la barre).
// Le choix est retenu par le navigateur. Changer de langue recharge la page : le
// diagramme est gardé par la sauvegarde automatique.

const KEY = 'bpmn-editor-lang'
export const LANGS = ['en', 'fr']

function read() {
  try {
    const value = localStorage.getItem(KEY)
    if (LANGS.includes(value)) return value
  } catch {}
  return 'en'
}

export const lang = read()

// Texte dans la langue de l'interface : T('Open', 'Ouvrir').
export const T = (en, fr) => (lang === 'fr' ? fr : en)

// Nombre formaté selon la langue.
export const num = (n) => n.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US')

export function setLang(value) {
  try { localStorage.setItem(KEY, value) } catch {}
}
