// Dictée vocale du Co-pilote IA : un clic sur le micro lance la dictée, un autre l'arrête.
//
// Reconnaissance sur l'appareil seulement (Web Speech API, processLocally) : ni l'audio
// ni le texte ne quittent le navigateur. Le bouton n'apparaît pas quand le navigateur ne
// sait pas reconnaître la voix en local (Safari, navigateurs mobiles, anciennes versions) :
// sans processLocally, Chrome et Safari envoient l'audio à leur service en ligne.
//
// Le texte dicté s'ajoute à la zone de saisie, et rien ne part sans un clic sur Envoyer.
// La langue de dictée suit celle de l'interface.

import { lang, T } from './i18n/lang.js'

export const MIC_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/></svg>`

const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition

// Vrai quand le navigateur sait au moins dire si la reconnaissance locale est possible.
export const voiceSupported = () => typeof Recognition === 'function' && typeof Recognition.available === 'function'

const LANG_TAG = lang === 'fr' ? 'fr-FR' : 'en-US'
const OPTIONS = { langs: [LANG_TAG], processLocally: true }

// Ajoute un morceau de texte dicté à la suite de ce qui est déjà écrit.
function join(before, piece) {
  const text = piece.trim()
  if (!text) return before
  if (!before) return text.charAt(0).toUpperCase() + text.slice(1)
  return /\s$/.test(before) ? before + text : `${before} ${text}`
}

// button : le bouton micro. input : la zone de saisie. interim : élément qui montre le
// texte provisoire. notify(kind, text) : message dans le fil du chat. onText() : après
// chaque ajout, pour que la zone de saisie s'ajuste à son contenu.
export function setupVoiceInput({ button, input, interim, notify, onText }) {
  let recognition = null
  let active = false // l'utilisateur veut dicter, même entre deux redémarrages
  let preparing = false

  const setState = (state) => {
    button.dataset.state = state
    button.setAttribute('aria-pressed', String(state === 'listening'))
    const label = {
      idle: T('Dictate (speech recognized on this device)', 'Dicter (voix reconnue sur cet appareil)'),
      preparing: T('Preparing speech recognition…', 'Préparation de la reconnaissance vocale…'),
      listening: T('Stop dictation', 'Arrêter la dictée'),
    }[state]
    button.title = label
    button.setAttribute('aria-label', label)
  }
  const showInterim = (text) => {
    interim.textContent = text
    interim.hidden = !text
  }

  function stop() {
    active = false
    showInterim('')
    setState('idle')
    if (recognition) {
      const r = recognition
      recognition = null
      try { r.stop() } catch {}
    }
  }

  function listen() {
    const r = new Recognition()
    r.lang = LANG_TAG
    r.continuous = true
    r.interimResults = true
    r.processLocally = true
    r.onresult = (e) => {
      let provisional = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]
        if (result.isFinal) {
          input.value = join(input.value, result[0].transcript)
          onText()
        } else provisional += result[0].transcript
      }
      showInterim(provisional.trim())
    }
    r.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return
      const message = {
        'not-allowed': T('Microphone access refused. Allow it in the site settings of the browser, then try again.', "Accès au micro refusé. Autorisez-le dans les réglages du site du navigateur, puis réessayez."),
        'audio-capture': T('No microphone found.', 'Aucun micro trouvé.'),
        'service-not-allowed': T('Speech recognition on this device is not available for this language.', "La reconnaissance vocale sur cet appareil n'est pas disponible pour cette langue."),
        'language-not-supported': T('Speech recognition on this device is not available for this language.', "La reconnaissance vocale sur cet appareil n'est pas disponible pour cette langue."),
      }[e.error] || T(`Dictation stopped: ${e.error}.`, `Dictée arrêtée : ${e.error}.`)
      notify('error', message)
      stop()
    }
    // En dictée continue, le navigateur s'arrête de lui-même après un long silence :
    // on relance tant que l'utilisateur n'a pas cliqué sur Arrêter.
    r.onend = () => {
      if (recognition !== r) return
      showInterim('')
      if (active) {
        try { r.start(); return } catch {}
      }
      stop()
    }
    recognition = r
    r.start()
    setState('listening')
  }

  async function start() {
    if (preparing) return
    preparing = true
    setState('preparing')
    try {
      let status = await Recognition.available(OPTIONS)
      if (status === 'downloadable' || status === 'downloading') {
        notify('notice', T(
          'First use: the browser downloads the speech recognition model for this language, once. Dictation starts when it is ready.',
          'Première utilisation : le navigateur télécharge une fois le modèle de reconnaissance vocale de cette langue. La dictée démarre dès qu\'il est prêt.'))
        status = (await Recognition.install(OPTIONS)) ? 'available' : 'unavailable'
      }
      if (status !== 'available') {
        notify('error', T(
          'This browser cannot recognize speech on this device for this language. Dictation stays off so that no audio leaves the device.',
          "Ce navigateur ne sait pas reconnaître la voix sur cet appareil pour cette langue. La dictée reste coupée pour qu'aucun son ne quitte l'appareil."))
        setState('idle')
        return
      }
      active = true
      listen()
    } catch (err) {
      notify('error', T(`Dictation unavailable: ${err?.message || err}`, `Dictée indisponible : ${err?.message || err}`))
      stop()
    } finally {
      preparing = false
    }
  }

  setState('idle')
  button.addEventListener('click', () => (active ? stop() : start()))
  return { stop, get active() { return active } }
}
