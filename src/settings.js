const fs   = require("fs");
const path = require("path");
const { getProvider, listProviders, getEnvVars } = require("./ai/providers");
const { AI_SYSTEM_PROMPT_DEFAULT, AI_SYSTEM_PROMPT_CONCISE } = require("./ai/harness-prompt");
const db   = require("./db");

const SETTINGS_FILE = path.join(__dirname, "..", "settings.json");


const DEFAULTS = {
  prefix:       "$",
  noPermMsg:    "You need Administrator or bot owner to use this command.",

  aiEnabled:          false,
  aiProvider:         "groq",
  groqApiKey:         "",
  groqModel:          "llama-3.3-70b-versatile",
  openaiApiKey:       "",
  openaiModel:        "gpt-4o-mini",
  claudeApiKey:       "",
  claudeModel:        "claude-sonnet-4-20250514",
  geminiApiKey:       "",
  geminiModel:        "gemini-2.0-flash",
  customApiKey:       "",
  customModel:        "",
  customBaseUrl:      "",
  customApiType:      "openai",   // "openai" | "anthropic"
  nvidiaApiKey:       "",
  nvidiaModel:        "mistralai/ministral-14b-instruct-2512",
  deepseekApiKey:     "",
  deepseekModel:      "deepseek-chat",
  togetherApiKey:     "",
  togetherModel:      "meta-llama/Llama-3.3-70B-Instruct-Turbo",
  requestyApiKey:     "",
  requestyModel:      "openai/gpt-4o-mini",
  aiSystemPrompt:     AI_SYSTEM_PROMPT_DEFAULT,
  aiAllowedChannels:  "",
  aiIgnoredChannels:  "",
  aiTemperature:      0.7,
  aiMaxTokens:        4096,
  aiTopP:             1.0,
  aiContextLimit:     8,
  aiToolsEnabled:     true,
  aiMemoryEnabled:    true,
  aiThinkingEnabled:   false,
  aiKeyword:           "mitto",
  aiFallbackProviders:  "",   // comma-separated provider IDs, up to 5
  aiChattyMode:         false, // respond to conversations naturally without being pinged
  aiChattyCooldown:     60,    // seconds between responses in the same channel (chatty mode)
  aiDmEnabled:          true,  // respond to direct messages via AI
  // ─── Voice settings ────────────────────────────────────────────────────
  voiceEnabled:       false,
  voiceChannelId:     "",
  voiceTTSVoice:      "en-US-EmmaMultilingualNeural",
  voiceVolume:          1.0,
  aiBrowserEnabled:     true,  // enable Playwright-powered browse_page tool
  aiToolPermissions:    "",   // JSON map of tool name -> min perm level: {"warn_member":"mod","kick_member":"admin","ban_member":"admin","mute_member":"mod"}
  aiPersonality:        "neutral",
  funEnabled:         true,
  infoEnabled:        true,
  fakeModEnabled:     true,
  levelingEnabled:    false,
  maintenanceMode:    false,
  maintenanceMessage: "🔧 The bot is currently under maintenance. Please try again later.",
};

// These options describe how AI behaves inside a server. Provider credentials,
// model selection, and generation defaults remain global; these values can be
// overridden independently for each guild.
const GUILD_AI_KEYS = new Set([
  "aiEnabled",
  "aiSystemPrompt", "aiAllowedChannels", "aiIgnoredChannels",
  "aiTemperature", "aiMaxTokens", "aiTopP", "aiContextLimit",
  "aiToolsEnabled", "aiMemoryEnabled", "aiThinkingEnabled",
  "aiKeyword",  "aiFallbackProviders", "aiChattyMode", "aiChattyCooldown",
  "aiBrowserEnabled", "aiPersonality", "aiToolPermissions",
]);

// These settings must never fall back to global state. In particular, a
// server's AI enabled/disabled switch is an explicit per-guild decision.
// Keeping this separate from GUILD_AI_KEYS lets other behavior settings retain
// the global provider/default fallback while preventing cross-server toggles.
const GUILD_REQUIRED_KEYS = new Set(["aiEnabled"]);

// Keys whose DEFAULTS type is boolean. Used both to know which rows to
// canonicalise on write and which existing rows to scrub on load.
const BOOLEAN_KEYS = new Set(
  Object.entries(DEFAULTS).filter(([, v]) => typeof v === "boolean").map(([k]) => k)
);

