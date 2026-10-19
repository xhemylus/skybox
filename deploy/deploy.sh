#!/usr/bin/env bash
# Mise à jour / premier déploiement sur le VPS.
# Usage (sur le serveur) : cd /opt/demoreviewer && bash deploy/deploy.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Manque .env — copie .env.example et remplis les valeurs prod."
  exit 1
fi

echo "==> git pull"
git pull --ff-only

echo "==> npm ci"
npm ci

echo "==> build"
npm run build

echo "==> migrations"
npm run db:migrate

echo "==> reload services"
if systemctl is-enabled demoreviewer-web &>/dev/null; then
  sudo systemctl restart demoreviewer-web demoreviewer-worker
  sudo systemctl --no-pager --full status demoreviewer-web demoreviewer-worker || true
else
  echo "Services systemd pas encore installés — suis deploy/PROD.md §8"
fi

echo "OK — déploiement terminé."
