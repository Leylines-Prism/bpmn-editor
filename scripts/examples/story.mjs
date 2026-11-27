// Fil rouge des exemples de l'aide : un intégrateur réseau fictif met en service un SD-WAN
// managé (underlay MPLS, fibre DIA et 4G/5G, overlay IPsec vers deux hubs), avec son portail
// client, chez un client de 40 agences. Aucun constructeur ni client réel n'est cité.
// Tous les textes sont ici, en français et en anglais. Le nom de l'entreprise se change
// en un seul endroit : COMPANY (et dans scripts/examples/help-examples.py pour l'aide).

export const COMPANY = 'Néréide Networks'

// Une chaîne par langue : L('texte français', 'English text').
export const L = (fr, en) => ({ fr, en })

// ── Version 1 : un seul pool, quatre couloirs (exemples 2 à 7) ──
// Colonnes : clé, libellé, type, couloir, suivants [[clé, libellé du flux]].
export const LANES_V1 = {
  client: L('Client', 'Customer'),
  pm: L('Chef de projet', 'Project manager'),
  eng: L('Ingénierie réseau', 'Network engineering'),
  noc: L('NOC', 'NOC'),
}

export const STEPS_V1 = [
  { key: 'start', type: 'startEvent', lane: 'pm', name: L('Contrat signé', 'Contract signed'), next: ['kickoff'] },
  { key: 'kickoff', type: 'userTask', lane: 'pm', name: L('Tenir le kick-off', 'Hold the kick-off'), next: ['inventory'] },
  { key: 'inventory', type: 'userTask', lane: 'client', name: L("Fournir l'inventaire des sites", 'Provide the site inventory'), next: ['audit'] },
  { key: 'audit', type: 'userTask', lane: 'eng', name: L('Réaliser le site survey', 'Run the site survey'), next: ['ready'] },
  { key: 'ready', type: 'exclusiveGateway', lane: 'eng', name: L('Sites prêts ?', 'Sites ready?'), next: [['design', L('Oui', 'Yes')], ['fix', L('Non', 'No')]] },
  { key: 'fix', type: 'manualTask', lane: 'client', name: L('Lever les réserves du survey', 'Clear the survey findings'), next: ['audit'] },
  { key: 'design', type: 'userTask', lane: 'eng', name: L('Rédiger le HLD et le LLD', 'Write the HLD and LLD'), next: ['approve'] },
  { key: 'approve', type: 'userTask', lane: 'client', name: L('Valider le HLD', 'Sign off the HLD'), next: ['configs'] },
  { key: 'configs', type: 'userTask', lane: 'eng', name: L('Préparer les templates ZTP', 'Build the ZTP templates'), next: ['install'] },
  { key: 'install', type: 'manualTask', lane: 'noc', name: L('Livrer et raccorder les CPE', 'Ship and rack the CPEs'), next: ['cutover'] },
  { key: 'cutover', type: 'userTask', lane: 'noc', name: L('Basculer la vague de sites', 'Cut over the wave of sites'), next: ['checks'] },
  { key: 'checks', type: 'userTask', lane: 'noc', name: L('Exécuter les post-checks', 'Run the post-checks'), next: ['ok'] },
  { key: 'ok', type: 'exclusiveGateway', lane: 'noc', name: L('Post-checks OK ?', 'Post-checks passed?'), next: [['acceptance', L('Oui', 'Yes')], ['rollback', L('Non', 'No')]] },
  { key: 'rollback', type: 'userTask', lane: 'noc', name: L('Exécuter le rollback', 'Execute the rollback'), next: ['cutover'] },
  { key: 'acceptance', type: 'userTask', lane: 'client', name: L('Prononcer la recette', 'Sign the acceptance'), next: ['portal'] },
  { key: 'portal', type: 'serviceTask', lane: 'eng', name: L('Ouvrir le portail client (SSO)', 'Open the customer portal (SSO)'), next: ['training'] },
  { key: 'training', type: 'manualTask', lane: 'pm', name: L('Former les équipes du client', "Train the customer's teams"), next: ['run'] },
  { key: 'run', type: 'userTask', lane: 'noc', name: L('Transférer au Run', 'Hand over to Run'), next: ['end'] },
  { key: 'end', type: 'endEvent', lane: 'noc', name: L('Service en production', 'Service live'), next: [] },
]

