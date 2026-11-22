# Serveur MCP et chat intégré de l'éditeur BPMN (prototype)

Ce serveur permet à une IA (Claude Code, Claude Desktop ou tout client MCP) de lire et de dessiner
dans l'éditeur BPMN **ouvert dans le navigateur**. Les modifications apparaissent en direct sur le
canevas, comme si elles étaient faites à la main, et chaque appel d'outil s'annule d'un seul Ctrl+Z, sauf `set_diagram_xml` et `auto_layout` qui rechargent tout le diagramme.

## Fonctionnement

```
Client MCP  ──HTTP──▶  serveur MCP (Node, 127.0.0.1:3333)  ──WebSocket──▶  onglet de l'éditeur (bpmn-js)
             /mcp                                            /bridge
```

- Le serveur valide les arguments de chaque outil puis relaie l'appel à l'onglet ouvert.
- L'onglet exécute l'outil avec l'API de modélisation de bpmn-js (`src/mcp-bridge.js`) et renvoie le résultat.
- Si plusieurs onglets sont ouverts, c'est le dernier utilisé qui reçoit les appels des clients MCP. Le chat intégré, lui, dessine toujours dans l'onglet où l'on discute.
- Sans onglet ouvert, les outils répondent par une erreur explicite.
- Un badge « MCP » dans la barre d'outils indique si l'éditeur est relié au serveur.

## Chat intégré

Le bouton « 💬 Assistant » de la barre d'outils ouvre un panneau de discussion à droite du canevas.
On y décrit un processus ou une modification, et le modèle la dessine dans **cet onglet** avec les mêmes
outils que le serveur MCP. Sous chaque réponse, une pastille par outil appelé (✓ réussi, ✗ échoué).
Le menu « Modèle », au-dessus de la zone de saisie, choisit le modèle parmi ceux que le serveur propose
(il n'apparaît qu'à partir de deux modèles). Le choix est retenu par le navigateur. Passer d'un
fournisseur à l'autre ouvre une nouvelle discussion, sans toucher au diagramme.
Le bouton « Arrêter » interrompt la réponse en cours. « Nouvelle discussion » repart de zéro.

```
éditeur (panneau de chat) ──HTTP /chat──▶ serveur ──API Claude──────────────▶ Claude
                                                  └─API compatible OpenAI──▶ OpenAI, OpenRouter, Ollama…
                          ◀──WebSocket── outils exécutés dans l'onglet
```

- Les clés d'API restent sur le serveur. Le navigateur ne reçoit que la liste des modèles (identifiant
  et libellé), ni clé ni adresse de fournisseur, et le serveur refuse tout modèle absent de cette liste.
