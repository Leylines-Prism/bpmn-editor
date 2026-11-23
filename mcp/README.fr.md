# Serveur MCP et chat intégré de l'éditeur BPMN (prototype)

[English](README.md) | **Français**

Ce serveur permet à une IA (Claude Code, Claude Desktop, GitHub Copilot dans VS Code ou tout client MCP) de lire et de dessiner
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
- Les outils, les consignes et la boucle du chat sont définis dans `src/ai/`, partagé avec l'éditeur : le serveur se lance depuis le dépôt complet, pas depuis le seul dossier `mcp/`.

## Chat intégré

Le bouton « Assistant IA » de la barre d'outils ouvre un panneau de discussion à droite du canevas.
On y décrit un processus ou une modification, et le modèle la dessine dans **cet onglet** avec les mêmes
outils que le serveur MCP. Sous chaque réponse, une pastille par outil appelé (✓ réussi, ✗ échoué).
Le modèle se choisit dans la fenêtre Options, parmi ceux que le serveur propose et ceux des fournisseurs
réglés là ; le panneau l'affiche au-dessus de la zone de saisie. Passer d'un fournisseur à l'autre ouvre
une nouvelle discussion, sans toucher au diagramme.
Le bouton « Arrêter » interrompt la réponse en cours. « Nouvelle discussion » repart de zéro.

```
éditeur (panneau de chat) ──HTTP /chat──▶ serveur ──API Claude──────────────▶ Claude
                                                  └─API compatible OpenAI──▶ OpenAI, OpenRouter, Ollama…
                          ◀──WebSocket── outils exécutés dans l'onglet
```

- Les clés des variables d'environnement restent sur le serveur. Le navigateur ne reçoit que la liste
  des modèles (identifiant et libellé), ni clé ni adresse de fournisseur, et le serveur refuse tout
  modèle absent de cette liste.
- Un fournisseur réglé dans la fenêtre Options (voir plus bas) part avec chaque message : adresse,
  clé et modèle. Le serveur s'en sert pour cet appel, sans l'enregistrer ni l'écrire dans son journal.
- La route `/chat` n'accepte que les pages de l'éditeur (même liste d'origines que le WebSocket).
- Les conversations sont gardées en mémoire par le serveur (20 au plus) et perdues à son redémarrage.
- Les images et PDF joints dans le panneau partent avec le message (34 Mo au plus par requête, avec
  leur propre type de contenu `application/vnd.bpmn-chat+json`), puis sont transmis au modèle.
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

Sans aucun fournisseur, le serveur démarre quand même : les outils MCP marchent, et le panneau invite
à régler un fournisseur dans la fenêtre Options.

### Fenêtre Options

Le bouton « Options » du panneau ouvre une fenêtre avec un bloc par fournisseur : Anthropic, OpenAI,
Ollama et « Compatible OpenAI » (LiteLLM, LM Studio, vLLM…). Pour chacun : l'adresse (préremplie pour
Anthropic, OpenAI et Ollama), la clé, et les modèles à proposer. « Lister les modèles » les demande au
fournisseur, « Tester » vérifie l'adresse et la clé. Ces deux boutons ne consomment aucun crédit.
Les modèles d'un fournisseur ne sont proposés qu'après la réussite de « Tester » ou « Lister les
modèles », et de nouveau après un changement d'adresse ou de clé. « Modèle de l'assistant » choisit le
modèle du chat.

- Les réglages restent dans le navigateur. Les clés sont oubliées à la fermeture de l'onglet, sauf si
  « Se souvenir des clés sur votre appareil » est coché. « Effacer les clés » les retire.
- Les appels passent par le serveur (routes `/chat` et `/chat/models`) : l'adresse est vue depuis le
  serveur. S'il tourne dans docker, Ollama sur la machine hôte se joint par
  `http://host.docker.internal:11434/v1`.
- Les modèles des variables d'environnement restent proposés, sous leur propre groupe.

### Dans un docker compose

