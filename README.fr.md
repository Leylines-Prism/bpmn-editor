# bpmn-editor

[English](README.md) | **Français**

Éditeur BPMN 2.0 dans le navigateur (bpmn-js), avec un assistant IA qui dessine les processus qu'on lui décrit.

## Deux façons de l'utiliser

| | Version docker (auto-hébergée) | Version en ligne |
|---|---|---|
| Lancer | `docker compose up -d --build`, ou en développement `npm run dev` et le serveur du dossier `mcp/` | `npm run dev:online`, ou `npm run build:online` (dossier `dist-online/`) |
| Où tourne l'assistant | sur le serveur `mcp/`, qui exécute les outils dans l'onglet | dans la page elle-même |
| Fournisseurs | variables d'environnement, ou fenêtre Options | fenêtre Options |
| Clé d'API | sur le serveur, ou saisie dans Options et relayée sans être enregistrée | dans le navigateur du visiteur, envoyée directement au fournisseur |
| Serveur MCP pour Claude Code et autres clients | oui | non |

Le serveur et l'assistant sont décrits dans [mcp/README.fr.md](mcp/README.fr.md).

## Version docker

```
docker compose up -d --build
```

Puis ouvrir http://localhost:8080. Deux conteneurs démarrent : l'éditeur, servi par nginx, et le
serveur MCP. nginx relaie le serveur sur la même adresse (`/mcp`, `/bridge`, `/chat`). Le badge
« MCP : connecté » apparaît dans la barre d'outils.

- Clés d'API : dans `mcp/.env` (copier `mcp/.env.example`, fichier exclu de git et de l'image), ou
  saisies dans la fenêtre Options. Sans clé, l'éditeur et les outils MCP marchent quand même.
- Clients MCP (Claude Code…) : `http://localhost:8080/mcp`. Un clic sur le badge MCP de la barre
  d'outils donne l'adresse de votre installation et des réglages prêts à coller (voir plus bas).
- Par défaut, le site n'est joignable que depuis la machine qui le fait tourner (`127.0.0.1`).
  `BPMN_PORT` change le port (8080 par défaut).
- Ollama lancé sur la machine hôte se joint par `http://host.docker.internal:11434/v1`.
- Les diagrammes enregistrés sur le serveur sont gardés dans le volume docker `diagrams`
  (`/data/diagrams` dans le conteneur, un fichier `.bpmn` par diagramme). `docker compose down -v`
  les supprime.
- Le serveur n'a pas d'authentification : ne pas l'exposer sur un réseau public.

### Connecter un agent

Cliquer sur le badge **MCP** de la barre d'outils : la fenêtre « Connecter un agent » montre l'adresse
MCP de cette installation, calculée depuis l'adresse de la page, avec un bouton Copier et des réglages
prêts à coller pour Claude Code (`claude mcp add`), Claude Desktop (par `mcp-remote`) et les autres
clients (Cursor, VS Code, `.mcp.json`). L'agent dessine dans le dernier onglet de l'éditeur utilisé :
il faut le garder ouvert.

| Installation | Adresse MCP |
|---|---|
| docker sur cette machine | `http://localhost:8080/mcp` (ou le port réglé dans `BPMN_PORT`) |
| développement (`npm run dev` et `mcp/`) | `http://127.0.0.1:3333/mcp` |
| docker derrière un nom de domaine ou un proxy inverse | `https://votre-domaine/mcp` |

Pour joindre l'éditeur depuis une autre machine ou par un nom de domaine, régler ces variables dans un
fichier `.env` à côté de `docker-compose.yml` :

```
BPMN_BIND=0.0.0.0                      # écoute sur toutes les interfaces (127.0.0.1 par défaut)
BPMN_EDITOR_ORIGINS=https://bpmn.example.com
MCP_ALLOWED_HOSTS=bpmn.example.com
```

`BPMN_EDITOR_ORIGINS` liste les adresses des pages de l'éditeur (avec `http://` ou `https://`), et
`MCP_ALLOWED_HOSTS` les noms d'hôte qu'utilisent les clients MCP. Le proxy inverse doit transmettre
l'en-tête `Host` et accepter le passage en WebSocket sur `/bridge`.

Le serveur n'a pas de connexion. Mettre `MCP_TOKEN=une-longue-valeur-aléatoire` dans `mcp/.env` pour
que les clients MCP doivent envoyer `Authorization: Bearer <jeton>`, puis relancer le serveur. Le
bouton « Générer un jeton » de la fenêtre en tire un au hasard et le place dans la ligne pour
`mcp/.env` et dans les réglages à copier ; la page ne peut pas écrire `mcp/.env` elle-même. Les pages de l'éditeur et les diagrammes enregistrés restent ouverts à
quiconque joint le site : le garder sur un réseau de confiance ou derrière un proxy qui demande une
connexion.

## Fonctions de l'éditeur

### Fichiers

- **Nom du fichier** : le champ à gauche de la barre d'outils donne le nom utilisé pour
  l'enregistrement et tous les exports.
