const fs   = require("fs");
const path = require("path");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const safe = require("./safe");
const db = require("./db");

const GREET_FILE = path.join(__dirname, "..", "greet.json");

// ─── Per-guild config. Shape:
// { [guildId]: {
//     welcome: { enabled, channelId, message },
//     leave:   { enabled, channelId, message },
//     logs:    { enabled, channelId, memberEvents, messageEvents, serverEvents, moderationEvents,
//                voiceEvents, inviteEvents, threadEvents, bulkMessageEvents },
//   } }
let store = {};
// Discord emits guildBanAdd/guildBanRemove after bot actions too. Keep a short
// in-memory marker so command-originated moderation logs are not duplicated by
// the corresponding gateway event.
const recentModerationEvents = new Map();
const MODERATION_EVENT_DEDUPE_MS = 5_000;
// Batch high-volume audit events into a single Discord message. This keeps
// voice/thread/invite bursts below rate limits while preserving each event.
const pendingLogBatches = new Map();
const LOG_BATCH_DELAY_MS = 500;
const LOG_BATCH_SIZE = 10;
const LOG_BATCH_MAX_PENDING = 100;

function guildDefaults() {
  return {
    welcome: { enabled: false, channelId: null, message: "Welcome {user} to **{server}**! You're member #{count}.", embedColor: "#57f287", imageUrl: "", authorName: "", title: "" },
    leave:   { enabled: false, channelId: null, message: "{tag} left the server. We're now {count} members." },
    logs:    {
      enabled: false,
      channelId: null,
      memberEvents: true,
      messageEvents: true,
      serverEvents: true,
      moderationEvents: true,
      voiceEvents: true,
      inviteEvents: true,
      threadEvents: true,
      bulkMessageEvents: true,
    },
  };
}

async function load() {
  try {
    store = {};
    const rows = await db.getAllGreetConfigs();
    for (const row of rows) {
      store[row.guild_id] = {
        welcome: {
          enabled: row.welcome_enabled === 1,
          channelId: row.welcome_channel_id,
          message: row.welcome_message,
        },
        leave: {
          enabled: row.leave_enabled === 1,
          channelId: row.leave_channel_id,
          message: row.leave_message,
        },
        logs: {
          enabled: row.logs_enabled === 1,
          channelId: row.logs_channel_id,
          memberEvents: row.logs_member_events !== 0,
          messageEvents: row.logs_message_events !== 0,
          serverEvents: row.logs_server_events !== 0,
          moderationEvents: row.logs_moderation_events !== 0,
          voiceEvents: row.logs_voice_events !== 0,
          inviteEvents: row.logs_invite_events !== 0,
          threadEvents: row.logs_thread_events !== 0,
          bulkMessageEvents: row.logs_bulk_message_events !== 0,
        }
      };
    }
  } catch (e) {
    console.error("Failed to load greet config from db:", e);
    store = {};
  }
}
function save() {}

function getConfig(guildId) {
  const base = guildDefaults();
  const saved = store[guildId];
  if (!saved) return base;
  return {
    welcome: { ...base.welcome, ...(saved.welcome || {}) },
    leave:   { ...base.leave,   ...(saved.leave   || {}) },
    logs:    { ...base.logs,    ...(saved.logs    || {}) },
  };
}

function setConfig(guildId, patch) {
  const cur = getConfig(guildId);
  const next = {
    welcome: { ...cur.welcome, ...(patch.welcome || {}) },
    leave:   { ...cur.leave,   ...(patch.leave   || {}) },
    logs:    { ...cur.logs,    ...(patch.logs    || {}) },
  };
  store[guildId] = next;

  db.setGreetConfig(guildId, {
    welcome_enabled: next.welcome.enabled,
    welcome_channel_id: next.welcome.channelId,
    welcome_message: next.welcome.message,
    leave_enabled: next.leave.enabled,
    leave_channel_id: next.leave.channelId,
    leave_message: next.leave.message,
    logs_enabled: next.logs.enabled,
    logs_channel_id: next.logs.channelId,
    logs_member_events: next.logs.memberEvents,
    logs_message_events: next.logs.messageEvents,
    logs_server_events: next.logs.serverEvents,
    logs_moderation_events: next.logs.moderationEvents,
    logs_voice_events: next.logs.voiceEvents,
    logs_invite_events: next.logs.inviteEvents,
    logs_thread_events: next.logs.threadEvents,
    logs_bulk_message_events: next.logs.bulkMessageEvents,
  }).catch(e => console.error("persist greet:", e.message));
  return next;
}

