const fs   = require("fs");
const path = require("path");
const { PermissionFlagsBits } = require("discord.js");
const { OWNER_IDS } = require("./utils");
const db = require("./db");

const CONFIG_FILE = path.join(__dirname, "..", "commandconfig.json");

// ─── Permission levels (ordered ladder; higher number = more privileged) ───
const PERM_LEVELS = {
  everyone: 0,
  booster:  1,
  mod:      2,
  admin:    3,
  owner:    4,
};
const PERM_LABELS = {
  everyone: "Everyone",
  booster:  "Server Booster",
  mod:      "Moderator (Manage Messages)",
  admin:    "Administrator",
  owner:    "Bot Owner",
};
const PERM_ORDER = Object.keys(PERM_LEVELS);

// Compute a member's effective level from their Discord permissions / roles.
function memberLevel(member, userId) {
  if (OWNER_IDS.has(userId)) return PERM_LEVELS.owner;
  if (!member) return PERM_LEVELS.everyone;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return PERM_LEVELS.admin;
  if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return PERM_LEVELS.mod;
  if (member.premiumSince) return PERM_LEVELS.booster;
  return PERM_LEVELS.everyone;
}

// ─── Store: per-guild, per-command overrides. Shape:
// { [guildId]: { [commandName]: { enabled, permission, allowedRoles[], allowedChannels[], blockedChannels[], cooldown, settings{} } } }
let store = {};

// Command names were historically split into fake actions (`warn`, `kick`,
// ...) and real actions (`realwarn`, `realkick`, ...). The public namespace is
// now unambiguous: fake commands use `fake<action>`, while real commands use
// the plain action name. Translate persisted rows while loading so existing
// guild-specific permissions, cooldowns, aliases, and settings survive.
const LEGACY_COMMAND_NAMES = {
  // Before v2, these plain names referred to fake moderation commands.
  warn: "fakewarn", kick: "fakekick", ban: "fakeban", mute: "fakemute",
  unmute: "fakeunmute", unban: "fakeunban", softban: "fakesoftban",
  tempban: "faketempban", timeout: "faketimeout", untimeout: "fakeuntimeout",
  lock: "fakelock", unlock: "fakeunlock", slowmode: "fakeslowmode",
  // The old real namespace used a `real` prefix.
  realwarn: "warn", realkick: "kick", realban: "ban",
  realsoftban: "softban", realtempban: "tempban", realmute: "mute",
  realunmute: "unmute", realunban: "unban", realwarnlist: "warnlist",
  realwarnclear: "warnclear", reallock: "lock", realunlock: "unlock",
  realslowmode: "slowmode",
};
const COMMAND_NAMESPACE_MARKER = "command_namespace_v2";
const LEGACY_FAKE_COMMANDS = new Set([
  "warn", "kick", "ban", "mute", "unmute", "unban", "softban", "tempban",
  "timeout", "untimeout", "lock", "unlock", "slowmode",
]);
const LEGACY_REAL_COMMANDS = new Set([
  "realwarn", "realkick", "realban", "realsoftban", "realtempban", "realmute",
  "realunmute", "realunban", "realwarnlist", "realwarnclear", "reallock",
  "realunlock", "realslowmode",
]);

function rowConfig(row) {
  return {
    enabled: row.enabled === 1,
    permission: row.permission,
    allowedRoles: db.safeJsonParse(row.allowed_roles, []),
    allowedChannels: db.safeJsonParse(row.allowed_channels, []),
    blockedChannels: db.safeJsonParse(row.blocked_channels, []),
    cooldown: row.cooldown,
    settings: db.safeJsonParse(row.settings, {}),
  };
}

