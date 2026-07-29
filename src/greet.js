const fs   = require("fs");
const path = require("path");
const { EmbedBuilder } = require("discord.js");
const safe = require("./safe");
const db = require("./db");

const GREET_FILE = path.join(__dirname, "..", "greet.json");

// ─── Per-guild config. Shape:
// { [guildId]: {
//     welcome: { enabled, channelId, message },
//     leave:   { enabled, channelId, message },
//   } }
// (Logging was moved to src/logging.js — the logs section here is retained
// for backward-compatible DB reads but is no longer actively used.)
let store = {};

function guildDefaults() {
  return {
    welcome: { enabled: false, channelId: null, message: "Welcome {user} to **{server}**! You're member #{count}.", embedColor: "#57f287", imageUrl: "", authorName: "", title: "" },
    leave:   { enabled: false, channelId: null, message: "{tag} left the server. We're now {count} members." },
    logs:    { enabled: false, channelId: null, memberEvents: true, messageEvents: true },
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
          memberEvents: row.logs_member_events === 1,
          messageEvents: row.logs_message_events === 1,
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
  if (ch) safe.send(ch, { embeds: [embed] }, "greet");
}

// ─── Event handlers ───
// Logging (join/leave/message events) has been moved to src/logging.js.
// greet.js now only handles welcome + leave messages.
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
}

async function onMemberRemove(member) {
  const cfg = getConfig(member.guild.id);
  if (cfg.leave.enabled && cfg.leave.channelId) {
    const embed = new EmbedBuilder().setColor(0xed4245).setDescription(format(cfg.leave.message, member, member.guild));
    sendTo(member.guild, cfg.leave.channelId, embed);
  }
}

module.exports = {
  load, save, getConfig, setConfig,
  onMemberAdd, onMemberRemove,
  GREET_FILE,
};
