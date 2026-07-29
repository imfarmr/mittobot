# ggboi Deployment Guide

**Architecture:** The bot and its dashboard run as a single Node.js process on one port (`3432` by default). The Express API in `src/api/server.js` serves the built `dashboard-v2` SPA from `dashboard-v2/dist/` as static files, so there is no separate dashboard server to deploy unless you want to split them later (e.g. Vercel).

```
┌─────────────────────────────────────────────┐
│  Single Node.js process (index.js)          │
│  ┌───────────────┐  ┌──────────────────┐   │
│  │  Express API  │  │ dashboard-v2 SPA │   │
│  │  /api/*       │  │  /* (fallback)   │   │
│  └───────────────  └──────────────────┘   │
│              listens on :3432               │
└─────────────────────────────────────────────┘
                     │
              reverse proxy (HTTPS)
                     │
                internet
```

## 1. Build the Dashboard

The dashboard lives in `dashboard-v2/` and is built into `dashboard-v2/dist/`. The bot serves that folder automatically.

```bash
# From the repo root
npm run build

# Or manually:
cd dashboard-v2
npm install
npm run build
```

The root `package.json` script does exactly this:

```json
"build": "npm run build:dashboard"
"build:dashboard": "cd dashboard-v2 && npm ci && npm run build"
```

> **Note for older checkouts:** There used to be a `dashboard/` directory (v1). It has been replaced by `dashboard-v2/`. Make sure any scripts or CI/CD you have now point to `dashboard-v2`.

---

## 2. Deploy the Bot

### Option A: Docker (Recommended)

```bash
# 1. Clone or copy the project to your VPS
git clone <your-repo> /opt/ggboi
cd /opt/ggboi

# 2. Create .env from example and fill in your secrets
cp .env.example .env
nano .env

# 3. Build and start with docker compose
docker compose -f docker-compose.prod.yml build bot
docker compose -f docker-compose.prod.yml up -d

# 4. Check logs
docker compose -f docker-compose.prod.yml logs -f bot
```

The bot API + dashboard UI both listen on the single port you set in `.env` (default `3432`). You need a reverse proxy (Caddy or nginx) to expose it publicly with HTTPS.

### Discord Intents

