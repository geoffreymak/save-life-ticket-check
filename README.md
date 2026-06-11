# 🎟️ Billetterie Save Life — Génération & Vérification de billets

Plateforme web (React + Firebase) pour la **Journée Caritative** de la Fondation Save Life.
Elle permet d'importer une liste d'invités, de générer des billets avec **QR code unique et
infalsifiable** sur les modèles officiels, de les exporter en **PDF / PNG**, puis de **vérifier
les accès** par scan caméra avec contrôle anti-fraude (usage unique).

---

## ✨ Fonctionnalités

- **Import CSV** avec détection automatique des colonnes et validation.
- **3 catégories** de billets correspondant aux modèles fournis :
  - `VVIP` — `100 $`
  - `VIP` — `50 $`
  - `Standard` — `10 $`
- **Génération de QR codes** placés automatiquement dans le cadre « VERIFICATION ACCÈS »
  de chaque modèle.
- **Export PDF & PNG** par billet ou par lot complet.
- **Vérification par caméra** (mobile/desktop) + saisie manuelle de secours.
- **Usage unique sécurisé** : le 1ᵉʳ scan admet le billet (transaction atomique). Un 2ᵉ scan
  affiche **la date/heure et l'opérateur du 1ᵉʳ passage** pour détecter les fraudes/erreurs.
- **Tableau de bord temps réel** (admin) : KPIs (émis / entrés / restants / refus), taux
  d'entrée, graphiques par catégorie (camembert + barres), détail par catégorie et **flux
  d'activité en direct** (`onSnapshot`).
- **Export en masse** : **PDF** (un seul fichier multi-pages), **PDF en `.zip`** (1 fichier par
  billet) et **PNG en `.zip`**, par lot.
