#!/usr/bin/env bash
# Build SPA for LAN testing and install nginx config on port 8888.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LAN_IP="${LAN_IP:-$(hostname -I | awk '{print $1}')}"
MOBILE_PORT="${MOBILE_PORT:-8888}"
MOBILE_URL="http://${LAN_IP}:${MOBILE_PORT}"

echo "==> Supermarket ERP — mobile nginx setup"
echo "    LAN IP:  ${LAN_IP}"
echo "    URL:     ${MOBILE_URL}"
echo

if ! command -v nginx >/dev/null; then
  echo "nginx is not installed. Run: sudo apt install nginx"
  exit 1
fi

if ! ss -tln | grep -q ':8000'; then
  echo "WARN: nothing listening on :8000 — start ERPNext first (bench start)"
fi

echo "==> Building SPA for mobile origin ${MOBILE_URL}"
cd "$ROOT"
VITE_ERPNEXT_URL="$MOBILE_URL" \
VITE_ERP_API_BASE="$MOBILE_URL" \
npm run build

echo "==> Installing nginx configs (sudo required)"
sudo mkdir -p /home/youssef/frappe-bench/config
sudo cp "$ROOT/deploy/nginx/frappe-bench-minimal.conf" /home/youssef/frappe-bench/config/nginx.conf
sudo cp "$ROOT/deploy/nginx/supermarket-erp-mobile.conf" /etc/nginx/conf.d/supermarket-erp-mobile.conf
sudo sed -i "s|/home/youssef/supermarket-erp|${ROOT}|g" /etc/nginx/conf.d/supermarket-erp-mobile.conf

echo "==> Testing nginx config"
sudo nginx -t

echo "==> Starting nginx"
sudo systemctl enable nginx
sudo systemctl restart nginx

if command -v ufw >/dev/null && sudo ufw status 2>/dev/null | grep -q 'Status: active'; then
  echo "==> Opening firewall port ${MOBILE_PORT}"
  sudo ufw allow "${MOBILE_PORT}/tcp" || true
fi

echo
echo "Done. On your phone (same Wi‑Fi):"
echo "  ${MOBILE_URL}"
echo
echo "ERPNext site: supermarket.local (proxied via /api on the same URL)"
