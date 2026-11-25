// Groupes « Forme » et « Texte » du panneau de propriétés : couleurs de la
// forme, puis libellé et mise en forme du texte de l'élément sélectionné.
//
// Le pinceau et le bouton A du menu contextuel ouvrent un petit menu de
// couleurs qui mène à ces groupes. Leurs menus complets restent pour une
// sélection multiple. Ces groupes passent par les mêmes commandes : chaque geste s'annule par Ctrl+Z
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
  FONTS, SIZES, TEXT_COLORS, AUTO_ICON, swatch as textSwatch,
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

// Seconde ligne de la forme : fonds vifs, contour plus foncé de la même teinte
// et texte blanc (au moins 5:1 avec le blanc), posés en une seule étape.
const VIVID_TEXT = '#FFFFFF'
const VIVID_ROW = [
  { label: T('Vivid blue', 'Bleu vif'), fill: '#1565C0', stroke: '#0C386A' },
  { label: T('Vivid green', 'Vert vif'), fill: '#2E7D32', stroke: '#19451C' },
  { label: T('Vivid red', 'Rouge vif'), fill: '#C62828', stroke: '#6D1616' },
  { label: T('Raspberry', 'Framboise'), fill: '#AD1457', stroke: '#5F0B30' },
  { label: T('Vivid purple', 'Violet vif'), fill: '#6A1B9A', stroke: '#3A0F55' },
  { label: T('Vivid teal', 'Turquoise vif'), fill: '#00695C', stroke: '#003A33' },
  { label: T('Rust', 'Rouille'), fill: '#BF360C', stroke: '#691E07' },
  { label: T('Charcoal', 'Anthracite'), fill: '#37474F', stroke: '#1E272B' },
]

// Seconde ligne du texte : quatre couleurs foncées pour les fonds clairs (au
// moins 6.6:1 sur blanc), quatre claires pour les fonds foncés (au moins 13:1 sur noir).
const CONTRAST_ROW = [
  { label: T('Black', 'Noir'), color: '#000000' },
  { label: T('Navy', 'Bleu nuit'), color: '#0D47A1' },
  { label: T('Forest green', 'Vert forêt'), color: '#1B5E20' },
  { label: T('Dark red', 'Rouge sombre'), color: '#B71C1C' },
  { label: T('White', 'Blanc'), color: '#FFFFFF' },
  { label: T('Bright yellow', 'Jaune vif'), color: '#FFEB3B' },
  { label: T('Bright cyan', 'Cyan vif'), color: '#00E5FF' },
  { label: T('Neon green', 'Vert fluo'), color: '#76FF03' },
]
const TEXT_ROW_KEYS = new Set([...TEXT_ROW, ...CONTRAST_ROW].map((c) => c.color))

// ── Pastille ────────────────────────────────────────────────────────────────

function Swatch({ title, fill, stroke, text, active, onClick, className = '' }) {
  return html`<button type="button" class=${'appearance-swatch' + (className && ' ' + className) + (active ? ' is-active' : '')}
    title=${title} aria-label=${title} aria-pressed=${active ? 'true' : 'false'} onClick=${onClick}>
    <span class="appearance-swatch-color" style=${{ background: fill || '#FFFFFF', borderColor: stroke || '#22242A', color: text || stroke || '#22242A' }}>${text ? 'A' : ''}</span>
  </button>`
}

// Pastille d'une couleur de texte : le A est dans cette couleur, sur un fond
// noir ou blanc, celui qui la fait le mieux ressortir.
const TextSwatch = ({ color, ...props }) =>
  html`<${Swatch} ...${props} fill=${readableOn(color)} stroke="var(--line-strong)" text=${color} className="is-text" />`

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

// Style complet d'un élément : couleurs de la forme, police et couleur du texte.
function styleOf(element) {
  const target = targetOf(element)
  return { fill: fillOf(target) || null, stroke: strokeOf(target) || null, font: fontOf(target), textColor: upper(textColorOf(target)) || null }
}
const styleKey = (style) => JSON.stringify([style.fill, style.stroke, style.textColor, style.font && Object.keys(style.font).sort().map((k) => [k, style.font[k]])])
const isDefaultStyle = (style) => !style.fill && !style.stroke && !style.font && !style.textColor

