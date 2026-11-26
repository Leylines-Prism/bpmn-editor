// Tests par propriétés (fast-check) des gardes du serveur MCP : noms de fichiers, identifiants
// de diagrammes et adresses refusées au relais. fast-check génère des centaines d'entrées au
// hasard, réduit tout contre-exemple au plus simple et affiche la graine pour le rejouer.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BlockList } from 'node:net'
import { join, relative, isAbsolute, sep } from 'node:path'
import fc from 'fast-check'
import { safeBaseName } from '../mcp/files.js'
import { DiagramStore } from '../mcp/diagrams.js'
import { isForbiddenAddress } from '../mcp/relay-guard.js'

const RUNS = { numRuns: 2000 }
const DIR = join('srv', 'data')

// Le fichier « name.ext » reste directement dans DIR.
function staysInDir(name, ext) {
  const rel = relative(DIR, join(DIR, `${name}.${ext}`))
  return rel !== '' && !isAbsolute(rel) && !rel.startsWith('..') && !rel.includes(sep)
}

// Texte qui mêle caractères piégés et Unicode quelconque.
const nastyText = fc.oneof(
  fc.string({ unit: 'binary' }),
  fc.array(
    fc.oneof(
      fc.constantFrom('.', '..', '/', '\\', ':', '*', '?', '"', '<', '>', '|', ' ', '-', '\u0000', '\u001f', '\u007f', '\u0085', 'é', '́', '😀', 'con', 'NUL', 'com1', 'LPT¹'),
      fc.string({ unit: 'grapheme' }),
    ),
    { maxLength: 80 },
  ).map((parts) => parts.join('')),
)

test('safeBaseName always gives a safe, visible file name', () => {
  fc.assert(
    fc.property(nastyText, (input) => {
      const name = safeBaseName(input)
      assert.ok(name.length > 0)
      assert.doesNotMatch(name, /[\u0000-\u001f\u007f-\u009f<>:"/\\|?*]/)
      assert.doesNotMatch(name, /^[.\s-]/, 'no hidden file, no leading dash')
      assert.doesNotMatch(name, /[.\s]$/, 'no trailing dot or space')
      assert.doesNotMatch(name.split('.')[0].trim(), /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])$/i)
      // Le nom le plus long que le serveur écrit tient dans les 255 octets des systèmes de fichiers.
      assert.ok(Buffer.byteLength(`${name} (999).bpmn`) <= 255)
      assert.ok(staysInDir(name, 'bpmn'))
    }),
    RUNS,
  )
})

test('safeBaseName ignores values that are not strings', () => {
  fc.assert(
    fc.property(fc.anything().filter((v) => typeof v !== 'string'), (value) => {
      assert.equal(safeBaseName(value), 'diagram')
    }),
  )
})

test('validId accepts only ids that stay in the folder', () => {
  fc.assert(
    fc.property(fc.oneof(nastyText, fc.stringMatching(/^[a-z0-9][a-z0-9-]{0,63}$/)), (id) => {
      if (!DiagramStore.validId(id)) return
      assert.match(id, /^[a-z0-9-]+$/)
      assert.ok(id.length <= 64)
      assert.ok(staysInDir(id, 'bpmn'))
    }),
    RUNS,
  )
})

test('validId accepts every id the server can create', () => {
  fc.assert(
    fc.property(fc.uuid(), (id) => {
      assert.equal(DiagramStore.validId(id), true)
    }),
  )
})

// Liste de référence, tenue par Node, des adresses que le relais doit refuser.
const forbidden = new BlockList()
forbidden.addSubnet('169.254.0.0', 16, 'ipv4')
forbidden.addSubnet('fe80::', 10, 'ipv6')
forbidden.addAddress('fd00:ec2::254', 'ipv6')
forbidden.addSubnet('::ffff:a9fe:0', 112, 'ipv6') // ::ffff:169.254.x.x
forbidden.addSubnet('::a9fe:0', 112, 'ipv6') // ::169.254.x.x
forbidden.addSubnet('64:ff9b::a9fe:0', 112, 'ipv6') // NAT64

const linkLocalV4 = fc.tuple(fc.nat(255), fc.nat(255)).map(([c, d]) => `169.254.${c}.${d}`)
const anyV4 = fc.oneof(fc.ipV4(), linkLocalV4)

test('isForbiddenAddress matches the reference list for any IPv4 address', () => {
  fc.assert(
    fc.property(anyV4, (ip) => {
      assert.equal(isForbiddenAddress(ip), forbidden.check(ip, 'ipv4'), ip)
    }),
    RUNS,
  )
})

test('isForbiddenAddress matches the reference list for any IPv6 address', () => {
  const linkLocalV6 = fc
    .tuple(fc.integer({ min: 0xfe80, max: 0xfebf }), fc.array(fc.nat(0xffff), { minLength: 7, maxLength: 7 }))
    .map(([first, rest]) => [first, ...rest].map((g) => g.toString(16)).join(':'))
  fc.assert(
    fc.property(fc.oneof(fc.ipV6(), linkLocalV6), (ip) => {
      assert.equal(isForbiddenAddress(ip), forbidden.check(ip, 'ipv6'), ip)
    }),
    RUNS,
  )
})

test('isForbiddenAddress gives the same answer in every notation of an IPv4 address', () => {
  fc.assert(
    fc.property(anyV4, fc.boolean(), (ip, upper) => {
      const [a, b, c, d] = ip.split('.').map(Number)
      const hex = `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
      const expected = isForbiddenAddress(ip)
      for (let form of [`::ffff:${ip}`, `::ffff:${hex}`, `[::ffff:${hex}]`, `0:0:0:0:0:ffff:${hex}`, `::${ip}`, `64:ff9b::${hex}`, `64:ff9b::${ip}`]) {
        if (upper) form = form.toUpperCase()
        assert.equal(isForbiddenAddress(form), expected, form)
      }
    }),
    RUNS,
  )
})
