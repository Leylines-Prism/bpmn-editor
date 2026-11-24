// Groupes « Forme » et « Texte » du panneau de propriétés : couleurs de la
// forme, puis libellé et mise en forme du texte de l'élément sélectionné.
//
// Le pinceau et le bouton A du menu contextuel ouvrent ces groupes. Leurs petits
// menus restent pour une sélection multiple. Ces groupes passent par les mêmes commandes : chaque geste s'annule par Ctrl+Z
// et le .bpmn reste au format standard (BPMN in Color, bpmndi:BPMNLabelStyle).
//
// Construit comme l'exemple officiel « properties-panel-extension » de
// bpmn-js-examples : un fournisseur de propriétés et des composants Preact
// écrits avec htm, branché sur le Preact du panneau.

import htm from 'htm'
import { h } from '@bpmn-io/properties-panel/preact'
import { useEffect, useRef, useState } from '@bpmn-io/properties-panel/preact/hooks'
import { TextAreaEntry, isTextAreaEntryEdited } from '@bpmn-io/properties-panel'
import { useService } from 'bpmn-js-properties-panel'
import { getBusinessObject, is } from 'bpmn-js/lib/util/ModelUtil'
import { getLabel } from 'bpmn-js/lib/util/LabelUtil'
import { isConnection } from 'diagram-js/lib/util/ModelUtil'
import { T } from './i18n/lang.js'
import { COLORS } from './color-palette.js'
import {
  FONTS, SIZES, TEXT_COLORS, AUTO_ICON,
  fontOf, textColorOf, hasText, readableOn,
  applyFont, applyTextColor, resetText,
} from './label-style.js'

const html = htm.bind(h)
const LOW_PRIORITY = 500
const STYLE_GROUP = 'appearance-style'
const SHAPE_GROUP = 'appearance-shape'
const TEXT_GROUP = 'appearance-text'

const targetOf = (element) => (element.type === 'label' ? element.labelTarget : element)
const upper = (c) => (c ? String(c).toUpperCase() : '')

function fillOf(element) {
  const di = targetOf(element).di
  return upper(di?.get('color:background-color') || di?.get('bioc:fill'))
}
function strokeOf(element) {
  const di = targetOf(element).di
  return upper(di?.get('color:border-color') || di?.get('bioc:stroke'))
}

// Éléments qui ont une apparence réglable : formes et flux dessinés, hors racine.
function hasAppearance(element) {
  const target = targetOf(element)
  if (!target?.di || !is(target.di, 'bpmndi:BPMNShape') && !is(target.di, 'bpmndi:BPMNEdge')) return false
  const bo = getBusinessObject(target)
  return !is(bo, 'bpmn:Process') && !is(bo, 'bpmn:Collaboration')
}

// ── Couleurs proposées ──────────────────────────────────────────────────────
// Une seule ligne de couleurs toutes prêtes. La palette complète reste dans le
// pinceau du menu contextuel.
const SHAPE_ROW = [0, 1, 2, 6, 9, 11, 13, 15].map((i) => COLORS[i])
const TEXT_ROW = [0, 1, 2, 3, 7, 12, 14, 16].map((i) => TEXT_COLORS[i])
const MAX_USED = 16

const pairKey = (fill, stroke) => `${upper(fill)}|${upper(stroke)}`
const SHAPE_ROW_KEYS = new Set(SHAPE_ROW.map((c) => pairKey(c.fill, c.stroke)))
const TEXT_ROW_KEYS = new Set(TEXT_ROW.map((c) => c.color))

// Couleurs déjà employées dans le diagramme et absentes de la ligne proposée :
// une couleur personnalisée choisie sur un élément se reprend ainsi d'un clic
// sur un autre. Rien n'est stocké à part : la liste se lit dans le diagramme.
function usedShapeColors(elementRegistry) {
  const seen = new Map()
  for (const el of elementRegistry.getAll()) {
    if (el.type === 'label' || !el.di) continue
    const fill = fillOf(el)
    const stroke = strokeOf(el)
    if (!fill && !stroke) continue
    const key = pairKey(fill, stroke)
    if (!SHAPE_ROW_KEYS.has(key) && !seen.has(key)) seen.set(key, { fill, stroke })
    if (seen.size >= MAX_USED) break
  }
  return [...seen.values()]
}
function usedTextColors(elementRegistry) {
  const seen = new Set()
  for (const el of elementRegistry.getAll()) {
    if (el.type === 'label' || !el.di) continue
    const color = upper(textColorOf(el))
    if (color && !TEXT_ROW_KEYS.has(color)) seen.add(color)
    if (seen.size >= MAX_USED) break
  }
  return [...seen]
}

