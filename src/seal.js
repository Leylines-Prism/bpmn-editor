// Chiffrement de l'adresse mail par preuve de travail : module d'obfuscation d'ALTCHA
// (altcha/plugins/obfuscation, licence MIT). Sert au build (vite.config.js, qui chiffre)
// et au navigateur (feedback.js, qui déchiffre au clic).
//
// Le README d'ALTCHA 3.7.0 montre `import { ObfuscationPlugin } from
// 'altcha/plugins/obfuscation'`, mais le fichier publié n'exporte rien : il inscrit la
// classe dans le registre global $altcha.plugins. On la prend donc dans ce registre,
// reconnue à ses méthodes statiques obfuscate et deobfuscate.
import 'altcha/plugins/obfuscation'

export const Obfuscation = [...(globalThis.$altcha?.plugins ?? [])].find(
  (p) => typeof p?.obfuscate === 'function' && typeof p?.deobfuscate === 'function',
)
if (!Obfuscation) throw new Error('ALTCHA obfuscation plugin not found')
