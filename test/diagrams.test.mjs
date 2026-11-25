// Diagrammes enregistrés sur le serveur (mcp/diagrams.js), dans un dossier temporaire.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DiagramStore } from '../mcp/diagrams.js'

const XML = '<?xml version="1.0" encoding="UTF-8"?><definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"/>'

async function withStore(run) {
  const dir = await mkdtemp(join(tmpdir(), 'bpmn-diagrams-'))
  try {
    await run(new DiagramStore(dir), dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test('validId rejects anything that could leave the folder', () => {
  assert.ok(DiagramStore.validId('abc-123'))
  for (const id of ['../etc/passwd', 'a/b', 'ABC', '-abc', '', 'a'.repeat(65), null, 42]) {
    assert.equal(DiagramStore.validId(id), false, String(id))
  }
})

test('cleanName removes control characters and refuses empty names', () => {
  assert.equal(DiagramStore.cleanName('  Order\u0000 process\n '), 'Order process')
  assert.equal(DiagramStore.cleanName('x'.repeat(200)).length, 120)
  assert.equal(DiagramStore.cleanName('   '), null)
  assert.equal(DiagramStore.cleanName(undefined), null)
})

test('a diagram can be saved, listed, read, renamed and removed', () =>
  withStore(async (store, dir) => {
    const meta = await store.put('d1', 'First', XML)
    assert.equal(meta.size, Buffer.byteLength(XML))

    assert.deepEqual((await store.list()).map((d) => d.id), ['d1'])
    assert.equal((await store.get('d1')).xml, XML)

    assert.equal((await store.rename('d1', 'Renamed')).name, 'Renamed')
    assert.equal((await store.get('d1')).name, 'Renamed')

    await store.remove('d1')
    assert.equal(await store.get('d1'), null)
    assert.deepEqual(await readdir(dir), [])
  }))

test('a missing diagram reads and renames as null', () =>
  withStore(async (store) => {
    assert.equal(await store.get('missing'), null)
    assert.equal(await store.rename('missing', 'Name'), null)
  }))
