// Prompts MCP : des recettes que l'utilisateur choisit dans son client MCP
// (menu des prompts de Claude Desktop, commande /mcp__bpmn-pilot__… de Claude Code).
// Elles s'appuient sur les règles de modélisation de INSTRUCTIONS (tools.js).
//
// Ce module n'importe rien : buildPrompts(z) décrit les arguments avec le zod fourni.
// Chaque prompt renvoie le texte d'un message utilisateur.

export function buildPrompts(z) {
  return [
    {
      name: 'model_process',
      title: 'Model a process from a description',
      description: 'Draws a process in the open editor from a text description, following the modeling rules.',
      argsSchema: {
        description: z.string().min(1).describe('The process to model, in plain words'),
      },
      text: ({ description }) =>
        `Model this process in the BPMN editor:

${description}

- Read the current diagram with get_shapes first. If it is not empty, ask me whether to add to it or replace it.
- Follow the modeling rules of this server: start and end events, verb + object for tasks, object + state for events, a question on each exclusive gateway with answers on its flows, the happy path from left to right.
- Name the elements in the language of the description.
- Finish with auto_layout, then validate_diagram, and fix what it reports.
- Then summarize the process in a few lines and list the assumptions you made.`,
    },
    {
      name: 'model_collaboration',
      title: 'Model a collaboration between organizations',
      description:
        'Draws one pool per organization or actor, with message flows between them, from a text description.',
      argsSchema: {
        description: z.string().min(1).describe('The exchange to model, in plain words'),
        participants: z
          .string()
          .optional()
          .describe('The organizations or actors, separated by commas. Left empty, they are taken from the description'),
      },
      text: ({ description, participants }) =>
        `Model this collaboration in the BPMN editor:

${description}
${participants ? `\nParticipants: ${participants}\n` : ''}
- Read the current diagram with get_shapes first. If it is not empty, ask me whether to add to it or replace it.
- Create one pool per participant, one under the other. Use lanes only for roles inside one participant.
- Model each participant's own process inside its pool, with its own start and end events.
- Connect the pools only with message flows (connect_shapes between shapes of two pools), never with sequence flows.
- Follow the modeling rules of this server, and name the elements in the language of the description.
- Finish with auto_layout, then validate_diagram, and fix what it reports.`,
    },
    {
      name: 'review_diagram',
      title: 'Review the diagram',
      description: 'Reviews the open diagram against the modeling rules and the validator, without changing anything.',
      argsSchema: {},
      text: () =>
        `Review the BPMN diagram open in the editor. Do not change anything.

- Read it with get_shapes, look at it with get_diagram_image, and run validate_diagram.
- List the problems, most important first: validation errors, then breaches of the modeling rules of this server (names, gateways, events, happy path, layout), then what is unclear for a reader.
- For each problem, name the element and propose a concrete fix, such as a better name.
- End with a short verdict, and ask me which fixes to apply.
Reply in the language of the diagram's names.`,
    },
    {
      name: 'tidy_diagram',
      title: 'Tidy up the diagram',
      description:
        'Renames elements to the naming conventions, fixes validation errors and lays the diagram out, keeping its meaning.',
      argsSchema: {},
      text: () =>
        `Tidy up the BPMN diagram open in the editor, keeping its meaning.

- Read it with get_shapes and run validate_diagram.
- Rename elements that break the naming rules of this server, in the language of the existing names.
- Fix the validation errors. Do not add or remove steps of the process: if a fix would change what the process does, list it and ask me instead.
- Then call auto_layout and validate_diagram again.
- Finally, list what you changed. I can undo everything with Ctrl+Z.`,
    },
  ]
}
