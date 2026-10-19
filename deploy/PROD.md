# Mise en prod — DemoReviewer (VPS + DNS déjà prêts)

Prérequis : SSH sur le VPS, DNS A qui pointe déjà vers l’IP, ports 22/80/443 ouverts.

Remplace partout `review.example.com` par **ton** domaine.

---

## 1. Outils sur le VPS (Ubuntu)

```bash
ssh root@IP_DU_VPS

apt update && apt upgrade -y
apt install -y git curl ufw

ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw --force enable

# Docker
curl -fsSL https://get.docker.com | sh

# Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs

# Caddy
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

---

## 2. Stockage démos (Cloudflare R2)

1. Cloudflare → R2 → bucket `demoreviewer-prod`
2. API Token (Object Read & Write)
3. Note endpoint : `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`

*(Sans R2 : tu peux lancer MinIO via `docker compose up -d minio` en local-only, moins idéal en prod.)*

---

## 3. Clone le repo

```bash
mkdir -p /opt
cd /opt
git clone https://github.com/xhemylus/skybox.git demoreviewer
cd demoreviewer
```

Si le repo est privé : utilise un [Deploy Key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys) ou un PAT.

---

## 4. Fichier `.env`

```bash
cp .env.example .env
nano .env
```

Exemple minimal :

```env
APP_URL=https://review.example.com
NODE_ENV=production

DATABASE_URL=postgresql://skybox:CHANGE_ME_DB_PASSWORD@127.0.0.1:5432/skybox
REDIS_URL=redis://127.0.0.1:6379

S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_REGION=auto
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_BUCKET=demoreviewer-prod
S3_FORCE_PATH_STYLE=false

AUTH_SECRET=<sortie de: openssl rand -hex 32>
SEED_ADMIN_STEAM_ID=7656119xxxxxxxxxx
SEED_TEAM_NAME=Nom De Ton Equipe

MAX_DEMO_SIZE_MB=512
DEMO_RETENTION_DAYS=90
```

Change aussi le mot de passe Postgres dans `docker-compose.yml` (ou aligne-le avec `DATABASE_URL`).

---

## 5. Postgres + Redis

```bash
cd /opt/demoreviewer
# Édite POSTGRES_PASSWORD dans docker-compose.yml si besoin
docker compose up -d postgres redis
docker compose ps
```

Les ports sont bindés sur `127.0.0.1` uniquement.

---

## 6. Install, build, migrate, seed

```bash
cd /opt/demoreviewer
npm ci
npm run build
npm run db:migrate
npm run db:seed
```

---

## 7. Caddy (HTTPS)

```bash
# Remplace le domaine dans le fichier
nano deploy/Caddyfile

cp deploy/Caddyfile /etc/caddy/Caddyfile
systemctl reload caddy
systemctl status caddy
```

Caddy obtient le certificat Let’s Encrypt tout seul si le DNS est bon.

---

## 8. Services (infra + web + worker) — démarrage auto au boot

```bash
# Docker doit démarrer au boot
systemctl enable docker

cp deploy/demoreviewer-infra.service /etc/systemd/system/
cp deploy/demoreviewer-web.service /etc/systemd/system/
cp deploy/demoreviewer-worker.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now demoreviewer-infra demoreviewer-web demoreviewer-worker caddy
systemctl status demoreviewer-infra demoreviewer-web demoreviewer-worker caddy
```

Ordre au reboot : Docker → Postgres/Redis (`demoreviewer-infra`) → web + worker → Caddy.  
Sans Redis, le login Steam échoue (nonce OpenID).

Logs :

```bash
journalctl -u demoreviewer-web -f
journalctl -u demoreviewer-worker -f
```

---

## 9. Vérifications

1. Ouvre `https://review.example.com`
2. Login Steam (toi = admin via `SEED_ADMIN_STEAM_ID`)
3. Invite un joueur → `/team`
4. Upload une démo → attend `Prêt` → replay + lien round

---

## Mises à jour suivantes (manuel)

```bash
cd /opt/demoreviewer
bash deploy/deploy.sh
```