// Exemple 1 : le croquis, six cases sans couloirs.
export const STEPS_SKETCH = [
  { key: 'start', type: 'startEvent', name: L('Contrat signé', 'Contract signed'), next: ['audit'] },
  { key: 'audit', type: 'task', name: L('Site survey', 'Site survey'), next: ['design'] },
  { key: 'design', type: 'task', name: L('HLD et LLD', 'HLD and LLD'), next: ['deploy'] },
  { key: 'deploy', type: 'task', name: L('Déployer les CPE', 'Deploy the CPEs'), next: ['acceptance'] },
  { key: 'acceptance', type: 'task', name: L('Recette', 'Acceptance'), next: ['run'] },
  { key: 'run', type: 'task', name: L('Transfert au Run', 'Handover to Run'), next: ['end'] },
  { key: 'end', type: 'endEvent', name: L('Service en production', 'Service live'), next: [] },
]

// Exemple 3 : une couleur par couloir, les tâches manuelles en orange.
export const LANE_COLORS = {
  client: { fill: '#E8F1FB', stroke: '#1E5FA8' },
  pm: { fill: '#F1EAFB', stroke: '#6B3FA0' },
  eng: { fill: '#E6F6F0', stroke: '#1C7C54' },
  noc: { fill: '#FDF3E1', stroke: '#9A6200' },
}
export const MANUAL_COLOR = { fill: '#FFE3CC', stroke: '#C2410C' }

