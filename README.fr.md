# bpmn-editor

[English](README.md) | **Français**

Un éditeur BPMN 2.0 dans le navigateur (bpmn-js), avec un assistant IA qui dessine les processus que
vous décrivez, et un serveur MCP pour que des agents comme Claude Code puissent y dessiner aussi. Il
tourne sur votre propre machine avec Docker.

## Le lancer avec Docker

Il faut [Docker](https://docs.docker.com/get-docker/) avec Docker Compose.

```
git clone https://github.com/Leylines-Prism/bpmn-editor.git
cd bpmn-editor
docker compose up -d --build
```

Puis ouvrir http://localhost:8080.

- **Assistant IA** : copier `mcp/.env.example` en `mcp/.env` et y mettre votre clé d'API (Anthropic,
  OpenAI, ou un Ollama local), puis relancer `docker compose up -d`. Une clé peut aussi se saisir
  dans la fenêtre Options de l'assistant. Sans clé, l'éditeur marche ; seul l'assistant est éteint.
- **Vos diagrammes** enregistrés avec « Mes diagrammes » sont gardés dans le volume Docker
  `diagrams`. `docker compose down -v` les supprime.
- **Mise à jour** : `git pull`, puis `docker compose up -d --build`.

> **Gardez-le sur votre machine ou un réseau privé.** Il n'a pas de comptes : quiconque l'atteint
> peut utiliser vos clés d'API, lire et supprimer vos diagrammes, et piloter l'éditeur. Par défaut,
> il ne répond que sur cette machine (`127.0.0.1`).

## Le servir en HTTPS

