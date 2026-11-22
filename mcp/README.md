# Serveur MCP de l'éditeur BPMN (prototype)

Ce serveur permet à une IA (Claude Code, Claude Desktop ou tout client MCP) de lire et de dessiner
dans l'éditeur BPMN **ouvert dans le navigateur**. Les modifications apparaissent en direct sur le
canevas, comme si elles étaient faites à la main, et chaque appel d'outil s'annule d'un seul Ctrl+Z.

## Fonctionnement

```
Client MCP  ──HTTP──▶  serveur MCP (Node, 127.0.0.1:3333)  ──WebSocket──▶  onglet de l'éditeur (bpmn-js)
             /mcp                                            /bridge
```

- Le serveur valide les arguments de chaque outil puis relaie l'appel à l'onglet ouvert.
- L'onglet exécute l'outil avec l'API de modélisation de bpmn-js (`src/mcp-bridge.js`) et renvoie le résultat.
- Si plusieurs onglets sont ouverts, c'est le dernier utilisé qui reçoit les appels.
- Sans onglet ouvert, les outils répondent par une erreur explicite.
- Un badge « MCP » dans la barre d'outils indique si l'éditeur est relié au serveur.

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

Un appel qui échoue en cours de route est annulé en entier : le diagramme ne reste jamais à moitié modifié.

## Sécurité

- Le serveur n'écoute que sur `127.0.0.1`.
- Les requêtes MCP dont l'en-tête `Host` n'est pas local sont refusées (protection contre le DNS rebinding, fournie par le SDK).
- Seules les pages de l'éditeur peuvent se connecter au WebSocket : l'origine doit figurer dans
  `BPMN_EDITOR_ORIGINS` (par défaut `http://localhost:5173` et `http://127.0.0.1:5173`).
- Le pont n'est actif dans l'éditeur qu'en développement, ou si `VITE_MCP_BRIDGE_URL` est définie au build.
  La version de production servie par nginx n'est pas modifiée.

## Variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `MCP_PORT` | `3333` | port du serveur |
| `BPMN_EDITOR_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | origines autorisées pour le WebSocket |
| `VITE_MCP_BRIDGE_URL` (côté éditeur) | `ws://127.0.0.1:3333/bridge` en développement | adresse du pont |

## Limites du prototype

- L'onglet de l'éditeur doit être ouvert pour que l'IA dessine.
- Pas encore de mise en page automatique, de validation (bpmnlint) ni de chat intégré.