// Exemple 6 : documentation, personnes assignées, systèmes et RACI.
// Les clés absentes de la version 1 (generate, review) servent à la version 2.
export const DETAILS_V1 = {
  kickoff: {
    assignee: L('Claire Morel', 'Claire Morel'), systems: L('ITSM, outil de gestion de projet', 'ITSM, project management tool'),
    accountable: L('Directeur des opérations', 'Head of operations'), consulted: L('Client', 'Customer'), informed: L('NOC, ingénierie réseau', 'NOC, network engineering'),
    doc: L(`## Objectif
Aligner le périmètre, le planning par vagues et la gouvernance avec le client.

## Livrables
- Planning : site survey (S1 à S3), HLD (S4 à S6), pilote 2 sites (S9), 5 vagues de 7 à 8 sites (S10 à S16), hypercare 30 jours
- Matrice d'escalade et contacts sur site
- Modèle d'inventaire des sites envoyé au client
- Créneaux de fenêtre de maintenance (MW) acceptés : du mardi au jeudi, 22 h à 2 h

## Points d'attention
Délai de livraison des liens fibre DIA : 6 à 8 semaines. Les commander dès le kick-off.`, `## Purpose
Align the scope, the wave plan and the governance with the customer.

## Deliverables
- Plan: site survey (W1 to W3), HLD (W4 to W6), 2-site pilot (W9), 5 waves of 7 to 8 sites (W10 to W16), 30-day hypercare
- Escalation matrix and on-site contacts
- Site inventory template sent to the customer
- Accepted maintenance window (MW) slots: Tuesday to Thursday, 10 pm to 2 am

## Watch out
DIA fibre lead time: 6 to 8 weeks. Order the circuits at kick-off.`),
  },
  inventory: {
    systems: L('Tableur, portail client', 'Spreadsheet, customer portal'), accountable: L('DSI du client', 'Customer CIO'), informed: L('Chef de projet', 'Project manager'),
    doc: L(`Pour chaque agence : code site, adresse, contact sur site, horaires d'accès.

| Donnée | Exemple |
|---|---|
| Underlay actuel | MPLS 20 Mb/s, routeur CE opérateur |
| Nouveaux liens | Fibre DIA 300 Mb/s, 4G/5G en secours |
| LAN | 3 VLAN : data, voix, invités |
| Préfixes | 10.40.12.0/24, 10.140.12.0/25 |
| Applications critiques | ERP (SaaS), ToIP, caisse |`, `For each branch: site code, address, on-site contact, access hours.

| Data | Example |
|---|---|
| Current underlay | 20 Mb/s MPLS, carrier-managed CE router |
| New links | 300 Mb/s DIA fibre, 4G/5G backup |
| LAN | 3 VLANs: data, voice, guest |
| Prefixes | 10.40.12.0/24, 10.140.12.0/25 |
| Critical applications | ERP (SaaS), VoIP, point of sale |`),
  },
  audit: {
    assignee: L('Karim Benali', 'Karim Benali'), systems: L('CMDB, IPAM, application de survey', 'CMDB, IPAM, survey app'),
    accountable: L('Responsable ingénierie', 'Engineering lead'), consulted: L('Client', 'Customer'), informed: L('Chef de projet', 'Project manager'),
    doc: L(`## Checklist du site survey
- [ ] Liens d'accès livrés, testés en débit (iPerf) et en latence vers les hubs
- [ ] Couverture 4G/5G mesurée à l'emplacement de l'antenne (RSRP > -100 dBm)
- [ ] Place en baie (1U), deux prises secourues (onduleur)
- [ ] Plan d'adressage sans chevauchement avec les autres sites (IPAM)
- [ ] Ports LAN et VLAN relevés sur le switch d'accès
- [ ] Photos de la baie et du point de livraison opérateur

Durée cible : une demi-journée par site. Toute réserve bloque le site, pas la vague.`, `## Site survey checklist
- [ ] Access links delivered, tested for throughput (iPerf) and latency to the hubs
- [ ] 4G/5G coverage measured at the antenna location (RSRP > -100 dBm)
- [ ] Rack space (1U), two UPS-backed power outlets
- [ ] Addressing plan with no overlap with other sites (IPAM)
- [ ] LAN ports and VLANs recorded on the access switch
- [ ] Photos of the rack and of the carrier demarc

Target: half a day per site. A finding blocks the site, not the wave.`),
  },
  fix: {
    accountable: L('DSI du client', 'Customer CIO'), consulted: L('Ingénierie réseau', 'Network engineering'), informed: L('Chef de projet', 'Project manager'),
    doc: L("Réserves typiques : lien DIA non livré, prise non secourue, chevauchement d'adressage avec un autre site, antenne 4G à déporter.", 'Typical findings: DIA circuit not delivered, power outlet not on UPS, address overlap with another site, 4G antenna to relocate.'),
  },
  design: {
    assignee: L('Karim Benali', 'Karim Benali'), systems: L('Orchestrateur SD-WAN, IPAM, wiki', 'SD-WAN orchestrator, IPAM, wiki'),
    accountable: L('Responsable ingénierie', 'Engineering lead'), consulted: L('Sécurité', 'Security'), informed: L('Client', 'Customer'),
    doc: L(`## HLD (High-Level Design)
- Topologie hub and spoke : 2 hubs en datacenter (actif/actif), 40 spokes
- Underlay : MPLS conservé pendant la migration, fibre DIA, 4G/5G en secours
- Overlay : tunnels IPsec de chaque spoke vers les deux hubs, sur chaque transport
- Routage : BGP dans l'overlay, eBGP vers le PE sur le lien MPLS, BFD sur tous les tunnels
- Politiques applicatives : voix sur MPLS (repli DIA), SaaS en local breakout sur la DIA, invités en DIA seulement
- QoS : 4 classes (voix EF, interactif AF41, métier AF21, best effort)
- Segmentation : 3 VRF (corporate, voix, invités)

## LLD (Low-Level Design)
Une fiche par site : interfaces, VLAN, préfixes, ASN, voisins BGP, seuils des sondes SLA, numéro de série du CPE.`, `## HLD (High-Level Design)
- Hub and spoke topology: 2 data center hubs (active/active), 40 spokes
- Underlay: MPLS kept during the migration, DIA fibre, 4G/5G backup
- Overlay: IPsec tunnels from each spoke to both hubs, over every transport
- Routing: BGP in the overlay, eBGP to the PE on the MPLS link, BFD on every tunnel
- Application-aware policies: voice on MPLS (DIA fallback), SaaS through local breakout on DIA, guest on DIA only
- QoS: 4 classes (voice EF, interactive AF41, business AF21, best effort)
- Segmentation: 3 VRFs (corporate, voice, guest)

## LLD (Low-Level Design)
One sheet per site: interfaces, VLANs, prefixes, ASN, BGP neighbors, SLA probe thresholds, CPE serial number.`),
  },
  approve: {
    accountable: L('DSI du client', 'Customer CIO'), consulted: L('RSSI du client', 'Customer CISO'), informed: L('Chef de projet', 'Project manager'),
    doc: L('Le HLD est signé avant toute commande de CPE. Toute modification ultérieure passe par une demande de changement de périmètre.', 'The HLD is signed off before any CPE order. Any later change goes through a scope change request.'),
  },
  configs: {
    assignee: L('Karim Benali', 'Karim Benali'), systems: L('Orchestrateur SD-WAN, dépôt Git, IPAM', 'SD-WAN orchestrator, Git repository, IPAM'),
    accountable: L('Responsable ingénierie', 'Engineering lead'), informed: L('NOC', 'NOC'),
    doc: L(`Un template par profil de site (petit, moyen, double lien), variables tirées du LLD et de l'IPAM, source de vérité versionnée dans Git.

Le CPE arrive sur site sans configuration. Au branchement, il appelle l'orchestrateur, s'authentifie par son certificat et son numéro de série, et reçoit sa configuration (zero-touch provisioning).`, `One template per site profile (small, medium, dual link), with variables taken from the LLD and the IPAM, the source of truth versioned in Git.

The CPE reaches the site with no configuration. Once plugged in, it calls the orchestrator, authenticates with its certificate and serial number, and gets its configuration (zero-touch provisioning).`),
  },
  install: {
    assignee: L('Technicien sur site (sous-traitant)', 'On-site technician (subcontractor)'), systems: L('ITSM, outil de logistique', 'ITSM, logistics tool'),
    accountable: L('Responsable NOC', 'NOC lead'), informed: L('Client', 'Customer'),
    doc: L("Le technicien pose le CPE en baie, raccorde la DIA et l'antenne 4G, sans toucher au LAN. Le CPE monte en ZTP et apparaît « en ligne » dans l'orchestrateur avant la MW.", 'The technician racks the CPE, connects the DIA circuit and the 4G antenna, without touching the LAN. The CPE comes up through ZTP and shows "online" in the orchestrator before the MW.'),
  },
  cutover: {
    assignee: L('Équipe NOC de nuit', 'Night NOC team'), systems: L('Orchestrateur SD-WAN, ITSM', 'SD-WAN orchestrator, ITSM'),
    accountable: L('Responsable NOC', 'NOC lead'), consulted: L('Client', 'Customer'), informed: L('Chef de projet', 'Project manager'),
    doc: L(`## Pre-checks (T-30 min)
- RFC approuvée, numéro reporté dans le canal de bridge
- CPE en ligne dans l'orchestrateur, certificat valide, bonne version logicielle
- Sauvegarde de la configuration du routeur CE MPLS
- Contact sur site joignable, appel test vers la ToIP

## Pendant la MW (22 h à 2 h)
1. Repasser le LAN du routeur CE sur le CPE SD-WAN
2. Vérifier la montée des tunnels et des sessions BGP
3. Annoncer les préfixes du site dans l'overlay
4. Garder le routeur CE en place 7 jours, câble prêt pour un retour

Durée cible : 45 min par site, 7 à 8 sites par vague. Point go/no-go à T+60 min.`, `## Pre-checks (T-30 min)
- RFC approved, number posted on the bridge channel
- CPE online in the orchestrator, valid certificate, right software release
- Backup of the MPLS CE router configuration
- On-site contact reachable, test call to the VoIP system

## During the MW (10 pm to 2 am)
1. Move the LAN from the CE router to the SD-WAN CPE
2. Check that tunnels and BGP sessions come up
3. Advertise the site prefixes into the overlay
4. Keep the CE router in place for 7 days, cable ready for a fallback

Target: 45 min per site, 7 to 8 sites per wave. Go/no-go point at T+60 min.`),
  },
  checks: {
    assignee: L('Équipe NOC de nuit', 'Night NOC team'), systems: L('Orchestrateur SD-WAN, supervision', 'SD-WAN orchestrator, monitoring'),
    accountable: L('Responsable NOC', 'NOC lead'), informed: L('Client', 'Customer'),
    doc: L(`## Post-checks
1. Tunnels IPsec up vers les deux hubs, sur la DIA, le MPLS et la 4G
2. Sessions BGP Established, nombre de préfixes reçus conforme au LLD
3. BFD up, sondes SLA dans les seuils : latence < 50 ms, gigue < 10 ms, perte < 1 % pour la classe voix
4. Pilotage applicatif : la voix passe par le MPLS, le SaaS sort en local breakout
5. Marquage DSCP conservé de bout en bout
6. Test de bascule : débrancher la DIA, l'appel en cours tient, convergence < 1 s, puis couper le MPLS, la 4G prend le relais
7. Remontée SNMP, syslog et NetFlow dans la supervision du NOC

## Critères de rollback
- Application critique injoignable plus de 15 min
- Tunnels absents 30 min après le basculement
- Perte de paquets > 2 % sur la classe voix`, `## Post-checks
1. IPsec tunnels up to both hubs, over DIA, MPLS and 4G
2. BGP sessions Established, received prefix count matching the LLD
3. BFD up, SLA probes within thresholds: latency < 50 ms, jitter < 10 ms, loss < 1 % for the voice class
4. Application-aware routing: voice goes over MPLS, SaaS through local breakout
5. DSCP marking preserved end to end
6. Failover test: unplug the DIA, the ongoing call holds, convergence < 1 s, then cut MPLS, 4G takes over
7. SNMP, syslog and NetFlow reaching the NOC monitoring

## Rollback criteria
- Critical application unreachable for more than 15 min
- Tunnels still down 30 min after the cutover
- Packet loss > 2 % on the voice class`),
  },
  rollback: {
    assignee: L('Équipe NOC de nuit', 'Night NOC team'), systems: L('Orchestrateur SD-WAN, ITSM', 'SD-WAN orchestrator, ITSM'),
    accountable: L('Responsable NOC', 'NOC lead'), informed: L('Client, chef de projet', 'Customer, project manager'),
    doc: L(`1. Repasser le LAN sur le routeur CE MPLS, restaurer sa configuration
2. Retirer les préfixes du site de l'overlay
3. Vérifier la ToIP et l'ERP depuis le site
4. Clore la RFC en « rollback », ouvrir un problème, replanifier le site dans la vague suivante

Durée cible : 20 min, dans la MW.`, `1. Move the LAN back to the MPLS CE router, restore its configuration
2. Withdraw the site prefixes from the overlay
3. Check VoIP and the ERP from the site
4. Close the RFC as "rolled back", open a problem record, reschedule the site in the next wave

Target: 20 min, within the MW.`),
  },
  acceptance: {
    systems: L('Portail client', 'Customer portal'), accountable: L('DSI du client', 'Customer CIO'), consulted: L('Chef de projet', 'Project manager'),
    doc: L("Le client déroule le cahier de recette par vague (applications métier, ToIP, accès invités, bascule de lien) et signe le PV de recette. Une réserve mineure n'empêche pas la signature.", 'The customer runs the acceptance plan per wave (business applications, VoIP, guest access, link failover) and signs the acceptance report. A minor finding does not prevent sign-off.'),
  },
  portal: {
    systems: L('Portail client, annuaire du client (SAML)', "Customer portal, customer's directory (SAML)"),
    accountable: L('Responsable ingénierie', 'Engineering lead'), informed: L('Client', 'Customer'),
    doc: L("Fédération SAML avec l'annuaire du client, deux rôles (lecture, administrateur réseau). Le portail montre la disponibilité des sites, la qualité par lien et le respect des SLA.", 'SAML federation with the customer directory, two roles (read-only, network admin). The portal shows site availability, quality per link and SLA compliance.'),
  },
  training: {
    assignee: L('Claire Morel', 'Claire Morel'), accountable: L('Directeur des opérations', 'Head of operations'), informed: L('Client', 'Customer'),
    doc: L("Deux sessions de 2 h : lecture du portail et des rapports SLA, ouverture d'un incident et circuit d'escalade.", 'Two 2-hour sessions: reading the portal and the SLA reports, raising an incident and the escalation path.'),
  },
  run: {
    assignee: L('Responsable NOC', 'NOC lead'), systems: L('ITSM, supervision, CMDB', 'ITSM, monitoring, CMDB'),
    accountable: L('Directeur des opérations', 'Head of operations'), informed: L('Client, chef de projet', 'Customer, project manager'),
    doc: L(`## Dossier de transfert au Run
- Dossier d'architecture technique (DAT) et LLD à jour (as-built)
- CMDB alimentée : CPE, liens, contrats opérateurs
- Seuils de supervision et runbooks validés par le NOC
- Matrice d'escalade et SLA : P1 pris en charge en 15 min, rétabli en 4 h
- Hypercare de 30 jours après la dernière vague, puis démontage des routeurs CE MPLS

## Indicateurs du projet
- Bascules réussies du premier coup : objectif ≥ 92 %
- Disponibilité par site : objectif 99,95 % (double lien)
- Retard moyen par vague : < 2 jours ouvrés`, `## Handover pack
- Up-to-date architecture document and LLD (as-built)
- CMDB populated: CPEs, circuits, carrier contracts
- Monitoring thresholds and runbooks approved by the NOC
- Escalation matrix and SLA: P1 acknowledged in 15 min, restored in 4 h
- 30-day hypercare after the last wave, then decommissioning of the MPLS CE routers

## Project KPIs
- First-time-right cutovers: target ≥ 92 %
- Availability per site: target 99.95 % (dual link)
- Average delay per wave: < 2 working days`),
  },
  generate: {
    assignee: L('Agent IA de configuration', 'Configuration AI agent'), systems: L('Orchestrateur SD-WAN, dépôt Git, IPAM, coffre de secrets', 'SD-WAN orchestrator, Git repository, IPAM, secrets vault'),
    accountable: L('Responsable ingénierie', 'Engineering lead'), informed: L('NOC', 'NOC'),
    doc: L("L'agent remplit les templates ZTP site par site à partir du LLD et de l'IPAM, lance le linter de configuration et ouvre une merge request par vague. Il ne pousse rien vers les équipements.", 'The agent fills the ZTP templates site by site from the LLD and the IPAM, runs the configuration linter and opens one merge request per wave. It pushes nothing to the devices.'),
  },
  review: {
    assignee: L('Karim Benali', 'Karim Benali'), systems: L('Dépôt Git', 'Git repository'),
    accountable: L('Responsable ingénierie', 'Engineering lead'), informed: L('NOC', 'NOC'),
    doc: L("Revue par un pair de chaque merge request : préfixes, ASN, voisins BGP, politiques applicatives, absence de secret en clair. La fusion met les configurations à disposition dans l'orchestrateur.", 'Peer review of every merge request: prefixes, ASN, BGP neighbors, application policies, no secret in clear text. The merge makes the configurations available in the orchestrator.'),
  },
}

