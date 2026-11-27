// Modules du mode Expert (src/expert-modules.js) : valeurs par défaut, reprise de l'ancien
// interrupteur DMN, module qui en demande un autre, choix retenu dans le navigateur.
import { test } from 'node:test'
import assert from 'node:assert/strict'

const store = new Map([['bpmn-editor-dmn', 'on']])
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
}
const classes = new Set()
const classList = { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), contains: (c) => classes.has(c), add() {}, remove() {} }
globalThis.document ??= { documentElement: { classList }, body: { classList }, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] }
globalThis.window ??= globalThis
globalThis.dispatchEvent ??= () => true
globalThis.CustomEvent ??= class extends Event { constructor(type, init) { super(type); this.detail = init?.detail } }

const { isModuleOn, setModule, registerModule, listModules } = await import('../src/expert-modules.js')

test('simulation, heatmap and report are on by default, DMN follows its former switch', () => {
  assert.equal(isModuleOn('simulation'), true)
  assert.equal(isModuleOn('heatmap'), true)
  assert.equal(isModuleOn('report'), true)
  assert.equal(isModuleOn('dmn'), true)
  assert.equal(isModuleOn('unknown'), false)
  assert.ok(classes.has('mod-dmn'))
})

test('the heatmap needs the simulation', () => {
  setModule('simulation', false)
  assert.equal(isModuleOn('heatmap'), false)
  assert.ok(!classes.has('mod-heatmap'))
  setModule('simulation', true)
  assert.equal(isModuleOn('heatmap'), true)
})

test('choices are kept in one key, and the former DMN key stays in step', () => {
  setModule('report', false)
  setModule('dmn', false)
  const saved = JSON.parse(store.get('bpmn-editor-expert-modules'))
  assert.equal(saved.report, false)
  assert.equal(store.get('bpmn-editor-dmn'), 'off')
  assert.equal(isModuleOn('report'), false)
})

test('a module registered later gets its own switch, off unless it says otherwise', () => {
  registerModule({ id: 'camunda-export', name: () => 'Camunda export', detail: () => '' })
  assert.ok(listModules().some((m) => m.id === 'camunda-export'))
  assert.equal(isModuleOn('camunda-export'), false)
  setModule('camunda-export', true)
  assert.equal(isModuleOn('camunda-export'), true)
})
