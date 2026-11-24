// Outils de dessin proposés aux modèles : définition commune au serveur MCP
// (dossier mcp/) et au chat intégré, qu'il tourne sur le serveur ou dans la page.
// L'éditeur ouvert fait le vrai travail sur bpmn-js (src/mcp-bridge.js).
//
// Ce module n'importe rien : chacun lui passe sa propre copie de zod (v4),
// pour que les schémas soient ceux de la bibliothèque qui les lira.

export const INSTRUCTIONS = `This server drives a BPMN editor (bpmn-js) open in the user's browser.
Every change shows up live on their canvas and can be undone with Ctrl+Z.

Recommended method:
1. Call get_shapes to learn the current diagram.
2. For a linear sequence, add_shapes with "after": the shape is placed to the right of the previous one and connected automatically.
3. For branches and loops back, add_shapes then connect_shapes.
4. Read the diagram again with get_shapes to check. get_diagram_image shows how it actually looks.
5. If the drawing is messy, auto_layout tidies it up (see its limits).
6. Finish with validate_diagram and fix the reported errors.

Pools and lanes: create each Participant first (add_shapes with x and y, one under the other, about 300 apart),
then its lanes, from top to bottom (type Lane, parent: the participant id), then the shapes with parent: the lane id.
Connect shapes of two different participants with connect_shapes: it creates a message flow.
auto_layout does not handle lanes or several participants: do not call it on such a diagram.

Size guide: task 100×80, event 36×36, gateway 50×50. The x and y coordinates are the centre of the shape.
To start from scratch or import a complete diagram, use set_diagram_xml.`

// Renvoie la liste des outils, décrits avec le zod fourni : buildTools(z).
export function buildTools(z) {
  const elementId = z.string().min(1).describe('Id of a diagram element, as returned by get_shapes')

  const bpmnType = z
    .string()
    .min(1)
    .describe(
      'BPMN type, with or without the "bpmn:" prefix. Examples: StartEvent, EndEvent, IntermediateThrowEvent, ' +
        'IntermediateCatchEvent, Task, UserTask, ServiceTask, ScriptTask, ManualTask, SendTask, ReceiveTask, ' +
        'BusinessRuleTask, SubProcess, CallActivity, ExclusiveGateway, ParallelGateway, InclusiveGateway, ' +
        'EventBasedGateway, DataObjectReference, DataStoreReference, TextAnnotation, Participant, Lane',
    )

  const eventDefinition = z
    .string()
    .describe(
      'For an event only: definition type, for example TimerEventDefinition, MessageEventDefinition, ' +
        'SignalEventDefinition, ErrorEventDefinition, EscalationEventDefinition, ConditionalEventDefinition, ' +
        'TerminateEventDefinition',
    )

  return [
    {
      name: 'get_shapes',
      title: 'Read the diagram elements',
      description:
        'Lists the elements of the open diagram: shapes (id, type, name, position, parent, incoming and outgoing flows) and connections (id, type, name, source, target).',
      inputSchema: {},
    },
    {
      name: 'get_diagram_xml',
      title: 'Read the BPMN XML',
      description: 'Returns the open diagram as BPMN 2.0 XML.',
      inputSchema: {},
    },
    {
      name: 'get_diagram_image',
      title: 'See the diagram',
      description:
        'Returns a PNG image of the open diagram, as drawn on the canvas. Use it to check the layout visually (overlaps, crossing flows, readability), or to show the diagram to the user.',
      inputSchema: {},
    },
    {
      name: 'set_diagram_xml',
      title: 'Replace the diagram',
      description:
        "Replaces the whole open diagram with the given BPMN 2.0 XML. Warning: clears the editor's undo history.",
      inputSchema: {
        xml: z.string().min(1).describe('Complete BPMN 2.0 XML document, with its diagram layout (BPMNDiagram)'),
      },
    },
    {
      name: 'add_shapes',
      title: 'Add shapes',
      description:
        'Adds one or more shapes. With "after", the shape is placed to the right of the given element and connected to it. ' +
        'With x and y, it is placed at that position without a connection. With neither, it is placed to the right of the diagram. ' +
        'A Lane is added at the bottom of its participant, which grows to make room. ' +
        'Returns the id created for each shape, and for each "key" given.',
      inputSchema: {
        shapes: z
          .array(
            z.object({
              key: z
                .string()
                .optional()
                .describe('Free local name, usable in "after" of later shapes in the same call'),
              type: bpmnType,
              name: z.string().optional().describe('Displayed label'),
              eventDefinition: eventDefinition.optional(),
              after: z
                .string()
                .optional()
                .describe('Id of an existing element, or "key" of an earlier shape in this call'),
              x: z.number().optional(),
              y: z.number().optional(),
              parent: elementId
                .optional()
                .describe(
                  'Participant, lane or subprocess that will contain the shape (an id, or the "key" of an earlier shape in this call). ' +
                    'In a lane, the shape is placed at the height of the lane, even with "after". ' +
                    'For a Lane: the participant that receives it. Default: the main process, or the first participant',
                ),
            }),
          )
          .min(1),
      },
    },
    {
      name: 'connect_shapes',
      title: 'Connect shapes',
      description:
        'Creates connections between existing shapes. The type follows the BPMN rules: sequence flow within a process, ' +
        'message flow between participants, association to an annotation. Returns the id of each connection.',
      inputSchema: {
        connections: z
          .array(
            z.object({
              source: elementId,
              target: elementId,
              name: z.string().optional().describe('Connection label, for example "Yes" after a gateway'),
            }),
          )
          .min(1),
      },
    },
    {
      name: 'update_elements',
      title: 'Update elements',
      description:
        'Renames elements or changes their type (for example Task to UserTask). A type change can produce a new id, returned in the result.',
      inputSchema: {
        elements: z
          .array(
            z.object({
              id: elementId,
              name: z.string().optional().describe('New label. Empty string to clear it'),
              type: bpmnType.optional(),
              eventDefinition: eventDefinition.optional(),
            }),
          )
          .min(1),
      },
    },
    {
      name: 'auto_layout',
      title: 'Tidy up the diagram',
      description:
        'Recalculates the position of every shape and the route of every connection, like the editor\'s "Tidy up" button. ' +
        'Limits: only the first participant of a collaboration is laid out, subprocesses become collapsed, ' +
        'annotations, groups, associations and message flows are not placed, colors are lost. ' +
        "Clears the editor's undo history.",
      inputSchema: {},
    },
    {
      name: 'validate_diagram',
      title: 'Validate the diagram',
      description:
        'Checks the diagram with the recommended bpmnlint rules (isolated element, missing start or end event, ' +
        'element without a label, superfluous gateway…). Returns the number of errors and warnings and the list of problems ' +
        'with the id of the element concerned, the rule and the message.',
      inputSchema: {},
    },
    {
      name: 'remove_elements',
      title: 'Remove elements',
      description: 'Removes shapes or connections. Removing a shape also removes its connections.',
      inputSchema: {
        ids: z.array(elementId).min(1),
      },
    },
  ]
}
