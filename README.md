# DemoReviewer v.0.1 — demoreview CS2 (MVP équipe)

Plateforme privée pour uploader, parser et revoir des démos CS2 (replayer 2D, stats, filtres, paint, partage interne). Pensée pour une équipe ~7 (5 joueurs + coach + manager), avec une base multi-tenant (`team_id`) prête à produitiser plus tard.

## Stack

- `apps/web` — Next.js 15 (UI + API)
- `apps/worker` — BullMQ + `@laihoe/demoparser2`
- `packages/shared` — types / schémas Zod
- Postgres, Redis, stockage S3-compatible (**Silo** — fork MinIO, les images `minio/minio` ne sont plus tirables)
- Auth Steam OpenID (invite-only)

## Démarrage local

```bash
cp .env.example .env
docker compose up -d
npm install
npm run build -w @skybox/shared
npm run db:migrate
npm run db:seed
```

Deux terminaux :

```bash
npm run dev
npm run dev:worker
```

### Vérifications (comme la CI)

```bash
npm run lint
npm run typecheck
npm test          # Vitest — rôles, redirections, Steam OpenID, uploads, décompression
```

La CI GitHub Actions (`.github/workflows/ci.yml`) lance lint + typecheck + tests + build sur chaque PR et chaque push sur `main`.

- App : http://localhost:3000  
- Console S3 (Silo) : http://localhost:9001 (`skybox` / `skyboxsecret`)

> Les images Docker Hub `minio/minio` ont été retirées (2025–2026). Ce projet utilise `pgsty/silo`, compatible S3 / mêmes variables `MINIO_*`. Le bucket est créé automatiquement au premier upload.

### Connexion (Steam)

1. Définis `SEED_ADMIN_STEAM_ID=7656119…` dans `.env` (**obligatoire en production**). En local sans seed, le premier Steam peut bootstrap.
2. Sur `/login` → **Continuer avec Steam** (OpenID, pas de clé API requise).
3. Invite d’autres membres depuis `/team` (lien + SteamID64 optionnel ; seul un admin peut inviter un admin).

### Upload démo

Uploade un `.dem` / `.dem.zst` depuis le dashboard. Le navigateur envoie le fichier directement dans le bucket (URL présignée — le serveur web ne le charge jamais en RAM), puis le worker le télécharge, détecte les doublons (SHA-256) et parse avec demoparser2. En prod sur R2, configure le CORS du bucket (voir `deploy/PROD.md`). En cas d’échec (fichier invalide, démo coupée, etc.), le match passe en `failed` avec un message clair — relance via **Reparse**.

## Déploiement VPS + Cloudflare R2

1. Provisionne Postgres (managé ou sur le VPS) + Redis.
2. Crée un bucket R2, génère des API tokens S3.
3. Variables :

```env
APP_URL=https://review.ton-domaine.gg
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_BUCKET=skybox-demos
S3_FORCE_PATH_STYLE=false
S3_REGION=auto
AUTH_SECRET=<long-random>
SEED_ADMIN_STEAM_ID=<ton-steamid64>
MAX_DEMO_SIZE_MB=512
DEMO_RETENTION_DAYS=90
```

> `APP_URL` doit être l’URL publique exacte (Steam vérifie `openid.return_to` / `realm`).


4. Build & run :

```bash
npm install
npm run build
npm run db:migrate
npm run db:seed
NODE_ENV=production npm run start -w @skybox/web
NODE_ENV=production npm run start -w @skybox/worker
```

Reverse-proxy (Caddy/Nginx) vers le port 3000. Worker sur la même machine suffit pour une équipe.

### Limites / rétention

- Taille max upload : `MAX_DEMO_SIZE_MB` (défaut 512).
- Rétention : `DEMO_RETENTION_DAYS` (défaut 90, `0` = illimité). Purge quotidienne via `deploy/demoreviewer-purge.timer` (supprime aussi les uploads abandonnés > 24 h).
- Auth invite-only : pas de signup public.

### Radars (pool compétitif)

Maps supportées par le 2D Replayer : Ancient, Anubis, Cache, Dust II, Inferno, Mirage, Nuke, Overpass, Train, Vertigo.

```bash
node scripts/fetch-radars.mjs   # télécharge les overviews + régénère packages/shared/src/maps.generated.ts
npm run build -w @skybox/shared
```

Si une démo est sur une map hors pool, le parse réussit mais le viewer affiche une erreur propre listant les maps supportées.

## Parcours de validation

1. Seed + login coach
2. Invite un player
3. Upload d’une démo Faceit
4. Attendre `ready`, ouvrir `/m/[id]`
5. Filtrer pistol / full, scrub le replayer
6. Paint + sauver, copier le lien, ouvrir depuis un autre compte équipe

## Structure

```
apps/web          UI + API
apps/worker       parse jobs
packages/shared   types partagés
docker-compose.yml
```
