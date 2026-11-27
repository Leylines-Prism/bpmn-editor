#!/usr/bin/env python3
# Insère dans aide.html et help.html la section « Exemple suivi » et un encart par exemple.
# À relancer sans risque : les blocs déjà insérés (marqués <!-- example:… -->) sont remplacés.
# Le nom de l'entreprise fictive ne figure que dans la section d'introduction : COMPANY ci-dessous,
# comme scripts/examples/story.mjs.
import re
import sys

COMPANY = 'Néréide Networks'


def uib(icon, label):
    return f'<span class="uib"><span class="ico" data-icon="{icon}" aria-hidden="true"></span>{label}</span>'


def figure(lang, name, w, h, alt, cap):
    return (f'<figure><img src="/src/help/img/{lang}-exemple-{name}.webp" width="{w}" height="{h}" '
            f'alt="{alt}" loading="lazy" /><figcaption>{cap}</figcaption></figure>')


def size(name, lang):
    # Largeur et hauteur d'une image WebP (en-tête VP8, VP8L ou VP8X), sans dépendance.
    d = open(f'src/help/img/{lang}-exemple-{name}.webp', 'rb').read(40)
    kind = d[12:16]
    if kind == b'VP8X':
        return 1 + int.from_bytes(d[24:27], 'little'), 1 + int.from_bytes(d[27:30], 'little')
    if kind == b'VP8L':
        bits = int.from_bytes(d[21:25], 'little')
        return 1 + (bits & 0x3FFF), 1 + ((bits >> 14) & 0x3FFF)
    return int.from_bytes(d[26:28], 'little') & 0x3FFF, int.from_bytes(d[28:30], 'little') & 0x3FFF

L = {
    'fr': {
        'page': 'aide.html', 'intro_id': 'exemple-suivi', 'after': 'premiers-pas', 'dir': 'examples/fr/',
        'toc_after': '<li><a href="#premiers-pas">Premiers pas</a></li>',
        'toc': '<li><a href="#exemple-suivi">Exemple suivi : un projet SD-WAN</a></li>',
        'title': lambda n, t: f'Exemple {n} sur 15 : {t}',
        'all': 'Tous les exemples',
        'open': uib('open', 'Ouvrir'),
    },
    'en': {
        'page': 'help.html', 'intro_id': 'worked-example', 'after': 'getting-started', 'dir': 'examples/en/',
        'toc_after': '<li><a href="#getting-started">Getting started</a></li>',
        'toc': '<li><a href="#worked-example">Worked example: an SD-WAN project</a></li>',
        'title': lambda n, t: f'Example {n} of 15: {t}',
        'all': 'All examples',
        'open': uib('open', 'Open'),
    },
}

