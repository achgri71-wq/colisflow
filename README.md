# ColisFlow

**Scan. Organisez. Livrez.**

ColisFlow est une application web progressive (PWA) de scan et de suivi de colis, pensée pour les points de collecte, les livreurs et les équipes qui répartissent des colis entre plusieurs distributeurs. Elle reprend le principe du scanner Sendit, puis ajoute un tableau de bord, des statistiques, un historique de sessions, une recherche globale, l'import de feuilles de calcul et une sauvegarde complète.

L'application fonctionne **entièrement dans le navigateur** : les données restent dans IndexedDB sur l'appareil. Aucun serveur, aucun compte et aucune donnée envoyée à un tiers.

---

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Aperçu de l'interface](#aperçu-de-linterface)
- [Stack technique](#stack-technique)
- [Démarrage](#démarrage)
- [Organisation des données](#organisation-des-données)
- [Import et export](#import-et-export)
- [Sauvegarde et restauration](#sauvegarde-et-restauration)
- [Raccourcis clavier](#raccourcis-clavier)
- [Scan et compatibilité mobile](#scan-et-compatibilité-mobile)
- [Déploiement](#déploiement)
- [Tests et qualité](#tests-et-qualité)
- [Structure du projet](#structure-du-projet)
- [Limites connues et feuille de route](#limites-connues-et-feuille-de-route)
- [Confidentialité](#confidentialité)

---

## Fonctionnalités

### Scan

- **Caméra** : moteur de scan continu (Code 128, Code 39, Code 93, Codabar, EAN, UPC, ITF, QR, Data Matrix, Aztec, PDF417, MaxiCode) avec cadre de visée, autofocus et exposition continus, torche et bascule avant/arrière lorsque l'appareil le permet. Le scan démarre dès l'ouverture et reprend immédiatement après chaque code.
- **Saisie manuelle** : collage d'une liste de codes, séparés par des retours à la ligne, virgules, points-virgules ou tabulations.
- **Douchette USB / Bluetooth** : détection automatique des scanners qui se comportent comme un clavier, sans champ de saisie dédié.
- **Détection Sendit** : extraction du code de suivi depuis les liens de partage `app.sendit.ma` et les URL similaires.
- **Préfixes Sendit configurables** : `DH`, `DXH` et `DSH` par défaut, modifiables dans les paramètres.
- **Retour immédiat** : son, vibration, mise en évidence du dernier code, détection des doublons et déplacement automatique d'un colis déjà scanné chez un autre distributeur actif.
- **Annulation** : les actions destructrices récentes peuvent être annulées depuis la notification (undo).
- **Écran maintenu éveillé** : option Wake Lock pour les sessions de scan longues.

### Sessions et distributeurs

- Création de distributeurs avec nom, téléphone et note.
- Démarrage, reprise, clôture et annulation de sessions de scan.
- Chaque colis est rattaché à une session et à un distributeur.
- Renommage, archivage, restauration et suppression de distributeurs.
- Vue détaillée par distributeur : colis, sessions, historique et export.
- Archives consultables et restaurables.

### Tableau de bord

- Indicateurs du jour et de la veille, avec variation.
- Répartition Sendit / standard.
- Activité des 14 derniers jours et répartition graphique.
- Classement des distributeurs les plus actifs.
- Fil d'activité : sessions, imports, exports, déplacements, archivages, etc.

### Recherche et audit

- Recherche globale dans les distributeurs et les codes.
- Filtres par état, distributeur et type de code.
- Journal d'activité persistant.
- Fiche détaillée des sessions avec leurs codes.

### Données

- Import `XLSX` / `CSV` avec détection automatique de la colonne de codes.
- Export Excel par distributeur : feuille « Codes » et feuille « Détails ».
- Export CSV prêt pour un tableur.
- Sauvegarde JSON complète : distributeurs, sessions, codes, journal et préférences.
- Restauration avec validation du format et confirmation.
- Jeu de démonstration pour découvrir l'application.

### Expérience

- PWA installable, fonctionnelle hors ligne grâce à Workbox.
- Interface en **français**, **anglais** et **arabe**, avec prise en charge complète du RTL.
- Thèmes sombre, clair et système.
- Mise en page responsive : barre latérale sur ordinateur, navigation basse sur mobile.
- Notifications, dialogues de confirmation et de saisie accessibles.
- Raccourcis clavier.
- Mise à jour de l'application signalée dans l'interface.

---

## Aperçu de l'interface

| Page | Rôle |
| --- | --- |
| `/` | Tableau de bord, indicateurs, graphiques, activité récente |
| `/scan` | Session active, scan caméra, saisie manuelle, douchette, import |
| `/distributors` | Liste et création des distributeurs |
| `/distributors/:id` | Détail d'un distributeur, colis, sessions, actions |
| `/archive` | Distributeurs archivés |
| `/search` | Recherche globale |
| `/settings` | Préférences, Sendit, données, sauvegarde, installation |

La navigation utilise un `HashRouter` afin de rester compatible avec un hébergement statique simple, sans règle de réécriture côté serveur.

---

## Stack technique

| Domaine | Choix |
| --- | --- |
| Interface | React 19 + TypeScript |
| Build | Vite 8 |
| État | Zustand |
| Stockage local | IndexedDB via `idb` |
| Scan | `@zxing/library` + `@zxing/browser` |
| Graphiques | SVG et CSS maison |
| Excel | `write-excel-file`, `read-excel-file` |
| Icônes | `lucide-react` |
| PWA | `vite-plugin-pwa` + Workbox |
| Tests | Vitest |

---

## Démarrage

### Prérequis

- Node.js **20.19+** ou **22.12+** (requis par Vite 8).
- npm 10+.
- Une caméra et un contexte sécurisé (`https://` ou `localhost`) pour le scan caméra.

### Installation

```bash
npm install
npm run dev
```

L'application est servie par défaut sur <http://localhost:5173>.

### Commandes

```bash
npm run dev        # serveur de développement
npm run build      # vérification TypeScript + build de production
npm run preview    # prévisualisation du build
npm test           # suite de tests Vitest
npm run test:watch # tests en mode watch
npm run icons      # régénération des icônes PWA
```

Le build est généré dans `dist/`.

---

## Organisation des données

Le stockage repose sur quatre magasins IndexedDB :

| Magasin | Contenu |
| --- | --- |
| `distributors` | Distributeurs, coordonnées, état d'archivage |
| `sessions` | Sessions de scan, statut, source, horodatages |
| `codes` | Colis scannés, code, source, session, distributeur |
| `events` | Journal d'activité |

Les préférences (langue, thème, nom de boutique, préfixes Sendit, son, vibration, Wake Lock) sont stockées dans `localStorage` sous la clé `colisflow.settings`.

### Règles importantes

- Un code déjà présent chez un **autre distributeur actif** est déplacé vers le distributeur courant. L'ancien propriétaire est conservé dans `movedFrom` et l'opération est journalisée.
- Les codes d'un distributeur **archivé** ne sont pas déplacés.
- Un code identique déjà scanné dans la session courante est signalé comme doublon.
- Les sessions annulées ne comptent pas dans les statistiques de sessions.
- Les données restent sur l'appareil et le navigateur utilisés. Elles ne se synchronisent pas entre appareils.

---

## Import et export

### Importer des codes

1. Ouvrir une session de scan.
2. Choisir **Importer**.
3. Déposer un fichier `.xlsx`, `.xls` ou `.csv`.
4. ColisFlow analyse jusqu'à 12 colonnes et retient celle qui contient le plus de codes plausibles.
5. Les codes sont ajoutés à la session active ; les doublons sont ignorés.

Conseils :

- Une ligne d'en-tête (`Code`, `Tracking`, etc.) est ignorée automatiquement.
- Les colonnes de métadonnées (téléphone, fournisseur, statut, date, adresse…) sont écartées automatiquement.
- Les fichiers CSV peuvent utiliser `,` ou `;` comme séparateur.
- Les liens Sendit sont convertis en code de suivi.

### Exporter

Depuis la fiche d'un distributeur, **Exporter Excel** produit un classeur avec :

- une feuille **Codes** : codes Sendit puis codes standard ;
- une feuille **Détails** : code, type, date, session et source.

Le nom du fichier inclut le distributeur et la date du jour.

---

## Sauvegarde et restauration

Dans **Paramètres → Données** :

- **Exporter la sauvegarde** télécharge un fichier JSON contenant l'ensemble des données et les préférences.
- **Importer une sauvegarde** remplace les données locales après validation du format et confirmation.
- **Charger les données de démonstration** crée un jeu d'exemple.
- **Tout réinitialiser** efface les données locales.

> Une sauvegarde régulière est recommandée. Vider les données du navigateur, utiliser une fenêtre de navigation privée ou changer d'appareil revient à repartir de zéro.

---

## Raccourcis clavier

| Raccourci | Action |
| --- | --- |
| `Ctrl` / `Cmd` + `K` | Ouvrir la recherche |
| `N` | Nouvelle session |
| `Esc` | Fermer une fenêtre modale ou un dialogue |

Les raccourcis sont désactivés lorsque le focus est dans un champ de saisie.

---

## Scan et compatibilité mobile

- Le scan caméra nécessite HTTPS (ou `localhost`).
- L'autorisation caméra doit être accordée au navigateur.
- La torche et la bascule de caméra dépendent du matériel et du navigateur.
- Sur iOS, l'installation se fait via **Partager → Sur l'écran d'accueil**.
- Le mode hors ligne est disponible après une première visite avec le service worker actif.
- Les scanners USB/Bluetooth en mode clavier fonctionnent sans pilote supplémentaire.

### Formats pris en charge

| Famille | Formats |
| --- | --- |
| 1D | Code 128, Code 39, Code 93, Codabar, EAN-8, EAN-13, UPC-A, UPC-E, ITF |
| 2D | QR, Micro QR, Data Matrix, Aztec, PDF417, MaxiCode |

### Moteur de scan

- **Zone utile** : seule la zone de visée (avec une marge) est décodée, pas l'image entière du capteur.
- **Code 128 prioritaire** : à chaque ligne analysée, le Code 128 est testé avant les autres formats 1D, sans balayage complet redondant.
- **Passe 2D séparée** : le 1D est tenté à chaque image, le 2D toutes les 2 images (toutes les 3 images sur un appareil modeste) avec une fenêtre de priorité de 5 s après un code 2D.
- **Résolution adaptative** : la largeur d'analyse diminue si le décodage ralentit et remonte quand l'appareil le supporte.
- **Réglages caméra** : autofocus, exposition et balance des blancs continus lorsqu'ils sont disponibles.
- **Aucun délai fixe** : la boucle enchaîne les images et reprend immédiatement après un scan, sans temporisation artificielle.
- **Doublons maîtrisés** : une fenêtre glissante de 1,5 s ignore le même code encore visible, mais un code différent est accepté sans attendre.
- **Robustesse** : secours inversion (étiquettes claires sur fond sombre), rotation et image entière pour les codes hors cadre.
- **Appareils modestes** : résolution et fréquence de la passe 2D réduites automatiquement selon les cœurs et la mémoire disponibles.

### Performances mesurées

Le banc compare l'ancien pipeline (image 1280×720 complète, lecteurs ZXing par défaut, délai fixe de 500 ms) au nouveau (zone de visée 800×560, Code 128 en premier, sans délai fixe), sur du contenu identique.

| Scénario | Avant | Après | Gain |
| --- | --- | --- | --- |
| Code 128, temps de détection | 501,4 ms | 16,8 ms | **29,9×** |
| QR, temps de détection | 642,7 ms | 39,7 ms | **16,2×** |

Décodage seul, médiane :

| Format | Avant (pleine image) | Après (zone de visée) |
| --- | --- | --- |
| Code 128 | 1,41 ms | **0,13 ms** |
| Code 39 | 0,69 ms | 0,91 ms |
| QR | 142,7 ms | **6,4 ms** |

```bash
npm run bench:scanner
```

Mesures Node 24 sur un Intel i5-6200U, images synthétiques. Elles ne comptent que le décodage ZXing : la capture et le rendu caméra dépendent de l'appareil. Pour observer les temps réels sur un téléphone, activez le HUD de diagnostic :

```js
localStorage.setItem('colisflow:scannerDebug', '1')
```

Le HUD affiche les images par seconde, la durée de décodage, la résolution analysée, la passe 1D/2D et le dernier format détecté. Désactivez-le avec `localStorage.removeItem('colisflow:scannerDebug')`.

### Dépannage caméra

- **Accès refusé** : autorisez la caméra pour le site dans les réglages du navigateur, puis utilisez « Réessayer ».
- **Aucune caméra** : vérifiez qu'aucun autre onglet ou application ne monopolise le capteur.
- **Connexion non sécurisée** : utilisez HTTPS ou `localhost`; une adresse LAN en `http://` ne permet pas l'accès à la caméra.
- **Code non détecté** : approchez le code du cadre, évitez les reflets et essayez la torche. La saisie manuelle reste disponible.

---

## Déploiement

Le dossier `dist/` est entièrement statique. Il peut être publié sur Netlify, Vercel, Cloudflare Pages, GitHub Pages, un hébergement mutualisé ou un serveur web classique.

### Netlify / Vercel / Cloudflare Pages

- Commande de build : `npm run build`
- Répertoire de publication : `dist`

### Serveur web

Servez `dist/` en HTTPS. Avec le `HashRouter`, aucune règle de réécriture n'est nécessaire pour les routes de l'application.

### Sous-répertoire

Si l'application est publiée sous un sous-chemin (par exemple `https://exemple.com/colisflow/`), adaptez `base` dans `vite.config.ts` ainsi que `start_url` et `scope` du manifeste PWA. Pour un déploiement à la racine, la configuration actuelle suffit.

---

## Tests et qualité

La suite couvre :

- l'extraction de codes et des liens Sendit ;
- la détection des préfixes et le regroupement des codes ;
- le parsing des listes et des feuilles de calcul ;
- les statistiques par distributeur, le résumé du tableau de bord, les séries temporelles, le classement et la répartition Sendit ;
- le décodeur du scanner (Code 128, Code 39, QR) et la déduplication des scans caméra et douchette.

```bash
npm test
```

Le benchmark du scanner s'exécute séparément :

```bash
npm run bench:scanner
```

Le build exécute `tsc --noEmit` avant Vite : une erreur de type bloque la production.

Les pages et les bibliothèques lourdes (scan caméra, Excel) sont chargées à la demande afin de garder le chargement initial léger.

---

## Structure du projet

```text
colisflow/
├─ public/                 # Icônes et assets statiques
├─ scripts/icons.mjs       # Génération des icônes PWA
├─ scripts/bench-scanner.ts # Benchmark du décodeur (npm run bench:scanner)
├─ src/
│  ├─ components/          # UI, modales, scanner, graphiques, layout
│  ├─ hooks/               # Actions distributeur, caméra, HID, Wake Lock, PWA
│  ├─ i18n/                # Dictionnaires FR / EN / AR
│  ├─ lib/                 # Codes, scanner, caméra, stats, export, IndexedDB
│  ├─ pages/               # Pages de l'application
│  ├─ store/               # Store Zustand et actions métier
│  ├─ App.tsx              # Routes, initialisation, raccourcis
│  ├─ main.tsx             # Point d'entrée React
│  ├─ styles.css           # Design system et responsive
│  └─ types.ts             # Types partagés
├─ index.html
├─ vite.config.ts          # Vite, PWA et Vitest
└─ package.json
```

---

## Limites connues et feuille de route

- **Pas de synchronisation multi-appareils** : les données sont locales par conception.
- **Pas d'authentification** : l'application est prévue pour un appareil partagé de confiance.
- **Pas de backend** : aucune collaboration temps réel entre opérateurs.
- **Export Excel par distributeur** : l'export global et les rapports planifiés restent à ajouter.
- **Pistes** : synchronisation chiffrée optionnelle, comptes opérateurs, étiquettes imprimables, notifications de colis en attente, statistiques par plage de dates personnalisée, mode multi-sites.

---

## Confidentialité

ColisFlow n'envoie aucune donnée métier vers un serveur. Les colis, distributeurs, sessions et préférences restent dans le navigateur. Les polices sont chargées depuis Google Fonts ; pour un déploiement totalement hors réseau, elles peuvent être auto-hébergées.

---

**ColisFlow** — local-first, sans compte, sans cloud.
