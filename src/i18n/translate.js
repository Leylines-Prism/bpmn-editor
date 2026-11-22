import fr from './fr.js'

// Module de traduction de bpmn-js, d'après l'exemple officiel
// https://github.com/bpmn-io/bpmn-js-examples/tree/main/i18n
// Il remplace le service `translate` par défaut : tous les textes de
// bpmn-js, diagram-js et du panneau de propriétés passent par lui.

const missing = new Set()

function translate(template, replacements) {
  replacements = replacements || {}

  const translated = fr[template]

  if (translated === undefined && import.meta.env.DEV && !missing.has(template)) {
    missing.add(template)
    console.debug('[i18n] texte non traduit :', template)
  }

  return (translated || template).replace(/{([^}]+)}/g, (_, key) => {
    return key in replacements ? replacements[key] : '{' + key + '}'
  })
}

export default {
  translate: [ 'value', translate ]
}