// Replace {user} {tag} {server} {count} placeholders.
function format(template, member, guild) {
  const user = member.user || member;
  return String(template || "")
    .replace(/\{user\}/g, `<@${user.id}>`)
    .replace(/\{tag\}/g, user.tag || user.username)
    .replace(/\{username\}/g, user.username)
    .replace(/\{server\}/g, guild.name)
    .replace(/\{count\}/g, guild.memberCount);
}

function sendTo(guild, channelId, embed) {
  if (!channelId) return;
  const ch = guild.channels.cache.get(channelId);
  if (!ch) return;
  const permissions = ch.permissionsFor?.(guild.members.me);
  if (!permissions?.has(PermissionFlagsBits.ViewChannel) ||
      !permissions.has(PermissionFlagsBits.SendMessages) ||
      !permissions.has(PermissionFlagsBits.EmbedLinks)) {
    return;
  }
  const embeds = Array.isArray(embed) ? embed : [embed];
  safe.send(ch, { embeds: embeds.slice(0, 10), allowedMentions: { parse: [] } }, "greet");
}

function safeLogText(value, maxLength = 1000) {
  return String(value || "*")
    .replace(/<@!?&?\d+>/g, "[mention]")
    .replace(/@everyone|@here/gi, "[mention]")
    .slice(0, maxLength);
}

function flushLogBatch(key) {
  const batch = pendingLogBatches.get(key);
  if (!batch) return;
  const current = getConfig(batch.guild.id);
  // Settings may have changed while the debounce timer was waiting. Never
  // emit buffered audit events after logging is disabled or redirected.
  if (!current.logs.enabled || current.logs.channelId !== batch.channelId) {
    pendingLogBatches.delete(key);
    return;
  }
  // Re-check each event's category at flush time. This prevents a category
  // that was disabled during the debounce window from being emitted anyway.
  batch.embeds = batch.embeds.filter(item => current.logs[item.category] === true);
  const droppedByCategory = batch.droppedByCategory || {};
  const visibleDropped = Object.entries(droppedByCategory)
    .filter(([category]) => current.logs[category] === true)
    .reduce((total, [, count]) => total + count, 0);
  pendingLogBatches.delete(key);
  const hasDropSummary = visibleDropped > 0;
  const embeds = batch.embeds.splice(0, hasDropSummary ? LOG_BATCH_SIZE - 1 : LOG_BATCH_SIZE)
    .map(item => item.embed);
  if (hasDropSummary) {
    embeds.push(new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle("Audit log burst truncated")
      .setDescription(`${visibleDropped} additional events were omitted during a high-volume burst.`)
      .setTimestamp());
  }
  batch.droppedByCategory = {};
  if (embeds.length) sendTo(batch.guild, batch.channelId, embeds);
  if (batch.embeds.length) {
    pendingLogBatches.set(key, batch);
    batch.timer = setTimeout(() => flushLogBatch(key), LOG_BATCH_DELAY_MS);
    batch.timer.unref?.();
  }
}

function queueLog(guild, channelId, embed, category = "memberEvents") {
  const key = `${guild.id}:${channelId}`;
  let batch = pendingLogBatches.get(key);
  if (!batch) {
    batch = { guild, channelId, embeds: [], droppedByCategory: {}, timer: null };
    pendingLogBatches.set(key, batch);
  }
  if (batch.embeds.length >= LOG_BATCH_MAX_PENDING) {
    const dropped = batch.embeds.shift();
    const droppedCategory = dropped?.category || "memberEvents";
    batch.droppedByCategory[droppedCategory] = (batch.droppedByCategory[droppedCategory] || 0) + 1;
  }
  batch.embeds.push({ embed, category });
  if (!batch.timer) {
    batch.timer = setTimeout(() => flushLogBatch(key), LOG_BATCH_DELAY_MS);
    batch.timer.unref?.();
  }
}

