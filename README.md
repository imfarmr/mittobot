# ggboi

A self-hosted Discord bot with a built-in web dashboard.

ggboi runs as a **single Node.js process**: the Discord bot and its React dashboard are served from the same port. It is built for Pterodactyl-style hosting where only one public port is available.

---

## Features

- **Single-port deployment** — API and dashboard both run on `PORT` (default `3432`).
- **Guild-scoped dashboard** — manage each server from a dedicated URL like `/g/:guildId/overview`.
- **Modular command system** — built-in commands plus owner-only hot-reloadable custom modules.
- **Moderation** — cases, mod log, user notes, automod v2 (heat, anti-raid, test mode), dangerzone, auto rules.
- **Community** — greet/leave messages, roles, reaction/button roles, levels/XP, tickets, giveaways, starboard, suggestions, birthdays, invites, tags, schedule, backups.
- **Engagement** — economy, shop, games, tags, music.
- **AI engine** — multi-provider chat, memory, prompts, analytics, tool permissions.
- **Owner system tools** — custom modules, data stores, experiments, global settings.

---

## Quick Start

```bash
# 1. Install dependencies
npm install
cd dashboard-v2 && npm install && cd ..

# 2. Configure the bot
cp .env.example .env
# Edit .env and set BOT_TOKEN, OWNER_IDS, and either DASHBOARD_PASSWORD or Discord OAuth.

# 3. Build the dashboard (the bot serves it as static files)
npm run build

# 4. Start the bot
npm start
```

Open `http://localhost:3432` (or your configured `PORT`) in the browser.

---

## Documentation

- [`BOT_SPEC.md`](./BOT_SPEC.md) — bot architecture, commands, database, API, and implementation phases.
- [`DASHBOARD_SPEC.md`](./DASHBOARD_SPEC.md) — dashboard-v2 design, routes, and data layer.
- [`MODULES.md`](./MODULES.md) — custom dynamic modules contract and examples.
- [`scripts/deploy.md`](./scripts/deploy.md) — deployment guide for Docker, PM2, systemd, and reverse proxies.

---

## Project Layout

```
.
├── index.js                 # Bot entry point: Discord client, command loader, API startup
├── src/                     # Bot source
│   ├── api/server.js        # Express API
│   ├── commands/            # Command definitions
│   ├── ai/                  # AI providers, memory, tools
│   ├── db.js                # SQLite data layer
│   └── ...
├── dashboard-v2/            # React + Vite + TypeScript dashboard
│   ├── src/
│   └── package.json
├── modules/                 # Hot-reloadable custom modules (owner-only)
├── scripts/                 # Dev/build/deployment helpers
├── BOT_SPEC.md
├── DASHBOARD_SPEC.md
├── MODULES.md
└── README.md
```

---

## Development

```bash
# Run the bot + Vite dev server (concurrently)
npm run dev

# Or run just the bot
npm start

# Or run just the dashboard dev server
cd dashboard-v2 && npm run dev
```

---

## Deployment

See [`scripts/deploy.md`](./scripts/deploy.md) for Docker, PM2, systemd, Caddy/nginx, and optional Vercel split-deploy instructions.

---

## License

This project is private and self-hosted; there is no public license.
