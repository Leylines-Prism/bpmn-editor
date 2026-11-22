# bpmn-editor

Éditeur BPMN 2.0 dans le navigateur (bpmn-js), avec un assistant IA qui dessine les processus qu'on lui décrit.

## Deux façons de l'utiliser

| | Version docker (auto-hébergée) | Version en ligne |
|---|---|---|
| Lancer | `npm run dev` et le serveur du dossier `mcp/` | `npm run dev:online`, ou `npm run build:online` (dossier `dist-online/`) |
| Où tourne l'assistant | sur le serveur `mcp/`, qui exécute les outils dans l'onglet | dans la page elle-même |
| Fournisseurs | variables d'environnement, ou fenêtre Options | fenêtre Options |
| Clé d'API | sur le serveur, ou saisie dans Options et relayée sans être enregistrée | dans le navigateur du visiteur, envoyée directement au fournisseur |
| Serveur MCP pour Claude Code et autres clients | oui | non |

Le serveur et l'assistant sont décrits dans [mcp/README.md](mcp/README.md).

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