function logEvent(guild, color, title, description, category = "memberEvents") {
  const cfg = getConfig(guild.id);
  if (!cfg.logs.enabled || !cfg.logs[category] || !cfg.logs.channelId) return;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(safeLogText(title, 256))
    .setDescription(safeLogText(description, 4096))
    .setTimestamp();
  queueLog(guild, cfg.logs.channelId, embed, category);
}

// ─── Event handlers ───
async function onMemberAdd(member) {
  const cfg = getConfig(member.guild.id);
  if (cfg.welcome.enabled && cfg.welcome.channelId) {
    const color = parseInt((cfg.welcome.embedColor || "#57f287").replace(/^#/, ""), 16) || 0x57f287;
    const embed = new EmbedBuilder().setColor(color).setDescription(format(cfg.welcome.message, member, member.guild));
    const avatar = cfg.welcome.imageUrl || member.user.displayAvatarURL();
    if (avatar) embed.setThumbnail(avatar);
    if (cfg.welcome.title) embed.setTitle(format(cfg.welcome.title, member, member.guild));
    if (cfg.welcome.authorName) embed.setAuthor({ name: format(cfg.welcome.authorName, member, member.guild), iconURL: member.user.displayAvatarURL() });
    sendTo(member.guild, cfg.welcome.channelId, embed);
  }
  if (cfg.logs.enabled && cfg.logs.memberEvents && cfg.logs.channelId) {
    const embed = new EmbedBuilder().setColor(0x57f287).setAuthor({ name: `${member.user.tag} joined`, iconURL: member.user.displayAvatarURL() })
      .setDescription(`<@${member.id}> • account created <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`).setTimestamp();
    queueLog(member.guild, cfg.logs.channelId, embed, "memberEvents");
  }
}

async function onMemberRemove(member) {
  const cfg = getConfig(member.guild.id);
  if (cfg.leave.enabled && cfg.leave.channelId) {
    const embed = new EmbedBuilder().setColor(0xed4245).setDescription(format(cfg.leave.message, member, member.guild));
    sendTo(member.guild, cfg.leave.channelId, embed);
  }
  if (cfg.logs.enabled && cfg.logs.memberEvents && cfg.logs.channelId) {
    const embed = new EmbedBuilder().setColor(0xed4245).setAuthor({ name: `${member.user.tag} left`, iconURL: member.user.displayAvatarURL() })
      .setDescription(`<@${member.id}>`).setTimestamp();
    queueLog(member.guild, cfg.logs.channelId, embed, "memberEvents");
  }
}

async function onMessageDelete(message) {
  if (!message.guild || message.author?.bot) return;
  const cfg = getConfig(message.guild.id);
  if (!cfg.logs.enabled || !cfg.logs.messageEvents || !cfg.logs.channelId) return;
  const embed = new EmbedBuilder().setColor(0xed4245)
    .setAuthor({ name: `${message.author?.tag ?? "Unknown"} • message deleted`, iconURL: message.author?.displayAvatarURL?.() })
    .setDescription(`In <#${message.channel.id}>:\n${safeLogText(message.content || "*[no text / embed]*", 1500)}`).setTimestamp();
  queueLog(message.guild, cfg.logs.channelId, embed, "messageEvents");
}

async function onMessageDeleteBulk(messages) {
  const first = messages?.first?.() || [...(messages?.values?.() || [])][0];
  const guild = first?.guild;
  if (!guild) return;
  const cfg = getConfig(guild.id);
  if (!cfg.logs.enabled || !cfg.logs.bulkMessageEvents || !cfg.logs.channelId) return;
  const channelId = first.channel?.id;
  const channelLabel = channelId ? `<#${channelId}>` : "a channel";
  const count = messages?.size || messages?.length || 0;
  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("Bulk messages deleted")
    .setDescription(`${count} messages were deleted from ${channelLabel}. Content is omitted from bulk events.`)
    .setTimestamp();
  queueLog(guild, cfg.logs.channelId, embed, "bulkMessageEvents");
}

async function onMessageUpdate(oldMsg, newMsg) {
  if (!newMsg.guild || newMsg.author?.bot) return;
  if (oldMsg.content === newMsg.content) return;
  const cfg = getConfig(newMsg.guild.id);
  if (!cfg.logs.enabled || !cfg.logs.messageEvents || !cfg.logs.channelId) return;
  const embed = new EmbedBuilder().setColor(0xfee75c)
    .setAuthor({ name: `${newMsg.author?.tag ?? "Unknown"} • message edited`, iconURL: newMsg.author?.displayAvatarURL?.() })
    .setDescription(`In <#${newMsg.channel.id}> ([jump](${newMsg.url}))`)
    .addFields(
      { name: "Before", value: safeLogText(oldMsg.content || "*[unknown]*") },
      { name: "After",  value: safeLogText(newMsg.content || "*[unknown]*") },
    ).setTimestamp();
  queueLog(newMsg.guild, cfg.logs.channelId, embed, "messageEvents");
}

async function onVoiceStateUpdate(oldState, newState) {
  const guild = newState.guild || oldState.guild;
  const member = newState.member || oldState.member;
  if (!guild || !member || member.user?.bot) return;
  const before = oldState.channel;
  const after = newState.channel;
  if (before?.id === after?.id) return;
  let action;
  let color;
  if (!before && after) { action = `**${member.user.tag}** joined <#${after.id}>`; color = 0x57f287; }
  else if (before && !after) { action = `**${member.user.tag}** left <#${before.id}>`; color = 0xed4245; }
  else { action = `**${member.user.tag}** moved from <#${before.id}> to <#${after.id}>`; color = 0x5865f2; }
  logEvent(guild, color, "Voice activity", action, "voiceEvents");
}

async function onInviteCreate(invite) {
  if (!invite.guild) return;
  const creator = invite.inviter?.tag || invite.inviter?.username || "Unknown user";
  const channel = invite.channel?.name ? `#${invite.channel.name}` : "a channel";
  logEvent(invite.guild, 0x57f287, "Invite created", `**${creator}** created an invite for ${channel}. Uses: ${invite.maxUses || "unlimited"}; expires: ${invite.maxAge ? `${invite.maxAge}s` : "never"}.`, "inviteEvents");
}

async function onInviteDelete(invite) {
  if (!invite.guild) return;
  const channel = invite.channel?.name ? `#${invite.channel.name}` : "a channel";
  logEvent(invite.guild, 0xed4245, "Invite deleted", `Invite **${invite.code || "unknown"}** was deleted from ${channel}.`, "inviteEvents");
}

async function onThreadCreate(thread) {
  if (thread.guild) logEvent(thread.guild, 0x57f287, "Thread created", `**${thread.name || thread.id}** in <#${thread.parentId || thread.id}>`, "threadEvents");
}

async function onThreadDelete(thread) {
  if (thread.guild) logEvent(thread.guild, 0xed4245, "Thread deleted", `**${thread.name || thread.id}**`, "threadEvents");
}

async function onThreadUpdate(oldThread, newThread) {
  if (!newThread.guild || oldThread.name === newThread.name) return;
  logEvent(newThread.guild, 0xfee75c, "Thread renamed", `**${oldThread.name || oldThread.id}** → **${newThread.name || newThread.id}**`, "threadEvents");
}

async function onMemberUpdate(oldMember, newMember) {
  if (oldMember.user?.bot) return;
  const changes = [];
  if (oldMember.nickname !== newMember.nickname) {
    changes.push(`Nickname: **${oldMember.nickname || oldMember.user.username}** → **${newMember.nickname || newMember.user.username}**`);
  }
  const oldRoles = new Set(oldMember.roles.cache.keys());
  const added = [...newMember.roles.cache.values()].filter(role => role.id !== newMember.guild.id && !oldRoles.has(role.id));
  const newRoles = new Set(newMember.roles.cache.keys());
  const removed = [...oldMember.roles.cache.values()].filter(role => role.id !== oldMember.guild.id && !newRoles.has(role.id));
  if (added.length) changes.push(`Roles added: ${added.slice(0, 8).map(role => role.name).join(", ")}`);
  if (removed.length) changes.push(`Roles removed: ${removed.slice(0, 8).map(role => role.name).join(", ")}`);
  if (changes.length) logEvent(newMember.guild, 0x5865f2, "Member updated", `**${newMember.user.tag}**\n${changes.join("\n")}`);
}

async function onChannelCreate(channel) {
  if (channel.guild) logEvent(channel.guild, 0x57f287, "Channel created", `#${channel.name || channel.id}`, "serverEvents");
}

async function onChannelDelete(channel) {
  if (channel.guild) logEvent(channel.guild, 0xed4245, "Channel deleted", `#${channel.name || channel.id}`, "serverEvents");
}

async function onChannelUpdate(oldChannel, newChannel) {
  if (!newChannel.guild || oldChannel.name === newChannel.name) return;
  logEvent(newChannel.guild, 0xfee75c, "Channel renamed", `**${oldChannel.name || oldChannel.id}** → **${newChannel.name || newChannel.id}**`, "serverEvents");
}

async function onRoleCreate(role) {
  logEvent(role.guild, 0x57f287, "Role created", `**${role.name}**`, "serverEvents");
}

async function onRoleDelete(role) {
  logEvent(role.guild, 0xed4245, "Role deleted", `**${role.name}**`, "serverEvents");
}

async function onRoleUpdate(oldRole, newRole) {
  if (oldRole.name !== newRole.name) logEvent(newRole.guild, 0xfee75c, "Role renamed", `**${oldRole.name}** → **${newRole.name}**`, "serverEvents");
}

function moderationEventKey(guildId, userId, action) {
  return `${guildId}:${userId || "unknown"}:${action}`;
}

function markModerationGatewayEvent(guildId, userId, action) {
  const now = Date.now();
  for (const [key, expiresAt] of recentModerationEvents) {
    if (expiresAt <= now) recentModerationEvents.delete(key);
  }
  const key = moderationEventKey(guildId, userId, action);
  recentModerationEvents.set(key, now + MODERATION_EVENT_DEDUPE_MS);
}

function consumeModerationGatewayEvent(guildId, userId, action) {
  const now = Date.now();
  for (const [key, expiresAt] of recentModerationEvents) {
    if (expiresAt <= now) recentModerationEvents.delete(key);
  }
  const key = moderationEventKey(guildId, userId, action);
  if (!recentModerationEvents.has(key)) return false;
  recentModerationEvents.delete(key);
  return true;
}

async function onGuildBanAdd(ban) {
  const userId = ban.user?.id;
  if (consumeModerationGatewayEvent(ban.guild.id, userId, "ban")) return;
  logEvent(ban.guild, 0xed4245, "Member banned", `**${ban.user?.tag || userId || "Unknown user"}**`, "moderationEvents");
}

async function onGuildBanRemove(ban) {
  const userId = ban.user?.id;
  if (consumeModerationGatewayEvent(ban.guild.id, userId, "unban")) return;
  logEvent(ban.guild, 0x57f287, "Member unbanned", `**${ban.user?.tag || userId || "Unknown user"}**`, "moderationEvents");
}

// Shared moderation-command logger. The moderation module already persists
// structured cases in moderation_log; this mirrors those actions to the
// configured Discord log channel without exposing proof or sensitive payloads.
async function logModerationAction(guild, { userId, moderator, action, reason, details }) {
  if (!guild) return;
  const cfg = getConfig(guild.id);
  if (!cfg.logs.enabled || !cfg.logs.moderationEvents || !cfg.logs.channelId) return;
  const target = userId ? `<@${userId}>` : "Unknown user";
  const description = [`Target: ${target}`, `Moderator: ${moderator || "Unknown moderator"}`];
  if (reason) description.push(`Reason: ${safeLogText(reason)}`);
  if (details) description.push(`Details: ${safeLogText(details)}`);
  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle(`Moderation action: ${action}`)
    .setDescription(description.join("\\n"))
    .setTimestamp();
  queueLog(guild, cfg.logs.channelId, embed, "moderationEvents");
}

module.exports = {
  load, save, getConfig, setConfig,
  onMemberAdd, onMemberRemove, onMessageDelete, onMessageDeleteBulk, onMessageUpdate, onMemberUpdate,
  onVoiceStateUpdate, onInviteCreate, onInviteDelete, onThreadCreate, onThreadDelete, onThreadUpdate,
  onChannelCreate, onChannelDelete, onChannelUpdate,
  onRoleCreate, onRoleDelete, onRoleUpdate, onGuildBanAdd, onGuildBanRemove,
  markModerationGatewayEvent, consumeModerationGatewayEvent, logModerationAction,
  GREET_FILE,
};