async function load() {
  try {
    store = {};
    const globalSettings = await db.getGlobalSettings();
    const marker = globalSettings[COMMAND_NAMESPACE_MARKER];
    const namespaceMigrated = marker === true || (marker && marker.version >= 2);
    const rows = await db.getAllCommandConfigs();

    if (namespaceMigrated) {
      for (const row of rows) {
        const g = (store[row.guild_id] ??= {});
        g[row.command] = rowConfig(row);
      }
      return;
    }

    // Before the marker exists, resolve each target as a group instead of
    // relying on SQLite row order. This handles an interrupted/partial first
    // migration deterministically:
    //   - legacy real (`realwarn`) wins for the real target (`warn`)
    //   - an already-created new fake row (`fakewarn`) wins over old `warn`
    //   - old plain `warn` is otherwise treated as fake and becomes `fakewarn`
    const groups = new Map();
    const addCandidate = (row, target, priority) => {
      const key = `${row.guild_id}:${target}`;
      const candidates = groups.get(key) || [];
      candidates.push({ row, target, priority });
      groups.set(key, candidates);
    };

    for (const row of rows) {
      const name = row.command;
      if (LEGACY_REAL_COMMANDS.has(name)) {
        addCandidate(row, LEGACY_COMMAND_NAMES[name], 3);
      } else if (LEGACY_FAKE_COMMANDS.has(name)) {
        addCandidate(row, LEGACY_COMMAND_NAMES[name], 1);
      } else if (name.startsWith("fake")) {
        // A new fake name may already exist if a previous migration wrote it
        // before crashing. Keep it ahead of the old plain fake row.
        addCandidate(row, name, 2);
      } else {
        // Unrelated commands and a possible already-created real plain name.
        addCandidate(row, name, 2);
      }
    }

    const migrationPlans = [];
    const rowsToDelete = new Map();
    for (const candidates of groups.values()) {
      candidates.sort((a, b) => b.priority - a.priority);
      const winner = candidates[0];
      migrationPlans.push({
        guildId: winner.row.guild_id,
        target: winner.target,
        cfg: rowConfig(winner.row),
      });

      // Delete obsolete source keys before writing migrated targets. This is
      // essential when an old fake `warn` row and old real `realwarn` row both
      // exist: both may ultimately touch the `warn` key, so deleting afterward
      // could remove the newly-written real configuration.
      const obsolete = rowsToDelete.get(winner.row.guild_id) || new Set();
      for (const candidate of candidates) {
        if (candidate.row.command !== winner.row.command) obsolete.add(candidate.row.command);
      }
      if (winner.row.command !== winner.target) obsolete.add(winner.row.command);
      rowsToDelete.set(winner.row.guild_id, obsolete);
    }

    const migratedAt = Date.now();
    await db.withTransaction(() => {
      const deleteStmt = db.db.prepare("DELETE FROM command_config WHERE guild_id = ? AND command = ?");
      const setStmt = db.db.prepare(`
        INSERT INTO command_config
          (guild_id, command, enabled, permission, allowed_roles, allowed_channels, blocked_channels, cooldown, settings)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(guild_id, command) DO UPDATE SET
          enabled = excluded.enabled,
          permission = excluded.permission,
          allowed_roles = excluded.allowed_roles,
          allowed_channels = excluded.allowed_channels,
          blocked_channels = excluded.blocked_channels,
          cooldown = excluded.cooldown,
          settings = excluded.settings
      `);
      const markerStmt = db.db.prepare(`
        INSERT INTO global_settings (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `);

      for (const [guildId, commands] of rowsToDelete) {
        for (const command of commands) deleteStmt.run(guildId, command);
      }
      for (const plan of migrationPlans) {
        const g = (store[plan.guildId] ??= {});
        g[plan.target] = plan.cfg;
        setStmt.run(
          plan.guildId,
          plan.target,
          plan.cfg.enabled ? 1 : 0,
          plan.cfg.permission,
          JSON.stringify(plan.cfg.allowedRoles || []),
          JSON.stringify(plan.cfg.allowedChannels || []),
          JSON.stringify(plan.cfg.blockedChannels || []),
          plan.cfg.cooldown || 0,
          JSON.stringify(plan.cfg.settings || {}),
        );
      }
      markerStmt.run(COMMAND_NAMESPACE_MARKER, JSON.stringify({ version: 2, migratedAt }));
    });
  } catch (e) {
    console.error("Failed to load command config from db:", e);
    store = {};
  }
}
function save() {}

// Raw stored override for a command (may be undefined / partial).
function getRaw(guildId, command) {
  return store[guildId]?.[command] || {};
}

