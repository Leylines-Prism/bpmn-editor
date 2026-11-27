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
5. When the drawing is complete, call auto_layout: it places every shape and connection cleanly, pools and lanes included.
6. Finish with validate_diagram and fix the reported errors.

Pools and lanes: create each Participant first (add_shapes with x and y, one under the other),
then its lanes, from top to bottom (type Lane, parent: the participant id), then the shapes with parent: the lane id.
Connect shapes of two different participants with connect_shapes: it creates a message flow.
Do not worry about exact positions: auto_layout tidies everything at the end.

Deadlines and exceptions on a task: add a boundary event with attachTo (for example a timer "3 days"),
then draw the exception path from it with "after".

Size guide: task 100×80, event 36×36, gateway 50×50. The x and y coordinates are the centre of the shape.
Colors and text formatting: style_elements sets the fill, stroke, text color and font of shapes and connections.
Use them sparingly and consistently, for example one color per actor or to highlight an exception path.
To start from scratch or import a complete diagram, use set_diagram_xml.
When the user asks for a file (BPMN, SVG, PNG or PDF), use export_diagram. To read the diagram yourself, use get_diagram_xml or get_diagram_image instead.

Process analysis: get_process_report gives the findings, and with simulate the token counts per element and per gateway branch.
Gateway branch probabilities are set with update_elements (probability, in %); the branches of one gateway add up to 100.
They are marked as proposed by the AI until the user reviews them.
set_report_commentary stores your analysis of the process (summary, bottlenecks, rare paths, risks, improvements)
in the diagram file: it appears in the process report, under your name. Base each point on the report's figures.

