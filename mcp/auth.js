// Accès à /mcp sans jeton. Quand le serveur accepte un nom d'hôte autre que localhost, il est
// joignable depuis d'autres machines : sans MCP_TOKEN, /mcp reste fermé (réponse 401), sauf si
// MCP_AUTH=off le rouvre exprès (réseau de confiance, ou proxy qui authentifie déjà /mcp).

export const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '::1']

const OFF = /^(off|false|0|no)$/i

// host : MCP_HOST. allowedHosts : MCP_ALLOWED_HOSTS découpé. token : MCP_TOKEN. auth : MCP_AUTH.
export function mcpAccess({ host, allowedHosts = [], token = '', auth = '' }) {
  const publicHosts = LOCAL_HOSTS.includes(host) ? [] : allowedHosts.filter((h) => !LOCAL_HOSTS.includes(h))
  const authOff = OFF.test(String(auth).trim())
  return {
    publicHosts,
    authOff,
    // /mcp fermé : nom public accepté, pas de jeton, et pas de MCP_AUTH=off.
    locked: publicHosts.length > 0 && !token && !authOff,
    // /mcp ouvert sans jeton sur un nom public, par choix explicite.
    openOnPurpose: publicHosts.length > 0 && !token && authOff,
  }
}

export const LOCKED_MESSAGE =
  'MCP is closed: this server accepts a non-local host name but MCP_TOKEN is empty. ' +
  'Set MCP_TOKEN (the "Connect an agent" window generates one), or set MCP_AUTH=off to allow access without a token.'
