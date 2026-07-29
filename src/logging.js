// ─── Server Logging ───────────────────────────────────────────────────────
// Comprehensive per-guild event logging with per-event-type toggles.
// Replaces the basic logs section that was in greet.js.
//
// Event types:
//   messageDelete, messageUpdate, messageBulkDelete
//   memberJoin, memberLeave, memberUpdate (nick/roles), memberBan, memberUnban
//   channelCreate, channelDelete, channelUpdate
//   roleCreate, roleDelete, roleUpdate
//   voiceJoin, voiceLeave, voiceMove
//   emojiCreate, emojiDelete, emojiUpdate
//   inviteCreate, inviteDelete
const { EmbedBuilder, AuditLogEvent } = require("discord.js");
const safe = require("./safe");
const db = require("./db");

// All event types and their default enabled state.
const EVENT_TYPES = {
  messageDelete:     { label: "Message Delete",      group: "Messages",  default: true,  color: 0xed4245 },
  messageUpdate:     { label: "Message Update",      group: "Messages",  default: true,  color: 0xfee75c },
  messageBulkDelete: { label: "Bulk Message Delete", group: "Messages",  default: true,  color: 0xed4245 },
  memberJoin:        { label: "Member Join",         group: "Members",   default: true,  color: 0x57f287 },
  memberLeave:       { label: "Member Leave",        group: "Members",   default: true,  color: 0xed4245 },
  memberUpdate:      { label: "Member Update",       group: "Members",   default: false, color: 0xfee75c },
  memberBan:         { label: "Member Ban",          group: "Members",   default: true,  color: 0xda373c },
  memberUnban:       { label: "Member Unban",        group: "Members",   default: true,  color: 0x57f287 },
  channelCreate:     { label: "Channel Create",      group: "Channels",  default: false, color: 0x57f287 },
  channelDelete:     { label: "Channel Delete",      group: "Channels",  default: false, color: 0xed4245 },
  channelUpdate:     { label: "Channel Update",      group: "Channels",  default: false, color: 0xfee75c },
  roleCreate:        { label: "Role Create",         group: "Roles",     default: false, color: 0x57f287 },
  roleDelete:        { label: "Role Delete",         group: "Roles",     default: false, color: 0xed4245 },
  roleUpdate:        { label: "Role Update",         group: "Roles",     default: false, color: 0xfee75c },
  voiceJoin:         { label: "Voice Join",          group: "Voice",     default: false, color: 0x57f287 },
  voiceLeave:        { label: "Voice Leave",         group: "Voice",     default: false, color: 0xed4245 },
  voiceMove:         { label: "Voice Move",          group: "Voice",     default: false, color: 0xfee75c },
  emojiCreate:       { label: "Emoji Create",        group: "Emojis",    default: false, color: 0x57f287 },
  emojiDelete:       { label: "Emoji Delete",        group: "Emojis",    default: false, color: 0xed4245 },
  emojiUpdate:       { label: "Emoji Update",        group: "Emojis",    default: false, color: 0xfee75c },
  inviteCreate:      { label: "Invite Create",       group: "Invites",   default: false, color: 0x57f287 },
  inviteDelete:      { label: "Invite Delete",       group: "Invites",   default: false, color: 0xed4245 },
};

// Build the default events map (which event types are enabled by default).
function defaultEvents() {
  const out = {};
  for (const [key, meta] of Object.entries(EVENT_TYPES)) {
    out[key] = meta.default;
  }
  return out;
}

let store = {}; // guildId → config

async function load() {
  try {
    store = {};
    for (const row of await db.getAllLoggingConfigs()) {
      store[row.guild_id] = {
        enabled: row.enabled === 1,
        channelId: row.channel_id,
        events: { ...defaultEvents(), ...db.safeJsonParse(row.events, {}) },
        ignoredChannels: db.safeJsonParse(row.ignored_channels, []),
        ignoredRoles: db.safeJsonParse(row.ignored_roles, []),
      };
    }
  } catch (e) {
    console.error("[logging] load:", e.message);
    store = {};
  }
}

function getConfig(guildId) {
  return {
    enabled: false,
    channelId: null,
    events: defaultEvents(),
    ignoredChannels: [],
    ignoredRoles: [],
    ...(store[guildId] || {}),
  };
}