function UsedRow({ label, children }) {
  if (!children.length) return null
  return html`<div class="appearance-used">
    <div class="appearance-sublabel">${label}</div>
    <div class="appearance-swatches" role="group" aria-label=${label}>${children}</div>
  </div>`
}

// ── Pastille ────────────────────────────────────────────────────────────────

function Swatch({ title, fill, stroke, text, active, onClick }) {
  return html`<button type="button" class=${'appearance-swatch' + (active ? ' is-active' : '')}
    title=${title} aria-label=${title} aria-pressed=${active ? 'true' : 'false'} onClick=${onClick}>
    <span class="appearance-swatch-color" style=${{ background: fill || '#FFFFFF', borderColor: stroke || '#22242A', color: text || stroke || '#22242A' }}>${text ? 'A' : ''}</span>
  </button>`
}

// Sélecteur de couleur du système. Le Preact du panneau change onChange en
// « input » pour les champs : chaque mouvement dans le sélecteur ferait une
// étape d'annulation. On écoute donc l'événement natif « change », envoyé une
// fois la couleur choisie.
function ColorInput({ id, value, onPick }) {
  const ref = useRef()
  const pick = useRef(onPick)
  pick.current = onPick
  useEffect(() => {
    const input = ref.current
    const listener = () => pick.current(input.value.toUpperCase())
    input.addEventListener('change', listener)
    return () => input.removeEventListener('change', listener)
  }, [])
  return html`<input ref=${ref} id=${id} type="color" value=${value.toLowerCase()} />`
}

// Carré de couleur qui ouvre le sélecteur du système, avec le code à côté.
function ColorField({ id, label, value, fallback, onChange }) {
  return html`<div class="appearance-color-field">
    <label for=${id}>${label}</label>
    <${ColorInput} id=${id} value=${value || fallback} onPick=${onChange} />
    <span class="appearance-color-code">${value || T('Default', 'Par défaut')}</span>
  </div>`
}

// ── Libellé ─────────────────────────────────────────────────────────────────

function LabelEntry({ element, id }) {
  const modeling = useService('modeling')
  const debounce = useService('debounceInput')
  const target = targetOf(element)
  return html`<${TextAreaEntry}
    id=${id}
    element=${target}
    label=${T('Label', 'Libellé')}
    getValue=${() => getLabel(target) || ''}
    setValue=${(value) => modeling.updateLabel(target, value || null)}
    debounce=${debounce}
    rows=${2}
    autoResize=${true}
  />`
}

// ── Copier et coller le style ───────────────────────────────────────────────
// « Copier le style » garde en mémoire les couleurs de la forme, la police et la
// couleur du texte de l'élément sélectionné. « Coller le style » les applique à
// un ou plusieurs éléments (bouton du panneau, ou rouleau du menu contextuel
// pour une sélection multiple), en une seule étape d'annulation. Le style
// copié est retenu par ce navigateur, d'un diagramme à l'autre.

const STYLE_KEY = 'bpmn-editor-copied-style'
let copied = readCopied()

function readCopied() {
  try { return JSON.parse(localStorage.getItem(STYLE_KEY)) || null } catch { return null }
}

function copyStyle(element) {
  const target = targetOf(element)
  copied = { fill: fillOf(target) || null, stroke: strokeOf(target) || null, font: fontOf(target), textColor: upper(textColorOf(target)) || null }
  try { localStorage.setItem(STYLE_KEY, JSON.stringify(copied)) } catch { /* stockage indisponible : le style vaut pour cette page */ }
}

const pasteTargets = (elements) => [...new Set(elements.map(targetOf))].filter(hasAppearance)

