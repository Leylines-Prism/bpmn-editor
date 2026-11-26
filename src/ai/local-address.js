// Adresse d'un fournisseur sur la machine ou le réseau local (Ollama, LiteLLM, vLLM…) :
// sert au bandeau du chat, qui dit où partent les messages. Ce module n'importe rien.

const PRIVATE_V4 = [
  [10, 0, 8],
  [127, 0, 8],
  [172, 16, 12],
  [192, 168, 16],
  [100, 64, 10], // espace partagé (CGNAT), utilisé par les réseaux privés virtuels
]

function privateV4(host) {
  const parts = host.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false
  const value = ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]
  return PRIVATE_V4.some(([a, b, bits]) => {
    const base = ((a << 24) >>> 0) + (b << 16)
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
    return ((value & mask) >>> 0) === ((base & mask) >>> 0)
  })
}

// Vrai pour localhost, une adresse privée, un nom sans point (service Docker) ou en .local, .internal, .lan, .home.arpa.
export function isLocalAddress(url) {
  let host
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, '')
  } catch {
    return false
  }
  if (!host) return false
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1') return true
  if (/^f[cd][0-9a-f]{2}:/.test(host) || host.startsWith('fe80:')) return true
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return privateV4(host)
  if (!host.includes('.')) return true
  return /\.(local|internal|lan|home\.arpa)$/.test(host)
}
