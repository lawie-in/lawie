#!/usr/bin/env bash
# Lawie production box — first-time provisioning (Ubuntu 22.04, t3.medium).
# Run ONCE as root from the Session Manager shell:   sudo bash /tmp/setup.sh
# Idempotent: safe to re-run. Installs Node 20, yarn, pm2, nginx, certbot, redis,
# Chromium libs + Devanagari fonts for PDF rendering, 2 GB swap, clones main.
# It does NOT create the env file and does NOT start the apps (next steps).
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
APP_USER=ubuntu; APP_DIR=/home/ubuntu/lawie; REPO=git@github.com:lawie-in/lawie.git   # private repo: read-only deploy key (step 0 below)

echo "== 1. swap (2 GB) =="
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "== 2. base packages =="
apt-get update -y
apt-get install -y --no-install-recommends ca-certificates curl gnupg git build-essential nginx redis-server unzip \
  fonts-noto-core fonts-noto-ui-core fonts-lohit-deva fonts-liberation \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
  libxfixes3 libxrandr2 libgbm1 libasound2 libpango-1.0-0 libcairo2 libgtk-3-0 libxshmfence1

echo "== 3. node 20 + yarn + pm2 =="
if ! command -v node >/dev/null || [[ "$(node -v)" != v20* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs
fi
npm install -g yarn@1 pm2 >/dev/null
node -v; yarn -v; pm2 -v

echo "== 4. redis: localhost only =="
sed -i 's/^#\? *bind .*/bind 127.0.0.1 ::1/' /etc/redis/redis.conf
sed -i 's/^#\? *appendonly .*/appendonly yes/' /etc/redis/redis.conf
systemctl enable --now redis-server && systemctl restart redis-server
redis-cli ping

echo "== 5. certbot =="
snap install core >/dev/null 2>&1 || true; snap refresh core >/dev/null 2>&1 || true
snap install --classic certbot >/dev/null 2>&1 || true
ln -sf /snap/bin/certbot /usr/bin/certbot

echo "== 0. read-only deploy key for the private repo =="
sudo -u $APP_USER mkdir -p /home/$APP_USER/.ssh && chmod 700 /home/$APP_USER/.ssh
if [[ ! -f /home/$APP_USER/.ssh/lawie_deploy ]]; then
  sudo -u $APP_USER ssh-keygen -q -t ed25519 -N "" -C "lawie-prod deploy key" -f /home/$APP_USER/.ssh/lawie_deploy
fi
sudo -u $APP_USER bash -c 'cat > ~/.ssh/config <<CFG
Host github.com
  IdentityFile ~/.ssh/lawie_deploy
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
CFG
chmod 600 ~/.ssh/config'
echo "----- PUBLIC deploy key (safe to paste into GitHub -> repo Settings -> Deploy keys, read-only) -----"
cat /home/$APP_USER/.ssh/lawie_deploy.pub
echo "-----------------------------------------------------------------------------------------------"
if ! sudo -u $APP_USER ssh -T git@github.com 2>&1 | grep -q "successfully authenticated"; then
  echo "Deploy key not yet added on GitHub. Add the PUBLIC key above (read-only), then re-run this script."; exit 2
fi

echo "== 6. clone main as $APP_USER =="
if [[ ! -d $APP_DIR/.git ]]; then
  sudo -u $APP_USER git clone --branch main --depth 50 "$REPO" "$APP_DIR"
else
  sudo -u $APP_USER git -C "$APP_DIR" fetch origin main && sudo -u $APP_USER git -C "$APP_DIR" checkout -q main && sudo -u $APP_USER git -C "$APP_DIR" pull -q origin main
fi
sudo -u $APP_USER git -C "$APP_DIR" log --oneline -1

echo "== 7. nginx: lawie.in -> web :3000, api.lawie.in -> gateway :4000 (HTTP for now; certbot adds TLS) =="
cat > /etc/nginx/sites-available/lawie <<'NGX'
map $http_upgrade $connection_upgrade { default upgrade; '' close; }
server {
  listen 80; server_name lawie.in www.lawie.in;
  client_max_body_size 25m;
  location / { proxy_pass http://127.0.0.1:3000; proxy_http_version 1.1;
    proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection $connection_upgrade; }
}
server {
  listen 80; server_name api.lawie.in;
  client_max_body_size 25m;
  location / { proxy_pass http://127.0.0.1:4000; proxy_http_version 1.1;
    proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off; proxy_cache off; proxy_read_timeout 600s; proxy_send_timeout 600s;   # SSE drafts
    proxy_set_header Connection ''; chunked_transfer_encoding off; }
}
NGX
ln -sf /etc/nginx/sites-available/lawie /etc/nginx/sites-enabled/lawie
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl enable --now nginx && systemctl reload nginx

echo "== 8. pm2 starts on boot for $APP_USER =="
env PATH=$PATH:/usr/bin pm2 startup systemd -u $APP_USER --hp /home/$APP_USER >/dev/null || true

echo "== DONE. Next: as ubuntu, create the env file, then deploy. =="
echo "Check: curl -sI http://127.0.0.1 | head -1 ; free -h ; df -h /"