# (n, ancre fr, ancre en, fichiers fr, fichiers en, titre fr, titre en, texte fr, texte en, image)
def examples():
    o = {'fr': L['fr']['open'], 'en': L['en']['open']}
    return [
        (1, 'premiers-pas', 'getting-started', ['01-croquis.bpmn'], ['01-sketch.bpmn'],
         'le croquis', 'the sketch',
         "Sept formes posées en deux minutes : un début, cinq étapes (site survey, HLD et LLD, déploiement des CPE, recette, transfert au Run), une fin. C'est déjà un processus lisible, et le point de départ de toute la série.",
         'Seven shapes placed in two minutes: a start, five steps (site survey, HLD and LLD, CPE deployment, acceptance, handover to Run), an end. It is already a readable process, and the starting point of the whole series.',
         ('sketch', 'Le croquis : Contrat signé, cinq tâches en ligne, Service en production.', 'Le croquis du projet SD-WAN.',
          'The sketch: Contract signed, five tasks in a row, Service live.', 'The sketch of the SD-WAN project.')),
        (2, 'dessiner', 'drawing', ['02-couloirs.bpmn'], ['02-lanes.bpmn'],
         'les couloirs et les décisions', 'lanes and decisions',
         "Le croquis prend un pool et quatre couloirs (client, chef de projet, ingénierie réseau, NOC), deux passerelles exclusives et leurs boucles : réserves du site survey à lever, post-checks en échec et rollback.",
         'The sketch gets a pool and four lanes (customer, project manager, network engineering, NOC), two exclusive gateways and their loops: site survey findings to clear, failed post-checks and rollback.',
         ('lanes', 'Le processus en quatre couloirs, avec les passerelles Sites prêts ? et Post-checks OK ? et leurs boucles.', 'Quatre couloirs, deux décisions, deux boucles.',
          'The process in four lanes, with the Sites ready? and Post-checks passed? gateways and their loops.', 'Four lanes, two decisions, two loops.')),
        (3, 'couleurs-texte', 'colors-text', ['03-mise-en-forme.bpmn'], ['03-styled.bpmn'],
         'la mise en forme', 'styling',
         'Une couleur par équipe, la même pour le fond et le contour, et une couleur à part pour les étapes manuelles.',
         'One color per team, the same for fill and outline, and a separate color for the manual steps.',
         ('styled', 'Le même processus avec une couleur par couloir.', 'Une couleur par équipe.',
          'The same process with one color per lane.', 'One color per team.')),
        (4, 'verifier', 'checking', ['04-a-corriger.bpmn'], ['04-to-fix.bpmn'],
         'à corriger', 'to fix',
         "Une version abîmée exprès : deux flux qui se rejoignent sur une tâche sans passerelle, et une tâche « Commander les liens DIA » reliée à rien. Ouvrez-la, cliquez sur le compteur de la vérification et corrigez jusqu'à « Aucun problème ».",
         'A version broken on purpose: two flows joining on a task without a gateway, and an "Order the DIA circuits" task connected to nothing. Open it, click the checking counter and fix it until "No issues".',
         ('broken', 'La version à corriger, avec le compteur de la vérification qui signale les erreurs.', 'Les erreurs signalées par la vérification.',
          'The version to fix, with the checking counter showing the errors.', 'Errors reported by the checks.')),
        (5, 'depuis-tableau', 'from-table', ['05-etapes.csv', '05-etapes.xlsx'], ['05-steps.csv', '05-steps.xlsx'],
         'depuis un tableau', 'from a table',
         f"Le même processus écrit en lignes, comme on le tiendrait dans Excel. Ouvrez le fichier, copiez les lignes et collez-les dans {uib('table', 'Depuis un tableau…')} : vous retrouvez l'exemple 2.",
         f"The same process written as rows, as you would keep it in Excel. Open the file, copy the rows and paste them into {uib('table', 'From a table…')}: you get example 2 back.",
         None),
        (6, 'responsabilites', 'responsibilities', ['06-documente.bpmn'], ['06-documented.bpmn'],
         'documenté', 'documented',
         "Chaque activité porte sa documentation en Markdown (checklist du site survey, HLD et LLD, pre-checks, post-checks et critères de rollback, dossier de transfert au Run), son Assigné à, ses systèmes et sa matrice RACI. Les fiches de procédure et la matrice RACI s'exportent depuis ce fichier.",
         'Each activity carries its documentation in Markdown (site survey checklist, HLD and LLD, pre-checks, post-checks and rollback criteria, handover pack), its Assignee, its systems and its RACI matrix. Procedure sheets and the RACI matrix export from this file.',
         ('documented', 'Le processus documenté : la pastille de documentation sur les tâches.', 'Le processus documenté.',
          'The documented process: the documentation badge on the tasks.', 'The documented process.')),
        (7, 'assistant', 'assistant', ['07-cahier-des-charges.md'], ['07-requirements.md'],
         'le cahier des charges', 'the requirements',
         "Le cahier des charges du client, fictif (contexte MPLS, cible technique, attentes sur le processus, planning et indicateurs), avec en fin de fichier un prompt prêt à copier. Joignez-le dans le chat du co-pilote IA et comparez son dessin avec l'exemple 6, puis avec l'exemple 8.",
         'The customer requirements, fictitious (MPLS context, target design, process expectations, schedule and KPIs), with a ready-to-copy prompt at the end of the file. Attach it in the AI co-pilot chat and compare its drawing with example 6, then with example 8.',
         None),
        (8, 'exemples-prompts', 'prompt-examples', ['08-v2-change.bpmn'], ['08-v2-change.bpmn'],
         'la version 2', 'version 2',
         f"La version 2, telle que l'exemple 7 la décrit. Le client devient un pool à part, relié par des flux de messages. Un agent IA génère les templates ZTP, un ingénieur les relit (peer review), et la bascule passe par un sous-processus de gestion des changements. Comparez-la avec l'exemple 6 dans {uib('compare', 'Comparer avec un fichier…')} (voir <a href=\"#comparer\">Comparer deux versions</a>).",
         f"Version 2, as example 7 describes it. The customer becomes a separate pool, linked by message flows. An AI agent generates the ZTP templates, an engineer peer-reviews them, and the cutover goes through a change management subprocess. Compare it with example 6 in {uib('compare', 'Compare with a file…')} (see <a href=\"#compare\">Compare two versions</a>).",
         ('v2', 'La version 2 : pool Client relié par des flux de messages, couloir Automatisation (agent IA) et sous-processus Gérer le change.', 'La version 2, deux pools et un sous-processus.',
          'Version 2: Customer pool linked by message flows, Automation (AI agent) lane and Manage the change subprocess.', 'Version 2, two pools and a subprocess.')),
        (9, 'carte-chaleur', 'heatmap', ['09-simulation.bpmn'], ['09-simulation.bpmn'],
         'simulation et carte de chaleur', 'simulation and heatmap',
         "La version 2 avec des probabilités sur les branches : 20 % des sites avec des réserves au premier site survey, 8 % de bascules en rollback. Lancez 1000 jetons et la carte de chaleur montre où le projet repasse.",
         'Version 2 with probabilities on the branches: 20 % of sites with findings at the first site survey, 8 % of cutovers rolled back. Run 1000 tokens and the heatmap shows where the project loops.',
         ('simulation', 'La carte de chaleur après 1000 jetons : Réaliser le site survey en rouge, repassé à cause de la boucle des réserves.', 'La carte de chaleur après 1000 jetons.',
          'The heatmap after 1000 tokens: Run the site survey in red, reached again through the findings loop.', 'The heatmap after 1000 tokens.')),
        (10, 'rapport-processus', 'process-report', ['10-rapport.pdf'], ['10-report.pdf'],
         'le rapport', 'the report',
         "Le rapport de processus tiré de l'exemple 9, tel qu'il sort de l'éditeur.",
         'The process report produced from example 9, as it comes out of the editor.',
         None),
        (11, 'potentiel-ia', 'ai-potential', ['11-potentiel-ia.bpmn'], ['11-ai-potential.bpmn'],
         "le potentiel d'IA", 'AI potential',
         "Chaque activité est classée : à automatiser, à assister ou humaine, avec la raison. Le rapport en fait la synthèse.",
         'Each activity is rated: automate, assist or human, with the reason. The report sums it up.',
         None),
        (12, 'risques-conformite', 'risks-compliance', ['12-conformite.bpmn'], ['12-compliance.bpmn'],
         'risques et conformité', 'risks and compliance',
         "Risques, contrôles et exigences sur les activités sensibles (AI Act art. 14 pour la relecture humaine des configurations, NIS2 art. 21, ISO 27001, RGPD art. 32), et la fiche d'identité du processus.",
         'Risks, controls and requirements on the sensitive activities (AI Act art. 14 for the human review of configurations, NIS2 art. 21, ISO 27001, GDPR art. 32), and the process identity card.',
         None),
        (13, 'decisions-dmn', 'dmn-decisions', ['13-decision.bpmn', '13-niveau-approbation.dmn', '13-niveau-approbation.xlsx'],
         ['13-decision.bpmn', '13-approval-level.dmn', '13-approval-level.xlsx'],
         "le niveau d'approbation", 'the approval level',
         "Dans le sous-processus Gérer le change, une tâche de règle métier classe la RFC (Standard, Normal ou CAB) selon l'impact métier et le nombre de sites de la vague. La table est aussi fournie seule, en .dmn et en Excel.",
         'In the Manage the change subprocess, a business rule task classifies the RFC (Standard, Normal or CAB) from the business impact and the number of sites in the wave. The table is also provided alone, as .dmn and Excel.',
         [('change', "L'intérieur du sous-processus Gérer le change : RFC créée, Classer le change (tâche de règle métier), passerelle Niveau ? vers Standard, Normal ou CAB, puis planification de la MW.", "Le sous-processus Gérer le change, ouvert.",
           'Inside the Manage the change subprocess: RFC raised, Classify the change (business rule task), Level? gateway to Standard, Normal or CAB, then MW scheduling.', 'The Manage the change subprocess, opened.'),
          ('decision', "La table de décision Niveau d'approbation du change dans la fenêtre DMN : deux entrées, une sortie, cinq règles.", "La table du niveau d'approbation.",
          'The Change approval level decision table in the DMN window: two inputs, one output, five rules.', 'The approval level table.')]),
        (14, 'dmn-fichiers', 'dmn-files', ['14-camunda-8.bpmn'], ['14-camunda-8.bpmn'],
         'pour Camunda 8', 'for Camunda 8',
         "L'exemple 13 exporté pour Camunda 8 : conditions en FEEL, tâches utilisateur assignées, décision appelée. Il s'ouvre dans Camunda Modeler.",
         'Example 13 exported for Camunda 8: conditions in FEEL, assigned user tasks, called decision. It opens in Camunda Modeler.',
         None),
        (15, 'experts-mcp', 'experts-mcp', ['15-prompt-agent-mcp.md'], ['15-mcp-agent-prompt.md'],
         'avec un agent MCP', 'with an MCP agent',
         "Le prompt à donner à un agent relié à l'éditeur et aux outils de l'entreprise : il lit la procédure et les tickets, dessine le processus réellement suivi et signale les écarts.",
         'The prompt to give an agent connected to the editor and to the company tools: it reads the procedure and the tickets, draws the process actually followed and reports the gaps.',
         None),
    ]