function registerPasteStyle(commandStack, modeling) {
  commandStack.registerHandler('appearance.pasteStyle', function () {
    this.preExecute = ({ elements, style }) => {
      modeling.setColor(elements, { fill: style.fill || undefined, stroke: style.stroke || undefined })
      const texts = elements.filter(hasText)
      if (!texts.length) return
      commandStack.execute('element.setLabelFont', { elements: texts, font: style.font || null })
      commandStack.execute('element.setLabelColor', { elements: texts, colors: texts.map(() => style.textColor || null) })
    }
    this.execute = () => []
    this.revert = () => []
  })
}
registerPasteStyle.$inject = ['commandStack', 'modeling']

function pasteStyle(commandStack, elements) {
  const targets = pasteTargets(elements)
  if (copied && targets.length) commandStack.execute('appearance.pasteStyle', { elements: targets, style: copied })
}

// Aperçu du style copié : la forme et un « A » dans la couleur et la police du texte.
function StylePreview({ style }) {
  const font = style.font || {}
  return html`<span class="appearance-style-preview" aria-hidden="true" style=${{
    background: style.fill || '#FFFFFF', borderColor: style.stroke || '#22242A', color: style.textColor || style.stroke || '#22242A',
    fontFamily: FONTS.find((f) => f.name === font.name)?.family || 'Arial, sans-serif',
    fontWeight: font.isBold ? 700 : 400, fontStyle: font.isItalic ? 'italic' : 'normal', textDecoration: font.isUnderline ? 'underline' : 'none',
  }}>A</span>`
}

function CopyPasteEntry({ element, id }) {
  const commandStack = useService('commandStack')
  const [, setVersion] = useState(0)
  return html`<div class="bio-properties-panel-entry appearance-entry" data-entry-id=${id}>
    <div class="appearance-row">
      <button type="button" class="appearance-button" id=${id + '-copy'}
        title=${T("Remember this element's colors and text formatting", 'Retenir les couleurs et la mise en forme du texte de cet élément')}
        onClick=${() => { copyStyle(element); setVersion((v) => v + 1) }}>${T('Copy style', 'Copier le style')}</button>
      <button type="button" class="appearance-button" id=${id + '-paste'} disabled=${!copied}
        title=${copied ? T('Apply the copied style to this element', 'Appliquer le style copié à cet élément') : T('Copy a style first', "Copiez d'abord un style")}
        onClick=${() => pasteStyle(commandStack, [element])}>
        ${copied ? html`<${StylePreview} style=${copied} />` : null}${T('Paste style', 'Coller le style')}
      </button>
    </div>
  </div>`
}

