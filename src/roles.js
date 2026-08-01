const fs   = require("fs");
const path = require("path");
const safe = require("./safe");
const db = require("./db");
const { PermissionFlagsBits } = require("discord.js");

const ROLES_FILE = path.join(__dirname, "..", "roles.json");

// ─── Per-guild config. Shape:
// { [guildId]: {
//     autoroles: [roleId, ...],                       // assigned on join
//     reactionRoles: { [messageId]: { [emojiKey]: roleId } },
//   } }
let store = {};

async function load() {
  try {
    store = {};
    const rows = await db.getAllRolesConfigs();
    for (const row of rows) {
      store[row.guild_id] = {
        autoroles: db.safeJsonParse(row.autoroles, []),
        reactionRoles: db.safeJsonParse(row.reaction_roles, {}),
      };
    }
    // Load panels as part of the normal roles bootstrap so published panels
    // work immediately after a restart, including before the dashboard opens.
    await loadPanels();
  } catch (e) {
    console.error("Failed to load roles config from db:", e);
    store = {};
    panelCache = new Map();
  }
}
function save() {}

function getGuild(guildId) {
  const g = store[guildId] || {};
  return { autoroles: g.autoroles || [], reactionRoles: g.reactionRoles || {} };
}

// ─── Autoroles ───
function getAutoroles(guildId) { return getGuild(guildId).autoroles; }
function setAutoroles(guildId, roleIds) {
  const cleanIds = roleIds.filter(x => /^\d{17,20}$/.test(x));
  (store[guildId] ??= {}).autoroles = cleanIds;

  const g = getGuild(guildId);
  db.setRolesConfig(guildId, cleanIds, g.reactionRoles).catch(e => console.error("persist roles:", e.message));
  return getAutoroles(guildId);
}

// ─── Reaction roles ───
// Emoji key: unicode char for standard emoji, or the custom emoji id.
function emojiKey(emoji) { return emoji.id || emoji.name; }

function getReactionRoles(guildId) { return getGuild(guildId).reactionRoles; }

function addReactionRole(guildId, messageId, key, roleId) {
  const g = (store[guildId] ??= {});
  (g.reactionRoles ??= {});
  (g.reactionRoles[messageId] ??= {});
  g.reactionRoles[messageId][key] = roleId;

  db.setRolesConfig(guildId, g.autoroles || [], g.reactionRoles).catch(e => console.error("persist roles:", e.message));
}

function removeReactionRole(guildId, messageId, key) {
  const map = store[guildId]?.reactionRoles?.[messageId];
  if (!map) return false;
  delete map[key];
  if (Object.keys(map).length === 0) delete store[guildId].reactionRoles[messageId];

  const g = getGuild(guildId);
  db.setRolesConfig(guildId, g.autoroles || [], g.reactionRoles).catch(e => console.error("persist roles:", e.message));
  return true;
}

function roleForReaction(guildId, messageId, emoji) {
  return store[guildId]?.reactionRoles?.[messageId]?.[emojiKey(emoji)] || null;
}

// ─── Event handlers ───
async function onMemberAdd(member) {
  const roleIds = getAutoroles(member.guild.id);
  if (!roleIds.length) return;
  const me = member.guild.members.me;
  for (const id of roleIds) {
    const role = member.guild.roles.cache.get(id);
    if (role && role.position < me.roles.highest.position) {
      await safe.addRole(member, role, "Autorole on join", "autorole on join");
    }
  }
}

// reaction: a (possibly partial) MessageReaction; added: bool
async function onReaction(reaction, user, added) {
  if (user.bot) return;
  if (reaction.partial) { if (!await safe.orNull(reaction.fetch(), "fetch partial reaction for reaction role")) return; }
  const msg = reaction.message;
  const guild = msg.guild;
  if (!guild) return;
  const roleId = roleForReaction(guild.id, msg.id, reaction.emoji);
  if (!roleId) return;
  const member = await safe.orNull(guild.members.fetch(user.id), "fetch member for reaction role");
  if (!member) return;
  const role = guild.roles.cache.get(roleId);
  if (!role || role.position >= guild.members.me.roles.highest.position) return;
  if (added) await safe.addRole(member, role, "Reaction role", "reaction role add");
  else       await safe.removeRole(member, role, "Reaction role", "reaction role remove");
}