- **Nouveau** repart d'un diagramme vide.
- **Ouvrir** : « Fichier .bpmn ou .xml… » ouvre un fichier du disque, « Coller du XML… » ouvre un
  diagramme collé sous forme de code. On peut aussi glisser un fichier sur la page.
- **Exporter** : fichier .bpmn, fichier .xml, « Code XML à copier… » (une fenêtre pour copier ou
  télécharger le code), puis image SVG, image PNG et PDF.
- Le diagramme en cours est gardé par le navigateur et retrouvé à la réouverture de la page.
- **Mes diagrammes** garde plusieurs diagrammes : on enregistre celui en cours sous un nom, puis on
  peut les rouvrir, les renommer ou les supprimer. Ils sont enregistrés dans le navigateur (sur cet
  appareil seulement), et dans la version docker aussi sur le serveur, où n'importe quel navigateur
  qui y accède peut les ouvrir. Une fois un diagramme enregistré, **Ctrl+S** le met à jour.
  « Enregistrer comme nouveau » en fait une copie.

### Dessin

- Palette d'outils à gauche, menu contextuel à côté de l'élément sélectionné, copier-coller
  (y compris entre onglets) et copie d'une sélection en image.
- **Couleurs** : le pinceau du menu contextuel propose 18 couleurs, avec un fond pâle et un trait
  foncé lisible, et « Couleur personnalisée… » pour choisir n'importe quelle teinte. Le trait est
  alors calculé pour rester lisible.
- **Texte** : le bouton « A » du menu contextuel met en forme le libellé de l'élément : gras,
  italique, souligné, taille (10 à 24) et police (Sans serif, Serif, Monospace). « Texte par
  défaut » retire la mise en forme. Le style est enregistré dans le .bpmn selon la norme BPMN
  (`bpmndi:BPMNLabelStyle`). Le souligné n'apparaît pas dans l'export PDF.
- **Ranger** remet en ordre la disposition du diagramme.
- **Simulation** fait circuler des jetons dans le processus pour vérifier son déroulement.
- Vérification automatique des règles BPMN, avec signalement des erreurs sur le canevas.
- Grille, mini-carte et panneau des propriétés (masquable avec le bouton à droite).
- **Thème** : clair, sombre ou automatique selon le système.
- **Langue** : le bouton EN/FR passe l'interface de l'anglais (par défaut) au français. Le
  navigateur retient le choix, et le diagramme est gardé.

### Assistant IA

Le bouton **Assistant IA** ouvre le panneau de discussion : on décrit un processus, l'assistant le
dessine, dans la langue du message. La fenêtre « Options » règle les fournisseurs et les clés, et
choisit le modèle : les modèles d'un fournisseur sont proposés une fois sa connexion testée. Le panneau
affiche le modèle utilisé.

- La zone de saisie grandit avec le texte. Le bouton dans son coin ouvre un grand éditeur, pratique
  pour coller un long prompt ou l'ouvrir depuis un fichier .txt ou .md. Ctrl+Entrée envoie.
- Un message fait au plus 100 000 caractères.
- **Images et PDF** : on les colle (Ctrl+V, une capture d'écran par exemple), on les glisse sur le
  panneau, ou on les choisit avec le bouton trombone, puis on décrit ce qu'il faut dessiner. Jusqu'à 5
  fichiers par message : images de 5 Mo au plus (les grandes sont réduites), PDF de 20 Mo au plus. Les
  modèles Claude lisent les deux. Avec les fournisseurs compatibles OpenAI, les images dépendent du
  modèle, et les PDF ne partent que vers OpenAI.

## Version en ligne

- Fournisseurs : Anthropic, OpenAI, Ollama et tout serveur compatible OpenAI, réglés dans la fenêtre
  « Options » du panneau Assistant. Chaque visiteur utilise sa propre clé et paie ses propres appels.
- La clé reste dans le navigateur : le temps de la session de l'onglet, ou sur l'appareil si
  « Se souvenir des clés » est coché. Le site ne reçoit ni clé ni diagramme.
- Le fournisseur doit accepter les appels venant d'une page web (CORS). Anthropic les accepte.
  OpenAI ne les accepte pas toujours : la version docker évite ce blocage. Ollama doit être lancé avec
  `OLLAMA_ORIGINS` réglée sur l'adresse du site. Un serveur compatible (LiteLLM…) doit autoriser cette
  adresse dans son réglage CORS.
- La page n'exécute aucun script tiers : une politique de sécurité du contenu (CSP) n'autorise que les
  scripts du site, et la police Urbanist est servie par le site.
- Pas de serveur MCP dans cette version. Mes diagrammes enregistre dans le navigateur seulement.
- Confidentialité : un lien « Confidentialité » en bas du canevas dit ce qui quitte le navigateur. Rien
  n'est envoyé au site : diagrammes, réglages et clés restent dans le navigateur. Avec l'assistant, les
  messages, le diagramme et la clé partent directement chez le fournisseur d'IA choisi, qui applique ses
  propres règles. L'hébergeur du site garde des journaux techniques, comme l'adresse IP. Régler
  `VITE_SITE_HOST` au build pour nommer l'hébergeur (par exemple
  `VITE_SITE_HOST="GitHub Pages" npm run build:online`).
