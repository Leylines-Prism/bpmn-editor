// Exports enregistrés sur le serveur (mcp/exports.js), dans un dossier temporaire.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ExportStore, MAX_EXPORT_BYTES } from '../mcp/exports.js'
import { safeBaseName } from '../mcp/files.js'

const XML = '<?xml version="1.0" encoding="UTF-8"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"/>'
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)])

test('only the five formats are accepted, with matching content', () => {
  assert.ok(ExportStore.validContent('bpmn', Buffer.from(XML)))
  assert.ok(ExportStore.validContent('xml', Buffer.from('﻿' + XML)))
  assert.ok(ExportStore.validContent('svg', Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>')))
  assert.ok(ExportStore.validContent('png', PNG))
  assert.ok(ExportStore.validContent('pdf', Buffer.from('%PDF-1.7\n')))

  assert.equal(ExportStore.validContent('exe', PNG), false)
  assert.equal(ExportStore.validContent('__proto__', PNG), false)
  assert.equal(ExportStore.validContent('png', Buffer.from('%PDF-1.7')), false)
  assert.equal(ExportStore.validContent('pdf', PNG), false)
  assert.equal(ExportStore.validContent('svg', Buffer.from('<html><script>')), false)
  assert.equal(ExportStore.validContent('bpmn', Buffer.from([0xff, 0xfe, 0x3c])), false)
  assert.equal(ExportStore.validContent('pdf', Buffer.alloc(0)), false)
  assert.equal(ExportStore.validContent('pdf', Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(MAX_EXPORT_BYTES)])), false)
})

test('safeBaseName keeps readable names and removes what is unsafe', () => {
  assert.equal(safeBaseName('Mon processus'), 'Mon processus')
  assert.equal(safeBaseName('../x/y'), 'x-y')
  assert.equal(safeBaseName('nul.txt'), '_nul.txt')
  assert.equal(safeBaseName('  ... '), 'diagram')
  assert.equal(safeBaseName('end. '), 'end')
  assert.ok(Buffer.byteLength(safeBaseName('é'.repeat(300))) <= 200)
})

test('exports never overwrite a file and are not world-readable', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bpmn-exports-'))
  const previous = process.umask(0o027)
  try {
    const store = new ExportStore(dir)
    await writeFile(join(dir, 'Order.pdf'), 'mine')
    assert.equal(await store.save('Order', 'pdf', Buffer.from('%PDF-1')), 'Order (2).pdf')
    assert.equal(await store.save('Order', 'pdf', Buffer.from('%PDF-1')), 'Order (3).pdf')
    assert.equal(await store.save('Order', 'png', PNG), 'Order.png')
    assert.deepEqual((await readdir(dir)).sort(), ['Order (2).pdf', 'Order (3).pdf', 'Order.pdf', 'Order.png'])
    assert.equal((await stat(join(dir, 'Order.png'))).mode & 0o777, 0o640)
  } finally {
    process.umask(previous)
    await rm(dir, { recursive: true, force: true })
  }
})