// ── Version 2 : deux pools, l'agent IA et le change (exemples 8 à 14) ──
export const LANES_V2 = {
  pm: L('Chef de projet', 'Project manager'),
  eng: L('Ingénierie réseau', 'Network engineering'),
  ai: L('Automatisation (agent IA)', 'Automation (AI agent)'),
  noc: L('NOC', 'NOC'),
}

export const CLIENT_STEPS = [
  { key: 'c_start', type: 'startEvent', name: L('Besoin validé', 'Need approved'), next: ['c_sign'] },
  { key: 'c_sign', type: 'sendTask', name: L('Signer le contrat', 'Sign the contract'), next: ['c_inventory'] },
  { key: 'c_inventory', type: 'sendTask', name: L("Envoyer l'inventaire des sites", 'Send the site inventory'), next: ['c_design'] },
  { key: 'c_design', type: 'userTask', name: L('Valider le HLD', 'Sign off the HLD'), next: ['c_accept'] },
  { key: 'c_accept', type: 'userTask', name: L('Prononcer la recette', 'Sign the acceptance'), next: ['c_end'] },
  { key: 'c_end', type: 'endEvent', name: L('Service accepté', 'Service accepted'), next: [] },
]

export const STEPS_V2 = [
  { key: 'start', type: 'startEvent', message: true, lane: 'pm', name: L('Contrat reçu', 'Contract received'), next: ['kickoff'] },
  { key: 'kickoff', type: 'userTask', lane: 'pm', name: L('Tenir le kick-off', 'Hold the kick-off'), next: ['inventory'] },
  { key: 'inventory', type: 'receiveTask', lane: 'pm', name: L("Recevoir l'inventaire", 'Receive the inventory'), next: ['audit'] },
  { key: 'audit', type: 'userTask', lane: 'eng', name: L('Réaliser le site survey', 'Run the site survey'), next: ['ready'] },
  { key: 'ready', type: 'exclusiveGateway', lane: 'eng', name: L('Sites prêts ?', 'Sites ready?'), next: [['design', L('Oui', 'Yes'), 80], ['fix', L('Non', 'No'), 20]] },
  { key: 'fix', type: 'userTask', lane: 'pm', name: L('Faire lever les réserves', 'Get the findings cleared'), next: ['audit'] },
  { key: 'design', type: 'userTask', lane: 'eng', name: L('Rédiger le HLD et le LLD', 'Write the HLD and LLD'), next: ['approve'] },
  { key: 'approve', type: 'userTask', lane: 'pm', name: L('Faire valider le HLD', 'Get the HLD signed off'), next: ['generate'] },
  { key: 'generate', type: 'serviceTask', lane: 'ai', name: L('Générer les templates ZTP', 'Generate the ZTP templates'), next: ['review'] },
  { key: 'review', type: 'userTask', lane: 'eng', name: L('Relire les templates (peer review)', 'Peer-review the templates'), next: ['change'] },
  { key: 'change', type: 'subProcess', lane: 'noc', name: L('Gérer le change', 'Manage the change'), next: ['cutover'] },
  { key: 'cutover', type: 'userTask', lane: 'noc', name: L('Basculer la vague de sites', 'Cut over the wave of sites'), next: ['checks'] },
  { key: 'checks', type: 'userTask', lane: 'noc', name: L('Exécuter les post-checks', 'Run the post-checks'), next: ['ok'] },
  { key: 'ok', type: 'exclusiveGateway', lane: 'noc', name: L('Post-checks OK ?', 'Post-checks passed?'), next: [['acceptance', L('Oui', 'Yes'), 92], ['rollback', L('Non', 'No'), 8]] },
  { key: 'rollback', type: 'userTask', lane: 'noc', name: L('Exécuter le rollback', 'Execute the rollback'), next: ['cutover'] },
  { key: 'acceptance', type: 'userTask', lane: 'pm', name: L('Organiser la recette', 'Organize the acceptance'), next: ['portal'] },
  { key: 'portal', type: 'serviceTask', lane: 'eng', name: L('Ouvrir le portail client (SSO)', 'Open the customer portal (SSO)'), next: ['training'] },
  { key: 'training', type: 'manualTask', lane: 'pm', name: L('Former les équipes du client', "Train the customer's teams"), next: ['run'] },
  { key: 'run', type: 'userTask', lane: 'noc', name: L('Transférer au Run', 'Hand over to Run'), next: ['end'] },
  { key: 'end', type: 'endEvent', lane: 'noc', name: L('Service en production', 'Service live'), next: [] },
]

