# Billetterie Save Life - Generation & Verification

Plateforme web React + Supabase pour la Journee Caritative de la Fondation Save Life.
Elle permet d'importer une liste d'invites, de generer des billets avec QR code unique,
d'exporter les billets en PDF / PNG, puis de verifier les acces par scan camera avec
controle anti-fraude a usage unique.

## Fonctionnalites

- Import CSV avec detection automatique des colonnes et validation.
- Trois categories de billets :
  - `VVIP` - `100 $`
  - `VIP` - `50 $`
  - `Standard` - `10 $`
- Generation de QR codes places automatiquement dans le cadre de verification des modeles.
- Export PDF et PNG par billet ou par lot complet.
- Verification par camera mobile/desktop, saisie manuelle de secours, mode plein ecran scanner.
- Usage unique securise : le premier scan admet le billet, les scans suivants sont refuses et traces.
- Tableau de bord temps reel : tickets emis, entres, restants, refus, categories et activite recente.
- Export en masse optimise pour les grands lots.
- PWA installable avec interface mobile.
- Roles :
  - `admin` : acces complet.
  - `generator` : generation des billets.
  - `verifier` : verification des acces.
  - `pending` : compte en attente de validation.

## Securite

- Chaque billet possede un secret aleatoire encode dans le QR sous la forme `ticketId.secret`.
- La consommation d'un billet passe par la fonction SQL atomique `scan_ticket`, avec verrouillage
  de la ligne du ticket pour empecher deux admissions simultanees.
- Les politiques RLS Supabase limitent les acces :
  - le staff peut lire les billets et les scans ;
  - les generateurs/admins peuvent creer des lots et tickets ;
  - les verificateurs/admins peuvent scanner via RPC ;
  - seuls les admins peuvent attribuer les roles ;
  - les scans sont append-only.

La cle anon Supabase cote client est publique par conception. La securite repose sur
l'authentification, les politiques RLS et les fonctions SQL securisees.

## Installation locale

```bash
npm install
cp .env.example .env
npm run dev
```

Application disponible sur http://localhost:5173

La camera necessite un contexte securise : `localhost` fonctionne ; en production il faut HTTPS.

## Configuration Supabase

1. Creez un projet sur Supabase.
2. Dans `Project Settings` -> `API`, copiez :
   - `Project URL`
   - `anon public key`
3. Renseignez `.env` :

```env
VITE_SUPABASE_URL=https://votre-projet.supabase.co
VITE_SUPABASE_ANON_KEY=votre_anon_key
```

4. Dans `SQL Editor`, executez tout le fichier `supabase/schema.sql`.
5. Dans `Authentication` -> `Providers`, activez `Email`.
6. Pour les tests rapides, vous pouvez desactiver temporairement la confirmation email.
7. Pour le flux d'activite en direct, activez Realtime sur la table `public.scans`.

## Creer le premier administrateur

Les nouveaux comptes sont crees avec le role `pending`.

1. Lancez l'app et creez votre compte depuis la page de connexion.
2. Dans Supabase `SQL Editor`, remplacez l'email puis executez :

```sql
update public.profiles
set role = 'admin'
where email = 'votre-email@example.com';
```

3. Reconnectez-vous dans l'app.
4. Utilisez l'onglet `Users` pour attribuer les roles `generator`, `verifier` ou `admin`.

## Format CSV

Colonnes reconnues :

| Champ | Synonymes acceptes | Obligatoire |
| --- | --- | :---: |
| `nom` | name, titulaire, beneficiaire | oui |
| `categorie` | category, cat, type, billet | oui |
| `email` | mail, courriel | non |
| `telephone` | phone, tel, gsm, contact | non |
| `reference` | ref, numero, no, id | non |
| `place` | seat, siege, table | non |

`categorie` accepte `VVIP`, `VIP`, `Standard` ou `100`, `50`, `10`
avec variantes comme `100$`, `50 $`, `10$`.

Un modele CSV est telechargeable depuis l'ecran de generation.

## Deploiement Vercel

1. Importez le depot sur Vercel.
2. Dans `Project` -> `Settings` -> `Environment Variables`, ajoutez :

```env
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

3. Lancez le deploiement. Vercel detecte Vite automatiquement (`npm run build` -> `dist`).
4. Dans Supabase `Authentication` -> `URL Configuration`, ajoutez votre domaine Vercel dans les
   URL autorisees si vous utilisez la confirmation email ou des redirections d'auth.

La camera de verification fonctionne en HTTPS, fourni par Vercel.

## PWA

L'application est une PWA via `vite-plugin-pwa`.

- Android / Chrome : menu -> Ajouter a l'ecran d'accueil.
- iOS / Safari : Partager -> Sur l'ecran d'accueil.
- Desktop : icone d'installation dans la barre d'adresse.

Les icones PWA sont regenerables via :

```bash
python scripts/gen_icons.py
```

## Stack technique

- React 18 + TypeScript + Vite
- Supabase Auth + Postgres + RLS + Realtime
- TailwindCSS
- qrcode, jspdf, jszip, papaparse, html5-qrcode, recharts, lucide-react
- vite-plugin-pwa

## Structure

```text
public/templates/
  billet-100.png         Modele VVIP - 100 $
  billet-50.png          Modele VIP - 50 $
  billet-10.png          Modele Standard - 10 $
supabase/
  schema.sql             Tables, RLS, RPC scan_ticket, stats
src/
  context/AuthContext    Authentification Supabase + roles
  lib/                   supabase, types, categories, crypto, csv, tickets, users, rendu
  components/            Layout, ProtectedRoute, QrScanner, TicketPreview, Spinner
  pages/                 Login, Pending, Generation, Verification, Admin, NotFound
```
