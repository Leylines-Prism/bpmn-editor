import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))

// Le serveur MCP annonce la version de mcp/package.json aux clients et aux annuaires :
// elle doit suivre celle de l'application à chaque release.
test('the MCP server version matches the application version', () => {
  const app = read('../package.json').version
  assert.equal(read('../mcp/package.json').version, app, 'set "version" in mcp/package.json')
  const lock = read('../mcp/package-lock.json')
  assert.equal(lock.version, app, 'run npm install in mcp/ to update mcp/package-lock.json')
  assert.equal(lock.packages[''].version, app, 'run npm install in mcp/ to update mcp/package-lock.json')
})