// Sous-processus « Gérer le change ». Les flux après la table portent le niveau qu'elle rend.
export const CHANGE_STEPS = [
  { key: 'ch_start', type: 'startEvent', name: L('RFC créée', 'RFC raised'), next: ['ch_level'] },
  { key: 'ch_level', type: 'businessRuleTask', name: L('Classer le change', 'Classify the change'), next: ['ch_gw'] },
  { key: 'ch_gw', type: 'exclusiveGateway', name: L('Niveau ?', 'Level?'), next: [['ch_merge', L('Standard', 'Standard')], ['ch_manager', L('Normal', 'Normal')], ['ch_cab', L('CAB', 'CAB')]] },
  { key: 'ch_manager', type: 'userTask', name: L('Faire approuver par le change manager', 'Get change manager approval'), next: ['ch_merge'] },
  { key: 'ch_cab', type: 'userTask', name: L('Présenter au CAB', 'Present at the CAB'), next: ['ch_merge'] },
  { key: 'ch_merge', type: 'exclusiveGateway', name: L('', ''), next: ['ch_window'] },
  { key: 'ch_window', type: 'userTask', name: L('Planifier la MW et prévenir le client', 'Schedule the MW and notify the customer'), next: ['ch_end'] },
  { key: 'ch_end', type: 'endEvent', name: L('Change approuvé', 'Change approved'), next: [] },
]

