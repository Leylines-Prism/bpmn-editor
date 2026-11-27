// Configuration de la vérification : bpmnlint:recommended (empaqueté depuis .bpmnlintrc
// par npm run lint:pack) plus la règle maison bpmnpilot/event-triggers, servie par le
// même résolveur sans paquet npm à part.

import packed from '../packed-lint-config.js'
import { eventTriggersRule } from './event-triggers.js'

const LOCAL_RULES = { 'bpmnlint-plugin-bpmnpilot/event-triggers': eventTriggersRule }

export const LOCAL_RULE_LEVELS = { 'bpmnpilot/event-triggers': 'error' }

export default {
  ...packed,
  config: { ...packed.config, rules: { ...packed.config.rules, ...LOCAL_RULE_LEVELS } },
  resolver: {
    resolveRule: (pkg, name) => LOCAL_RULES[`${pkg}/${name}`] || packed.resolver.resolveRule(pkg, name),
    resolveConfig: (pkg, name) => packed.resolver.resolveConfig(pkg, name),
  },
}