function setConfig(guildId, patch) {
  const cur = getConfig(guildId);
  const next = {
    enabled: patch.enabled !== undefined ? patch.enabled : cur.enabled,
    channelId: patch.channelId !== undefined ? patch.channelId : cur.channelId,
    events: { ...cur.events, ...(patch.events || {}) },
    ignoredChannels: patch.ignoredChannels !== undefined ? patch.ignoredChannels : cur.ignoredChannels,
    ignoredRoles: patch.ignoredRoles !== undefined ? patch.ignoredRoles : cur.ignoredRoles,
  };
  store[guildId] = next;
  db.setLoggingConfig(guildId, {
    enabled: next.enabled,
    channel_id: next.channelId,
    events: next.events,
    ignored_channels: next.ignoredChannels,
    ignored_roles: next.ignoredRoles,
  }).catch(e => console.error("[logging] persist:", e.message));
  return next;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

// Check if logging is active for a guild + event type, and return the log channel.
function getLogChannel(guild, eventType) {
  const cfg = getConfig(guild.id);
  if (!cfg.enabled || !cfg.channelId) return null;
  if (!cfg.events[eventType]) return null;
  return guild.channels.cache.get(cfg.channelId) || null;
}

// Check if a member/channel should be ignored (by role or channel).
function isIgnored(cfg, { channelId, member } = {}) {
  if (channelId && cfg.ignoredChannels.includes(channelId)) return true;
  if (member && cfg.ignoredRoles) {
    for (const roleId of cfg.ignoredRoles) {
      if (member.roles?.cache?.has(roleId)) return true;
    }
  }
  return false;
}

// Truncate text to fit Discord embed field limits.
function trunc(text, max = 1024) {
  if (!text) return "*[no content]*";
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

// Fetch the most recent audit log entry for a given type and target.
// Used to attribute actions to moderators.
async function fetchAuditEntry(guild, actionType, targetId) {
  try {
    const logs = await safe.orNull(guild.fetchAuditLogs({ limit: 20, type: actionType }), "logging audit fetch");
    if (!logs) return null;
    for (const entry of logs.entries.values()) {
      if (entry.targetId === targetId || !targetId) {
        // Only use entries from the last 30 seconds to avoid stale attributions.
        if (Date.now() - entry.createdTimestamp < 30_000) return entry;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Send a log embed to the configured log channel.
function sendLog(guild, eventType, embed) {
  const ch = getLogChannel(guild, eventType);
  if (!ch) return;
  const meta = EVENT_TYPES[eventType];
  if (meta) embed.setColor(meta.color);
  safe.send(ch, { embeds: [embed] }, `logging ${eventType}`);
}

// ─── Event Handlers: Messages ─────────────────────────────────────────────

async function onMessageDelete(message) {
  if (!message.guild) return;
  const cfg = getConfig(message.guild.id);
  if (!cfg.enabled || !cfg.events.messageDelete) return;
  if (isIgnored(cfg, { channelId: message.channel.id, member: message.member })) return;
  if (message.author?.bot) return;

  const embed = new EmbedBuilder()
    .setAuthor({ name: `${message.author?.tag ?? "Unknown"} • message deleted`, iconURL: message.author?.displayAvatarURL?.() })
    .setDescription(`In <#${message.channel.id}>`)
    .addFields({ name: "Content", value: trunc(message.content, 1024) })
    .setFooter({ text: `#${message.channel.name} • msg ${message.id}` })
    .setTimestamp();
  sendLog(message.guild, "messageDelete", embed);
}

async function onMessageUpdate(oldMsg, newMsg) {
  if (!newMsg.guild) return;
  if (oldMsg.content === newMsg.content) return;
  if (newMsg.author?.bot) return;
  const cfg = getConfig(newMsg.guild.id);
  if (!cfg.enabled || !cfg.events.messageUpdate) return;
  if (isIgnored(cfg, { channelId: newMsg.channel.id, member: newMsg.member })) return;

  const embed = new EmbedBuilder()
    .setAuthor({ name: `${newMsg.author?.tag ?? "Unknown"} • message edited`, iconURL: newMsg.author?.displayAvatarURL?.() })
    .setDescription(`In <#${newMsg.channel.id}> ([jump](${newMsg.url}))`)
    .addFields(
      { name: "Before", value: trunc(oldMsg.content || "*[unknown]*", 1024) },
      { name: "After",  value: trunc(newMsg.content || "*[unknown]*", 1024) },
    )
    .setFooter({ text: `#${newMsg.channel.name} • msg ${newMsg.id}` })
    .setTimestamp();
  sendLog(newMsg.guild, "messageUpdate", embed);
}

async function onMessageBulkDelete(messages, channel) {
  if (!channel?.guild) return;
  const cfg = getConfig(channel.guild.id);
  if (!cfg.enabled || !cfg.events.messageBulkDelete) return;
  if (isIgnored(cfg, { channelId: channel.id })) return;

  // Deduplicate by message id (partial events can fire duplicates).
  const unique = [...new Map(messages.map(m => [m.id, m])).values()];
  const count = unique.length;
  const authors = [...new Set(unique.map(m => m.author?.tag).filter(Boolean))];
  const sample = unique.slice(0, 5).map(m =>
    `**${m.author?.tag ?? "Unknown"}**: ${trunc(m.content, 80)}`,
  ).join("\n");

  const embed = new EmbedBuilder()
    .setDescription(`${count} messages bulk-deleted in <#${channel.id}>`)
    .addFields(
      { name: "Authors", value: authors.length ? authors.slice(0, 10).join(", ") : "Unknown", inline: true },
      { name: "Sample", value: trunc(sample || "*[no text content]*", 1024) },
    )
    .setFooter({ text: `#${channel.name}` })
    .setTimestamp();
  sendLog(channel.guild, "messageBulkDelete", embed);
}

// ─── Event Handlers: Members ──────────────────────────────────────────────

async function onMemberJoin(member) {
  const cfg = getConfig(member.guild.id);
  if (!cfg.enabled || !cfg.events.memberJoin) return;
  if (isIgnored(cfg, { member })) return;

  const user = member.user;
  const embed = new EmbedBuilder()
    .setAuthor({ name: `${user.tag} joined`, iconURL: user.displayAvatarURL?.() })
    .setDescription(`<@${member.id}> • account created <t:${Math.floor(user.createdTimestamp / 1000)}:R>`)
    .addFields({ name: "Member Count", value: String(member.guild.memberCount), inline: true })
    .setFooter({ text: `ID: ${member.id}` })
    .setTimestamp();
  sendLog(member.guild, "memberJoin", embed);
}

async function onMemberLeave(member) {
  const cfg = getConfig(member.guild.id);
  if (!cfg.enabled || !cfg.events.memberLeave) return;
  if (isIgnored(cfg, { member })) return;

  const user = member.user;
  const roles = member.roles?.cache?.filter(r => r.id !== member.guild.id).map(r => `<@&${r.id}>`).join(", ") || "None";
  const embed = new EmbedBuilder()
    .setAuthor({ name: `${user.tag} left`, iconURL: user.displayAvatarURL?.() })
    .setDescription(`<@${member.id}>`)
    .addFields(
      { name: "Roles", value: trunc(roles, 1024), inline: false },
      { name: "Member Count", value: String(member.guild.memberCount), inline: true },
    )
    .setFooter({ text: `ID: ${member.id}` })
    .setTimestamp();
  sendLog(member.guild, "memberLeave", embed);
}

async function onMemberUpdate(oldMember, newMember) {
  const cfg = getConfig(newMember.guild.id);
  if (!cfg.enabled || !cfg.events.memberUpdate) return;
  if (isIgnored(cfg, { member: newMember })) return;

  const changes = [];

  // Nickname change
  if (oldMember.nickname !== newMember.nickname) {
    changes.push({
      name: "Nickname",
      value: `**Before:** ${oldMember.nickname || oldMember.user.username}\n**After:** ${newMember.nickname || newMember.user.username}`,
    });
  }

  // Role changes
  const addedRoles = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id) && r.id !== newMember.guild.id);
  const removedRoles = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id) && r.id !== oldMember.guild.id);

  if (addedRoles.size > 0) {
    changes.push({ name: "Roles Added", value: addedRoles.map(r => `<@&${r.id}>`).join(", ") });
  }
  if (removedRoles.size > 0) {
    changes.push({ name: "Roles Removed", value: removedRoles.map(r => `<@&${r.id}>`).join(", ") });
  }

  if (changes.length === 0) return;

  // Try to fetch the audit log entry for the role change
  let moderator = null;
  if (addedRoles.size > 0 || removedRoles.size > 0) {
    const entry = await fetchAuditEntry(newMember.guild, AuditLogEvent.MemberRoleUpdate, newMember.id);
    if (entry?.executor) moderator = entry.executor;
  }

  const embed = new EmbedBuilder()
    .setAuthor({ name: `${newMember.user.tag} updated`, iconURL: newMember.user.displayAvatarURL?.() })
    .setDescription(`<@${newMember.id}>`)
    .addFields(...changes)
    .setFooter({ text: `ID: ${newMember.id}` })
    .setTimestamp();
  if (moderator) {
    embed.addFields({ name: "Moderator", value: `<@${moderator.id}> (${moderator.tag})` });
  }
  sendLog(newMember.guild, "memberUpdate", embed);
}

async function onMemberBan(banOrGuild) {
  // guildBanAdd gives a GuildBan { guild, user }, but partials may give just guild + partial.
  const guild = banOrGuild?.guild || banOrGuild;
  const user = banOrGuild?.user;
  if (!guild) return;
  const cfg = getConfig(guild.id);
  if (!cfg.enabled || !cfg.events.memberBan) return;

  // Try to fetch the audit log entry for the ban (only if we have a user id to match).
  const entry = user?.id ? await fetchAuditEntry(guild, AuditLogEvent.MemberBanAdd, user.id) : null;
  const reason = entry?.reason || "No reason provided";
  const moderator = entry?.executor;

  const embed = new EmbedBuilder()
    .setAuthor({ name: user ? `${user.tag} banned` : "Member banned", iconURL: user?.displayAvatarURL?.() })
    .setDescription(user ? `<@${user.id}>` : "Unknown user")
    .addFields({ name: "Reason", value: trunc(reason, 1024) })
    .setFooter({ text: `ID: ${user?.id || "?"}` })
    .setTimestamp();
  if (moderator) {
    embed.addFields({ name: "Moderator", value: `<@${moderator.id}> (${moderator.tag})` });
  }
  sendLog(guild, "memberBan", embed);
}

async function onMemberUnban(banOrGuild) {
  const guild = banOrGuild?.guild || banOrGuild;
  const user = banOrGuild?.user;
  if (!guild) return;
  const cfg = getConfig(guild.id);
  if (!cfg.enabled || !cfg.events.memberUnban) return;

  // Only fetch audit entry if we have a user id to match (avoids wrong attribution on partials).
  const entry = user?.id ? await fetchAuditEntry(guild, AuditLogEvent.MemberBanRemove, user.id) : null;
  const moderator = entry?.executor;

  const embed = new EmbedBuilder()
    .setAuthor({ name: user ? `${user.tag} unbanned` : "Member unbanned", iconURL: user?.displayAvatarURL?.() })
    .setDescription(user ? `<@${user.id}>` : "Unknown user")
    .setFooter({ text: `ID: ${user?.id || "?"}` })
    .setTimestamp();
  if (moderator) {
    embed.addFields({ name: "Moderator", value: `<@${moderator.id}> (${moderator.tag})` });
  }
  sendLog(guild, "memberUnban", embed);
}

// ─── Event Handlers: Channels ─────────────────────────────────────────────

async function onChannelCreate(channel) {
  if (!channel.guild) return;
  const cfg = getConfig(channel.guild.id);
  if (!cfg.enabled || !cfg.events.channelCreate) return;
  if (isIgnored(cfg, { channelId: channel.id })) return;

  const entry = await fetchAuditEntry(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
  const moderator = entry?.executor;

  const embed = new EmbedBuilder()
    .setDescription(`Channel created: <#${channel.id}> (\`${channel.name}\`)`)
    .addFields(
      { name: "Type", value: channel.type ? String(channel.type) : "Unknown", inline: true },
      { name: "ID", value: channel.id, inline: true },
    )
    .setTimestamp();
  if (moderator) {
    embed.addFields({ name: "Moderator", value: `<@${moderator.id}> (${moderator.tag})` });
  }
  sendLog(channel.guild, "channelCreate", embed);
}

async function onChannelDelete(channel) {
  if (!channel.guild) return;
  const cfg = getConfig(channel.guild.id);
  if (!cfg.enabled || !cfg.events.channelDelete) return;
  if (isIgnored(cfg, { channelId: channel.id })) return;

  const entry = await fetchAuditEntry(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
  const moderator = entry?.executor;

  const embed = new EmbedBuilder()
    .setDescription(`Channel deleted: \`${channel.name}\``)
    .addFields(
      { name: "Type", value: channel.type ? String(channel.type) : "Unknown", inline: true },
      { name: "ID", value: channel.id, inline: true },
    )
    .setTimestamp();
  if (moderator) {
    embed.addFields({ name: "Moderator", value: `<@${moderator.id}> (${moderator.tag})` });
  }
  sendLog(channel.guild, "channelDelete", embed);
}

async function onChannelUpdate(oldChannel, newChannel) {
  if (!newChannel.guild) return;
  const cfg = getConfig(newChannel.guild.id);
  if (!cfg.enabled || !cfg.events.channelUpdate) return;
  if (isIgnored(cfg, { channelId: newChannel.id })) return;

  const changes = [];
  if (oldChannel.name !== newChannel.name) {
    changes.push({ name: "Name", value: `**Before:** ${oldChannel.name}\n**After:** ${newChannel.name}` });
  }
  if (oldChannel.topic !== newChannel.topic) {
    changes.push({ name: "Topic", value: `**Before:** ${trunc(oldChannel.topic || "*None*", 512)}\n**After:** ${trunc(newChannel.topic || "*None*", 512)}` });
  }
  if (oldChannel.nsfw !== newChannel.nsfw) {
    changes.push({ name: "NSFW", value: `**Before:** ${oldChannel.nsfw}\n**After:** ${newChannel.nsfw}` });
  }
  if (oldChannel.parentId !== newChannel.parentId) {
    changes.push({
      name: "Category",
      value: `**Before:** ${oldChannel.parent ? oldChannel.parent.name : "None"}\n**After:** ${newChannel.parent ? newChannel.parent.name : "None"}`,
    });
  }
  if (changes.length === 0) return;

  const embed = new EmbedBuilder()
    .setDescription(`Channel updated: <#${newChannel.id}> (\`${newChannel.name}\`)`)
    .addFields(...changes)
    .setFooter({ text: `ID: ${newChannel.id}` })
    .setTimestamp();
  sendLog(newChannel.guild, "channelUpdate", embed);
}

// ─── Event Handlers: Roles ────────────────────────────────────────────────

async function onRoleCreate(role) {
  if (!role.guild) return;
  const cfg = getConfig(role.guild.id);
  if (!cfg.enabled || !cfg.events.roleCreate) return;

  const entry = await fetchAuditEntry(role.guild, AuditLogEvent.RoleCreate, role.id);
  const moderator = entry?.executor;

  const embed = new EmbedBuilder()
    .setDescription(`Role created: <@&${role.id}> (\`${role.name}\`)`)
    .addFields(
      { name: "Color", value: role.color ? `#${role.color.toString(16).padStart(6, "0")}` : "Default", inline: true },
      { name: "ID", value: role.id, inline: true },
    )
    .setTimestamp();
  if (moderator) {
    embed.addFields({ name: "Moderator", value: `<@${moderator.id}> (${moderator.tag})` });
  }
  sendLog(role.guild, "roleCreate", embed);
}

async function onRoleDelete(role) {
  if (!role.guild) return;
  const cfg = getConfig(role.guild.id);
  if (!cfg.enabled || !cfg.events.roleDelete) return;

  const entry = await fetchAuditEntry(role.guild, AuditLogEvent.RoleDelete, role.id);
  const moderator = entry?.executor;

  const embed = new EmbedBuilder()
    .setDescription(`Role deleted: \`${role.name}\``)
    .addFields(
      { name: "Color", value: role.color ? `#${role.color.toString(16).padStart(6, "0")}` : "Default", inline: true },
      { name: "ID", value: role.id, inline: true },
    )
    .setTimestamp();
  if (moderator) {
    embed.addFields({ name: "Moderator", value: `<@${moderator.id}> (${moderator.tag})` });
  }
  sendLog(role.guild, "roleDelete", embed);
}

async function onRoleUpdate(oldRole, newRole) {
  if (!newRole.guild) return;
  const cfg = getConfig(newRole.guild.id);
  if (!cfg.enabled || !cfg.events.roleUpdate) return;

  const changes = [];
  if (oldRole.name !== newRole.name) {
    changes.push({ name: "Name", value: `**Before:** ${oldRole.name}\n**After:** ${newRole.name}` });
  }
  if (oldRole.color !== newRole.color) {
    changes.push({ name: "Color", value: `**Before:** ${oldRole.color ? `#${oldRole.color.toString(16).padStart(6, "0")}` : "Default"}\n**After:** ${newRole.color ? `#${newRole.color.toString(16).padStart(6, "0")}` : "Default"}` });
  }
  if (oldRole.permissions?.bitfield !== newRole.permissions?.bitfield) {
    const added = newRole.permissions?.toArray().filter(p => !oldRole.permissions?.has(p)) || [];
    const removed = oldRole.permissions?.toArray().filter(p => !newRole.permissions?.has(p)) || [];
    if (added.length) changes.push({ name: "Permissions Added", value: trunc(added.join(", "), 1024) });
    if (removed.length) changes.push({ name: "Permissions Removed", value: trunc(removed.join(", "), 1024) });
  }
  if (changes.length === 0) return;

  const embed = new EmbedBuilder()
    .setDescription(`Role updated: <@&${newRole.id}> (\`${newRole.name}\`)`)
    .addFields(...changes)
    .setFooter({ text: `ID: ${newRole.id}` })
    .setTimestamp();
  sendLog(newRole.guild, "roleUpdate", embed);
}

// ─── Event Handlers: Voice ────────────────────────────────────────────────

async function onVoiceStateUpdate(oldState, newState) {
  const guild = newState.guild;
  if (!guild) return;
  const cfg = getConfig(guild.id);
  if (!cfg.enabled) return;
  if (isIgnored(cfg, { member: newState.member })) return;

  const oldCh = oldState.channelId;
  const newCh = newState.channelId;
  const member = newState.member;
  const user = member?.user;

  // Joined a voice channel
  if (!oldCh && newCh) {
    if (!cfg.events.voiceJoin) return;
    const embed = new EmbedBuilder()
      .setAuthor({ name: `${user?.tag ?? "Unknown"} joined voice`, iconURL: user?.displayAvatarURL?.() })
      .setDescription(`<@${member.id}> → <#${newCh}>`)
      .setFooter({ text: `ID: ${member.id}` })
      .setTimestamp();
    sendLog(guild, "voiceJoin", embed);
    return;
  }

  // Left a voice channel
  if (oldCh && !newCh) {
    if (!cfg.events.voiceLeave) return;
    const embed = new EmbedBuilder()
      .setAuthor({ name: `${user?.tag ?? "Unknown"} left voice`, iconURL: user?.displayAvatarURL?.() })
      .setDescription(`<@${member.id}> ← <#${oldCh}>`)
      .setFooter({ text: `ID: ${member.id}` })
      .setTimestamp();
    sendLog(guild, "voiceLeave", embed);
    return;
  }

  // Moved between voice channels
  if (oldCh && newCh && oldCh !== newCh) {
    if (!cfg.events.voiceMove) return;
    const embed = new EmbedBuilder()
      .setAuthor({ name: `${user?.tag ?? "Unknown"} moved voice`, iconURL: user?.displayAvatarURL?.() })
      .setDescription(`<@${member.id}> moved from <#${oldCh}> to <#${newCh}>`)
      .setFooter({ text: `ID: ${member.id}` })
      .setTimestamp();
    sendLog(guild, "voiceMove", embed);
    return;
  }
}

// ─── Event Handlers: Emojis ───────────────────────────────────────────────

async function onEmojiCreate(emoji) {
  if (!emoji.guild) return;
  const cfg = getConfig(emoji.guild.id);
  if (!cfg.enabled || !cfg.events.emojiCreate) return;

  const display = emoji.animated
    ? `<a:${emoji.name}:${emoji.id}>`
    : `<:${emoji.name}:${emoji.id}>`;
  const embed = new EmbedBuilder()
    .setDescription(`Emoji created: ${display} ` + "`:" + emoji.name + ":`")
    .addFields({ name: "ID", value: emoji.id, inline: true })
    .setThumbnail(emoji.imageURL?.())
    .setTimestamp();
  sendLog(emoji.guild, "emojiCreate", embed);
}

async function onEmojiDelete(emoji) {
  if (!emoji.guild) return;
  const cfg = getConfig(emoji.guild.id);
  if (!cfg.enabled || !cfg.events.emojiDelete) return;

  const embed = new EmbedBuilder()
    .setDescription(`Emoji deleted: \`:${emoji.name}:\``)
    .addFields({ name: "ID", value: emoji.id, inline: true })
    .setThumbnail(emoji.imageURL?.())
    .setTimestamp();
  sendLog(emoji.guild, "emojiDelete", embed);
}

async function onEmojiUpdate(oldEmoji, newEmoji) {
  if (!newEmoji.guild) return;
  const cfg = getConfig(newEmoji.guild.id);
  if (!cfg.enabled || !cfg.events.emojiUpdate) return;

  if (oldEmoji.name === newEmoji.name) return;

  const display = newEmoji.animated
    ? `<a:${newEmoji.name}:${newEmoji.id}>`
    : `<:${newEmoji.name}:${newEmoji.id}>`;
  const embed = new EmbedBuilder()
    .setDescription(`Emoji updated: ${display}`)
    .addFields({ name: "Name", value: `**Before:** ${oldEmoji.name}\n**After:** ${newEmoji.name}` })
    .addFields({ name: "ID", value: newEmoji.id, inline: true })
    .setThumbnail(newEmoji.imageURL?.())
    .setTimestamp();
  sendLog(newEmoji.guild, "emojiUpdate", embed);
}

// ─── Event Handlers: Invites ──────────────────────────────────────────────

async function onInviteCreate(invite) {
  if (!invite.guild) return;
  const cfg = getConfig(invite.guild.id);
  if (!cfg.enabled || !cfg.events.inviteCreate) return;

  const embed = new EmbedBuilder()
    .setDescription(`Invite created: \`${invite.code}\``)
    .addFields(
      { name: "Channel", value: invite.channel ? `<#${invite.channelId}>` : "Unknown", inline: true },
      { name: "Max Uses", value: String(invite.maxUses ?? 0), inline: true },
      { name: "Inviter", value: invite.inviter ? `<@${invite.inviter.id}>` : "Unknown", inline: true },
    )
    .setTimestamp();
  sendLog(invite.guild, "inviteCreate", embed);
}

async function onInviteDelete(invite) {
  if (!invite.guild) return;
  const cfg = getConfig(invite.guild.id);
  if (!cfg.enabled || !cfg.events.inviteDelete) return;

  const embed = new EmbedBuilder()
    .setDescription(`Invite deleted: \`${invite.code}\``)
    .addFields(
      { name: "Channel", value: invite.channel ? `<#${invite.channelId}>` : "Unknown", inline: true },
      { name: "Uses", value: String(invite.uses ?? "?"), inline: true },
    )
    .setTimestamp();
  sendLog(invite.guild, "inviteDelete", embed);
}

module.exports = {
  EVENT_TYPES,
  defaultEvents,
  load,
  getConfig,
  setConfig,
  // Message events
  onMessageDelete,
  onMessageUpdate,
  onMessageBulkDelete,
  // Member events
  onMemberJoin,
  onMemberLeave,
  onMemberUpdate,
  onMemberBan,
  onMemberUnban,
  // Channel events
  onChannelCreate,
  onChannelDelete,
  onChannelUpdate,
  // Role events
  onRoleCreate,
  onRoleDelete,
  onRoleUpdate,
  // Voice events
  onVoiceStateUpdate,
  // Emoji events
  onEmojiCreate,
  onEmojiDelete,
  onEmojiUpdate,
  // Invite events
  onInviteCreate,
  onInviteDelete,
};