Modeling rules (validate_diagram checks most of them):
- Every process has a start event and at least one end event. Use a single blank start event per process.
- Name every task, event, splitting gateway, pool and lane, in the user's business words, not technical terms.
- Task: verb + object ("Check invoice"). Avoid vague verbs such as handle, process or manage.
- Event: object + state reached ("Invoice received", "Order shipped"). End events name the result.
- Exclusive gateway: a question ("Amount over 1000?"). Label each outgoing flow with an answer ("Yes", "No").
- Never give a task two outgoing flows: split with a gateway. Never merge flows into a task: join them with a gateway.
- A gateway either splits or joins, never both. Close a parallel split with a parallel join.
- Do not name parallel gateways or joining gateways.
- Put the happy path on a straight line from left to right, with exceptions below it.
- Exceptions on a task: a boundary event (timer, error, message), not a gateway after the task.
- Lanes only when the user names roles or departments. Separate organizations are separate pools linked by message flows.
- No retry loops for technical failures. A loop back is for a business reason ("Correct the request").
- Keep default sizes. Use color only to convey meaning, and say what it means.`

// Polices proposées par l'éditeur (src/label-style.js, FONTS), recopiées ici : ce module n'importe rien.
export const FONT_NAMES = ['Arial', 'Times New Roman', 'Courier New', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Georgia', 'Palatino Linotype', 'Comic Sans MS']

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

  const color = z
    .string()
    .regex(/^(#?[0-9a-fA-F]{6}|#?[0-9a-fA-F]{3}|)$/)
    .describe('Hexadecimal color such as #1E88E5, or an empty string')

  // Annotations MCP (readOnlyHint, destructiveHint, idempotentHint, openWorldHint) : des indices
  // pour les clients, qui peuvent par exemple demander confirmation avant un outil destructif.
  // Seul le serveur MCP les transmet. Tous les outils agissent sur l'onglet ouvert, jamais au-delà.
  const READ = { readOnlyHint: true, openWorldHint: false }
  const edit = (destructive, idempotent) => ({ readOnlyHint: false, destructiveHint: destructive, idempotentHint: idempotent, openWorldHint: false })

  return [
    {
      name: 'get_shapes',
      title: 'Read the diagram elements',
      description:
        'Lists the elements of the open diagram: shapes (id, type, name, position, parent, incoming and outgoing flows, documentation) and connections (id, type, name, source, target). ' +
        'Documentation is the Markdown text the user wrote about the element (shortened past 1,500 characters): use it to answer questions about the process. ' +
        'Call it before changing an existing diagram: the other tools take these ids. Read-only. ' +
        'For the full BPMN content (conditions, full documentation, extensions) use get_diagram_xml; to see the layout, get_diagram_image.',
      inputSchema: {},
      annotations: READ,
    },
    {
      name: 'get_diagram_xml',
      title: 'Read the BPMN XML',
      description:
        'Returns the open diagram as BPMN 2.0 XML, with its diagram layout. Read-only. ' +
        'Use it to keep or pass on the exact file, or to read details get_shapes leaves out; to list ids before an edit, get_shapes is shorter.',
      inputSchema: {},
      annotations: READ,
    },
    {
      name: 'get_diagram_image',
      title: 'See the diagram',
      description:
        'Returns a PNG image of the open diagram, as drawn on the canvas. Use it to check the layout visually (overlaps, crossing flows, readability), or to show the diagram to the user. ' +
        'Read-only: nothing is saved. To give the user an image file, use export_diagram.',
      inputSchema: {},
      annotations: READ,
    },
    {
      name: 'export_diagram',
      title: 'Export the diagram',
      description:
        'Exports the open diagram as a file, exactly like the editor\'s Export menu: bpmn (BPMN 2.0 XML), svg, png (2x, white background) or pdf (vector). ' +
        'When the editor runs with its server, the file is saved in the exports folder of the server; an existing file is never replaced ' +
        '("Name (2).pdf" is added next to it). The editor also shows the user a Download button: nothing is downloaded unless they click it. ' +
        'The file content is not returned: to read the XML use get_diagram_xml, to look at the diagram get_diagram_image. ' +
        'The diagram itself is not changed. Use it only when the user asks for a file.',
      inputSchema: {
        format: z.enum(['bpmn', 'svg', 'png', 'pdf']).describe('File format'),
        name: z
          .string()
          .max(120)
          .optional()
          .describe('File name without extension. Default: the name of the diagram in the editor'),
      },
      annotations: edit(false, false),
    },
    {
      name: 'set_diagram_xml',
      title: 'Replace the diagram',
      description:
        "Replaces the whole open diagram with the given BPMN 2.0 XML, for example to load a file or to start over. Everything not in the XML is lost. " +
        'Unreadable XML, or XML without a drawn diagram (BPMNDiagram), is rejected and the diagram stays unchanged. ' +
        'The user can undo it in one step, but not the earlier changes one by one. To change part of a diagram, prefer add_shapes, update_elements or remove_elements.',
      annotations: edit(true, true),
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
        'With "attachTo", the shape becomes a boundary event on a task or subprocess. ' +
        'Returns the id created for each shape, and for each "key" given. To connect existing shapes, use connect_shapes. ' +
        'If one shape fails, the whole call is undone. The user can undo the call with Ctrl+Z.',
      annotations: edit(false, false),
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
              attachTo: z
                .string()
                .optional()
                .describe(
                  'Boundary event: id (or "key") of the task or subprocess it is attached to. The shape becomes a BoundaryEvent ' +
                    'on the bottom edge of that activity; give its eventDefinition (TimerEventDefinition, ErrorEventDefinition…). ' +
                    'Continue from it with "after" for the exception path',
                ),
              interrupting: z
                .boolean()
                .optional()
                .describe('Boundary event only: false for a non-interrupting event (the activity goes on). Default: true'),
              x: z.number().optional().describe('Horizontal position of the shape centre, in diagram pixels. Give x and y together, without "after"'),
              y: z.number().optional().describe('Vertical position of the shape centre, in diagram pixels'),
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
        'message flow between participants, association to an annotation. Returns the id of each connection. ' +
        'Shapes added with "after" in add_shapes are already connected. To rename a connection later, use update_elements; ' +
        'to remove one, remove_elements. The user can undo the call with Ctrl+Z.',
      annotations: edit(false, false),
      inputSchema: {
        connections: z
          .array(
            z.object({
              source: elementId.describe('Id of the shape the connection starts from'),
              target: elementId.describe('Id of the shape the connection goes to'),
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
        'Renames elements, changes their type (for example Task to UserTask), fills in their Documentation field, or sets the probability of a gateway branch. ' +
        'Only the fields given change. A type change can produce a new id, returned in the result. ' +
        'For colors and fonts use style_elements; to move shapes, auto_layout. The user can undo the call with Ctrl+Z.',
      annotations: edit(false, false),
      inputSchema: {
        elements: z
          .array(
            z.object({
              id: elementId,
              name: z.string().optional().describe('New label. Empty string to clear it'),
              type: bpmnType.optional(),
              eventDefinition: eventDefinition.optional(),
              documentation: z.string().max(4000).optional().describe('Text of the Documentation field, in Markdown (## headings, - lists, **bold**, [links](https://…)). It replaces the whole field: to complete a documentation, send the existing text with your additions. Empty string to clear it'),
              probability: z
                .number()
                .min(0)
                .max(100)
                .nullable()
                .optional()
                .describe('Sequence flows leaving an exclusive, inclusive, complex or event-based gateway only: probability of this branch in %, used by the heatmap simulation. null to clear it'),
            }),
          )
          .min(1),
      },
    },
    {
      name: 'style_elements',
      title: 'Style elements',
      description:
        'Sets the colors and text formatting of shapes and connections, like the editor\'s Shape and Text panels. ' +
        'Each field is optional: only the fields given change. An empty string removes that setting. ' +
        'Colors are hexadecimal, for example #1E88E5. A connection only has a stroke. ' +
        'For a dark fill, set textColor to "auto" (or #FFFFFF) so the label stays readable. ' +
        'reset: true removes every color and text formatting of the element first. ' +
        'Returns the resulting style of each element. Names and types are changed with update_elements. The user can undo it in one step.',
      annotations: edit(false, true),
      inputSchema: {
        elements: z
          .array(
            z.object({
              id: elementId,
              reset: z.boolean().optional().describe('Remove all colors and text formatting before applying the other fields'),
              fill: color.optional().describe('Shape fill color. Empty string for the default'),
              stroke: color.optional().describe('Shape outline or connection line color. Empty string for the default'),
              textColor: z
                .union([color, z.literal('auto')])
                .optional()
                .describe('Label color, or "auto" for black or white, whichever reads best on the fill. Empty string for the default'),
              bold: z.boolean().optional(),
              italic: z.boolean().optional(),
              underline: z.boolean().optional(),
              fontSize: z.number().int().min(8).max(48).optional().describe('Label font size in points. The editor offers 10, 12, 14, 18 and 24'),
              font: z.enum(FONT_NAMES).optional().describe('Label font'),
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
        'Handles pools, lanes, message flows, boundary events, expanded subprocesses, annotations and groups. ' +
        'Colors, names and connections are kept: only positions and routes change. Returns the layout warnings, if any. ' +
        'Call it once the drawing is complete, then check the result with get_diagram_image. ' +
        'The user can undo it in one step.',
      inputSchema: {},
      annotations: edit(false, true),
    },
    {
      name: 'validate_diagram',
      title: 'Validate the diagram',
      description:
        'Checks the diagram and returns a report. Six checks: the XML is well formed; every element and attribute exists in the BPMN 2.0 metamodel; ' +
        'references resolve, ids are unique and each flow stays in its scope (sequence flows inside their process, message flows between two pools); ' +
        'every element is drawn (diagram interchange complete); bpmn-js reimports the document without warnings; ' +
        'the recommended bpmnlint rules raise no error (isolated element, missing start or end event, element without a label, superfluous gateway…). ' +
        'Returns the element counts, each check with its problems, the number of errors and warnings, and the bpmnlint issues ' +
        'with the id of the element concerned, the rule and the message. Read-only: fix the problems with the editing tools, then validate again. ' +
        'For an analysis of how the process runs, use get_process_report.',
      inputSchema: {},
      annotations: READ,
    },
    {
      name: 'remove_elements',
      title: 'Remove elements',
      description:
        'Removes shapes or connections from the diagram. Removing a shape also removes its connections and, for a pool or an expanded subprocess, what it contains. ' +
        'Read the ids with get_shapes first. To change an element rather than delete it, use update_elements; to replace the whole diagram, set_diagram_xml. ' +
        'If one id is unknown, nothing is removed. The user can undo the call with Ctrl+Z.',
      annotations: edit(true, true),
      inputSchema: {
        ids: z.array(elementId).min(1).describe('Ids of the shapes and connections to remove, as returned by get_shapes'),
      },
    },
    {
      name: 'get_process_report',
      title: 'Read the process report',
      description:
        'Returns the process report of the open diagram, in Markdown, as the editor\'s Export menu produces it: key figures, ' +
        'modeling findings by level (error, warning, to complete) with their source (bpmnlint, model check, simulation), ' +
        'improvement areas by priority with the expected effect, end events, activities by lane, and the element sequence ' +
        '(type, lane, documentation, outgoing flows with their conditions). Use it to review a model, write a procedure, or ' +
        'propose improvements; the improvement areas you add are your own analysis, to be validated by the process owner. ' +
        'Read-only. To check conformance only, validate_diagram is shorter; to store your analysis in the report, set_report_commentary.',
      annotations: READ,
      inputSchema: {
        simulate: z
          .boolean()
          .optional()
          .describe('Compute 100 tokens first, following the gateway probabilities, to add instance counts, rework and the share of each end event'),
      },
    },
    {
      name: 'set_report_commentary',
      title: 'Write the analysis of the process report',
      description:
        'Stores your analysis of the process in the diagram file, where the process report shows it in a section of its own, ' +
        'marked as written by the AI co-pilot, with your name and the date. It replaces the previous analysis. ' +
        'Read get_process_report (with simulate for token counts) first, and base each point on its findings and figures. ' +
        'Each point has a kind: bottleneck (an activity or path most instances go through, or that repeats), rare_path ' +
        '(a branch or end seldom or never reached), risk (a missing exception, a dead end, a gap in the model), or improvement ' +
        '(a concrete change and its expected effect). Cite the elements concerned by id. ' +
        'Write in the language of the user. An empty summary with no points removes the analysis. The user can undo it with Ctrl+Z.',
      annotations: edit(true, true),
      inputSchema: {
        summary: z.string().max(2000).describe('Two to five sentences on how the process runs and what matters most'),
        points: z
          .array(
            z.object({
              kind: z.enum(['bottleneck', 'rare_path', 'risk', 'improvement']),
              elements: z.array(elementId).max(10).optional().describe('Ids of the elements this point is about'),
              text: z.string().min(1).max(600).describe('The point, with the figure it relies on when there is one'),
            }),
          )
          .max(12),
      },
    },
  ]
}
