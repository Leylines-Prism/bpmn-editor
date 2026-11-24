![BPMN Editor : dessiner des processus BPMN 2.0 dans le navigateur, à la main, avec un assistant IA ou depuis un agent MCP](public/social-preview.png)

# bpmn-editor

[English](README.md) | **Français**

![L'assistant IA dessine un processus de commande en ligne avec deux pools et quatre lanes, puis le range](docs/demo.fr.gif)

Un éditeur BPMN 2.0 dans le navigateur (bpmn-js), avec un assistant IA qui dessine les processus que
vous décrivez, et un serveur MCP pour que des agents comme Claude Code puissent y dessiner aussi. Il
tourne sur votre propre machine avec Docker.

> [!WARNING]
> **Pas fait pour être exposé sur internet, par conception.** La version Docker est prévue pour
> votre propre machine ou un réseau privé, elle n'a donc pas de connexion. Le risque reste limité,
> mais la publier revient à ouvrir à tous un service sans authentification : vos clés API peuvent
> être utilisées ou volées, et les diagrammes stockés dans le conteneur (les fichiers BPMN de « Mes
> diagrammes ») peuvent être lus ou supprimés. Par défaut, elle ne répond que sur cette machine
> (`127.0.0.1`). Si vous la mettez quand même sur internet, c'est à vos propres risques.

## Le lancer avec Docker

Il faut [Docker](https://docs.docker.com/get-docker/) avec Docker Compose. Deux images sont publiées
sur le GitHub Container Registry, pour amd64 et arm64 :

- `ghcr.io/leylines-prism/bpmn-editor` : l'éditeur.
- `ghcr.io/leylines-prism/bpmn-editor-mcp` : son serveur (assistant IA, MCP pour les agents,
  « Mes diagrammes »).

### En ligne de commande

```
mkdir bpmn-editor && cd bpmn-editor
curl -fsSLO https://raw.githubusercontent.com/Leylines-Prism/bpmn-editor/main/docker-compose.image.yml
docker compose -f docker-compose.image.yml up -d
```

Puis ouvrir http://localhost:8080. Sans `curl`, `wget https://raw.githubusercontent.com/Leylines-Prism/bpmn-editor/main/docker-compose.image.yml` fait la même chose.

- **Assistant IA** : créez un fichier `.env` dans le même dossier avec votre clé API (Mistral,
  Anthropic, OpenAI, ou un Ollama local), par exemple `ANTHROPIC_API_KEY=sk-ant-...`, puis relancez la
  commande `up -d`. Toutes les variables sont listées dans [mcp/.env.example](mcp/.env.example).
  Une clé peut aussi se saisir dans la fenêtre Options de l'assistant. Sans clé, l'éditeur marche ;
  seul l'assistant est éteint.
- **Vos diagrammes** enregistrés avec « Mes diagrammes » sont gardés dans le volume Docker
  `diagrams`. `docker compose -f docker-compose.image.yml down -v` les supprime.
- **Mise à jour** : changez le numéro de version des deux images dans `docker-compose.image.yml`
  (voir les [versions](https://github.com/Leylines-Prism/bpmn-editor/tags)), puis :

  ```
  docker compose -f docker-compose.image.yml pull
  docker compose -f docker-compose.image.yml up -d
  ```

### Avec un gestionnaire de conteneurs

Dans un outil qui déploie des piles Compose (Portainer, par exemple), créez une pile, collez-y le
contenu de [docker-compose.image.yml](docker-compose.image.yml), et saisissez les réglages ci-dessous
(`ANTHROPIC_API_KEY`…) comme variables d'environnement de la pile.

### Depuis le code source

Pour modifier le code, ou construire les images vous-même :

```
git clone https://github.com/Leylines-Prism/bpmn-editor.git
cd bpmn-editor
docker compose up -d --build
```

Les clés API vont alors dans `mcp/.env` (copie de `mcp/.env.example`), les autres réglages dans
un fichier `.env` à côté de `docker-compose.yml`. **Mise à jour** : `git pull`, puis
`docker compose up -d --build`.

## Le joindre depuis d'autres machines

Le conteneur sert du HTTP simple sur `127.0.0.1:8080`, pour cette machine seulement. Pour l'utiliser
depuis vos autres appareils, gardez-le sur un réseau privé : [Tailscale Serve](https://tailscale.com/kb/1312/serve),
par exemple, lui donne une adresse HTTPS que seules les machines de votre tailnet peuvent joindre.
Donnez ensuite son nouveau nom à l'éditeur, dans le fichier `.env` à côté du fichier Compose, et
ajoutez un jeton `MCP_TOKEN=...` (la fenêtre « Connecter un agent » en génère un ; depuis le code
source, il va dans `mcp/.env`) :

```
BPMN_EDITOR_ORIGINS=https://bpmn.example.com
MCP_ALLOWED_HOSTS=bpmn.example.com
```

Relancez `docker compose up -d`. D'autres proxys marchent aussi : ils doivent transmettre l'en-tête
`Host` et accepter le WebSocket sur `/bridge` (détails dans
[mcp/README.fr.md](mcp/README.fr.md#derrière-un-nom-de-domaine)).

### Sur internet, à vos propres risques

Ce projet n'est ni conçu ni testé pour être exposé sur internet, et n'offre aucune garantie si vous
le faites. Si vous le choisissez quand même, placez une connexion devant les pages et réglez le
jeton. Voici un exemple avec [Caddy](https://caddyserver.com/), qui obtient tout seul le certificat
de votre domaine. Faites pointer le DNS du domaine vers la machine, réglez les deux variables et le
jeton ci-dessus, puis utilisez ce `Caddyfile` :

```
bpmn.example.com {
	# Une connexion pour les pages. /mcp en est exclu : les agents utilisent MCP_TOKEN.
	@pages not path /mcp
	basic_auth @pages {
		alice <empreinte donnée par : caddy hash-password>
	}
	reverse_proxy 127.0.0.1:8080
}
```

Sans connexion au proxy, quiconque trouve l'adresse peut utiliser l'éditeur et vos clés API. Une
connexion et un jeton réduisent le risque, ils ne le suppriment pas. [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
avec Cloudflare Access est une autre façon de placer une connexion devant, sans port ouvert.

## Connecter un agent (MCP)

Cliquez sur le badge **MCP** de la barre d'outils. La fenêtre « Connecter un agent » donne l'adresse à
utiliser (`http://localhost:8080/mcp`, ou `https://votre-domaine/mcp`), et le réglage à coller pour
Claude Code, Claude Desktop, GitHub Copilot dans VS Code, Cursor ou un autre client MCP. L'agent dessine dans le dernier onglet de l'éditeur
utilisé : gardez-le ouvert.

Un jeton facultatif protège cet accès : la même fenêtre en génère un et dit où le mettre.

## Où sont gardées vos clés API

**Dans la version Docker**, le plus sûr est le serveur : le fichier `.env` à côté de
`docker-compose.image.yml` (ou `mcp/.env` depuis le code source). La clé reste sur le serveur et
n'arrive jamais au navigateur. Une clé saisie dans la fenêtre Options de l'assistant est gardée dans le
navigateur comme ci-dessous, puis envoyée à chaque message à votre serveur, qui la transmet au
fournisseur sans l'enregistrer.

**Dans le navigateur** (la démo en ligne, ou les clés saisies dans Options) :

- La clé reste dans votre navigateur, pour ce site seulement. Les autres sites ne peuvent pas la lire.
- « Se souvenir des clés API sur votre appareil » décoché (par défaut) : la clé est gardée dans le
  `sessionStorage` et disparaît à la fermeture de l'onglet.
- Coché : la clé est gardée dans le `localStorage` et reste sur l'appareil jusqu'au clic sur
  « Effacer les clés API ».
- Elle n'est pas chiffrée. La chiffrer dans le navigateur ne servirait à rien : la clé pour la
  déchiffrer devrait être rangée juste à côté.
- Ce qui la protège : la page n'exécute aucun script venu d'un autre site (politique de sécurité du
  contenu, CSP), et la clé ne part que vers le fournisseur choisi.
- La limite : une extension de navigateur malveillante, ou quelqu'un qui utilise votre session sur
  l'ordinateur, peut la lire. Sur un ordinateur partagé, laissez la case décochée.

## Réglages

Tous facultatifs. Avec les images publiées, mettez-les tous dans le fichier `.env` à côté de
`docker-compose.image.yml`, ou dans les variables d'environnement de la pile, puis relancez la
commande `up -d`. Depuis le code source, mettez-les dans un fichier `.env` à côté de
`docker-compose.yml` (git l'ignore), sauf si le tableau indique `mcp/.env`, puis lancez
`docker compose up -d --build`.

| Réglage | Rôle |
|---|---|
| `MISTRAL_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`… (`mcp/.env`) | Clés API de l'assistant IA. Voir `mcp/.env.example`. |
| `MCP_TOKEN` (`mcp/.env`) | Jeton que les agents doivent envoyer. La fenêtre « Connecter un agent » en génère un. |
| `BPMN_PORT` | Port du site (8080 par défaut). |
| `BPMN_EDITOR_ORIGINS`, `MCP_ALLOWED_HOSTS` | L'adresse et le nom du site quand il est servi sous un nom de domaine (voir plus haut). |
| `BPMN_BIND` | Interface réseau où le site écoute (`127.0.0.1` par défaut). `0.0.0.0` l'ouvre à votre réseau, sans HTTPS. |

## Ce que fait l'éditeur

- **Fichiers** : nom, nouveau, ouvrir (fichier, XML collé, ou glisser-déposer), exporter (.bpmn,
  .xml, SVG, PNG, PDF), imprimer le diagramme seul, sur une page. Le diagramme en cours est restauré
  quand vous revenez.
- **Mes diagrammes** : enregistrer plusieurs diagrammes, les rouvrir, renommer, supprimer. Ctrl+S
  enregistre.
- **Dessin** : palette, menu contextuel, copier-coller, 18 couleurs ou une couleur libre, mise en
  forme du texte (gras, italique, taille, police, couleur, avec « Auto » pour un texte lisible sur
  les fonds sombres), rangement, simulation de jetons, vérification des règles BPMN, grille,
  mini-carte, panneau de propriétés avec des groupes Forme et Texte (fond, contour, libellé et mise
  en forme du texte de l'élément sélectionné, couleurs personnalisées reprises d'un clic, copier-coller d'un style
  complet, aussi sur plusieurs éléments).
- **Assistant IA** : décrivez un processus et il le dessine, dans votre langue. Vous pouvez coller ou
  déposer des images et des PDF. Le modèle se choisit dans Options. Ce qu'il ajoute ou modifie est
  entouré sur le canevas, et une pilule résume les changements.
- **Interface** : thème clair ou sombre, anglais ou français, panneaux latéraux redimensionnables.

## En quoi il diffère de draw.io ou Lucidchart

Ils sont très bien pour dessiner à peu près tout, à plusieurs. Cet éditeur ne fait que du BPMN 2.0,
sur la base de [bpmn-js](https://github.com/bpmn-io/bpmn-js) : un diagramme y est un vrai modèle
BPMN, le fichier .bpmn s'ouvre donc dans d'autres outils BPMN, se vérifie et se simule, et ce que
dessine l'IA est aussi du BPMN valide. En revanche, pas de collaboration en temps réel, de lien de
partage ni de modèles.

## Démo en ligne

Une démo tourne sur https://bpmn.leylines.fr (GitHub Pages). Son [guide d'utilisation](https://bpmn.leylines.fr/aide.html)
explique comment dessiner, enregistrer, exporter et se servir de l'assistant IA. Le bouton Aide (?) de la
barre d'outils l'ouvre aussi.

Elle sert juste à essayer : chaque visiteur saisit sa propre clé API, qui reste dans son
navigateur. Pas de connexion d'agent (MCP), pas d'enregistrement sur un serveur, et certains
fournisseurs (OpenAI) refusent les appels depuis une page web. Le lien « Confidentialité » de la page
dit ce qui sort du navigateur.

La démo mesure son audience sans cookie, avec [Umami](https://umami.is) :
visites, provenance et quelques actions (assistant ouvert ou utilisé, fournisseur connecté, diagramme
créé, ouvert ou exporté, temps actif par tranche). Aucun script tiers n'est chargé : la page envoie
elle-même ces mesures ([src/analytics.js](src/analytics.js)), jamais le contenu des diagrammes, des
messages ni les clés API. « Do Not Track » et « Global Privacy Control » coupent la mesure, et
`localStorage.setItem('umami.disabled', '1')` dans la console exclut vos propres visites. Ni l'image
Docker ni `npm run dev` ne mesurent quoi que ce soit. La mesure est configurée conformément aux recommandations de la
CNIL pour les mesures d'audience exemptées de consentement.

## Développement

`npm install`, puis `npm run dev` pour l'éditeur, et `npm start` dans `mcp/` pour le serveur.
Détails sur le serveur, l'assistant et les outils MCP : [mcp/README.fr.md](mcp/README.fr.md).
`npm run build:online` construit la démo en site statique dans `dist-online/` (`BASE_PATH` règle son
chemin). La mesure d'audience s'active avec les variables GitHub `VITE_UMAMI_URL` (adresse
d'Umami) et `VITE_UMAMI_WEBSITE_ID` (identifiant du site) : sans elles, rien n'est envoyé. Elle est publiée par [.github/workflows/pages.yml](.github/workflows/pages.yml) à chaque
changement sur `main`.

## À propos du projet

C'est un projet personnel, maintenu sur le temps libre, et **toutes les contributions sont les
bienvenues** : signalements de bugs, idées, traductions, documentation ou code. Si vous avez envie de
le faire grandir, n'hésitez pas.

En toute transparence : son auteur n'est pas développeur professionnel. Le développement de
l'éditeur est assisté par IA, avec Claude Code et d'autres modèles, et chaque changement est essayé
dans le navigateur avant d'être publié. Les relectures de développeurs expérimentés sont particulièrement
appréciées.

Commencez par [CONTRIBUTING.md](CONTRIBUTING.md) (en anglais). Les questions et les idées vont dans
les [Discussions](https://github.com/Leylines-Prism/bpmn-editor/discussions), les bugs dans les
[issues](https://github.com/Leylines-Prism/bpmn-editor/issues), et les failles de sécurité passent
par le formulaire privé décrit dans [SECURITY.md](SECURITY.md). Pas de délai de réponse garanti,
mais tout est lu.

## Licence

Le code est publié sous la [licence MIT](LICENSE).

Le nom, le logo et les éléments de marque Leylines (les fichiers de [src/brand/](src/brand/)
et le logo dessiné par [src/theme/brand-logo.js](src/theme/brand-logo.js)) ne sont pas couverts
par cette licence. Si vous publiez votre propre version, remplacez-les par les vôtres.

L'éditeur repose sur [bpmn-js](https://github.com/bpmn-io/bpmn-js), dont la licence impose que le
filigrane bpmn.io reste entièrement visible sur le canevas. Gardez-le si vous changez la mise en page.