// ─── Role Panels ───────────────────────────────────────────────────────
// Panels are stored in SQLite (role_panels) and loaded into a per-guild cache.
// Each panel has a type ('button' or 'select'), a list of options (label, emoji, roleId),
// and an optional message_id if it has been published to a channel.
let panelCache = new Map(); // guildId → panel[]

async function loadPanels() {
  try {
    const rows = await db.getAllRolePanels();
    panelCache = new Map();
    for (const row of rows) {
      const panels = panelCache.get(row.guild_id) || [];
      panels.push({
        id: row.id,
        guildId: row.guild_id,
        name: row.name,
        description: row.description,
        channelId: row.channel_id,
        messageId: row.message_id,
        panelType: row.panel_type,
        embedJson: db.safeJsonParse(row.embed_json, null),
        options: db.safeJsonParse(row.options, []),
        exclusive: row.exclusive === 1,
        requiredRole: row.required_role,
        enabled: row.enabled === 1,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
      panelCache.set(row.guild_id, panels);
    }
  } catch (e) {
    console.error("Failed to load role panels from db:", e);
    panelCache = new Map();
  }
}

function getPanels(guildId) {
  return panelCache.get(guildId) || [];
}

function getPanel(id) {
  for (const panels of panelCache.values()) {
    const p = panels.find(p => p.id === id);
    if (p) return p;
  }
  return null;
}

function getPanelByMessageId(messageId) {
  for (const panels of panelCache.values()) {
    const p = panels.find(p => p.messageId === messageId);
    if (p) return p;
  }
  return null;
}

async function createPanel(guildId, data) {
  const row = await db.createRolePanel(guildId, data);
  if (!row) return null;
  const panel = {
    id: row.id,
    guildId: row.guild_id,
    name: row.name,
    description: row.description,
    channelId: row.channel_id,
    messageId: row.message_id,
    panelType: row.panel_type,
    embedJson: db.safeJsonParse(row.embed_json, null),
    options: db.safeJsonParse(row.options, []),
    exclusive: row.exclusive === 1,
    requiredRole: row.required_role,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  const panels = panelCache.get(guildId) || [];
  panels.push(panel);
  panelCache.set(guildId, panels);
  return panel;
}

async function updatePanel(id, patch) {
  const row = await db.updateRolePanel(id, patch);
  if (!row) return null;
  const panel = {
    id: row.id,
    guildId: row.guild_id,
    name: row.name,
    description: row.description,
    channelId: row.channel_id,
    messageId: row.message_id,
    panelType: row.panel_type,
    embedJson: db.safeJsonParse(row.embed_json, null),
    options: db.safeJsonParse(row.options, []),
    exclusive: row.exclusive === 1,
    requiredRole: row.required_role,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  // Update cache
  const panels = panelCache.get(panel.guildId) || [];
  const idx = panels.findIndex(p => p.id === id);
  if (idx >= 0) panels[idx] = panel;
  else panels.push(panel);
  panelCache.set(panel.guildId, panels);
  return panel;
}

async function deletePanel(id) {
  const panel = getPanel(id);
  if (!panel) return false;
  await db.deleteRolePanel(id);
  const panels = panelCache.get(panel.guildId) || [];
  const idx = panels.findIndex(p => p.id === id);
  if (idx >= 0) panels.splice(idx, 1);
  if (panels.length === 0) panelCache.delete(panel.guildId);
  return true;
}

// Find the matching option for a button customId or select menu value.
function findOption(panel, identifier) {
  return panel.options.find(o => o.customId === identifier || o.roleId === identifier);
}

function panelRoleIds(panel) {
  return [...new Set(panel.options.map(option => String(option.roleId)).filter(Boolean))];
}

// Handle a published role panel component. Select menus use their selected
// values as toggles for multi-select panels; exclusive menus assign exactly one
// panel role and remove the other roles in that panel.
async function handlePanelInteraction(interaction) {
  if (!interaction?.guild || !interaction.customId?.startsWith("rolepanel:")) return false;
  const parts = interaction.customId.split(":");
  const panelId = Number(parts[1]);
  if (!Number.isInteger(panelId)) return false;

  const panel = getPanel(panelId);
  if (!panel || panel.guildId !== interaction.guild.id || !panel.enabled) {
    await interaction.reply({ content: "This role panel is no longer available.", ephemeral: true });
    return true;
  }

  const member = interaction.member;
  if (!member?.roles?.cache) {
    await interaction.reply({ content: "I couldn't resolve your server membership.", ephemeral: true });
    return true;
  }
  if (panel.requiredRole && !member.roles.cache.has(panel.requiredRole)) {
    await interaction.reply({ content: "You don't have the required role to use this panel.", ephemeral: true });
    return true;
  }

  const isSelect = Boolean(interaction.isStringSelectMenu?.());
  const selectedIds = isSelect ? interaction.values : [parts[2]];
  // An exclusive select menu permits an empty selection so members can clear
  // their current panel role. Buttons and non-empty selects still require a
  // concrete option to prevent malformed custom IDs from doing work.
  if (!selectedIds.length && !(panel.exclusive && isSelect)) {
    await interaction.reply({ content: "Choose a role option first.", ephemeral: true });
    return true;
  }
  const options = selectedIds.map(identifier => findOption(panel, identifier)).filter(Boolean);
  if (options.length !== selectedIds.length) {
    await interaction.reply({ content: "That role option is no longer available.", ephemeral: true });
    return true;
  }

  const botMember = interaction.guild.members.me;
  if (!botMember) {
    await interaction.reply({ content: "I can't verify my role permissions right now.", ephemeral: true });
    return true;
  }
  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    await interaction.reply({ content: "I need the Manage Roles permission to assign panel roles.", ephemeral: true });
    return true;
  }
  const roles = options.map(option => interaction.guild.roles.cache.get(option.roleId));
  const invalidRole = roles.find(role => !role || role.id === interaction.guild.id || role.managed || role.position >= botMember.roles.highest.position);
  if (invalidRole || roles.some(role => !role)) {
    await interaction.reply({ content: "One of those roles cannot be managed by me. Ask an administrator to move my role higher.", ephemeral: true });
    return true;
  }

  if (panel.exclusive && isSelect) {
    const panelRoles = panelRoleIds(panel)
      .map(id => interaction.guild.roles.cache.get(id))
      .filter(role => role && role.id !== interaction.guild.id && !role.managed && role.position < botMember.roles.highest.position);
    const failed = [];
    for (const role of panelRoles) {
      if (!roles.some(selected => selected.id === role.id) && member.roles.cache.has(role.id)) {
        const result = await safe.removeRole(member, role, "Role panel selection", "role panel remove");
        if (!result) failed.push(role.name);
      }
    }
    for (const role of roles) {
      if (!member.roles.cache.has(role.id)) {
        const result = await safe.addRole(member, role, "Role panel selection", "role panel add");
        if (!result) failed.push(role.name);
      }
    }
    const selectionMessage = roles.length
      ? `Role selection updated: ${roles.map(role => `<@&${role.id}>`).join(", ")}`
      : "Role selection cleared.";
    await interaction.reply({ content: failed.length ? `${selectionMessage} Could not update: ${failed.join(", ")}.` : selectionMessage, ephemeral: true, allowedMentions: { parse: [], roles: roles.map(role => role.id) } });
    return true;
  }

  const failed = [];
  for (const role of roles) {
    let result;
    if (member.roles.cache.has(role.id)) {
      result = await safe.removeRole(member, role, "Role panel toggle", "role panel remove");
    } else {
      result = await safe.addRole(member, role, "Role panel toggle", "role panel add");
    }
    if (!result) failed.push(role.name);
  }
  const toggleMessage = `Updated: ${roles.map(role => `<@&${role.id}>`).join(", ")}`;
  await interaction.reply({ content: failed.length ? `${toggleMessage} Could not update: ${failed.join(", ")}.` : toggleMessage, ephemeral: true, allowedMentions: { parse: [], roles: roles.map(role => role.id) } });
  return true;
}

module.exports = {
  load, save, getGuild,
  getAutoroles, setAutoroles,
  getReactionRoles, addReactionRole, removeReactionRole, roleForReaction, emojiKey,
  onMemberAdd, onReaction,
  // Panel management
  loadPanels, getPanels, getPanel, getPanelByMessageId,
  createPanel, updatePanel, deletePanel, findOption, handlePanelInteraction,
  ROLES_FILE,
};
