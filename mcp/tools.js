// Définition des outils MCP. Le serveur valide les arguments, puis les relaie
// à l'éditeur ouvert, qui fait le vrai travail sur bpmn-js (src/mcp-bridge.js).

import * as z from 'zod/v4'

const elementId = z.string().min(1).describe("Identifiant d'un élément du diagramme, tel que renvoyé par get_shapes")

const bpmnType = z
  .string()
  .min(1)
  .describe(
    'Type BPMN, avec ou sans préfixe « bpmn: ». Exemples : StartEvent, EndEvent, IntermediateThrowEvent, ' +
      'IntermediateCatchEvent, Task, UserTask, ServiceTask, ScriptTask, ManualTask, SendTask, ReceiveTask, ' +
      'BusinessRuleTask, SubProcess, CallActivity, ExclusiveGateway, ParallelGateway, InclusiveGateway, ' +
      'EventBasedGateway, DataObjectReference, DataStoreReference, TextAnnotation, Participant',
  )

const eventDefinition = z
  .string()
  .describe(
    'Pour un événement seulement : type de définition, par exemple TimerEventDefinition, MessageEventDefinition, ' +
      'SignalEventDefinition, ErrorEventDefinition, EscalationEventDefinition, ConditionalEventDefinition, ' +
      'TerminateEventDefinition',
  )

export const INSTRUCTIONS = `Ce serveur pilote un éditeur BPMN (bpmn-js) ouvert dans le navigateur de l'utilisateur.
Toutes les modifications apparaissent en direct sur son canevas et peuvent être annulées avec Ctrl+Z.

Méthode conseillée :
1. Appeler get_shapes pour connaître le diagramme actuel.
2. Pour un enchaînement linéaire, add_shapes avec « after » : la forme est placée à droite de la précédente et reliée automatiquement.
3. Pour les branches et les retours, add_shapes puis connect_shapes.
4. Relire avec get_shapes pour vérifier.
5. Si le dessin est confus, auto_layout le range (voir ses limites).
6. Terminer par validate_diagram et corriger les erreurs signalées.

Repères de taille : tâche 100×80, événement 36×36, passerelle 50×50. Les coordonnées x et y désignent le centre de la forme.
Pour repartir de zéro ou importer un diagramme complet, utiliser set_diagram_xml.`

export const TOOLS = [
  {
    name: 'get_shapes',
    title: 'Lire les éléments du diagramme',
    description:
      'Liste les éléments du diagramme ouvert : formes (id, type, nom, position, parent, flux entrants et sortants) et connexions (id, type, nom, source, cible).',
    inputSchema: {},
  },
  {
    name: 'get_diagram_xml',
    title: 'Lire le XML BPMN',
    description: 'Renvoie le diagramme ouvert au format BPMN 2.0 XML.',
    inputSchema: {},
  },
  {
    name: 'set_diagram_xml',
    title: 'Remplacer le diagramme',
    description:
      "Remplace tout le diagramme ouvert par le XML BPMN 2.0 fourni. Attention : vide l'historique d'annulation de l'éditeur.",
    inputSchema: {
      xml: z.string().min(1).describe('Document BPMN 2.0 XML complet, avec sa partie graphique (BPMNDiagram)'),
    },
  },
  {
    name: 'add_shapes',
    title: 'Ajouter des formes',
    description:
      "Ajoute une ou plusieurs formes. Avec « after », la forme est placée à droite de l'élément indiqué et reliée à lui. " +
      'Avec x et y, elle est placée à cette position sans connexion. Sans aucun des deux, elle est placée à droite du diagramme. ' +
      "Renvoie l'id créé pour chaque forme, et pour chaque « key » fournie.",
    inputSchema: {
      shapes: z
        .array(
          z.object({
            key: z
              .string()
              .optional()
              .describe('Nom local libre, utilisable dans « after » des formes suivantes du même appel'),
            type: bpmnType,
            name: z.string().optional().describe('Libellé affiché'),
            eventDefinition: eventDefinition.optional(),
            after: z
              .string()
              .optional()
              .describe("Id d'un élément existant, ou « key » d'une forme précédente de cet appel"),
            x: z.number().optional(),
            y: z.number().optional(),
            parent: elementId
              .optional()
              .describe('Participant ou sous-processus qui contiendra la forme. Par défaut : le processus principal'),
          }),
        )
        .min(1),
    },
  },
  {
    name: 'connect_shapes',
    title: 'Relier des formes',
    description:
      'Crée des connexions entre formes existantes. Le type est choisi selon les règles BPMN : flux de séquence dans un même processus, ' +
      "flux de message entre participants, association vers une annotation. Renvoie l'id de chaque connexion.",
    inputSchema: {
      connections: z
        .array(
          z.object({
            source: elementId,
            target: elementId,
            name: z.string().optional().describe('Libellé de la connexion, par exemple « Oui » après une passerelle'),
          }),
        )
        .min(1),
    },
  },
  {
    name: 'update_elements',
    title: 'Modifier des éléments',
    description:
      'Renomme des éléments ou change leur type (par exemple Task vers UserTask). Un changement de type peut produire un nouvel id, renvoyé dans le résultat.',
    inputSchema: {
      elements: z
        .array(
          z.object({
            id: elementId,
            name: z.string().optional().describe('Nouveau libellé. Chaîne vide pour effacer'),
            type: bpmnType.optional(),
            eventDefinition: eventDefinition.optional(),
          }),
        )
        .min(1),
    },
  },
  {
    name: 'auto_layout',
    title: 'Ranger le diagramme',
    description:
      "Recalcule la position de toutes les formes et le tracé de toutes les connexions, comme le bouton « Ranger » de l'éditeur. " +
      "Limites : seul le premier participant d'une collaboration est rangé, les sous-processus deviennent repliés, " +
      'les annotations, groupes, associations et flux de message ne sont pas placés, les couleurs sont perdues. ' +
      "Vide l'historique d'annulation de l'éditeur.",
    inputSchema: {},
  },
  {
    name: 'validate_diagram',
    title: 'Valider le diagramme',
    description:
      'Vérifie le diagramme avec les règles recommandées de bpmnlint (élément isolé, événement de début ou de fin manquant, ' +
      "élément sans libellé, passerelle superflue…). Renvoie le nombre d'erreurs, d'avertissements et la liste des problèmes " +
      "avec l'id de l'élément concerné, la règle et le message (en anglais).",
    inputSchema: {},
  },
  {
    name: 'remove_elements',
    title: 'Supprimer des éléments',
    description: 'Supprime des formes ou des connexions. Supprimer une forme supprime aussi ses connexions.',
    inputSchema: {
      ids: z.array(elementId).min(1),
    },
  },
]