// Flux de messages entre le client et l'intégrateur.
export const MESSAGES = [
  ['c_sign', 'start', L('Contrat', 'Contract')],
  ['c_inventory', 'inventory', L('Inventaire', 'Inventory')],
  ['approve', 'c_design', L('HLD', 'HLD')],
  ['acceptance', 'c_accept', L('Cahier de recette', 'Acceptance plan')],
]

// Exemple 11 : potentiel d'IA par activité (automate, assist, human).
export const AI_POTENTIAL = {
  audit: ['assist', L("Un agent rapproche l'inventaire, les relevés du survey et l'IPAM, et liste les écarts à vérifier.", 'An agent reconciles the inventory, the survey records and the IPAM, and lists the gaps to check.')],
  design: ['assist', L("Un agent remplit les fiches LLD depuis le HLD et l'IPAM. L'ingénieur garde les choix d'architecture.", 'An agent fills the LLD sheets from the HLD and the IPAM. The engineer keeps the architecture decisions.')],
  generate: ['automate', L("L'agent remplit les templates ZTP site par site et ouvre une merge request par vague.", 'The agent fills the ZTP templates site by site and opens one merge request per wave.')],
  review: ['human', L('Revue par un pair obligatoire avant tout envoi vers les équipements.', 'Mandatory peer review before anything reaches the devices.')],
  checks: ['assist', L("Un agent lit l'état des tunnels, des sessions BGP et des sondes SLA, et signale les écarts aux seuils.", 'An agent reads tunnel, BGP session and SLA probe status, and flags values outside the thresholds.')],
  rollback: ['human', L('Décision go/no-go humaine, prise dans la MW.', 'Human go/no-go decision, taken within the MW.')],
  acceptance: ['human', L('Engagement contractuel avec le client.', 'Contractual commitment with the customer.')],
  training: ['human', L('Présence et échange avec les équipes du client.', "Being there with the customer's teams.")],
}