Before the bot can function, enable these Gateway Intents in the [Discord Developer Portal](https://discord.com/developers/applications) under **Bot > Privileged Gateway Intents**:

- **Server Members Intent** — for autoroles, welcome/leave messages, role tracking
- **Message Content Intent** — for reading message content (commands, automod, AI)
- **Presence Intent** — for presence data in userinfo commands

### Option B: PM2 (Direct Node.js)

```bash
# 1. Install Node.js 22+ and PM2
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt install -y nodejs
sudo npm install -g pm2

# 2. Clone the project
git clone <your-repo> /opt/ggboi
cd /opt/ggboi

# 3. Install dependencies
npm install --production

# 4. Create .env
cp .env.example .env
nano .env

# 5. Build the dashboard
cd dashboard-v2
npm install
npm run build
cd ..

# 6. Start with PM2
pm2 start ecosystem.config.cjs
pm2 save
sudo pm2 startup   # auto-start on boot

# 7. Check status
pm2 status
pm2 logs ggboi-bot
```

### Option C: systemd (No PM2)

```bash
# 1. Clone the project
sudo git clone <your-repo> /opt/ggboi
cd /opt/ggboi
sudo npm install --production

# 2. Build the dashboard
cd dashboard-v2
npm install
npm run build
cd ..

# 3. Create a non-root user
sudo useradd -r -s /bin/false ggboi-bot
sudo mkdir -p logs
sudo chown -R ggboi-bot:ggboi-bot /opt/ggboi

# 4. Create .env
sudo -u ggboi-bot cp .env.example .env
sudo -u ggboi-bot nano .env

# 5. Install the systemd service
sudo cp scripts/ggboi-bot.service /etc/systemd/system/ggboi-bot.service
sudo systemctl daemon-reload
sudo systemctl enable ggboi-bot
sudo systemctl start ggboi-bot

# 6. Check status
sudo systemctl status ggboi-bot
sudo journalctl -u ggboi-bot -f
```

---

## 3. Set Up HTTPS (Reverse Proxy)

The bot listens on `0.0.0.0:3432` (or whatever you set for `PORT`). You must put it behind a reverse proxy for HTTPS.

### Option A: Caddy (Simplest — auto HTTPS)

```bash
# Install Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy

# Create Caddyfile
sudo tee /etc/caddy/Caddyfile << 'EOF'
bot.yourdomain.com {
    reverse_proxy 0.0.0.0:3432
    log {
        output file /var/log/caddy/ggboi-bot.log
    }
}
EOF

# Start Caddy
sudo systemctl enable caddy
sudo systemctl restart caddy
```

### Option B: nginx + Let's Encrypt

```bash
# Install nginx and certbot
sudo apt install -y nginx certbot python3-certbot-nginx

# Create nginx config
sudo tee /etc/nginx/sites-available/ggboi-bot << 'EOF'
server {
    listen 80;
    server_name bot.yourdomain.com;

    location / {
        proxy_pass http://0.0.0.0:3432;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/ggboi-bot /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Get HTTPS certificate
sudo certbot --nginx -d bot.yourdomain.com
```

---

## 4. Environment Variables

See `.env.example` for the full list. Critical values for production:

```bash
# Required
BOT_TOKEN=your_discord_bot_token

# Auth — pick one or both:
DASHBOARD_PASSWORD=a_very_strong_password_here
# OR
DISCORD_CLIENT_ID=your_discord_app_id
DISCORD_CLIENT_SECRET=your_discord_app_secret
DISCORD_REDIRECT_URI=https://bot.yourdomain.com/api/auth/discord/callback

# Required in production
DASHBOARD_JWT_SECRET=random_64_char_hex_secret

# Port — single port for both API and UI
PORT=3432

# Optional: only needed if you split the dashboard out to Vercel
# DASHBOARD_ORIGIN=https://ggboi-dash.vercel.app
```

---

## 5. Optional: Vercel Split Deploy

If you want to host the dashboard separately on Vercel, you can, but the **default and recommended path is single-port serving**.

If you do split them:

1. Set `VITE_BOT_API_URL=https://bot.yourdomain.com` in the Vercel build environment.
2. Set `DASHBOARD_ORIGIN=https://your-vercel-app.vercel.app` in the bot's `.env` so CORS is locked down.
3. Keep `DISCORD_REDIRECT_URI` pointed at the bot's callback URL.
4. Make sure `dashboard-v2/vercel.json` has the SPA rewrite.

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

---

## 6. Security Checklist

- [ ] **HTTPS** — The bot API MUST be served over HTTPS in production
- [ ] **`DASHBOARD_JWT_SECRET`** — Set a long (~64 char), random, stable secret
- [ ] **`DASHBOARD_PASSWORD`** — Use a strong password (or use Discord OAuth)
- [ ] **Firewall** — Only ports 80/443 open to the internet; port 3432 should be private/local
- [ ] **API rate limit** — 300 requests/minute per IP on all `/api/*` endpoints (built-in)
- [ ] **Login rate limit** — 10 attempts/minute per IP on `/login` (built-in)
- [ ] **Regular updates** — Run `npm audit` and update dependencies periodically
- [ ] **SQLite backup** — Back up the `ggboi.sqlite` file regularly
- [ ] **Custom modules** — Only bot owners can write JS modules; keep credentials safe

---

## 7. Local Development

```bash
# Run bot + dashboard dev server together
npm run dev

# Bot only
node scripts/dev.js --no-dashboard
```

The dashboard dev server runs on `http://localhost:5174` and proxies `/api` and `/login` to the bot on `:3432`.

---

## 8. Updating

### Dashboard only
```bash
cd /opt/ggboi
npm run build
pm2 restart ggboi-bot   # or docker compose restart
```

### Bot + dashboard (Docker)
```bash
cd /opt/ggboi
git pull
docker compose -f docker-compose.prod.yml build bot
docker compose -f docker-compose.prod.yml up -d
```

### Bot + dashboard (PM2)
```bash
cd /opt/ggboi
git pull
npm install --production
cd dashboard-v2 && npm install && npm run build && cd ..
pm2 restart ggboi-bot
```
