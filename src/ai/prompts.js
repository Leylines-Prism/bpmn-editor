// Prompts MCP : des recettes que l'utilisateur choisit dans son client MCP
// (menu des prompts de Claude Desktop, commande /mcp__bpmn-pilot__… de Claude Code).
// Elles s'appuient sur les règles de modélisation de INSTRUCTIONS (tools.js).
//
// Ce module n'importe rien : buildPrompts(z) décrit les arguments avec le zod fourni.
// Chaque prompt renvoie le texte d'un message utilisateur.

// Critique d'une description avant de la dessiner : commune au prompt MCP critique_description
// et à l'étape de critique du chat intégré (src/ai/chat-loop.js).
export const CRITIQUE_POINTS = `- who does what: the organizations or actors (pools) and the roles inside them (lanes);
- what starts the process and which results end it;
- each decision: the question asked and the condition of each answer;
- exceptions, cancellations, deadlines and waiting times;
- loops and repetitions, and when they stop;
- documents, data and messages exchanged;
- vague or contradictory wording.`

export const CRITIQUE_SEVERITIES = `- blocking: without the answer, the model would probably be wrong;
- major: an assumption is needed, and it changes the model;
- minor: a detail, such as a name.`

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
- Finish with layout_diagram, then validate_diagram, and fix what it reports.
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
- Finish with layout_diagram, then validate_diagram, and fix what it reports.`,
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
- Then call layout_diagram and validate_diagram again. If a few shapes still sit badly, adjust them with move_elements rather than laying out again.
- If a call gives a wrong result, back out of it with undo before trying again.
- Finally, list what you changed. I can undo everything with Ctrl+Z.`,
    },
    {
      name: 'write_user_stories',
      title: 'Write the user stories of each activity',
      description:
        'Writes user stories and acceptance criteria for each activity of the open diagram, saved in the diagram, for the team that will tool the process.',
      argsSchema: {},
      text: () =>
        `Write the user stories and acceptance criteria of each activity of the BPMN diagram open in the editor, as a product owner would for the team that will tool the process.

- Read it with get_shapes: name, lane, documentation, assignee, systems, and the stories and criteria already written.
- Save them with update_elements, keeping what is already written: userStories, one per line, "As a <role>, I want <action>, so that <benefit>"; acceptanceCriteria, one per line, testable, "Given <context>, when <event>, then <result>".
- Two or three stories and three to five criteria per activity at most. Change nothing else in the diagram.
- Then list the activities whose need is still unclear, with the question to ask.
Write in the language of the diagram's names. I can undo everything with Ctrl+Z, and export the backlog with Export > User stories (Markdown).`,
    },
    {
      name: 'critique_description',
      title: 'Review a description before modeling it',
      description:
        'Lists what is ambiguous or missing in a process description before drawing it, with a severity, the passage concerned and a question.',
      argsSchema: {
        description: z.string().min(1).describe('The process description to review, in plain words'),
      },
      text: ({ description }) =>
        `Review this process description before modeling it in BPMN. Do not draw anything yet.

${description}

Look for what is ambiguous or missing for a correct BPMN model:
${CRITIQUE_POINTS}

List at most 8 points, most severe first, in a table with three columns: severity, the exact passage concerned (or "missing" when nothing in the text covers it), and the question to ask me. Severities:
${CRITIQUE_SEVERITIES}

Then give the assumption you would make for each point, and ask me whether to draw now with these assumptions or to wait for my answers.
Reply in the language of the description.`,
    },
  ]
}