INTRO = {
    'fr': lambda: f'''<section id="exemple-suivi">
        <h2>Exemple suivi : un projet SD-WAN</h2>
        <p>{COMPANY}, intégrateur réseau fictif, déploie un SD-WAN managé pour un client de 40 agences. Ce même processus sert d'exemple tout au long de l'aide et grandit d'une section à l'autre : un croquis, puis des couloirs, de la documentation, une deuxième version avec le client, un agent IA et la gestion des changements, enfin la simulation, le rapport, la conformité, une table de décision et l'export vers un moteur.</p>
        <p>Chaque fichier s'ouvre dans l'éditeur avec {uib('open', 'Ouvrir')}. Les exemples 9 à 15 demandent le mode Expert.</p>
        <div class="table-wrap"><table class="examples">
          <thead><tr><th>N°</th><th>Étape</th><th>Fichiers</th></tr></thead>
          <tbody>
{{rows}}
          </tbody>
        </table></div>
      </section>''',
    'en': lambda: f'''<section id="worked-example">
        <h2>Worked example: an SD-WAN project</h2>
        <p>{COMPANY}, a fictitious network integrator, deploys a managed SD-WAN for a customer with 40 branches. This same process is the example throughout the help and grows from one section to the next: a sketch, then lanes, documentation, a second version with the customer, an AI agent and change management, and finally simulation, the report, compliance, a decision table and the export to an engine.</p>
        <p>Each file opens in the editor with {uib('open', 'Open')}. Examples 9 to 15 need Expert mode.</p>
        <div class="table-wrap"><table class="examples">
          <thead><tr><th>#</th><th>Step</th><th>Files</th></tr></thead>
          <tbody>
{{rows}}
          </tbody>
        </table></div>
      </section>''',
}