---

## 10. Déploiement auto (vraie prod) — GitHub Actions → SSH

À chaque push sur `main`, GitHub SSHe sur le VPS et lance `deploy/deploy.sh` (pull, build, migrate, restart, healthcheck).

### A. User dédié sur le VPS (recommandé)

```bash
# Sur le VPS (en root)
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy   # si besoin docker compose plus tard
mkdir -p /home/deploy/.ssh
# Colle la clé PUBLIQUE du déploiement (voir B) :
nano /home/deploy/.ssh/authorized_keys
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh

# Droits sur le repo
chown -R deploy:deploy /opt/demoreviewer

# Sudo limité (restart services uniquement)
cp /opt/demoreviewer/deploy/sudoers.demoreviewer /etc/sudoers.d/demoreviewer
chmod 440 /etc/sudoers.d/demoreviewer
visudo -cf /etc/sudoers.d/demoreviewer
```

Si tu restes en `root` pour Actions, ignore le sudoers — le workflow fonctionne pareil.

### B. Clé SSH pour GitHub Actions

Sur ton Mac (ou le VPS) :

```bash
ssh-keygen -t ed25519 -C "github-actions-demoreviewer" -f ./demoreviewer-deploy -N ""
```

- **Privée** (`demoreviewer-deploy`) → secret GitHub `VPS_SSH_KEY` (contenu entier, y compris `BEGIN`/`END`)
- **Publique** (`demoreviewer-deploy.pub`) → `/home/deploy/.ssh/authorized_keys` (ou root)

Ne committe jamais la clé privée.

### C. Secrets GitHub

Repo → **Settings → Secrets and variables → Actions** :

| Secret | Exemple |
|--------|---------|
| `VPS_HOST` | `203.0.113.10` ou hostname |
| `VPS_USER` | `deploy` (ou `root`) |
| `VPS_SSH_KEY` | contenu de la clé privée |
| `VPS_PORT` | `22` (optionnel) |

### D. Accès git sur le VPS

Le user `deploy` doit pouvoir `git pull` le repo. Si privé :

```bash
# Deploy key en lecture seule liée au repo GitHub
sudo -u deploy ssh-keygen -t ed25519 -f /home/deploy/.ssh/github_ro -N ""
# Ajoute github_ro.pub dans GitHub → Settings → Deploy keys (read-only)
sudo -u deploy bash -c 'cat >> /home/deploy/.ssh/config <<EOF
Host github.com
  IdentityFile ~/.ssh/github_ro
  StrictHostKeyChecking accept-new
EOF'
cd /opt/demoreviewer
sudo -u deploy git remote set-url origin git@github.com:xhemylus/skybox.git
sudo -u deploy git fetch
```

### E. Test

1. GitHub → **Actions → Deploy production → Run workflow**
2. Ou : `git push origin main`
3. Vérifie le job vert + `https://review.hemylabs.com/api/health`

Logs sur le VPS : `/opt/demoreviewer/logs/deploy-*.log`

### F. Règles de bon sens

- Ne modifie **pas** de fichiers trackés à la main sur le VPS (`deploy.sh` refuse un working tree sale).
- Les changements d’env restent dans `/opt/demoreviewer/.env` (hors git).
- Un seul deploy à la fois (lock + concurrency GitHub).
- En cas d’échec healthcheck : le job échoue ; rollback manuel :
  ```bash
  cd /opt/demoreviewer
  git checkout <sha-précédent>
  SKIP_PULL=1 bash deploy/deploy.sh
  ```

---

## Dépannage rapide

| Symptôme | Check |
|----------|--------|
| Certificat HTTPS KO | DNS A pointe bien vers l’IP ? `dig +short review.example.com` |
| Steam refuse login | `APP_URL` = URL HTTPS exacte (pas de slash final bizarre) |
| Upload OK mais jamais prêt | `journalctl -u demoreviewer-worker -n 100` + Redis up |
| 502 Bad Gateway | `systemctl status demoreviewer-web` — écoute sur :3000 ? |
