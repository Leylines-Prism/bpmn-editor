// Garde du relais des fournisseurs réglés dans la fenêtre Options.
//
// Le relais appelle une adresse choisie par la page. Les adresses de lien local
// (169.254.0.0/16, fe80::/10) et l'adresse IPv6 des métadonnées d'AWS servent aux
// services de métadonnées des hébergeurs cloud, jamais à un fournisseur de modèles :
// elles sont refusées, quelle que soit leur écriture (nom DNS, IPv4 dans IPv6, NAT64),
// et les redirections ne sont pas suivies.

import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

const FORBIDDEN_NAMES = new Set(['metadata.google.internal', 'metadata.google.internal.'])

// Huit groupes de 16 bits d'une adresse IPv6, ou null.
function ipv6Groups(address) {
  let text = address.toLowerCase()
  // Quatre derniers octets écrits en IPv4 (::ffff:169.254.169.254).
  const dotted = text.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/)
  if (dotted) {
    const bytes = dotted[2].split('.').map(Number)
    text = `${dotted[1]}${((bytes[0] << 8) | bytes[1]).toString(16)}:${((bytes[2] << 8) | bytes[3]).toString(16)}`
  }
  const [head, tail] = text.split('::')
  const left = head ? head.split(':') : []
  const right = tail ? tail.split(':') : []
  const missing = 8 - left.length - right.length
  if (text.includes('::') ? missing < 1 : missing !== 0) return null
  const groups = [...left, ...Array(text.includes('::') ? missing : 0).fill('0'), ...right].map((g) => parseInt(g, 16))
  return groups.length === 8 && groups.every((g) => g >= 0 && g <= 0xffff) ? groups : null
}

const isLinkLocalV4 = (address) => address.startsWith('169.254.')

// Adresse IP (sans crochets) interdite au relais.
export function isForbiddenAddress(address) {
  const ip = String(address).replace(/^\[|\]$/g, '').replace(/%.*$/, '')
  if (isIP(ip) === 4) return isLinkLocalV4(ip)
  if (isIP(ip) !== 6) return false
  const g = ipv6Groups(ip)
  if (!g) return true
  if ((g[0] & 0xffc0) === 0xfe80) return true // fe80::/10
  if (g[0] === 0xfd00 && g[1] === 0x0ec2 && g.slice(2, 7).every((x) => x === 0) && g[7] === 0x0254) return true // fd00:ec2::254
  // IPv4 dans IPv6 : ::ffff:a.b.c.d, ::a.b.c.d et NAT64 64:ff9b::a.b.c.d.
  const mapped = g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)
  const nat64 = g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)
  if (mapped || nat64) return isLinkLocalV4(`${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`)
  return false
}

export class RelayBlockedError extends Error {}

// Vérifie le nom d'hôte d'une adresse et toutes les adresses IP qu'il désigne.
export async function checkRelayHost(url, { resolve = lookup } = {}) {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (FORBIDDEN_NAMES.has(host)) throw new RelayBlockedError('address not allowed')
  const addresses = isIP(host) ? [host] : (await resolve(host, { all: true, verbatim: true })).map((a) => a.address)
  if (!addresses.length || addresses.some(isForbiddenAddress)) throw new RelayBlockedError('address not allowed')
}

// fetch du relais : contrôle l'hôte avant chaque appel et ne suit pas les redirections.
export async function relayFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  await checkRelayHost(url)
  return fetch(input, { ...init, redirect: 'manual' })
}