Le conteneur sert du HTTP simple sur `127.0.0.1:8080`. Pour le joindre à `https://bpmn.example.com`,
placez un proxy inverse devant. [Caddy](https://caddyserver.com/) obtient tout seul le certificat de
votre domaine. Faites pointer le DNS du domaine vers la machine, puis utilisez ce `Caddyfile` :

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

Donnez ensuite son nouveau nom à l'éditeur, dans un fichier `.env` à côté de `docker-compose.yml`, et
mettez un jeton dans `mcp/.env` (la fenêtre « Connecter un agent » en génère un) :

```
BPMN_EDITOR_ORIGINS=https://bpmn.example.com
MCP_ALLOWED_HOSTS=bpmn.example.com
```

Relancez `docker compose up -d`. Sans connexion au proxy, quiconque trouve l'adresse peut utiliser
l'éditeur et vos clés : ne le publiez jamais sans la connexion et le jeton.

Autres façons d'avoir le HTTPS : [Tailscale Serve](https://tailscale.com/kb/1312/serve) (privé, pour
les machines de votre tailnet) ou [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
(aucun port ouvert, avec Cloudflare Access pour la connexion). Réglez les deux variables ci-dessus sur
le nom qu'ils vous donnent. D'autres proxys marchent aussi : ils doivent transmettre l'en-tête `Host`
et accepter le WebSocket sur `/bridge` (détails dans
[mcp/README.fr.md](mcp/README.fr.md#derrière-un-nom-de-domaine)).

## Connecter un agent (MCP)

Cliquez sur le badge **MCP** de la barre d'outils. La fenêtre « Connecter un agent » donne l'adresse à
utiliser (`http://localhost:8080/mcp`, ou `https://votre-domaine/mcp`), et le réglage à coller pour
Claude Code, Claude Desktop, Cursor ou VS Code. L'agent dessine dans le dernier onglet de l'éditeur
utilisé : gardez-le ouvert.

Un jeton facultatif protège cet accès : la même fenêtre en génère un et dit où le mettre.

## Où sont gardées vos clés d'API

**Dans la version Docker**, le plus sûr est `mcp/.env` : la clé reste sur le serveur et n'arrive
jamais au navigateur. Une clé saisie dans la fenêtre Options de l'assistant est gardée dans le
navigateur comme ci-dessous, puis envoyée à chaque message à votre serveur, qui la transmet au
fournisseur sans l'enregistrer.

**Dans le navigateur** (la démo en ligne, ou les clés saisies dans Options) :

- La clé reste dans votre navigateur, pour ce site seulement. Les autres sites ne peuvent pas la lire.
- « Se souvenir des clés sur votre appareil » décoché (par défaut) : la clé est gardée dans le
  `sessionStorage` et disparaît à la fermeture de l'onglet.
- Coché : la clé est gardée dans le `localStorage` et reste sur l'appareil jusqu'au clic sur
  « Effacer les clés ».
- Elle n'est pas chiffrée. La chiffrer dans le navigateur ne servirait à rien : la clé pour la
  déchiffrer devrait être rangée juste à côté.
- Ce qui la protège : la page n'exécute aucun script venu d'un autre site (politique de sécurité du
  contenu, CSP), et la clé ne part que vers le fournisseur choisi.
- La limite : une extension de navigateur malveillante, ou quelqu'un qui utilise votre session sur
  l'ordinateur, peut la lire. Sur un ordinateur partagé, laissez la case décochée.

## Réglages

Tous facultatifs. Mettez-les dans un fichier `.env` à côté de `docker-compose.yml` (git l'ignore),
sauf si le tableau indique `mcp/.env`. Puis lancez `docker compose up -d --build`.

| Réglage | Rôle |
|---|---|
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`… (`mcp/.env`) | Clés de l'assistant IA. Voir `mcp/.env.example`. |
| `MCP_TOKEN` (`mcp/.env`) | Jeton que les agents doivent envoyer. La fenêtre « Connecter un agent » en génère un. |
| `BPMN_PORT` | Port du site (8080 par défaut). |
| `BPMN_EDITOR_ORIGINS`, `MCP_ALLOWED_HOSTS` | L'adresse et le nom du site quand il est servi sous un nom de domaine (voir plus haut). |
| `BPMN_BIND` | Interface réseau où le site écoute (`127.0.0.1` par défaut). `0.0.0.0` l'ouvre à votre réseau, sans HTTPS. |

## Ce que fait l'éditeur

- **Fichiers** : nom, nouveau, ouvrir (fichier, XML collé, ou glisser-déposer), exporter (.bpmn,
  .xml, SVG, PNG, PDF). Le diagramme en cours est restauré quand vous revenez.
- **Mes diagrammes** : enregistrer plusieurs diagrammes, les rouvrir, renommer, supprimer. Ctrl+S
  enregistre.
- **Dessin** : palette, menu contextuel, copier-coller, 18 couleurs ou une couleur libre, mise en
  forme du texte (gras, italique, taille, police, couleur, avec « Auto » pour un texte lisible sur
  les fonds sombres), rangement, simulation de jetons, vérification des règles BPMN, grille,
  mini-carte, panneau de propriétés.
- **Assistant IA** : décrivez un processus et il le dessine, dans votre langue. Vous pouvez coller ou
  déposer des images et des PDF. Le modèle se choisit dans Options.
- **Interface** : thème clair ou sombre, anglais ou français, panneaux latéraux redimensionnables.

## Démo en ligne

Une démo tourne sur https://bpmn.leylines.fr (GitHub Pages).

Elle sert juste à essayer : chaque visiteur saisit sa propre clé d'API, qui reste dans son
navigateur. Pas de connexion d'agent (MCP), pas d'enregistrement sur un serveur, et certains
fournisseurs (OpenAI) refusent les appels depuis une page web. Le lien « Confidentialité » de la page
dit ce qui sort du navigateur.

La démo mesure son audience sans cookie, avec [Umami](https://umami.is) :
visites, provenance et quelques actions (assistant ouvert ou utilisé, fournisseur connecté, diagramme
créé, ouvert ou exporté, temps actif par tranche). Aucun script tiers n'est chargé : la page envoie
elle-même ces mesures ([src/analytics.js](src/analytics.js)), jamais le contenu des diagrammes, des
messages ni les clés. « Do Not Track » et « Global Privacy Control » coupent la mesure, et
`localStorage.setItem('umami.disabled', '1')` dans la console exclut vos propres visites. Ni l'image
Docker ni `npm run dev` ne mesurent quoi que ce soit.

## Développement

`npm install`, puis `npm run dev` pour l'éditeur, et `npm start` dans `mcp/` pour le serveur.
Détails sur le serveur, l'assistant et les outils MCP : [mcp/README.fr.md](mcp/README.fr.md).
`npm run build:online` construit la démo en site statique dans `dist-online/` (`BASE_PATH` règle son
chemin). La mesure d'audience s'active avec les variables GitHub `VITE_UMAMI_URL` (adresse
d'Umami) et `VITE_UMAMI_WEBSITE_ID` (identifiant du site) : sans elles, rien n'est envoyé. Elle est publiée par [.github/workflows/pages.yml](.github/workflows/pages.yml) à chaque
changement sur `main`.
