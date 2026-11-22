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
On y décrit un processus ou une modification, et Claude la dessine dans **cet onglet** avec les mêmes
outils que le serveur MCP. Sous chaque réponse, une pastille par outil appelé (✓ réussi, ✗ échoué).
Le bouton « Arrêter » interrompt la réponse en cours. « Nouvelle discussion » repart de zéro.

```
éditeur (panneau de chat) ──HTTP /chat──▶ serveur ──API Claude──▶ Claude
                          ◀──WebSocket── outils exécutés dans l'onglet
```

- La clé d'API reste sur le serveur, le navigateur n'en voit jamais.
- La route `/chat` n'accepte que les pages de l'éditeur (même liste d'origines que le WebSocket).
- Les conversations sont gardées en mémoire par le serveur (20 au plus) et perdues à son redémarrage.
- Si Claude décline une demande, l'API la rejoue sur un modèle de repli (`fallbacks: "default"`).
- Chaque message consomme des crédits d'API : la clé de l'organisation à crédits inclus s'arrête
  quand ils sont épuisés, une clé avec moyen de paiement est facturée à l'usage.

Pour l'activer, créer `mcp/.env` (exclu de git) :

```
ANTHROPIC_API_KEY=sk-ant-...
```

Sans clé, le serveur démarre quand même : les outils MCP marchent, le panneau indique que le chat
n'est pas configuré.

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
| `ANTHROPIC_API_KEY` | aucune | clé d'API du chat intégré. Sans elle, le chat est inactif |
| `CHAT_MODEL` | `claude-opus-5-5` | modèle du chat |
| `CHAT_EFFORT` | `medium` | effort de réflexion : `low`, `medium`, `high`, `xhigh` ou `max` |
| `VITE_MCP_BRIDGE_URL` (côté éditeur) | `ws://127.0.0.1:3333/bridge` en développement | adresse du pont |

## Limites du prototype

- L'onglet de l'éditeur doit être ouvert pour que l'IA dessine.
- `auto_layout` hérite des limites de bpmn-auto-layout 1.3.0 : seul le premier participant d'une collaboration est rangé, les annotations et les flux de message ne sont pas placés.