- La route `/chat` n'accepte que les pages de l'éditeur (même liste d'origines que le WebSocket).
- Les conversations sont gardées en mémoire par le serveur (20 au plus) et perdues à son redémarrage.
- Si Claude Opus ou Sonnet décline une demande, l'API la rejoue sur un modèle de repli
  (`fallbacks: "default"`). Haiku n'a pas ce repli.
- Chaque message consomme des crédits d'API : la clé de l'organisation à crédits inclus s'arrête
  quand ils sont épuisés, une clé avec moyen de paiement est facturée à l'usage. Il en va de même chez
  les fournisseurs compatibles OpenAI, sauf un modèle local (Ollama, LM Studio).

### Configurer les fournisseurs

Copier `mcp/.env.example` en `mcp/.env` (exclu de git) et remplir ce qui sert. Un fournisseur n'apparaît
dans le menu que s'il est configuré. Les deux peuvent l'être en même temps.

**Anthropic** : il suffit de la clé. Le menu propose alors Claude Opus 5.5, Sonnet 5.5 et Haiku 5.5.

```
ANTHROPIC_API_KEY=sk-ant-...
```

**Compatible OpenAI** : tout service qui expose `/chat/completions` avec appels d'outils (`tools`).
La liste des modèles est obligatoire, car elle dépend du service.

```
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_API_KEY=sk-or-...
OPENAI_MODELS=openai/gpt-5=GPT-5,mistralai/mistral-large=Mistral Large
OPENAI_LABEL=OpenRouter
```

Pour un modèle local avec Ollama, pas de clé : `OPENAI_BASE_URL=http://localhost:11434/v1` et
`OPENAI_MODELS=qwen3:14b`. Le modèle doit savoir appeler des outils, et un petit modèle dessine moins
bien qu'un grand.

Sans aucun fournisseur, le serveur démarre quand même : les outils MCP marchent, le panneau indique
que le chat n'est pas configuré.

### Dans un docker compose

Les mêmes variables se passent par `environment`, les clés de préférence par un fichier `.env` à côté
du compose, jamais écrites dans le compose lui-même :

```yaml
services:
  bpmn-mcp:
    environment:
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      CHAT_MODEL: anthropic:claude-sonnet-5-5
      OPENAI_BASE_URL: ${OPENAI_BASE_URL:-}
      OPENAI_API_KEY: ${OPENAI_API_KEY:-}
      OPENAI_MODELS: ${OPENAI_MODELS:-}
      OPENAI_LABEL: ${OPENAI_LABEL:-}
```

## Lancer

Dans deux terminaux, à la racine du dépôt :

```
npm install && npm run dev
cd mcp && npm install && npm start
```

Puis ouvrir http://localhost:5173. Le badge passe à « MCP : connecté ».

Pour Claude Code, le fichier `.mcp.json` à la racine déclare déjà le serveur
(`http://127.0.0.1:3333/mcp`).

## Outils

| Outil | Rôle |
|---|---|
| `get_shapes` | liste les formes et les connexions du diagramme (id, type, nom, position, liens) |
| `get_diagram_xml` | renvoie le diagramme en BPMN 2.0 XML |
| `set_diagram_xml` | remplace tout le diagramme. Un XML illisible ou sans partie graphique est refusé et le diagramme reste inchangé |
| `add_shapes` | ajoute des formes, à la suite d'un élément (`after`, placement et connexion automatiques), à une position, ou à droite du diagramme |
| `connect_shapes` | relie deux formes. Le type de connexion suit les règles BPMN de bpmn-js |
| `update_elements` | renomme ou change le type d'éléments (Task vers UserTask, événement minuté…) |
| `remove_elements` | supprime des formes ou des connexions |
| `auto_layout` | range tout le diagramme, comme le bouton « Ranger ». Vide l'historique d'annulation |
| `validate_diagram` | vérifie le diagramme avec bpmnlint et renvoie les erreurs et avertissements, élément par élément |

Un appel qui échoue en cours de route est annulé en entier : le diagramme ne reste jamais à moitié modifié.

## Sécurité

- Le serveur n'écoute que sur `127.0.0.1`.
- Les requêtes MCP dont l'en-tête `Host` n'est pas local sont refusées (protection contre le DNS rebinding, fournie par le SDK).
- Seules les pages de l'éditeur peuvent se connecter au WebSocket : l'origine doit figurer dans
  `BPMN_EDITOR_ORIGINS` (par défaut `http://localhost:5173` et `http://127.0.0.1:5173`).
- Le pont et le panneau de chat ne sont actifs dans l'éditeur qu'en développement, ou si `VITE_MCP_BRIDGE_URL` est définie au build.
  La version de production servie par nginx n'est pas modifiée.

## Variables d'environnement

Elles peuvent aussi être placées dans `mcp/.env`.

| Variable | Défaut | Rôle |
|---|---|---|
| `MCP_PORT` | `3333` | port du serveur |
| `BPMN_EDITOR_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | origines autorisées pour le WebSocket |
| `ANTHROPIC_API_KEY` | aucune | clé d'API Anthropic. Sans elle, pas de modèle Claude dans le menu |
| `ANTHROPIC_MODELS` | `claude-opus-5-5=Claude Opus 5.5,claude-sonnet-5-5=Claude Sonnet 5.5,claude-haiku-5-5=Claude Haiku 5.5` | modèles Claude proposés, `identifiant=Libellé` séparés par des virgules (libellé facultatif) |
| `CHAT_EFFORT` | `medium` | effort de réflexion des modèles Claude : `low`, `medium`, `high`, `xhigh` ou `max` |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | adresse de l'API compatible OpenAI, sans `/chat/completions` |
| `OPENAI_API_KEY` | aucune | clé de ce fournisseur. Facultative pour un serveur local |
| `OPENAI_MODELS` | aucune | modèles proposés, même format que `ANTHROPIC_MODELS`. Sans elle, pas de fournisseur compatible OpenAI |
| `OPENAI_LABEL` | `Compatible OpenAI` | nom du fournisseur dans le menu (OpenRouter, Ollama…) |
| `OPENAI_REASONING_EFFORT` | aucune | envoyée telle quelle en `reasoning_effort`, pour les modèles qui l'acceptent |
| `CHAT_MODEL` | le premier de la liste | modèle choisi par défaut dans le menu : `anthropic:claude-sonnet-5-5`, `openai:qwen3:14b`, ou l'identifiant seul |
| `VITE_MCP_BRIDGE_URL` (côté éditeur) | `ws://127.0.0.1:3333/bridge` en développement | adresse du pont |

## Limites du prototype

- L'onglet de l'éditeur doit être ouvert pour que l'IA dessine.
- `auto_layout` hérite des limites de bpmn-auto-layout 1.3.0 : seul le premier participant d'une collaboration est rangé, les annotations et les flux de message ne sont pas placés.
