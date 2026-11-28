// Dictée vocale du Co-pilote IA : un clic sur le micro lance la dictée, un autre l'arrête.
//
// Reconnaissance sur l'appareil seulement (Web Speech API, processLocally) : ni l'audio
// ni le texte ne quittent le navigateur. Le bouton n'apparaît pas quand le navigateur ne
// sait pas reconnaître la voix en local (Safari, navigateurs mobiles, anciennes versions) :
// sans processLocally, Chrome et Safari envoient l'audio à leur service en ligne.
//
// Le texte dicté s'ajoute à la zone de saisie, et rien ne part sans un clic sur Envoyer.
// La langue de dictée suit celle de l'interface.
//
// Pendant l'écoute, un vu-mètre montre le niveau du micro (getUserMedia + AnalyserNode,
// calcul fait dans la page, rien n'est enregistré ni envoyé). Il prouve que le son arrive,
// et la dictée prévient quand le micro reste muet ou quand la parole entendue ne donne
// aucun texte, au lieu de rester silencieuse.

import { lang, T } from './i18n/lang.js'

export const MIC_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/></svg>`

const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition

// Vrai quand le navigateur sait au moins dire si la reconnaissance locale est possible.
export const voiceSupported = () => typeof Recognition === 'function' && typeof Recognition.available === 'function'

// Langue sans région (fr, en) : avec fr-FR, Chrome 158 sous Windows annonce le modèle local
// comme disponible, entend la parole, mais ne renvoie jamais de texte. Avec fr, il transcrit.
const LANG_TAG = lang === 'fr' ? 'fr' : 'en'
const OPTIONS = { langs: [LANG_TAG], processLocally: true }

// Ajoute un morceau de texte dicté à la suite de ce qui est déjà écrit.
function join(before, piece) {
  const text = piece.trim()
  if (!text) return before
  if (!before) return text.charAt(0).toUpperCase() + text.slice(1)
  return /\s$/.test(before) ? before + text : `${before} ${text}`
}

// Délais des contrôles : micro muet, puis parole entendue sans texte reconnu.
const SILENCE_MS = 4000
const NO_TEXT_MS = 8000
// Niveau (valeur RMS) sous lequel le micro est tenu pour muet.
const SILENCE_LEVEL = 0.004
const BARS = 24

// Vu-mètre : rond rouge, barres du niveau des dernières secondes, nom du micro.
// meter : conteneur vide fourni par l'appelant. Le niveau se lit sur un flux du micro
// ouvert à part, dans la page, et fermé à l'arrêt de la dictée.
function createMeter(meter) {
  meter.classList.add('voice-meter')
  meter.hidden = true
  meter.innerHTML = '<span class="voice-meter-dot" aria-hidden="true"></span><canvas class="voice-meter-wave" aria-hidden="true"></canvas><span class="voice-meter-label"></span>'
  const canvas = meter.querySelector('canvas')
  const label = meter.querySelector('.voice-meter-label')
  let stream = null
  let context = null
  let timer = 0
  let levels = []
  let loudest = 0

  function draw() {
    const ratio = globalThis.devicePixelRatio || 1
    const w = canvas.clientWidth || 72
    const h = canvas.clientHeight || 18
    if (canvas.width !== Math.round(w * ratio)) { canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio) }
    const g = canvas.getContext('2d')
    g.setTransform(ratio, 0, 0, ratio, 0, 0)
    g.clearRect(0, 0, w, h)
    g.fillStyle = getComputedStyle(canvas).color
    const step = w / BARS
    levels.forEach((level, i) => {
      // Échelle racine : la voix parlée reste lisible sans saturer.
      const bar = Math.max(2, Math.min(h, Math.sqrt(level) * h * 2.6))
      g.fillRect(i * step + 1, (h - bar) / 2, Math.max(1.5, step - 2), bar)
    })
  }

  return {
    get loudest() { return loudest },
    async start() {
      levels = new Array(BARS).fill(0)
      loudest = 0
      label.textContent = T('Listening', 'Écoute')
      meter.hidden = false
      draw()
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const name = stream.getAudioTracks()[0]?.label.replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)$/i, '')
      if (name) {
        label.textContent = name
        meter.title = T(`Microphone used: ${name}`, `Micro utilisé : ${name}`)
      }
      context = new AudioContext()
      const analyser = context.createAnalyser()
      analyser.fftSize = 1024
      context.createMediaStreamSource(stream).connect(analyser)
      const samples = new Float32Array(analyser.fftSize)
      timer = setInterval(() => {
        analyser.getFloatTimeDomainData(samples)
        let sum = 0
        for (const v of samples) sum += v * v
        const level = Math.sqrt(sum / samples.length)
        loudest = Math.max(loudest, level)
        levels.push(level)
        levels.shift()
        draw()
      }, 80)
      return name
    },
    stop() {
      clearInterval(timer)
      timer = 0
      stream?.getTracks().forEach((t) => t.stop())
      stream = null
      context?.close().catch(() => {})
      context = null
      meter.hidden = true
      meter.removeAttribute('title')
    },
  }
}

// button : le bouton micro. input : la zone de saisie. interim : élément qui montre le
// texte provisoire. notify(kind, text) : message dans le fil du chat. onText() : après
// chaque ajout, pour que la zone de saisie s'ajuste à son contenu. meter : conteneur du
// vu-mètre, rempli ici.
export function setupVoiceInput({ button, input, interim, notify, onText, meter }) {
  let recognition = null
  let active = false // l'utilisateur veut dicter, même entre deux redémarrages
  let preparing = false
  const level = meter ? createMeter(meter) : null
  let silenceTimer = 0
  let noTextTimer = 0
  let warnedNoText = false
  const clearChecks = () => { clearTimeout(silenceTimer); clearTimeout(noTextTimer) }

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
    clearChecks()
    level?.stop()
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
    // Parole détectée : si aucun texte ne revient, on le dit au lieu de rester muet.
    r.onspeechstart = () => {
      clearTimeout(noTextTimer)
      if (warnedNoText) return
      noTextTimer = setTimeout(() => {
        warnedNoText = true
        notify('error', T(
          'Speech is heard, but the browser returns no text. Stop and start dictation again. If it persists, restart the browser: its on-device speech model may be updating.',
          "La voix est entendue, mais le navigateur ne renvoie aucun texte. Arrêtez puis relancez la dictée. Si cela persiste, redémarrez le navigateur : son modèle de reconnaissance local est peut-être en cours de mise à jour."))
      }, NO_TEXT_MS)
    }
    r.onresult = (e) => {
      clearTimeout(noTextTimer)
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

  // Vu-mètre et contrôle du micro muet. Un échec ici n'arrête pas la dictée : la
  // reconnaissance a son propre accès au micro et signale ses erreurs elle-même.
  async function watchLevel() {
    if (!level) return
    let name = ''
    try {
      name = await level.start()
    } catch (err) {
      if (!active) return
      notify('error', err?.name === 'NotAllowedError'
        ? T('Microphone access refused. Allow it in the site settings of the browser, then try again.', "Accès au micro refusé. Autorisez-le dans les réglages du site du navigateur, puis réessayez.")
        : T(`Microphone level unavailable: ${err?.message || err}`, `Niveau du micro indisponible : ${err?.message || err}`))
      return
    }
    if (!active) { level.stop(); return }
    silenceTimer = setTimeout(() => {
      if (!active || level.loudest >= SILENCE_LEVEL) return
      const mic = name ? `« ${name} »` : ''
      notify('error', T(
        `The microphone ${name ? `"${name}" ` : ''}picks up no sound. Check that it is not muted, or choose another microphone in the browser settings (site settings, Microphone).`,
        `Le micro ${mic ? `${mic} ` : ''}ne capte aucun son. Vérifiez qu'il n'est pas coupé, ou choisissez un autre micro dans les réglages du navigateur (paramètres du site, Micro).`))
    }, SILENCE_MS)
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
      warnedNoText = false
      listen()
      watchLevel()
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