const ROLLER_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="13" height="5" rx="1.2"/><path d="M16 5.5h2.5v5H10v3"/><rect x="8.6" y="13.5" width="2.8" height="6" rx="1"/></svg>`

// ── Couleurs de la forme ────────────────────────────────────────────────────

function ShapeColorEntry({ element, id }) {
  const modeling = useService('modeling')
  const elementRegistry = useService('elementRegistry')
  const target = targetOf(element)
  const edge = isConnection(target)
  const fill = fillOf(target)
  const stroke = strokeOf(target)
  const set = (colors) => modeling.setColor([target], colors)
  const swatches = SHAPE_ROW.map((c, i) => html`<${Swatch} key=${i} title=${c.label} fill=${c.fill} stroke=${c.stroke}
    active=${c.fill ? upper(c.fill) === fill && upper(c.stroke) === stroke : !fill && !stroke}
    onClick=${() => set({ fill: c.fill, stroke: c.stroke })} />`)
  return html`<div class="bio-properties-panel-entry appearance-entry" data-entry-id=${id}>
    <div class="bio-properties-panel-label">${T('Color', 'Couleur')}</div>
    <div class="appearance-swatches" role="group" aria-label=${T('Shape color', 'Couleur de la forme')}>${swatches}</div>
    <${UsedRow} label=${T('Used in this diagram', 'Déjà dans le diagramme')}>${usedShapeColors(elementRegistry).map((c) => html`<${Swatch}
      key=${pairKey(c.fill, c.stroke)} title=${[c.fill, c.stroke].filter(Boolean).join(' / ')} fill=${c.fill} stroke=${c.stroke}
      active=${c.fill === fill && c.stroke === stroke}
      onClick=${() => set(edge ? { stroke: c.stroke } : { fill: c.fill, stroke: c.stroke })} />`)}<//>
    ${edge ? null : html`<${ColorField} id=${id + '-fill'} label=${T('Fill', 'Fond')} value=${fill} fallback="#FFFFFF" onChange=${(v) => set({ fill: v })} />`}
    <${ColorField} id=${id + '-stroke'} label=${T('Stroke', 'Contour')} value=${stroke} fallback="#22242A" onChange=${(v) => set({ stroke: v })} />
  </div>`
}

// ── Texte ───────────────────────────────────────────────────────────────────

function TextStyleEntry({ element, id }) {
  const commandStack = useService('commandStack')
  const elementRegistry = useService('elementRegistry')
  const target = targetOf(element)
  const elements = [target]
  const font = fontOf(target) || {}
  const color = upper(textColorOf(target))
  const toggle = (key, letter, title, cls) => html`<button type="button"
    class=${'appearance-toggle ' + cls + (font[key] ? ' is-active' : '')}
    title=${title} aria-label=${title} aria-pressed=${font[key] ? 'true' : 'false'}
    onClick=${() => applyFont(commandStack, elements, { [key]: !font[key] })}>${letter}</button>`
  const select = (sid, label, value, options, onChange) => html`<div class="appearance-select">
    <label for=${sid}>${label}</label>
    <select id=${sid} class="bio-properties-panel-input" value=${value} onChange=${(e) => onChange(e.target.value)}>
      <option value="">${T('Default', 'Par défaut')}</option>
      ${options.map((o) => html`<option value=${o.value} style=${o.family ? { fontFamily: o.family } : null}>${o.label}</option>`)}
    </select>
  </div>`
  const custom = color && !TEXT_ROW_KEYS.has(color)
  return html`<div class="bio-properties-panel-entry appearance-entry" data-entry-id=${id}>
    <div class="bio-properties-panel-label">Style</div>
    <div class="appearance-toggles" role="group" aria-label="Style">
      ${toggle('isBold', T('B', 'G'), T('Bold', 'Gras'), 'is-bold')}
      ${toggle('isItalic', 'I', T('Italic', 'Italique'), 'is-italic')}
      ${toggle('isUnderline', T('U', 'S'), T('Underline', 'Souligné'), 'is-underline')}
    </div>
    <div class="appearance-selects">
      ${select(id + '-size', T('Size', 'Taille'), font.size ? String(font.size) : '',
        SIZES.map((s) => ({ value: String(s.size), label: `${s.label} (${s.size})` })),
        (v) => applyFont(commandStack, elements, { size: v ? Number(v) : undefined }))}
      ${select(id + '-font', T('Font', 'Police'), font.name || '',
        FONTS.map((f) => ({ value: f.name, label: f.name, family: f.family })),
        (v) => applyFont(commandStack, elements, { name: v || undefined }))}
    </div>
    <div class="bio-properties-panel-label">${T('Text color', 'Couleur du texte')}</div>
    <div class="appearance-swatches" role="group" aria-label=${T('Text color', 'Couleur du texte')}>
      ${TEXT_ROW.map((c, i) => html`<${Swatch} key=${i} title=${c.label} fill=${c.color} stroke="var(--line-strong)" text=${readableOn(c.color)}
        active=${color === c.color} onClick=${() => applyTextColor(commandStack, elements, c.color)} />`)}
    </div>
    <${UsedRow} label=${T('Used in this diagram', 'Déjà dans le diagramme')}>${usedTextColors(elementRegistry).map((c) => html`<${Swatch}
      key=${c} title=${c} fill=${c} stroke="var(--line-strong)" text=${readableOn(c)}
      active=${color === c} onClick=${() => applyTextColor(commandStack, elements, c)} />`)}<//>
    <div class="appearance-row">
      <button type="button" class="appearance-button" title=${T('Black or white, whichever reads best on the fill', 'Noir ou blanc, le plus lisible sur le fond')}
        onClick=${() => applyTextColor(commandStack, elements, 'auto')}>
        <span class="appearance-icon" dangerouslySetInnerHTML=${{ __html: AUTO_ICON }}></span>Auto
      </button>
      <label class=${'appearance-button appearance-custom' + (custom ? ' is-active' : '')} title=${T('Custom color…', 'Couleur personnalisée…')}>
        <${ColorInput} id=${id + '-custom'} value=${color || '#000000'} onPick=${(v) => applyTextColor(commandStack, elements, v)} />
        ${T('Custom…', 'Autre…')}
      </label>
    </div>
    <button type="button" class="appearance-button appearance-reset" title=${T('Remove formatting and color', 'Retirer la mise en forme et la couleur')}
      onClick=${() => resetText(commandStack, elements)}>${T('Default text', 'Texte par défaut')}</button>
  </div>`
}

// ── Fournisseur ─────────────────────────────────────────────────────────────

function AppearancePropertiesProvider(propertiesPanel) {
  propertiesPanel.registerProvider(LOW_PRIORITY, this)
}
AppearancePropertiesProvider.$inject = ['propertiesPanel']

AppearancePropertiesProvider.prototype.getGroups = function (element) {
  return (groups) => {
    if (!hasAppearance(element)) return groups
    const target = targetOf(element)
    const added = [{
      // Copier et coller portent sur la forme et le texte : groupe à part, avant les deux.
      id: STYLE_GROUP,
      label: 'Style',
      shouldOpen: true,
      entries: [{ id: 'appearance-copy-paste', component: CopyPasteEntry }],
    }, {
      id: SHAPE_GROUP,
      label: T('Shape', 'Forme'),
      entries: [{ id: 'appearance-shape-color', component: ShapeColorEntry, isEdited: () => !!(fillOf(target) || strokeOf(target)) }],
    }]
    if (hasText(target)) {
      added.push({
        id: TEXT_GROUP,
        label: T('Text', 'Texte'),
        entries: [
          { id: 'appearance-label', component: LabelEntry, isEdited: isTextAreaEntryEdited },
          { id: 'appearance-text', component: TextStyleEntry, isEdited: () => !!(fontOf(target) || textColorOf(target)) },
        ],
      })
    }
    const general = groups.findIndex((g) => g.id === 'general')
    groups.splice(general + 1, 0, ...added)
    return groups
  }
}

// ── Pinceau et bouton A du menu contextuel ──────────────────────────────────
// Pour un seul élément, ils ouvrent le panneau sur le groupe Forme ou Texte,
// déplié et amené en vue. Pour plusieurs éléments, le panneau ne s'affiche
// pas : ils gardent leur petit menu.

function AppearanceContextPad(contextPad, eventBus, propertiesPanel, commandStack) {
  contextPad.registerProvider(LOW_PRIORITY, this)
  this._commandStack = commandStack
  let layout = {}
  eventBus.on('propertiesPanel.layoutChanged', ({ layout: current }) => { layout = current || {} })

  this._open = (groupId) => {
    if (document.body.classList.contains('properties-hidden')) document.getElementById('btn-properties')?.click()
    propertiesPanel.setLayout({ ...layout, groups: { ...(layout.groups || {}), [groupId]: { open: true } } })
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const group = document.querySelector(`#properties-panel [data-group-id="group-${groupId}"]`)
      if (!group) return
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      group.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
      group.querySelector('.bio-properties-panel-group-header')?.focus?.({ preventScroll: true })
    }))
  }
}
AppearanceContextPad.$inject = ['contextPad', 'eventBus', 'propertiesPanel', 'commandStack']

