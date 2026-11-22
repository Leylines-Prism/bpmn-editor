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
- Clients MCP (Claude Code…) : `http://localhost:8080/mcp`.
- Par défaut, le site n'est joignable que depuis la machine qui le fait tourner (`127.0.0.1`).
  `BPMN_PORT` change le port (8080 par défaut).
- Ollama lancé sur la machine hôte se joint par `http://host.docker.internal:11434/v1`.
- Le serveur n'a pas d'authentification : ne pas l'exposer sur un réseau public.

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
dessine, dans la langue du message. Le menu « Modèle » choisit le modèle, la fenêtre « Options » règle les fournisseurs et les
clés.

- La zone de saisie grandit avec le texte. Le bouton dans son coin ouvre un grand éditeur, pratique
  pour coller un long prompt ou l'ouvrir depuis un fichier .txt ou .md. Ctrl+Entrée envoie.
- Un message fait au plus 100 000 caractères.

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
- Pas de serveur MCP dans cette version.