Le fichier `docker-compose.yml` à la racine du dépôt lance l'éditeur et ce serveur (voir le
[README principal](../README.fr.md#le-lancer-avec-docker)). Le serveur lit `mcp/.env` s'il existe. Les
variables peuvent aussi se passer par `environment`, les clés de préférence par un fichier `.env`
à côté du compose, jamais écrites dans le compose lui-même :

```yaml
services:
  mcp:
    environment:
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      CHAT_MODEL: anthropic:claude-sonnet-5-5
```

### Derrière un nom de domaine

Par défaut, le compose ne publie le site que sur `127.0.0.1` de la machine hôte. Pour le servir sous
un nom de domaine ou depuis une autre machine, régler ces variables dans un fichier `.env` à côté de
`docker-compose.yml` :

| Variable | Exemple | Rôle |
|---|---|---|
| `BPMN_EDITOR_ORIGINS` | `https://bpmn.example.com` | adresses des pages de l'éditeur, avec `http://` ou `https://`, séparées par des virgules. Le WebSocket et le chat n'acceptent qu'elles |
| `MCP_ALLOWED_HOSTS` | `bpmn.example.com` | noms d'hôte qu'utilisent les clients MCP |
| `BPMN_BIND` | `0.0.0.0` | interface où le site écoute (`127.0.0.1` par défaut). Utile seulement si le proxy tourne sur une autre machine |

| Installation | Adresse MCP |
|---|---|
| docker sur cette machine | `http://localhost:8080/mcp` (ou le port réglé dans `BPMN_PORT`) |
| développement (`npm run dev` et `mcp/`) | `http://127.0.0.1:3333/mcp` |
| docker derrière un nom de domaine ou un proxy inverse | `https://votre-domaine/mcp` |

Le proxy inverse doit transmettre l'en-tête `Host`, accepter le passage en WebSocket sur `/bridge`, et
ne pas retenir les réponses de `/mcp` et `/chat` (Caddy fait tout cela par défaut). Régler `MCP_TOKEN`
pour que les clients MCP doivent envoyer `Authorization: Bearer <jeton>`. Les pages de l'éditeur et
les diagrammes enregistrés restent ouverts à quiconque joint le site : placer une connexion devant au
niveau du proxy, comme dans le [README principal](../README.fr.md#le-servir-en-https).

## Lancer

Avec docker : `docker compose up -d --build` à la racine du dépôt, puis ouvrir http://localhost:8080.
Les clients MCP se connectent à `http://localhost:8080/mcp`.

En développement, dans deux terminaux, à la racine du dépôt :

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
| `get_diagram_image` | renvoie une image PNG du diagramme, tel qu'il est dessiné, pour que le modèle vérifie la mise en page ou la montre (avec le format OpenAI, l'assistant intégré ne peut pas la recevoir) |
| `set_diagram_xml` | remplace tout le diagramme. Un XML illisible ou sans partie graphique est refusé et le diagramme reste inchangé |
| `add_shapes` | ajoute des formes, à la suite d'un élément (`after`, placement et connexion automatiques), à une position, ou à droite du diagramme |
| `connect_shapes` | relie deux formes. Le type de connexion suit les règles BPMN de bpmn-js |
| `update_elements` | renomme ou change le type d'éléments (Task vers UserTask, événement minuté…) |
| `remove_elements` | supprime des formes ou des connexions |
| `auto_layout` | range tout le diagramme, comme le bouton « Ranger ». Vide l'historique d'annulation |
| `validate_diagram` | vérifie le diagramme avec bpmnlint et renvoie les erreurs et avertissements, élément par élément |

Un appel qui échoue en cours de route est annulé en entier : le diagramme ne reste jamais à moitié modifié.

## Diagrammes enregistrés

La fenêtre « Mes diagrammes » de l'éditeur peut enregistrer les diagrammes sur ce serveur, en plus du
navigateur. Les routes `/diagrams` les listent, les lisent, les enregistrent (`PUT`, corps en XML
BPMN, 10 Mo au plus), les renomment et les suppriment. Elles n'acceptent que les pages de l'éditeur,
comme `/chat`. Chaque diagramme est un fichier `<id>.bpmn` accompagné de `<id>.json` pour son nom et
sa date, dans `DIAGRAMS_DIR` (`mcp/data/diagrams` par défaut, exclu de git ; le volume `diagrams` en
docker).

## Sécurité

- Le serveur n'écoute que sur `127.0.0.1`. Dans son conteneur docker, il écoute sur toutes les
  interfaces du conteneur, mais le site n'est publié que sur `127.0.0.1` de la machine hôte.
- Avec `MCP_TOKEN`, `/mcp` répond 401 à toute requête sans `Authorization: Bearer <jeton>`. L'onglet
  de l'éditeur (`/bridge`) et le chat ne l'utilisent pas : ils sont limités aux origines de l'éditeur.
- Les requêtes MCP dont l'en-tête `Host` n'est pas local sont refusées (protection contre le DNS rebinding, fournie par le SDK).
  Dans docker, les noms acceptés sont ceux de `MCP_ALLOWED_HOSTS`.
- Seules les pages de l'éditeur peuvent se connecter au WebSocket : l'origine doit figurer dans
  `BPMN_EDITOR_ORIGINS` (par défaut `http://localhost:5173` et `http://127.0.0.1:5173`).
- Le pont et le panneau de chat ne sont actifs dans l'éditeur qu'en développement, dans l'image
  docker du compose, ou si `VITE_MCP_BRIDGE_URL` est définie au build.
- Les routes `/chat` et `/chat/models` appellent l'adresse qu'on leur donne : elles n'acceptent que les
  pages de l'éditeur, et le serveur ne doit pas être exposé sur un réseau public.
- Les routes `/diagrams` n'ont pas non plus d'authentification : quiconque atteint une page de l'éditeur
  servie par le serveur peut lire et modifier les diagrammes enregistrés.

## Variables d'environnement

Elles peuvent aussi être placées dans `mcp/.env`.

| Variable | Défaut | Rôle |
|---|---|---|
| `MCP_PORT` | `3333` | port du serveur |
| `MCP_HOST` | `127.0.0.1` (`0.0.0.0` dans l'image docker) | adresse d'écoute |
| `MCP_TOKEN` | aucune | jeton que les clients MCP doivent envoyer (`Authorization: Bearer <jeton>`). Sans lui, `/mcp` ne demande rien |
| `MCP_ALLOWED_HOSTS` | `localhost,127.0.0.1` | noms d'hôte acceptés quand `MCP_HOST` n'est pas local |
| `BPMN_EDITOR_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | origines autorisées pour le WebSocket et le chat |
| `ANTHROPIC_API_KEY` | aucune | clé d'API Anthropic. Sans elle, pas de modèle Claude dans le menu |
| `ANTHROPIC_MODELS` | `claude-opus-5-5=Claude Opus 5.5,claude-sonnet-5-5=Claude Sonnet 5.5,claude-haiku-5-5=Claude Haiku 5.5` | modèles Claude proposés, `identifiant=Libellé` séparés par des virgules (libellé facultatif) |
| `CHAT_EFFORT` | `medium` | effort de réflexion des modèles Claude : `low`, `medium`, `high`, `xhigh` ou `max` |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | adresse de l'API compatible OpenAI, sans `/chat/completions` |
| `OPENAI_API_KEY` | aucune | clé de ce fournisseur. Facultative pour un serveur local |
| `OPENAI_MODELS` | aucune | modèles proposés, même format que `ANTHROPIC_MODELS`. Sans elle, pas de fournisseur compatible OpenAI |
| `OPENAI_LABEL` | `OpenAI-compatible` | nom du fournisseur dans le menu (OpenRouter, Ollama…) |
| `OPENAI_REASONING_EFFORT` | aucune | envoyée telle quelle en `reasoning_effort`, pour les modèles qui l'acceptent |
| `CHAT_MODEL` | le premier de la liste | modèle choisi par défaut dans le menu : `anthropic:claude-sonnet-5-5`, `openai:qwen3:14b`, ou l'identifiant seul |
| `DIAGRAMS_DIR` | `mcp/data/diagrams` (`/data/diagrams` dans l'image docker) | dossier des diagrammes enregistrés sur le serveur |
| `VITE_MCP_BRIDGE_URL` (côté éditeur) | `ws://127.0.0.1:3333/bridge` en développement, `/bridge` dans le compose | adresse du pont. Une adresse relative vise le site lui-même |

## Limites du prototype

- L'onglet de l'éditeur doit être ouvert pour que l'IA dessine.
- `auto_layout` hérite des limites de bpmn-auto-layout 1.3.0 : seul le premier participant d'une collaboration est rangé, les annotations et les flux de message ne sont pas placés.
