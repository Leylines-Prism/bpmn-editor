// Diagrammes enregistrés sur le serveur (mcp/diagrams.js), dans un dossier temporaire.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
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
    assert.deepEqual(await readdir(dir), ['.index.json'])
  }))

test('a missing diagram reads and renames as null', () =>
  withStore(async (store) => {
    assert.equal(await store.get('missing'), null)
    assert.equal(await store.rename('missing', 'Name'), null)
  }))

test('files take the name of their diagram, and renaming renames the file', () =>
  withStore(async (store, dir) => {
    await store.put('d1', 'Order process', XML)
    assert.ok((await readdir(dir)).includes('Order process.bpmn'))
    await store.put('d2', 'order process', XML)
    await store.put('d3', 'Order process', XML)
    const files = (await readdir(dir)).filter((f) => !f.startsWith('.')).sort()
    assert.deepEqual(files, ['Order process (3).bpmn', 'Order process.bpmn', 'order process (2).bpmn'])

    await store.rename('d1', 'Invoices')
    assert.ok((await readdir(dir)).includes('Invoices.bpmn'))
    assert.ok(!(await readdir(dir)).includes('Order process.bpmn'))
    assert.equal((await store.get('d1')).xml, XML)

    // Même nom, fichier inchangé ; sauvegarde sous un nouveau nom : le fichier suit.
    await store.put('d2', 'order process', XML + ' ')
    assert.equal((await store.get('d2')).file, 'order process (2).bpmn')
    await store.put('d2', 'Payments', XML)
    assert.equal((await store.get('d2')).file, 'Payments.bpmn')
  }))

test('names that could leave the folder or clash with Windows stay inside', () =>
  withStore(async (store, dir) => {
    await store.put('a', '../../etc/passwd', XML)
    await store.put('b', '.hidden', XML)
    await store.put('c', 'CON', XML)
    await store.put('d', 'a:b*c?', XML)
    const files = (await readdir(dir)).filter((f) => f !== '.index.json').sort()
    assert.deepEqual(files, ['_CON.bpmn', 'a-b-c-.bpmn', 'etc-passwd.bpmn', 'hidden.bpmn'])
  }))

test('a file deleted by hand leaves the list, and a symlink is never followed', () =>
  withStore(async (store, dir) => {
    await store.put('d1', 'One', XML)
    await rm(join(dir, 'One.bpmn'))
    assert.deepEqual(await store.list(), [])
    assert.equal(await store.get('d1'), null)

    await store.put('d2', 'Two', XML)
    await rm(join(dir, 'Two.bpmn'))
    await symlink('/etc/hostname', join(dir, 'Two.bpmn'))
    assert.equal(await store.get('d2'), null)
  }))

test('concurrent saves never share a file', () =>
  withStore(async (store, dir) => {
    await Promise.all(['a', 'b', 'c', 'd', 'e'].map((id) => store.put(id, 'Same', XML)))
    assert.equal((await readdir(dir)).filter((f) => f.endsWith('.bpmn')).length, 5)
    assert.equal((await store.list()).length, 5)
  }))

test('diagrams of older versions are renamed after their name', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bpmn-diagrams-'))
  try {
    await writeFile(join(dir, 'abc-1.bpmn'), XML)
    await writeFile(join(dir, 'abc-1.json'), JSON.stringify({ id: 'abc-1', name: 'Old one', updatedAt: '2026-01-01T00:00:00.000Z', size: 1 }))
    const store = new DiagramStore(dir)
    assert.deepEqual((await store.list()).map((d) => d.name), ['Old one'])
    assert.deepEqual((await readdir(dir)).sort(), ['.index.json', 'Old one.bpmn'])
    assert.equal((await store.get('abc-1')).xml, XML)
    assert.match(await readFile(join(dir, '.index.json'), 'utf8'), /Old one\.bpmn/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a .bpmn file dropped by hand in the folder is listed and can be opened', () =>
  withStore(async (store, dir) => {
    await writeFile(join(dir, 'Dropped by hand.bpmn'), XML)
    await writeFile(join(dir, 'notes.txt'), 'not a diagram')
    await writeFile(join(dir, 'Too big.bpmn'), Buffer.alloc(10 * 1024 * 1024 + 1))
    const list = await store.list()
    assert.deepEqual(list.map((d) => d.name).sort(), ['Dropped by hand', 'Too big'])
    const dropped = list.find((d) => d.name === 'Dropped by hand')
    assert.ok(DiagramStore.validId(dropped.id))
    assert.equal((await store.get(dropped.id)).xml, XML)
    assert.equal(await store.get(list.find((d) => d.name === 'Too big').id), null)
    // Listé une seule fois, même après plusieurs lectures.
    assert.equal((await store.list()).length, 2)
    await store.rename(dropped.id, 'Renamed')
    assert.ok((await readdir(dir)).includes('Renamed.bpmn'))
  }))

test('decision models are kept as .dmn files, listed with their kind', () =>
  withStore(async (store, dir) => {
    const DMN = '<?xml version="1.0" encoding="UTF-8"?><definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" id="d" name="Risk" namespace="x"/>'
    await store.put('p1', 'Credit', XML)
    const meta = await store.put('m1', 'Credit', DMN, 'dmn')
    assert.equal(meta.kind, 'dmn')
    assert.deepEqual((await readdir(dir)).filter((f) => !f.startsWith('.')).sort(), ['Credit.bpmn', 'Credit.dmn'])
    const kinds = Object.fromEntries((await store.list()).map((d) => [d.id, d.kind]))
    assert.deepEqual(kinds, { p1: 'bpmn', m1: 'dmn' })
    assert.equal((await store.get('m1')).xml, DMN)
    // Renommer garde l'extension ; un .dmn déposé à la main entre dans la liste.
    await store.rename('m1', 'Risk rules')
    assert.ok((await readdir(dir)).includes('Risk rules.dmn'))
    await writeFile(join(dir, 'Pricing.dmn'), DMN)
    const adopted = (await store.list()).find((d) => d.name === 'Pricing')
    assert.equal(adopted.kind, 'dmn')
  }))
