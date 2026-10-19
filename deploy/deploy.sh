#!/usr/bin/env bash
# Déploiement prod sur le VPS.
# Usage : cd /opt/demoreviewer && bash deploy/deploy.sh
# Env optionnels :
#   DEPLOY_BRANCH=main   (défaut: branche courante / main)
#   SKIP_PULL=1          (ne pas git pull — utile pour debug local)
#   HEALTH_URL=http://127.0.0.1:3000/api/health
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOCK_FILE="${LOCK_FILE:-/tmp/demoreviewer-deploy.lock}"
LOG_DIR="${LOG_DIR:-$ROOT/logs}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"
HEALTH_RETRIES="${HEALTH_RETRIES:-30}"
HEALTH_SLEEP="${HEALTH_SLEEP:-2}"

mkdir -p "$LOG_DIR"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Un autre déploiement est déjà en cours (lock: $LOCK_FILE)."
  exit 1
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_FILE="$LOG_DIR/deploy-$STAMP.log"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "==> deploy start $STAMP"
echo "    root=$ROOT branch=$DEPLOY_BRANCH"

if [[ ! -f .env ]]; then
  echo "Manque .env — copie .env.example et remplis les valeurs prod."
  exit 1
fi

PREV_SHA="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
echo "    prev=$PREV_SHA"

if [[ "${SKIP_PULL:-0}" != "1" ]]; then
  echo "==> git fetch / pull --ff-only"
  git fetch --prune origin
  # Évite les déploiements si le working tree a été modifié à la main sur le VPS
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "Working tree sale sur le VPS. Annule (git status --porcelain non vide)."
    echo "Corrige avec: git stash -u  OU  git restore . && git clean -fd"
    exit 1
  fi
  git checkout "$DEPLOY_BRANCH"
  git pull --ff-only origin "$DEPLOY_BRANCH"
fi

NEW_SHA="$(git rev-parse HEAD)"
echo "    new=$NEW_SHA"
if [[ "$PREV_SHA" == "$NEW_SHA" && "${SKIP_PULL:-0}" != "1" ]]; then
  echo "==> déjà à jour ($NEW_SHA) — rebuild quand même pour unités/sync"
fi

PRIV="/usr/bin/bash $ROOT/deploy/privileged.sh"

echo "==> sync systemd units"
if [[ -d /etc/systemd/system ]]; then
  sudo $PRIV sync-units
fi

echo "==> npm ci"
npm ci

echo "==> build"
npm run build

echo "==> migrations"
npm run db:migrate

echo "==> restart services"
if systemctl is-enabled demoreviewer-web &>/dev/null; then
  sudo $PRIV restart
else
  echo "Services systemd pas encore installés — suis deploy/PROD.md §8"
  exit 1
fi

echo "==> healthcheck $HEALTH_URL"
ok=0
for i in $(seq 1 "$HEALTH_RETRIES"); do
  body="$(curl -fsS "$HEALTH_URL" 2>/dev/null || true)"
  if [[ "$body" == *'"ok":true'* ]] || [[ "$body" == *'"ok": true'* ]]; then
    ok=1
    echo "    healthy after ${i}x${HEALTH_SLEEP}s"
    break
  fi
  sleep "$HEALTH_SLEEP"
done

if [[ "$ok" != "1" ]]; then
  echo "HEALTHCHECK FAILED après redémarrage."
  echo "Rollback: git checkout $PREV_SHA && SKIP_PULL=1 bash deploy/deploy.sh"
  sudo $PRIV status || true
  exit 1
fi

sudo $PRIV status || true
echo "OK — déployé $NEW_SHA (log: $LOG_FILE)"