- **PWA installable** + **interface mobile** (barre d'onglets en bas, style application).
- **Vérification enrichie** : stats globales temps réel, **mode auto** (réarme le scanner
  automatiquement), **recherche par référence** (billet papier), bip sonore.
- **Rôles** :
  - `admin` — accès complet (dashboard, génération, vérification, gestion des utilisateurs) ;
  - `generator` — génération des billets uniquement ;
  - `verifier` — vérification des accès uniquement.
- **Sécurité** : règles Firestore strictes + jetons aléatoires 160 bits anti-falsification.

---

## 🔐 Modèle de sécurité

- Chaque billet possède un **jeton aléatoire** (`secret`, ~160 bits) encodé dans le QR sous la
  forme `id.secret`. Impossible à deviner ⇒ impossible de forger un billet valide.
- La **consommation** d'un billet se fait via une **transaction Firestore atomique** :
  deux scans simultanés ne peuvent pas admettre deux fois le même billet.
- Les **règles Firestore** (`firestore.rules`) imposent :
  - un vérificateur ne peut **que** consommer un billet (champs d'identité immuables,
    `scanCount` strictement croissant, statut → `used`) ;
  - seul un générateur/admin peut créer des billets ;
  - seul un admin peut attribuer des rôles (pas d'auto-élévation de privilèges) ;
  - le journal des scans est **append-only**.

> La clé API Firebase côté client est **publique par conception** : la sécurité repose sur
> l'authentification et les règles Firestore, pas sur le secret de la clé.

---

## 🚀 Installation locale

```bash
npm install
cp .env.example .env   # les valeurs Firebase y sont déjà renseignées
npm run dev
```

Application disponible sur http://localhost:5173

> ⚠️ La **caméra** nécessite un contexte sécurisé : `localhost` fonctionne ; sur le réseau/en
> production il faut **HTTPS**.

---

## ⚙️ Configuration Firebase (console)

1. **Authentication** → activer le fournisseur **E-mail / Mot de passe**.
2. **Firestore Database** → créer la base (mode production).
3. **Déployer les règles** (voir ci-dessous).

### Déployer les règles Firestore

```bash
npm install -g firebase-tools
firebase login
firebase use save-life-cd
firebase deploy --only firestore:rules
```

---

## 👑 Créer le premier administrateur (bootstrap)

Les nouveaux comptes ont le rôle `pending` (aucun accès) tant qu'un admin ne les valide pas.
Pour le **tout premier admin** :

1. Lancez l'app et **créez un compte** (page de connexion → « S'inscrire »).
2. Dans la **console Firebase → Firestore → collection `users`**, ouvrez votre document
   utilisateur et changez le champ `role` de `pending` en **`admin`**.
3. Reconnectez-vous : vous avez désormais accès à l'onglet **Utilisateurs** pour attribuer les
   rôles `generator` et `verifier` aux autres comptes.

---

## 📥 Format du fichier CSV

Colonnes reconnues (insensible à la casse/accents) :

| Champ       | Synonymes acceptés            | Obligatoire |
| ----------- | ----------------------------- | :---------: |
| `nom`       | name, titulaire, beneficiaire |     ✅      |
| `categorie` | category, cat, type, billet   |     ✅      |
| `email`     | mail, courriel                |     ❌      |
| `telephone` | phone, tel, gsm, contact      |     ❌      |
| `reference` | ref, numero, no, id           |     ❌      |
| `place`     | seat, siege, table            |     ❌      |

`categorie` accepte : `VVIP` / `VIP` / `Standard` ou `100` / `50` / `10`
(avec variantes comme `100$`, `50 $`, `10$`).

Un **modèle CSV** est téléchargeable directement depuis l'écran de génération.

---

## ▲ Déploiement sur Vercel

Le projet est prêt pour Vercel (`vercel.json` : framework Vite, sortie `dist`, rewrites SPA pour
le routage côté client).

**1. Importer le dépôt** sur https://vercel.com (New Project → import Git).

**2. Variables d'environnement** — dans _Project → Settings → Environment Variables_, ajoutez
(valeurs dans votre `.env`) :

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_MEASUREMENT_ID
```

**3. Build** : Vercel détecte Vite automatiquement (`npm run build` → `dist`). Déployez.

**4. Domaines autorisés Firebase** : dans _Firebase Console → Authentication → Settings →
Authorized domains_, ajoutez votre domaine Vercel (ex : `mon-projet.vercel.app`) pour que la
connexion fonctionne.

> La caméra de vérification fonctionne en HTTPS (fourni par Vercel) ✅.

### Alternative : Firebase Hosting

```bash
npm run build
firebase deploy --only hosting
```

(Le `firebase.json` est déjà configuré : dossier `dist`, rewrites SPA.)

---

## 📱 Installation en application (PWA)

L'application est une **PWA** (`vite-plugin-pwa`) : une fois déployée en HTTPS, elle s'installe
comme une app native.

- **Android / Chrome** : menu ⋮ → _Ajouter à l'écran d'accueil_.
- **iOS / Safari** : bouton _Partager_ → _Sur l'écran d'accueil_.
- **Desktop** : icône d'installation dans la barre d'adresse.

Interface optimisée mobile : **barre d'onglets en bas** (Stats / Billets / Scanner / Users),
zones tactiles larges, gestion des _safe areas_ (encoche). Le service worker met l'app en cache
pour un démarrage rapide et un usage hors-ligne partiel (les écritures nécessitent le réseau).

> Les icônes PWA sont régénérables via `python scripts/gen_icons.py`.

---

## 🧱 Stack technique

- **React 18 + TypeScript + Vite**
- **TailwindCSS** (palette inspirée des billets)
- **Firebase** : Authentication + Firestore
- **qrcode** (génération QR), **jspdf** (PDF), **jszip** (export `.zip`), **papaparse** (CSV),
  **html5-qrcode** (scan), **recharts** (graphiques), **lucide-react** (icônes)
- **vite-plugin-pwa** (PWA / service worker)

---

## 📁 Structure

```
public/templates/
  billet-100.png         Modèle VVIP — 100 $
  billet-50.png          Modèle VIP — 50 $
  billet-10.png          Modèle Standard — 10 $
src/
  lib/                   firebase, types, categories, crypto, csv, tickets, users, rendu
  context/AuthContext    Authentification + rôles
  components/            Layout, ProtectedRoute, QrScanner, TicketPreview, Spinner
  pages/                 Login, Pending, Generation, Verification, Admin, NotFound
firestore.rules          Règles de sécurité
```