// Merge a command's compiled defaults with the stored override.
// `def` is the command definition (provides defaultPermission, category, etc.).
function resolve(guildId, command, def = {}) {
  const raw = getRaw(guildId, command);
  return {
    enabled:         raw.enabled !== undefined ? raw.enabled : true,
    permission:      raw.permission || def.defaultPermission || "everyone",
    allowedRoles:    raw.allowedRoles || [],
    allowedChannels: raw.allowedChannels || [],
    blockedChannels: raw.blockedChannels || [],
    cooldown:        raw.cooldown || 0, // seconds, per-user
    settings:        { ...(def.defaultSettings || {}), ...(raw.settings || {}) },
  };
}

function set(guildId, command, patch) {
  (store[guildId] ??= {})[command] ??= {};
  Object.assign(store[guildId][command], patch);
  const cfg = resolve(guildId, command);
  db.setCommandConfig(guildId, command, cfg).catch(e => console.error("persist command config:", e.message));
}

// Merge into a command's `settings` bag without clobbering siblings.
function setSetting(guildId, command, key, value) {
  (store[guildId] ??= {})[command] ??= {};
  (store[guildId][command].settings ??= {})[key] = value;
  const cfg = resolve(guildId, command);
  db.setCommandConfig(guildId, command, cfg).catch(e => console.error("persist command config:", e.message));
}

function reset(guildId, command) {
  if (store[guildId]) {
    delete store[guildId][command];
    db.deleteCommandConfig(guildId, command).catch(e => console.error("reset command config:", e.message));
  }
}

// ─── Cooldown tracking (in-memory; resets on restart) ───
// key: `${guildId}:${command}:${userId}` -> timestamp(ms) when cooldown expires
const cooldowns = new Map();
const COOLDOWNS_MAX_SIZE = 5000; // Maximum number of cooldown entries to track

// Evict expired entries every 15 minutes to prevent unbounded growth
setInterval(() => {
  const now = Date.now();
  for (const [key, until] of cooldowns) {
    if (now >= until) cooldowns.delete(key);
  }
  // Size-based eviction: if we exceed max size, remove oldest entries
  if (cooldowns.size > COOLDOWNS_MAX_SIZE) {
    const entries = Array.from(cooldowns.entries()).sort((a, b) => a[1] - b[1]);
    const toRemove = entries.slice(0, cooldowns.size - COOLDOWNS_MAX_SIZE);
    for (const [key] of toRemove) cooldowns.delete(key);
  }
}, 15 * 60_000).unref();

// Returns remaining seconds if on cooldown, or 0 if clear (and arms the cooldown).
function checkCooldown(guildId, command, userId, seconds, now) {
  if (!seconds) return 0;
  const key = `${guildId}:${command}:${userId}`;
  const until = cooldowns.get(key) || 0;
  if (now < until) return Math.ceil((until - now) / 1000);
  cooldowns.set(key, now + seconds * 1000);
  return 0;
}

// ─── Central access decision. Returns { ok: true } or { ok: false, reason }.
// `member` may be null (e.g. uncached); level then resolves to everyone.
function evaluate({ guildId, command, def, member, userId, channelId, now }) {
  const cfg = resolve(guildId, command, def);

  if (!cfg.enabled) return { ok: false, reason: "disabled", cfg };

  // Channel gating
  if (cfg.blockedChannels.length && cfg.blockedChannels.includes(channelId))
    return { ok: false, reason: "channel", cfg };
  if (cfg.allowedChannels.length && !cfg.allowedChannels.includes(channelId))
    return { ok: false, reason: "channel", cfg };

  // Permission gating: either meet the level, or hold one of the allowed roles.
  const needed = PERM_LEVELS[cfg.permission] ?? 0;
  const have   = memberLevel(member, userId);
  const roleOk = cfg.allowedRoles.length && member?.roles?.cache?.some(r => cfg.allowedRoles.includes(r.id));
  if (have < needed && !roleOk) return { ok: false, reason: "permission", cfg };

  // Cooldown (owners bypass)
  if (have < PERM_LEVELS.owner) {
    const remain = checkCooldown(guildId, command, userId, cfg.cooldown, now);
    if (remain > 0) return { ok: false, reason: "cooldown", remain, cfg };
  }

  return { ok: true, cfg };
}

module.exports = {
  load, save,
  getRaw, resolve, set, setSetting, reset,
  evaluate, memberLevel,
  PERM_LEVELS, PERM_LABELS, PERM_ORDER,
  CONFIG_FILE,
};
