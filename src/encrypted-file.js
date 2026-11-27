// Fichier .bpmn chiffré par mot de passe (Exporter > Fichier .bpmn chiffré, Ouvrir).
//
// Le chiffrement se fait dans le navigateur (Web Crypto) : AES-GCM 256 bits, clé tirée
// du mot de passe par PBKDF2-SHA-256 (600 000 tours, sel aléatoire). Le mot de passe
// n'est ni gardé ni envoyé : perdu, le fichier ne s'ouvre plus. Le fichier est un petit
// JSON (extension .bpmn.enc) que seul BPMN Pilot sait rouvrir.

import { T } from './i18n/lang.js'
import { addDialogClose } from './dialog-close.js'

export const ENCRYPTED_EXT = 'bpmn.enc'
const FORMAT = 'bpmn-pilot-encrypted'
const ITERATIONS = 600000
const MIN_LENGTH = 8

const b64 = (bytes) => btoa(String.fromCharCode(...bytes))
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function deriveKey(password, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export async function encryptText(text, password) {
  if (String(password).length < MIN_LENGTH) throw new Error('password too short')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt, ITERATIONS)
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text)))
  // Le bloc de données dépasse vite la limite d'arguments de String.fromCharCode : par morceaux.
  let bin = ''
  for (let i = 0; i < data.length; i += 0x8000) bin += String.fromCharCode(...data.subarray(i, i + 0x8000))
  return JSON.stringify({
    format: FORMAT, version: 1,
    cipher: 'AES-256-GCM', kdf: 'PBKDF2-SHA-256', iterations: ITERATIONS,
    salt: b64(salt), iv: b64(iv), data: btoa(bin),
  }, null, 1) + '\n'
}

export function isEncrypted(text) {
  return /^\s*\{/.test(text) && text.includes(`"${FORMAT}"`)
}

// Lève une erreur « wrong password » si le mot de passe ne convient pas.
export async function decryptText(content, password) {
  let box
  try { box = JSON.parse(content) } catch { throw new Error('not an encrypted BPMN Pilot file') }
  if (box?.format !== FORMAT || box.version !== 1) throw new Error('not an encrypted BPMN Pilot file')
  const key = await deriveKey(password, unb64(box.salt), Number(box.iterations) || ITERATIONS)
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.data))
    return new TextDecoder().decode(plain)
  } catch {
    throw new Error('wrong password')
  }
}

// Fenêtre de mot de passe. confirm : demander deux fois (chiffrement).
// Renvoie le mot de passe, ou null si on annule.
export function askPassword({ confirm = false, fileName = '' } = {}) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog')
    dialog.id = 'password-dialog'
    dialog.innerHTML = `
      <form method="dialog">
        <h2>${confirm ? T('Encrypted .bpmn file', 'Fichier .bpmn chiffré') : T('Open an encrypted file', 'Ouvrir un fichier chiffré')}</h2>
        <p class="hint"></p>
        <label>${T('Password', 'Mot de passe')}<input type="password" id="pw-1" autocomplete="${confirm ? 'new-password' : 'current-password'}" minlength="${MIN_LENGTH}" required></label>
        ${confirm ? `<label>${T('Confirm the password', 'Confirmer le mot de passe')}<input type="password" id="pw-2" autocomplete="new-password" required></label>` : ''}
        <p class="error" role="alert"></p>
        <div class="actions"><span class="grow"></span>
          <button type="button" class="btn" id="pw-cancel">${T('Cancel', 'Annuler')}</button>
          <button type="submit" class="btn primary" id="pw-ok">${confirm ? T('Encrypt and save', 'Chiffrer et enregistrer') : T('Open', 'Ouvrir')}</button>
        </div>
      </form>`
    dialog.querySelector('.hint').textContent = confirm
      ? T(`Encrypted in your browser (AES-256). The password is neither kept nor sent: if it is lost, the file can no longer be opened. At least ${MIN_LENGTH} characters. Only BPMN Pilot opens this file.`,
        `Chiffré dans votre navigateur (AES-256). Le mot de passe n'est ni gardé ni envoyé : perdu, le fichier ne s'ouvre plus. ${MIN_LENGTH} caractères au moins. Seul BPMN Pilot ouvre ce fichier.`)
      : T(`${fileName} is encrypted. Enter its password; it is used in your browser only.`, `${fileName} est chiffré. Saisissez son mot de passe : il ne sert que dans votre navigateur.`)
    addDialogClose(dialog)
    document.body.appendChild(dialog)
    const error = dialog.querySelector('.error')
    const first = dialog.querySelector('#pw-1')
    const done = (value) => { dialog.close(); dialog.remove(); resolve(value) }
    dialog.addEventListener('cancel', () => done(null))
    dialog.addEventListener('close', () => { if (dialog.isConnected) done(null) })
    dialog.querySelector('#pw-cancel').addEventListener('click', () => done(null))
    dialog.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault()
      const pw = first.value
      if (pw.length < MIN_LENGTH) { error.textContent = T(`At least ${MIN_LENGTH} characters.`, `${MIN_LENGTH} caractères au moins.`); return }
      if (confirm && pw !== dialog.querySelector('#pw-2').value) { error.textContent = T('The two passwords differ.', 'Les deux mots de passe diffèrent.'); return }
      done(pw)
    })
    dialog.showModal()
    first.focus()
  })
}