def links(lang, files):
    d = L[lang]['dir']
    return ' '.join(f'<a class="example-file" href="{d}{f}" download>{f}</a>' for f in files)


def build(lang):
    page = L[lang]['page']
    html = open(page, encoding='utf-8').read()
    html = re.sub(r'[ \t]*<!-- example:[a-z0-9]+ -->.*?<!-- /example -->\n', '', html, flags=re.S)
    if L[lang]['toc'] not in html:
        html = html.replace(L[lang]['toc_after'], L[lang]['toc_after'] + '\n              ' + L[lang]['toc'], 1)
    i = 0 if lang == 'fr' else 1
    rows = []
    for ex in examples():
        n, anchors, files, titles, texts, img = ex[0], ex[1:3], ex[3:5], ex[5:7], ex[7:9], ex[9]
        anchor, fl, title, text = anchors[i], files[i], titles[i], texts[i]
        rows.append(f'            <tr><td>{n}</td><td><a href="#{anchor}">{title[0].upper() + title[1:]}</a></td><td>{links(lang, fl)}</td></tr>')
        block = (f'<div class="note example" id="{"exemple" if lang == "fr" else "example"}-{n}">'
                 f'<p class="note-title">{L[lang]["title"](n, title)}</p><p>{text}</p>'
                 f'<p class="example-files">{links(lang, fl)} <a class="example-all" href="#{L[lang]["intro_id"]}">{L[lang]["all"]}</a></p></div>')
        for one in (img if isinstance(img, list) else [img] if img else []):
            name = one[0]
            alt, cap = (one[1], one[2]) if lang == 'fr' else (one[3], one[4])
            block += '\n        ' + figure(lang, name, *size(name, lang), alt, cap)
        block = f'        <!-- example:{n} -->\n        {block}\n        <!-- /example -->\n'
        # Avant le h3 ou la fin de section qui suit l'ancre.
        m = re.search(rf'id="{anchor}"', html)
        if not m:
            sys.exit(f'{page}: ancre {anchor} introuvable')
        nxt = re.compile(r'\n[ \t]*(<h3 |</section>)').search(html, m.end())
        html = html[:nxt.start() + 1] + block + html[nxt.start() + 1:]
    intro = INTRO[lang]().replace('{rows}', '\n'.join(rows))
    intro = f'      <!-- example:intro -->\n      {intro}\n      <!-- /example -->\n'
    m = re.search(rf'<section id="{L[lang]["after"]}">', html)
    end = html.index('</section>', m.end()) + len('</section>\n')
    html = html[:end] + intro + html[end:]
    open(page, 'w', encoding='utf-8').write(html)
    print(page, 'ok')


for lang in ('fr', 'en'):
    build(lang)