AppearanceContextPad.prototype._pasteEntry = function (elements) {
  if (!copied || !pasteTargets(elements).length) return {}
  return {
    'paste-style': {
      group: 'edit',
      title: T('Paste style', 'Coller le style'),
      html: `<div class="entry">${ROLLER_ICON}</div>`,
      action: { click: () => pasteStyle(this._commandStack, elements) },
    },
  }
}

AppearanceContextPad.prototype.getMultiElementContextPadEntries = function (elements) {
  return this._pasteEntry(elements)
}

AppearanceContextPad.prototype.getContextPadEntries = function (element) {
  return (entries) => {
    if (!hasAppearance(element)) return entries
    const redirect = (key, groupId) => {
      if (!entries[key]) return
      entries[key] = { ...entries[key], action: { click: () => this._open(groupId) } }
    }
    redirect('set-color', SHAPE_GROUP)
    if (hasText(targetOf(element))) redirect('label-style', TEXT_GROUP)
    return { ...entries, ...this._pasteEntry([element]) }
  }
}

export const AppearancePanelModule = {
  __init__: ['appearancePropertiesProvider', 'appearanceContextPad', registerPasteStyle],
  appearancePropertiesProvider: ['type', AppearancePropertiesProvider],
  appearanceContextPad: ['type', AppearanceContextPad],
}
