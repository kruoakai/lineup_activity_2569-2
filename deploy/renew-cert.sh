#!/usr/bin/env bash
# ขอ/ต่ออายุใบรับรอง Let's Encrypt แบบ webroot แล้วโหลด nginx ใหม่
#   renew-cert.sh issue <domain> [email]
#   renew-cert.sh renew
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"
MODE="${1:-renew}"
DOMAIN="${2:-$(grep ^DOMAIN= .env | cut -d= -f2)}"
EMAIL="${3:-}"

CERTBOT=(docker run --rm
  -v "$DIR/letsencrypt:/etc/letsencrypt"
  -v "$DIR/certbot-www:/var/www/certbot"
  certbot/certbot)

if [ "$MODE" = "issue" ]; then
  if [ -n "$EMAIL" ]; then REG=(--email "$EMAIL"); else REG=(--register-unsafely-without-email); fi
  "${CERTBOT[@]}" certonly --webroot -w /var/www/certbot -d "$DOMAIN" "${REG[@]}" --agree-tos --non-interactive --keep-until-expiring
else
  "${CERTBOT[@]}" renew --webroot -w /var/www/certbot --quiet
fi

LIVE="$DIR/letsencrypt/live/$DOMAIN"
if [ -f "$LIVE/fullchain.pem" ]; then
  cp -L "$LIVE/fullchain.pem" "$DIR/certs/fullchain.pem"
  cp -L "$LIVE/privkey.pem" "$DIR/certs/privkey.pem"
  chmod 600 "$DIR/certs/privkey.pem"
  docker compose exec -T nginx nginx -s reload
fi
