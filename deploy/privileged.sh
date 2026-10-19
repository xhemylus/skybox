#!/usr/bin/env bash
# Actions root-only (appelées via sudo depuis deploy.sh).
# Usage: sudo bash deploy/privileged.sh <cmd>
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

cmd="${1:-}"
case "$cmd" in
  sync-units)
    cp -f deploy/demoreviewer-infra.service /etc/systemd/system/
    cp -f deploy/demoreviewer-web.service /etc/systemd/system/
    cp -f deploy/demoreviewer-worker.service /etc/systemd/system/
    systemctl daemon-reload
    ;;
  restart)
    systemctl restart demoreviewer-web demoreviewer-worker
    ;;
  status)
    systemctl --no-pager --full status demoreviewer-web demoreviewer-worker || true
    ;;
  *)
    echo "Usage: $0 {sync-units|restart|status}"
    exit 1
    ;;
esac