// Exemple 12 : risques, contrôles, exigences, et fiche d'identité du processus.
export const COMPLIANCE = {
  generate: {
    risks: L("Configuration erronée produite par l'agent\nSecret (PSK, mot de passe) écrit en clair", 'Wrong configuration produced by the agent\nSecret (PSK, password) written in clear text'),
    controls: L('Linter de configuration et revue par un pair\nSecrets lus dans le coffre au déploiement, jamais dans le prompt', 'Configuration linter and peer review\nSecrets read from the vault at deployment, never in the prompt'),
    requirements: L('AI Act, art. 14 (contrôle humain) ; NIS2, art. 21', 'AI Act, art. 14 (human oversight); NIS2, art. 21'),
  },
  review: {
    risks: L('Merge request approuvée par son propre auteur', 'Merge request approved by its own author'),
    controls: L("Séparation des tâches : règle de protection de branche, l'auteur ne peut pas approuver", 'Segregation of duties: branch protection rule, the author cannot approve'),
    requirements: L('ISO/IEC 27001, A.5.3', 'ISO/IEC 27001, A.5.3'),
  },
  cutover: {
    risks: L('Coupure de service hors de la MW\nPerte de la ToIP des agences', 'Outage outside the MW\nLoss of branch VoIP'),
    controls: L('RFC approuvée avant toute action\nSauvegarde du routeur CE, conservé 7 jours\nCritères de rollback écrits dans la RFC', 'RFC approved before any action\nCE router backed up and kept for 7 days\nRollback criteria written in the RFC'),
    requirements: L('NIS2, art. 21 ; ITIL 4, gestion des changements', 'NIS2, art. 21; ITIL 4, change enablement'),
  },
  portal: {
    risks: L('Accès au portail donné à de mauvaises personnes', 'Portal access granted to the wrong people'),
    controls: L("Comptes ouverts par l'annuaire du client (SAML), revue trimestrielle des accès", "Accounts provisioned from the customer's directory (SAML), quarterly access review"),
    requirements: L('RGPD, art. 32', 'GDPR, art. 32'),
  },
}

