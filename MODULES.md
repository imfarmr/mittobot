# ggboi Custom Modules

> Owner-only, hot-reloadable JavaScript command modules for ggboi.
> Drop a `.js` file into the `modules/` directory (or create it through Discord / the dashboard) and the bot will load it as a command without restarting the process.

---

## Table of Contents

1. [Overview](#overview)
2. [Security Warnings](#security-warnings)
3. [File Storage & Naming](#file-storage--naming)
4. [Module Structure](#module-structure)
5. [The `ctx` Object](#the-ctx-object)
6. [Prefix vs Slash Commands](#prefix-vs-slash-commands)
7. [Built-in `modules` Command](#built-in-modules-command)
8. [Dashboard Modules Page](#dashboard-modules-page)
9. [HTTP API](#http-api)
10. [Examples](#examples)
11. [Troubleshooting](#troubleshooting)

---

## Overview

Custom modules let the bot owner add new commands at runtime by writing plain Node.js modules. They are loaded from the `modules/` folder at startup and can be created, reloaded, or deleted while the bot is running.

Key facts:

- **Owner-only**: creating, reloading, or deleting a module requires bot-owner privileges.
- **Hot-reloadable**: a module can be edited and reloaded without restarting the bot.
- **Same power as built-in commands**: a module has access to the full command context (`ctx`), including the Discord client, guild data, and utility helpers.
- **No persistence guarantees**: modules live as plain `.js` files in `modules/`. Back them up if they matter.

---

## Security Warnings

Custom modules execute arbitrary JavaScript in the same process as the bot. Treat them like server-side code:

- Only bot owners can create or modify modules.
- Keep dashboard credentials (`DASHBOARD_PASSWORD` / Discord OAuth) and the bot token secure.
- Never paste a module you do not understand; a module can read guild data, call the Discord API, and access the host filesystem with the bot's privileges.
- The bot validates module names to prevent path traversal (`../../`), but the code inside the module is still executed.
- Avoid `eval()` inside modules unless you fully control the input.

---

## File Storage & Naming

- Modules are stored as plain `.js` files in the project root `modules/` directory.
- The file name (without `.js`) becomes the module name and is used by the `loadModule` loader and the dashboard.
- Valid names match: `^[a-zA-Z0-9_-]{1,32}$`
  - Allowed characters: letters, numbers, underscores (`_`), hyphens (`-`).
  - No spaces, dots, slashes, or other special characters.
- Examples: `ping.js`, `my-cool-command.js`, `server_stats.js`.
- The exported `name` field can differ from the file name, but the file name is used for reload/delete and in the dashboard list.
- Keep names ≤ 32 characters. Some entry points accept longer names, but the loader itself enforces the 1–32 character limit, so longer names will be saved but fail to load.

---

## Module Structure

A module must export an object describing the command.

```js
module.exports = {
  name: "hello",
  description: "Greets the user",
  aliases: ["hi"],
  defaultPermission: "everyone",
  category: "dynamic",      // optional; defaults to the dynamic/modules group
  prefix: async (message, args, ctx) => {
    await message.reply("Hello from a custom module!");
  },
  slash: new (require("discord.js").SlashCommandBuilder)()
    .setName("hello")
    .setDescription("Greets the user"),
  execute: async (interaction, ctx) => {
    await interaction.reply("Hello from a custom module!");
  },
};
```

### Field reference

| Field | Type | Required? | Description |
| --- | --- | --- | --- |
| `name` | `string` | **Yes** | The command name. Used as the map key if different from the file name. |
| `description` | `string` | No | Shown in the `$help` output. |
| `prefix` | `async function(message, args, ctx)` | **Prefix commands** | Called when the command is invoked with the configured prefix. |
| `slash` | `SlashCommandBuilder` | **Slash commands** | Discord.js slash command builder. |
| `execute` | `async function(interaction, ctx)` | **Slash commands** | Called when the slash command is invoked. |
| `aliases` | `string[]` | No | Extra names that invoke the prefix command. |
| `defaultPermission` | `string` | No | Permission level for access checks: `everyone`, `booster`, `mod`, `admin`, `owner`. Defaults to `everyone`. |
| `defaultSettings` | `object` | No | Default settings bag for this command. Per-guild overrides are not currently exposed for dynamic modules, so these values act as immutable defaults. |
| `category` | `string` | No | Currently all dynamic modules are shown under the `dynamic` help category. |

- Provide `prefix` to make the command usable as a text/prefix command.
- Provide `slash` + `execute` to make the command usable as a slash command. See [Prefix vs Slash Commands](#prefix-vs-slash-commands) for the registration caveat.

---

## The `ctx` Object

Both prefix and slash handlers receive the same shared context object that the bot uses internally:

```js
{
  client,                // discord.js Client instance
  data,                 // in-memory data stores (afkUsers, stickies, etc.)
  utils,                // utility helpers (successEmbed, errorEmbed, isOwner, etc.)
  commandMap,           // Map of all loaded command definitions
  slashMap,             // Map of slash execute functions
  slashDefs,            // Array of registered slash command builders
  commandAliases,       // function(def, guildId) -> aliases
  resolvePrefixCommand, // function(input, guildId) -> { name, def, usedAlias }
  config,               // per-guild command config resolver
  features,             // feature toggles
  automod,              // automod module
  greet,                // greet module
  roles,                // roles module
  dangerzone,           // dangerzone module
  autoexec,             // autoexec module
  roletracker,          // roletracker module
  femboyify,            // femboyify module
  get voiceManager() { return voiceManager; }
}
```

Access these properties at runtime (e.g. `ctx.client`, `ctx.config`). The `voiceManager` property is exposed through a getter, so it is always the current voice session manager.

Common examples:

```js
// Reply with the bot's latency
prefix: async (message, args, ctx) => {
  const ping = ctx.client.ws.ping;
  await message.reply(`WebSocket ping: ${ping}ms`);
},

// Check another command
prefix: async (message, args, ctx) => {
  const resolved = ctx.resolvePrefixCommand(args[0], message.guild.id);
  await message.reply(resolved.def ? `Found: ${resolved.name}` : "Not found");
},
```

---

## Prefix vs Slash Commands

### Prefix commands

Prefix commands work immediately after the module is loaded because the router resolves them at runtime from the in-memory `commandMap`.

- Trigger: `$<name> ...` (or a configured alias).
- Handler signature: `async (message, args, ctx)`.
- `args` is an array of the space-split words after the command name.

### Slash commands

Slash commands require Discord to know the command definition before it can be invoked.

- The bot loads your `slash` builder into memory when the module is loaded.
- However, **Discord must be told about the new slash command** before users can see or use it.
- If your module defines `slash`, run the built-in `$reregister` command (owner-only) after loading the module to push the command definitions to Discord.
- Until you `$reregister`, only the prefix version (if any) will work.

Best practice: develop the prefix command first, then add `slash` + `execute` and run `$reregister` once.

---

## Built-in `modules` Command

The bot ships with an `$modules` command (owner-only) for quick management in Discord.

```text
$modules create <name>   # requires a JS code block in the same message
$modules delete <name>
$modules reload <name>
$modules list
```

### Create a module from Discord

Send `$modules create hello` followed by a JavaScript code block in the same message:

```js
module.exports = {
  name: 'hello',
  description: 'Say hello',
  prefix: async (message, args, ctx) => {
    await message.reply('Hello!');
  }
};
```

The bot writes the file, loads it, and replies with the command name.

---

## Dashboard Modules Page

In `System > Custom Modules` (or `/system/modules`):

- **List**: shows every file in `modules/`, whether it is currently loaded, and quick actions.
- **View**: opens the source code of the selected module.
- **Reload**: re-reads the file from disk and loads it into the command map.
- **Delete**: removes the file and unloads the command.
- **Create**: paste new code and the dashboard writes and loads the module.

> The dashboard modules page is owner-only; it uses the `/api/modules` endpoints.

---

## HTTP API

All endpoints are `Bearer <jwt>` authenticated and restricted to bot owners.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/modules` | List modules: `{ modules: [{ name, loaded }] }` |
| `GET` | `/api/modules/:name` | Get source code: `{ name, code, loaded }` |
| `POST` | `/api/modules` | Create/update: body `{ name, code }`. Writes to disk and loads. |
| `POST` | `/api/modules/:name/reload` | Reload a module from disk. |
| `DELETE` | `/api/modules/:name` | Delete a module and unload it. |

---

## Examples

### Simple reply

```js
module.exports = {
  name: "ping",
  description: "Replies with pong",
  prefix: async (message, args, ctx) => {
    const latency = Date.now() - message.createdTimestamp;
    await message.reply(`Pong! \`${latency}ms\``);
  },
};
```

### Echo command

```js
module.exports = {
  name: "echo",
  description: "Echoes the provided text",
  prefix: async (message, args, ctx) => {
    const text = args.join(" ") || "...";
    await message.reply({ content: text, allowedMentions: { parse: [] } });
  },
};
```

### Slash + prefix command (guild-only example)

```js
const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  name: "serverinfo",
  description: "Shows server information",
  defaultPermission: "everyone",
  prefix: async (message, args, ctx) => {
    const guild = message.guild;
    await message.reply(`${guild.name} has ${guild.memberCount} members.`);
  },
  slash: new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Shows server information"),
  execute: async (interaction, ctx) => {
    const guild = interaction.guild;
    await interaction.reply(`${guild.name} has ${guild.memberCount} members.`);
  },
};
```

After creating the above, run `$reregister` (owner-only) to register the slash command with Discord.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `Invalid module name` | Name contains spaces, dots, or special characters. | Use only `a-z`, `A-Z`, `0-9`, `_`, `-` (1–32 chars). |
| `Module loaded as null` | The file threw an error during `require`. | Check the bot console for the exact error, fix the syntax, then reload. |
| Module not responding | The module's `name` differs from the file name and you are invoking the wrong one. | Use the file name for reload/delete; the command trigger uses the exported `name`. |
| Slash command does not appear | New slash commands must be registered with Discord. | Run `$reregister` after creating/updating a module that defines `slash`. |
| Changes not reflected | `require` cache is not busted for the old module name. | Use `$modules reload <name>` or the dashboard **Reload** button. |
| Module disappeared after restart | The `.js` file was deleted or not persisted to disk. | Ensure the file is in `modules/` and included in backups. |

---

## See Also

- `src/commands/modules.js` — loader and Discord command implementation
- `src/api/server.js` — `/api/modules` endpoints
- `dashboard-v2/src/pages/views/system/ModulesView.tsx` — dashboard UI
- `DASHBOARD_SPEC.md` §5.6
- `BOT_SPEC.md` §5.9