function copyStyle(element) {
  copied = styleOf(element)
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

// Couleurs de la forme et, si besoin, couleur du texte, en une seule étape
// d'annulation. textColor : une couleur, null pour la retirer, undefined pour
// ne pas y toucher.
function registerShapeColor(commandStack, modeling) {
  commandStack.registerHandler('appearance.setShapeColor', function () {
    this.preExecute = ({ elements, colors, textColor }) => {
      modeling.setColor(elements, colors)
      const texts = textColor === undefined ? [] : elements.filter(hasText)
      if (texts.length) commandStack.execute('element.setLabelColor', { elements: texts, colors: texts.map(() => textColor) })
    }
    this.execute = () => []
    this.revert = () => []
  })
}
registerShapeColor.$inject = ['commandStack', 'modeling']

function pasteStyle(commandStack, elements, style = copied) {
  const targets = pasteTargets(elements)
  if (style && targets.length) commandStack.execute('appearance.pasteStyle', { elements: targets, style })
}

// ── Styles du diagramme ─────────────────────────────────────────────────────
// Chaque style posé à la main sur un élément est repris automatiquement dans
// une ligne du groupe Style : un clic l'applique à l'élément sélectionné. La
// liste se lit dans le diagramme (elle suit donc le fichier), les styles
// modifiés le plus récemment en tête.

const USED_MAX = 8
const recent = new Map()
let tick = 0

// Les mêmes listes existent pour les seules couleurs de la forme (groupe Forme,
// menu du pinceau) et pour les seules couleurs du texte (groupe Texte, menu du
// bouton A). Chaque lecteur rend { key, value } pour un élément, ou null.
const USED_READERS = {
  style: (el) => {
    const style = styleOf(el)
    return isDefaultStyle(style) ? null : { key: styleKey(style), value: style }
  },
  shape: (el) => {
    const fill = fillOf(el)
    const stroke = strokeOf(el)
    return fill || stroke ? { key: `${fill}|${stroke}`, value: { fill: fill || undefined, stroke: stroke || undefined } } : null
  },
  text: (el) => {
    const color = hasText(el) && upper(textColorOf(el))
    return color ? { key: color, value: color } : null
  },
}

function trackRecentStyles(eventBus) {
  eventBus.on('elements.changed', ({ elements }) => {
    for (const el of elements) {
      if (el.type === 'label' || !hasAppearance(el)) continue
      for (const [kind, read] of Object.entries(USED_READERS)) {
        const used = read(el)
        if (used) recent.set(`${kind}:${used.key}`, ++tick)
      }
    }
  })
  eventBus.on('import.done', () => recent.clear())
}
trackRecentStyles.$inject = ['eventBus']

// Ce qui est réglé à la main dans le diagramme, sans doublon, le plus récent en tête.
function usedIn(elementRegistry, kind, max = USED_MAX) {
  const read = USED_READERS[kind]
  const seen = new Map()
  elementRegistry.forEach((el) => {
    if (el.type === 'label' || !hasAppearance(el)) return
    const used = read(el)
    if (used && !seen.has(used.key)) seen.set(used.key, { ...used, order: seen.size })
  })
  const rank = (item) => recent.get(`${kind}:${item.key}`) || 0
  return [...seen.values()].sort((a, b) => rank(b) - rank(a) || a.order - b.order).slice(0, max)
}

const usedStyles = (elementRegistry) => usedIn(elementRegistry, 'style').map(({ key, value }) => ({ key, style: value }))
const USED_LABEL = () => T('Used in this diagram', 'Déjà dans le diagramme')
const shapeTitle = ({ fill, stroke }) => [fill && `${T('Fill', 'Fond')} ${fill}`, stroke && `${T('Stroke', 'Contour')} ${stroke}`].filter(Boolean).join(', ')

function describeStyle(style) {
  const font = style.font || {}
  const parts = [
    style.fill && `${T('Fill', 'Fond')} ${style.fill}`,
    style.stroke && `${T('Stroke', 'Contour')} ${style.stroke}`,
    font.name, font.size && `${font.size}`,
    font.isBold && T('bold', 'gras'), font.isItalic && T('italic', 'italique'), font.isUnderline && T('underline', 'souligné'),
    style.textColor && `${T('Text', 'Texte')} ${style.textColor}`,
  ]
  return parts.filter(Boolean).join(', ')
}

function UsedStyles({ element }) {
  const commandStack = useService('commandStack')
  const elementRegistry = useService('elementRegistry')
  const styles = usedStyles(elementRegistry)
  if (!styles.length) return null
  const current = styleKey(styleOf(element))
  const label = USED_LABEL()
  return html`<div class="appearance-used">
    <div class="appearance-sublabel">${label}</div>
    <div class="appearance-swatches" role="group" aria-label=${label}>
      ${styles.map(({ key, style }) => html`<button type="button" key=${key}
        class=${'appearance-swatch' + (key === current ? ' is-active' : '')}
        title=${describeStyle(style)} aria-label=${describeStyle(style)} aria-pressed=${key === current ? 'true' : 'false'}
        onClick=${() => pasteStyle(commandStack, [element], style)}><${StylePreview} style=${style} /></button>`)}
    </div>
  </div>`
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

// Rouleau du menu du canevas, dans un carré peint avec le style copié : le
// carré prend le fond et le contour de la forme, le rouleau la couleur du
// texte. Sans style copié, le rouleau reste seul, au trait.
const ROLLER_PATHS = html`<rect x="3" y="3" width="13" height="5" rx="1.2" /><path d="M16 5.5h2.5v5H10v3" /><rect x="8.6" y="13.5" width="2.8" height="6" rx="1" />`

function RollerPreview({ style }) {
  const svg = (color) => html`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22" fill="none" stroke=${color}
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ROLLER_PATHS}</svg>`
  if (!style) return html`<span class="appearance-roller" aria-hidden="true">${svg('currentColor')}</span>`
  return html`<span class="appearance-roller is-painted" aria-hidden="true"
    style=${{ background: style.fill || '#FFFFFF', borderColor: style.stroke || '#22242A' }}>
    ${svg(style.textColor || style.stroke || '#22242A')}
  </span>`
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
        <${RollerPreview} style=${copied} />${T('Paste style', 'Coller le style')}
      </button>
    </div>
    <${UsedStyles} element=${element} />
  </div>`
}

const ROLLER_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="13" height="5" rx="1.2"/><path d="M16 5.5h2.5v5H10v3"/><rect x="8.6" y="13.5" width="2.8" height="6" rx="1"/></svg>`

// ── Couleurs de la forme ────────────────────────────────────────────────────

function ShapeColorEntry({ element, id }) {
  const modeling = useService('modeling')
  const commandStack = useService('commandStack')
  const target = targetOf(element)
  const edge = isConnection(target)
  const fill = fillOf(target)
  const stroke = strokeOf(target)
  const set = (colors) => modeling.setColor([target], colors)
  const swatches = SHAPE_ROW.map((c, i) => html`<${Swatch} key=${i} title=${c.label} fill=${c.fill} stroke=${c.stroke}
    active=${c.fill ? upper(c.fill) === fill && upper(c.stroke) === stroke : !fill && !stroke}
    onClick=${() => setPale(c)} />`)
  // Un fond vif met le texte en blanc. Revenir à un fond pâle retire ce blanc,
  // illisible sur fond clair. Un flux n'a pas de fond : son libellé reste tel quel.
  const whiteText = upper(textColorOf(target)) === VIVID_TEXT
  const setPale = (c) => commandStack.execute('appearance.setShapeColor', {
    elements: [target], colors: { fill: c.fill, stroke: c.stroke }, textColor: whiteText && !edge ? null : undefined,
  })
  const setVivid = (c) => commandStack.execute('appearance.setShapeColor', {
    elements: [target], colors: { fill: c.fill, stroke: c.stroke }, textColor: edge ? undefined : VIVID_TEXT,
  })
  const vivid = VIVID_ROW.map((c, i) => html`<${Swatch} key=${i} title=${c.label} fill=${c.fill} stroke=${c.stroke} text=${edge ? undefined : VIVID_TEXT}
    active=${c.fill === fill && c.stroke === stroke} onClick=${() => setVivid(c)} />`)
  return html`<div class="bio-properties-panel-entry appearance-entry" data-entry-id=${id}>
    <div class="bio-properties-panel-label">${T('Color', 'Couleur')}</div>
    <div class="appearance-swatches" role="group" aria-label=${T('Shape color', 'Couleur de la forme')}>${swatches}</div>
    <div class="appearance-swatches" role="group" aria-label=${T('Vivid shape colors', 'Couleurs vives de la forme')}>${vivid}</div>
    <${UsedShapeColors} fill=${fill} stroke=${stroke} set=${set} />
    ${edge ? null : html`<${ColorField} id=${id + '-fill'} label=${T('Fill', 'Fond')} value=${fill} fallback="#FFFFFF" onChange=${(v) => set({ fill: v })} />`}
    <${ColorField} id=${id + '-stroke'} label=${T('Stroke', 'Contour')} value=${stroke} fallback="#22242A" onChange=${(v) => set({ stroke: v })} />
  </div>`
}

// Couleurs de forme réglées ailleurs dans le diagramme, sur une ligne.
function UsedShapeColors({ fill, stroke, set }) {
  const elementRegistry = useService('elementRegistry')
  const used = usedIn(elementRegistry, 'shape')
  if (!used.length) return null
  const label = USED_LABEL()
  return html`<div class="appearance-used">
    <div class="appearance-sublabel">${label}</div>
    <div class="appearance-swatches" role="group" aria-label=${label}>
      ${used.map(({ key, value }) => html`<${Swatch} key=${key} title=${shapeTitle(value)} fill=${value.fill} stroke=${value.stroke}
        active=${upper(value.fill) === fill && upper(value.stroke) === stroke} onClick=${() => set({ fill: value.fill, stroke: value.stroke })} />`)}
    </div>
  </div>`
}

// Couleurs de texte réglées ailleurs dans le diagramme, sur une ligne.
function UsedTextColors({ color, onPick }) {
  const elementRegistry = useService('elementRegistry')
  const used = usedIn(elementRegistry, 'text')
  if (!used.length) return null
  const label = USED_LABEL()
  return html`<div class="appearance-used">
    <div class="appearance-sublabel">${label}</div>
    <div class="appearance-swatches" role="group" aria-label=${label}>
      ${used.map(({ value }) => html`<${TextSwatch} key=${value} title=${value} color=${value}
        active=${color === value} onClick=${() => onPick(value)} />`)}
    </div>
  </div>`
}

// ── Texte ───────────────────────────────────────────────────────────────────

function TextStyleEntry({ element, id }) {
  const commandStack = useService('commandStack')
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
      ${TEXT_ROW.map((c, i) => html`<${TextSwatch} key=${i} title=${c.label} color=${c.color}
        active=${color === c.color} onClick=${() => applyTextColor(commandStack, elements, c.color)} />`)}
    </div>
    <div class="appearance-swatches" role="group" aria-label=${T('High contrast text colors', 'Couleurs de texte à fort contraste')}>
      ${CONTRAST_ROW.map((c, i) => html`<${TextSwatch} key=${i} title=${c.label} color=${c.color}
        active=${color === c.color} onClick=${() => applyTextColor(commandStack, elements, c.color)} />`)}
    </div>
    <${UsedTextColors} color=${color} onPick=${(v) => applyTextColor(commandStack, elements, v)} />
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
// Pour un seul élément, ils ouvrent un petit menu de couleurs : cinq couleurs
// toutes prêtes, puis jusqu'à trois couleurs déjà dans le diagramme, et un
// bouton « Plus… » qui ouvre le panneau sur le groupe Forme ou Texte. Un
// choix referme le menu.
// Pour plusieurs éléments, le panneau ne s'affiche pas : ils gardent leur menu
// complet (palette du pinceau, menu Texte).

const QUICK_SHAPE = [2, 6, 9, 11, 13].map((i) => COLORS[i])
const QUICK_TEXT = [0, 3, 7, 12, 14].map((i) => TEXT_COLORS[i])
const QUICK_USED_MAX = 3
const QUICK_SHAPE_MENU = 'quick-shape-color'
const QUICK_TEXT_MENU = 'quick-text-color'

const shapeIcon = (fill, stroke) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22"><rect x="2" y="2" width="20" height="20" rx="4" fill="${fill || '#FFFFFF'}" stroke="${stroke || '#22242A'}" stroke-width="2"/></svg>`

function AppearanceContextPad(contextPad, eventBus, propertiesPanel, commandStack, popupMenu, modeling, elementRegistry) {
  contextPad.registerProvider(LOW_PRIORITY, this)
  this._commandStack = commandStack
  this._contextPad = contextPad
  this._popupMenu = popupMenu
  this._modeling = modeling
  this._elementRegistry = elementRegistry
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

  popupMenu.registerProvider(QUICK_SHAPE_MENU, { getPopupMenuEntries: (element) => this._shapeEntries(element) })
  popupMenu.registerProvider(QUICK_TEXT_MENU, { getPopupMenuEntries: (element) => this._textEntries(element) })
}
AppearanceContextPad.$inject = ['contextPad', 'eventBus', 'propertiesPanel', 'commandStack', 'popupMenu', 'modeling', 'elementRegistry']

// Ouvre un petit menu sous le menu contextuel, comme le menu Texte.
AppearanceContextPad.prototype._openMenu = function (element, menu, title, event) {
  const rect = this._contextPad.getPad(element).html.getBoundingClientRect()
  this._popupMenu.open(element, menu, { x: rect.left, y: rect.bottom + 5, cursor: { x: event.x, y: event.y } }, { title, width: 190 })
}

// Bas du menu : revenir à la couleur par défaut, ou ouvrir le panneau.
AppearanceContextPad.prototype._moreEntries = function (prefix, groupId, reset, isDefault) {
  const group = { id: 'more' }
  return {
    [prefix + '-default']: {
      label: T('Default', 'Par défaut'),
      title: T('Back to the default color', 'Revenir à la couleur par défaut'),
      className: isDefault ? 'is-active' : '',
      group,
      action: reset,
    },
    [prefix + '-more']: {
      label: T('More…', 'Plus…'),
      title: T('More options in the panel', "Plus d'options dans le panneau"),
      group,
      action: () => { this._popupMenu.close(); this._open(groupId) },
    },
  }
}

AppearanceContextPad.prototype._shapeEntries = function (element) {
  const target = targetOf(element)
  const fill = fillOf(target)
  const stroke = strokeOf(target)
  const set = (colors) => () => { this._popupMenu.close(); this._modeling.setColor([target], colors) }
  const isActive = (c) => upper(c.fill) === fill && upper(c.stroke) === stroke
  const entries = {}
  QUICK_SHAPE.forEach((c, i) => {
    entries[`quick-shape-${i}`] = {
      title: c.label, imageHtml: shapeIcon(c.fill, c.stroke), className: isActive(c) ? 'is-active' : '',
      group: { id: 'quick' }, action: set({ fill: c.fill, stroke: c.stroke }),
    }
  })
  const used = { id: 'used', name: USED_LABEL() }
  usedIn(this._elementRegistry, 'shape', QUICK_USED_MAX).forEach(({ value }, i) => {
    entries[`quick-shape-used-${i}`] = {
      title: shapeTitle(value), imageHtml: shapeIcon(value.fill, value.stroke), className: isActive(value) ? 'is-active' : '',
      group: used, action: set({ fill: value.fill, stroke: value.stroke }),
    }
  })
  return { ...entries, ...this._moreEntries('quick-shape', SHAPE_GROUP, set({ fill: undefined, stroke: undefined }), !fill && !stroke) }
}

AppearanceContextPad.prototype._textEntries = function (element) {
  const target = targetOf(element)
  const color = upper(textColorOf(target))
  const set = (value) => () => { this._popupMenu.close(); applyTextColor(this._commandStack, [target], value) }
  const entries = {}
  QUICK_TEXT.forEach((c, i) => {
    entries[`quick-text-${i}`] = {
      title: c.label, imageHtml: textSwatch(c.color), className: color === c.color ? 'is-active' : '',
      group: { id: 'quick' }, action: set(c.color),
    }
  })
  const used = { id: 'used', name: USED_LABEL() }
  usedIn(this._elementRegistry, 'text', QUICK_USED_MAX).forEach(({ value }, i) => {
    entries[`quick-text-used-${i}`] = {
      title: value, imageHtml: textSwatch(value), className: color === value ? 'is-active' : '',
      group: used, action: set(value),
    }
  })
  return { ...entries, ...this._moreEntries('quick-text', TEXT_GROUP, set(null), !color) }
}

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
    const redirect = (key, menu, title) => {
      if (!entries[key]) return
      entries[key] = { ...entries[key], action: { click: (event) => this._openMenu(element, menu, title, event) } }
    }
    redirect('set-color', QUICK_SHAPE_MENU, T('Shape color', 'Couleur de la forme'))
    if (hasText(targetOf(element))) redirect('label-style', QUICK_TEXT_MENU, T('Text color', 'Couleur du texte'))
    return { ...entries, ...this._pasteEntry([element]) }
  }
}

export const AppearancePanelModule = {
  __init__: ['appearancePropertiesProvider', 'appearanceContextPad', registerPasteStyle, registerShapeColor, trackRecentStyles],
  appearancePropertiesProvider: ['type', AppearancePropertiesProvider],
  appearanceContextPad: ['type', AppearanceContextPad],
}
