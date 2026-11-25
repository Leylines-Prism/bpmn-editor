// Noms de fichiers lisibles dans les dossiers du serveur (diagrammes et exports).
//
// Le dossier peut être ouvert dans un explorateur de fichiers, sous Linux, Windows ou macOS :
// les noms suivent les règles les plus strictes des trois. Aucun nom reçu ne peut sortir du
// dossier, écraser un fichier existant ni créer un fichier caché.

import { open, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

export const FILE_MODE = 0o640
export const DIR_MODE = 0o750

const MAX_CHARS = 120
// Les systèmes de fichiers limitent un nom à 255 octets : de la marge pour « (2) » et l'extension.
const MAX_BYTES = 200
// Noms réservés par Windows, avec ou sans extension.
const RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])$/i

// Nom de base (sans extension) sûr pour un fichier, tiré du nom donné dans l'éditeur.
export function safeBaseName(name, fallback = 'diagram') {
  let s = typeof name === 'string' ? name.normalize('NFC') : ''
  s = s
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    // Pas de fichier caché ni de « .. » au début, pas de point ni d'espace à la fin (Windows).
    .replace(/^[.\s-]+/, '')
  s = [...s].slice(0, MAX_CHARS).join('')
  while (Buffer.byteLength(s) > MAX_BYTES) s = [...s].slice(0, -1).join('')
  s = s.replace(/[.\s]+$/, '')
  if (!s) s = fallback
  if (RESERVED.test(s.split('.')[0].trim())) s = '_' + s
  return s
}

export function candidateName(base, ext, n) {
  return n === 1 ? `${base}.${ext}` : `${base} (${n}).${ext}`
}

// Noms présents dans le dossier, en minuscules : deux fichiers qui ne diffèrent que par la
// casse se gêneraient sous Windows et macOS.
export async function takenNames(dir) {
  return new Set((await readdir(dir)).map((f) => f.toLowerCase()))
}

// Crée un nouveau fichier « base.ext », ou « base (2).ext »… si le nom est pris. Jamais
// d'écrasement : l'ouverture exclusive (O_EXCL) échoue si un fichier, un dossier ou un lien
// porte déjà ce nom, et ne suit pas les liens symboliques. Renvoie le nom retenu.
export async function createUnique(dir, base, ext, content, { exclude } = {}) {
  const taken = await takenNames(dir)
  if (exclude) taken.delete(exclude.toLowerCase())
  for (let n = 1; n < 1000; n++) {
    const file = candidateName(base, ext, n)
    if (taken.has(file.toLowerCase())) continue
    let handle
    try {
      handle = await open(join(dir, file), 'wx', FILE_MODE)
    } catch (err) {
      if (err.code === 'EEXIST') continue
      throw err
    }
    try {
      await handle.writeFile(content)
      await handle.close()
    } catch (err) {
      await handle.close().catch(() => {})
      await rm(join(dir, file), { force: true })
      throw err
    }
    return file
  }
  throw new Error('No free file name')
}