// Collapse any recognisable boolean representation to a real JS boolean in
// `load()` so handler-side truthiness checks (`if (settings.get('foo'))`) can't
// be tricked by a legacy integer 0/1 round-trip through a TEXT column. Anything
// we don't recognise defers to the caller-supplied fallback (the DEFAULTS
// value, guaranteed boolean here) — never leaks a malformed string up the stack.
function asBool(v, fallback) {
  if (v === true  || v === "true"  || v === 1 || v === "1") return true;
  if (v === false || v === "false" || v === 0 || v === "0") return false;
  return fallback;
}

// Canonical DB form: every boolean key persists as the string "true"/"false".
// This avoids a class of bugs where a JS false round-trips through a TEXT
// binding as a non-empty string like "0" that is *truthy* in JS — leaving
// the toggle apparently stuck after a bot restart.
function canonicaliseForPersist(key, value) {
  if (BOOLEAN_KEYS.has(key) && typeof value === "boolean") return value ? "true" : "false";
  return value;
}

let _settings = { ...DEFAULTS };
let _guildSettings = {};

function guildSettingValue(key, guildId) {
  if (!guildId || !GUILD_AI_KEYS.has(key)) return undefined;
  return _guildSettings[String(guildId)]?.[key];
}

/**
 * Read an AI behavior setting for a guild.
 *
 * Most behavior values inherit global defaults, but `aiEnabled` is deliberately
 * strict: an absent guild row means disabled, never the global toggle. This
 * prevents one server's legacy/global setting from changing another server.
 */
function getForGuild(key, guildId) {
  const override = guildSettingValue(key, guildId);
  if (override !== undefined) return override;
  if (GUILD_REQUIRED_KEYS.has(key)) return DEFAULTS[key];
  return get(key);
}

function hasGuildSetting(key, guildId) {
  return Boolean(guildId && GUILD_AI_KEYS.has(key) && guildSettingValue(key, guildId) !== undefined);
}

/**
 * Migrate the legacy global AI toggle to the guilds currently known by Discord.
 * Older versions stored `aiEnabled` globally; seed that value into each current
 * guild once, then neutralize the global value so future guilds stay isolated.
 */
function migrateLegacyGuildAiEnabled(guildIds = []) {
  if (get("aiEnabled") !== true) return false;
  const ids = [...new Set(Array.from(guildIds || []).map(id => String(id || "")).filter(Boolean))];
  if (ids.length === 0) return false;

  for (const guildId of ids) {
    if (!hasGuildSetting("aiEnabled", guildId)) setForGuild(guildId, "aiEnabled", true);
  }
  set("aiEnabled", false);
  console.log(`[settings] Migrated legacy global AI enablement to ${ids.length} guild(s).`);
  return true;
}

/** Persist an AI behavior override for one guild only. */
function setForGuild(guildId, key, value) {
  if (!guildId || !GUILD_AI_KEYS.has(key)) return false;
  const normalized = BOOLEAN_KEYS.has(key) && typeof value !== "boolean"
    ? asBool(value, DEFAULTS[key])
    : value;
  const id = String(guildId);
  (_guildSettings[id] ??= {})[key] = normalized;
  db.setGuildAiSetting(id, key, canonicaliseForPersist(key, normalized))
    .catch(e => console.error("Failed to persist guild AI setting:", e));
  return true;
}

function getGuildSettings(guildId) {
  const id = String(guildId || "");
  const overrides = id ? (_guildSettings[id] || {}) : {};
  return Object.fromEntries([...GUILD_AI_KEYS].map(key => [key, getForGuild(key, guildId)]));
}