export const IDENTITY = {
  owner: L('Directeur des opérations', 'Head of operations'),
  version: L('2.1', '2.1'),
  status: L('Validé', 'Approved'),
  validatedOn: L('2026-11-20', '2026-11-20'),
  scope: L('Mise en service SD-WAN managé, de la signature du contrat au transfert au Run, 40 agences en 5 vagues', 'Managed SD-WAN onboarding, from contract signature to handover to Run, 40 branches in 5 waves'),
}

// Exemple 13 : table de décision « Niveau d'approbation du change ».
export const DECISION = {
  name: L("Niveau d'approbation du change", 'Change approval level'),
  inputs: [
    { label: L('Impact métier', 'Business impact'), expression: 'impact', type: 'string', values: L('"faible","moyen","fort"', '"low","medium","high"') },
    { label: L('Sites dans la vague', 'Sites in the wave'), expression: 'sites', type: 'number' },
  ],
  output: { label: L('Niveau', 'Level'), name: 'niveau', nameEn: 'level', type: 'string', values: L('"Standard","Normal","CAB"', '"Standard","Normal","CAB"') },
  rules: [
    [L('faible', 'low'), '<= 5', 'Standard', L('Modèle de change préapprouvé du catalogue', 'Pre-approved change model from the catalog')],
    [L('faible', 'low'), '> 5', 'Normal', L('Approbation du change manager', 'Change manager approval')],
    [L('moyen', 'medium'), '<= 10', 'Normal', L('Approbation du change manager', 'Change manager approval')],
    [L('moyen', 'medium'), '> 10', 'CAB', L('CAB hebdomadaire', 'Weekly CAB')],
    [L('fort', 'high'), '-', 'CAB', L('Toujours en CAB, ECAB si urgence', 'Always to the CAB, ECAB if urgent')],
  ],
}
