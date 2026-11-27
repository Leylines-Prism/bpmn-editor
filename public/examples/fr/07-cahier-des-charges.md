# Cahier des charges : SD-WAN managé pour 40 agences

*Document fictif, fourni avec l'aide de BPMN-Pilot pour s'exercer avec le Co-pilote IA. Aucun constructeur ni client réel.*

## Contexte
Le client exploite 40 agences et 2 datacenters reliés par un VPN MPLS opérateur (20 Mb/s par agence, routeurs CE gérés par l'opérateur). Le SaaS (ERP, bureautique) sature ces liens via la sortie Internet centralisée. Il confie à Néréide Networks la mise en place d'un SD-WAN managé, avec un portail client.

## Cible technique
- Underlay : MPLS conservé pendant la migration, fibre DIA 300 Mb/s par agence, 4G/5G en secours
- Overlay : tunnels IPsec de chaque agence vers 2 hubs en datacenter (actif/actif), BGP et BFD
- Politiques applicatives : voix sur MPLS, SaaS en local breakout, invités isolés en DIA
- QoS sur 4 classes, segmentation en 3 VRF
- Déploiement des CPE en zero-touch provisioning (ZTP)

## Attentes sur le processus
- Un chef de projet unique côté intégrateur, du kick-off à la recette.
- Un site survey de chaque agence avant la conception. Une réserve bloque le site, pas la vague.
- Un HLD signé par la DSI du client avant toute commande de CPE, puis un LLD par site.
- Des configurations générées par un agent IA à partir du LLD et de l'IPAM, toujours relues par un ingénieur (peer review) avant mise à disposition.
- Toute bascule passe par la gestion des changements : RFC, niveau d'approbation selon l'impact métier et le nombre de sites (préapprouvé, change manager ou CAB), MW du mardi au jeudi, 22 h à 2 h.
- Pre-checks avant la bascule, post-checks après : tunnels, sessions BGP, sondes SLA, test de bascule de lien.
- Rollback vers le routeur CE MPLS si un critère est atteint (application critique injoignable plus de 15 min, perte > 2 % sur la voix), puis nouvelle bascule dans la vague suivante.
- Recette par vague, ouverture du portail en SSO, formation des équipes, transfert au Run (NOC) avec 30 jours d'hypercare.

## Planning et indicateurs
- Pilote de 2 agences en semaine 9, puis 5 vagues de 7 à 8 agences
- Bascules réussies du premier coup : ≥ 92 %
- Disponibilité par agence : 99,95 %
- SLA de run : P1 pris en charge en 15 min, rétabli en 4 h

## Rôles
Client (DSI), chef de projet, ingénierie réseau, NOC, agent IA de configuration.

## Prompt pour le Co-pilote IA
Joignez ce fichier dans le chat du Co-pilote, puis copiez :

> Dessine le processus de mise en service décrit dans le cahier des charges joint : un pool pour le client, un pour l'intégrateur avec un couloir par équipe, et la gestion des changements en sous-processus. Mets les tâches manuelles en orange.