// Async: awaited once during bot startup before any command is processed.
async function load() {
  try {
    const saved = await db.getGlobalSettings();
    const guildSaved = await db.getAllGuildAiSettings();
    _guildSettings = {};
    for (const [guildId, values] of Object.entries(guildSaved || {})) {
      _guildSettings[guildId] = {};
      for (const [key, value] of Object.entries(values || {})) {
        if (GUILD_AI_KEYS.has(key)) {
          _guildSettings[guildId][key] = BOOLEAN_KEYS.has(key)
            ? asBool(value, DEFAULTS[key])
            : value;
        }
      }
    }
    _settings = { ...DEFAULTS, ...saved };
    // Normalise every boolean-keyed row to a real JS boolean, regardless of
    // how it ended up in the DB ("true"/"false" canonical, "1"/"0"/1/0 legacy).
    // Non-boolean keys pass through unchanged.
    for (const k of Object.keys(_settings)) {
      if (BOOLEAN_KEYS.has(k)) _settings[k] = asBool(_settings[k], DEFAULTS[k]);
    }
    // Heal legacy rows in-place: any boolean-keyed value that doesn't already
    // match the canonical "true"/"false" form gets re-persisted. Best-effort,
    // doesn't block startup. Without this the DB silently keeps potholes
    // forever and every restart repeats the normalisation work.
    for (const k of Object.keys(saved)) {
      if (!BOOLEAN_KEYS.has(k)) continue;
      const raw = saved[k];
      const isCanonical = raw === "true" || raw === "false";
      const canonical = isCanonical ? raw : (asBool(raw, DEFAULTS[k]) ? "true" : "false");
      if (canonical !== raw) {
        db.setGlobalSetting(k, canonical).catch(e => console.error(`[settings] Failed to migrate ${k}:`, e));
      }
    }
  } catch (e) {
    console.error("Failed to load settings from db:", e);
    _settings = { ...DEFAULTS };
    _guildSettings = {};
  }
}

// Persist all keys (used for bulk operations like reset-to-defaults).
// The in-memory cache is authoritative at runtime; persistence is best-effort.
function save() {
  const pairs = Object.entries(_settings).map(([k, v]) => [k, canonicaliseForPersist(k, v)]);
  Promise.all(pairs.map(([k, v]) => db.setGlobalSetting(k, v)))
    .catch(e => console.error("Failed to save settings to db:", e));
}

function get(key) { return _settings[key] ?? DEFAULTS[key]; }
function set(key, value) {
  _settings[key] = value;
  db.setGlobalSetting(key, canonicaliseForPersist(key, value))
    .catch(e => console.error("Failed to persist setting:", e));
}
function getAll() { return { ..._settings }; }

function getActiveProvider() {
  const id = get("aiProvider") || "groq";
  return getProvider(id) || getProvider("groq");
}

function getAiApiKey(providerId) {
  const provider = getProvider(providerId);
  if (!provider) return "";
  const stored = String(get(provider.keyField) || "").trim();
  if (stored) return stored;
  for (const envVar of getEnvVars(provider)) {
    const val = process.env[envVar];
    if (val) return val;
  }
  return "";
}

function getAiModel(providerId) {
  const provider = getProvider(providerId);
  if (!provider) return "";
  return get(provider.modelField) || provider.defaultModel;
}

function setAiModel(providerId, model) {
  const provider = getProvider(providerId);
  if (!provider || !model) return;
  set(provider.modelField, model);
}

function hydrateAiKeysFromEnv() {
  const changed = [];
  for (const meta of listProviders()) {
    const provider = getProvider(meta.id);
    if (!provider) continue;
    const current = String(get(provider.keyField) || "").trim();
    if (current) continue;
    for (const envVar of getEnvVars(provider)) {
      const val = process.env[envVar];
      if (val) {
        _settings[provider.keyField] = val;
        changed.push(provider.keyField);
        break;
      }
    }
  }
  if (changed.length) {
    // Only persist the keys that actually changed
    Promise.all(changed.map(k => db.setGlobalSetting(k, canonicaliseForPersist(k, _settings[k]))))
      .catch(e => console.error("Failed to persist AI keys:", e));
  }
}

module.exports = {
  load,
  save,
  get,
  set,
  getAll,
  getForGuild,
  getGuildSettings,
  setForGuild,
  GUILD_AI_KEYS,
  GUILD_REQUIRED_KEYS,
  hasGuildSetting,
  migrateLegacyGuildAiEnabled,
  DEFAULTS,
  AI_SYSTEM_PROMPT_DEFAULT,
  AI_SYSTEM_PROMPT_CONCISE,
  getActiveProvider,
  getAiApiKey,
  getAiModel,
  setAiModel,
  hydrateAiKeysFromEnv,
};
