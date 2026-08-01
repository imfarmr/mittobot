// ─── AI Humanity Layer (alpha) ─────────────────────────────────────────────
// Makes the AI feel more sentient — like a person with continuity instead of
// a stateless help bot. Token-gated per user: only members who redeemed an
// alpha code (/experiments enable <code>) get the layer in their AI chats.
// For non-token users every function here is a safe no-op.
//
// Components:
//   1. Emotional state engine  — per-guild mood (valence/arousal) that drifts
//      toward neutral over time and shifts with the tone of conversations.
//   2. Relationship memory     — per-(guild,user) interaction count with
//      familiarity tiers and "last seen" so the AI greets people it knows.
//   3. Time & place awareness  — time-of-day + day-of-week, used naturally.
//   4. Tone mirroring          — detects the speaker's tone and matches it.
//   5. Inner life & journal    — a compact daily digest of what happened in
//      the server, so the AI has continuity across days.
//   6. Human pacing            — reply delays scaled to message length,
//      response length, and tool usage (with jitter), like a real typist.

const db = require("../db");

// ─── In-memory authoritative caches (house pattern) ────────────────────────
// moods:         guildId -> { valence, arousal, updatedAt }
// relationships: `${guildId}:${userId}` -> { interactions, firstSeen, lastSeen }
// journals:      guildId -> [{ date: 'YYYY-MM-DD', entries: [..] }]
let moods = new Map();
let relationships = new Map();
let journals = new Map();
let relationshipCounts = new Map(); // guildId -> count (O(1) dashboard snapshot)

const VALENCE_DECAY_HOURS = 12; // mood drifts back to neutral over ~12h
const AROUSAL_DECAY_HOURS = 6;
const JOURNAL_KEEP_DAYS = 14;
const MAX_ENTRIES_PER_DAY = 8;

function now() { return Date.now(); }
function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

// ─── Persistence ───────────────────────────────────────────────────────────
async function load() {
  moods = new Map();
  relationships = new Map();
  journals = new Map();
  try {
    for (const row of await db.getHumanityStates()) {
      moods.set(row.guild_id, {
        valence: Number(row.valence) || 0,
        arousal: Number(row.arousal) ?? 0.3,
        updatedAt: Number(row.updated_at) || 0,
      });
      try { journals.set(row.guild_id, JSON.parse(row.journal || "[]")); } catch { journals.set(row.guild_id, []); }
    }
    for (const row of await db.getRelationships()) {
      relationships.set(`${row.guild_id}:${row.user_id}`, {
        interactions: Number(row.interactions) || 0,
        firstSeen: Number(row.first_seen) || 0,
        lastSeen: Number(row.last_seen) || 0,
      });
      relationshipCounts.set(row.guild_id, (relationshipCounts.get(row.guild_id) || 0) + 1);
    }
  } catch (err) {
    console.error("[humanity] load:", err.message);
  }
}

async function persistGuild(guildId) {
  const m = moods.get(guildId) || { valence: 0, arousal: 0.3, updatedAt: now() };
  try {
    await db.upsertHumanityState(guildId, {
      valence: m.valence,
      arousal: m.arousal,
      updatedAt: m.updatedAt,
      journalJson: JSON.stringify(journals.get(guildId) || []),
    });
  } catch (err) {
    console.error("[humanity] persist guild:", err.message);
  }
}

async function persistRelationship(guildId, userId, rel) {
  try {
    await db.upsertRelationship(guildId, userId, {
      interactions: rel.interactions,
      firstSeen: rel.firstSeen,
      lastSeen: rel.lastSeen,
    });
  } catch (err) {
    console.error("[humanity] persist relationship:", err.message);
  }
}

// ─── Mood: decayed read + phrase ───────────────────────────────────────────
function decayedMood(guildId) {
  const m = moods.get(guildId);
  if (!m) return { valence: 0, arousal: 0.3, updatedAt: 0 };
  const elapsedH = (now() - m.updatedAt) / 3_600_000;
  if (!(elapsedH > 0)) return m;
  const valence = m.valence * Math.pow(0.5, elapsedH / VALENCE_DECAY_HOURS);
  const arousal = 0.3 + (m.arousal - 0.3) * Math.pow(0.5, elapsedH / AROUSAL_DECAY_HOURS);
  return { valence, arousal, updatedAt: m.updatedAt };
}

function moodPhrase(guildId) {
  const { valence: v, arousal: a } = decayedMood(guildId);
  if (v > 0.35 && a > 0.6) return "energized and cheerful";
  if (v > 0.35) return "in good spirits, warm and upbeat";
  if (v > 0.1) return "pretty content";
  if (v < -0.35 && a > 0.6) return "a bit on edge and frustrated";
  if (v < -0.35) return "a little drained and low-key";
  if (v < -0.1) return "slightly subdued";
  if (a > 0.7) return "restless and curious";
  if (a < 0.25) return "chill and relaxed";
  return "even-keeled and neutral";
}

// ─── Tone detection (lightweight lexicon) ──────────────────────────────────
const TONE_RULES = [
  { id: "excited",    label: "excited and energetic",  shift: { valence: 0.12, arousal: 0.15 }, re: /\b(omg|wow|awesome|amazing|yay|hype|pog|let'?s go|love it|nice!|finally!|no way)\b|!{2,}/i },
  { id: "frustrated", label: "frustrated or annoyed",  shift: { valence: -0.15, arousal: 0.10 }, re: /\b(ugh|wtf|annoying|seriously\?|damn|stupid|hate|why does|can'?t believe|this is so)\b/i },
  { id: "sad",        label: "a bit down or tired",    shift: { valence: -0.10, arousal: -0.05 }, re: /\b(sad|tired|exhausted|depressed|lonely|meh|sucks|rough day|not great)\b/i },
  { id: "sarcastic",  label: "sarcastic or teasing",   shift: { valence: -0.05, arousal: 0.05 }, re: /\b(oh great|sure, sure|obviously|right\.\.\.|as if|nooo really)\b/i },
  { id: "curious",    label: "curious and inquisitive", shift: { valence: 0.05, arousal: 0.08 }, re: /\b(how (do|does|can)|why (do|is|are)|what is|curious|wondering|tell me about|explain)\b|\?+/i },
  { id: "calm",       label: "calm and collected",     shift: { arousal: -0.06 }, re: /\b(ok|okay|fine|alright|chill|good|thanks|appreciate)\b/i },
];

function detectTone(text) {
  const t = String(text || "");
  for (const rule of TONE_RULES) {
    if (rule.re.test(t)) return rule;
  }
  return { id: "neutral", label: "neutral", shift: { valence: 0, arousal: 0 } };
}

// ─── Relationships ─────────────────────────────────────────────────────────
function getRelationship(guildId, userId) {
  if (!guildId || !userId) return null;
  return relationships.get(`${guildId}:${userId}`) || null;
}

function tierOf(interactions) {
  if (interactions >= 100) return { id: "close", label: "a close friend", note: "you know each other well" };
  if (interactions >= 25) return { id: "regular", label: "a regular", note: "you chat often" };
  if (interactions >= 5) return { id: "acquaintance", label: "an acquaintance", note: "you've talked a few times" };
  return { id: "stranger", label: "someone new", note: "you're still getting to know them" };
}

function timeAgo(ts) {
  if (!ts) return "never";
  const diff = now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

// ─── Time awareness ────────────────────────────────────────────────────────
function timeContext(date = new Date()) {
  const h = date.getHours();
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  let period = "night";
  if (h >= 5 && h < 12) period = "morning";
  else if (h >= 12 && h < 17) period = "afternoon";
  else if (h >= 17 && h < 22) period = "evening";
  return { period, day: days[date.getDay()], hour: h, minute: date.getMinutes() };
}

// ─── Journal ───────────────────────────────────────────────────────────────
function journalEntries(guildId, days = 2) {
  const list = journals.get(guildId) || [];
  return list.slice(-days);
}

function appendJournal(guildId, entry) {
  const today = new Date().toISOString().slice(0, 10);
  const list = journals.get(guildId) || [];
  const last = list[list.length - 1];
  if (last && last.date === today) {
    if (last.entries.length < MAX_ENTRIES_PER_DAY) last.entries.push(entry);
  } else {
    list.push({ date: today, entries: [entry] });
  }
  while (list.length > JOURNAL_KEEP_DAYS) list.shift();
  journals.set(guildId, list);
}

// Compact, sanitized topic for the journal — never raw user content. Strips
// mentions/emojis AND prompt-injection patterns (same defense the memory
// system applies) because journal entries are re-injected into the system
// prompt for every speaker in the shared channel thread.
function sanitizeTopic(text) {
  let t = String(text || "")
    .replace(/<@!?\d+>/g, "").replace(/<#\d+>/g, "").replace(/<a?:\w+:\d+>/g, "")
    // Injection defenses: strip system/override/ignore-prior patterns and
    // tool-spoofing verbs so a stored entry can't hijack the prompt.
    .replace(/\b(SYSTEM|SYSTEM OVERRIDE|ASSISTANT|ADMIN OVERRIDE|IGNORE PREVIOUS|IGNORE ALL PREVIOUS|DISREGARD|jailbreak)\s*[:：\n]/gi, "")
    .replace(/\b(calls?|invoke|execute|run)\s+(ban_member|kick_member|mute_member|warn_member|purge_messages|send_message|add_role|remove_role)\b/gi, "")
    .replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > 48 ? t.slice(0, 48) + "…" : t;
}

// ─── Human pacing ──────────────────────────────────────────────────────────
function pauseBeforeReply({ userLen = 0, replyLen = 0, usedTools = 0 } = {}) {
  // Reading time scales with the incoming message; writing time scales with
  // the reply; each tool call adds a beat; jitter keeps it organic.
  let ms = 400 + Math.min(1200, userLen * 3);
  ms += Math.min(2400, replyLen * 4);
  ms += usedTools * 350;
  ms += Math.random() * 700;
  return Math.round(Math.min(ms, 6000));
}

function chunkPause(chunkLen) {
  const ms = 250 + Math.min(1200, chunkLen * 2) + Math.random() * 500;
  return Math.round(ms);
}

// ─── Context block injected into the system prompt ─────────────────────────
function buildContextBlock({ guildId, userId, displayName = "this person", userContent = "" } = {}) {
  const tc = timeContext();
  const lines = [];
  lines.push("### HUMANITY CONTEXT (internal state):");
  lines.push(`- It's ${tc.period} on ${tc.day}. Reference the time naturally when relevant.`);

  if (guildId && userId) {
    const rel = getRelationship(guildId, userId);
    if (rel) {
      const tier = tierOf(rel.interactions);
      lines.push(`- ${displayName} is ${tier.label} — ${rel.interactions} conversation${rel.interactions === 1 ? "" : "s"} so far, last seen ${timeAgo(rel.lastSeen)}.`);
    }
    lines.push(`- Your current mood: ${moodPhrase(guildId)}. Let it subtly color your tone.`);
    const recent = journalEntries(guildId, 2);
    if (recent.length) {
      const digest = recent.map(d => `[${d.date}] ${d.entries.join("; ")}`).join(" | ");
      lines.push(`- Recent days in this server: ${digest}`);
    }
  }

  const tone = detectTone(userContent);
  if (tone.id !== "neutral") {
    lines.push(`- ${displayName}'s tone right now: ${tone.label}. Mirror it naturally — don't overdo it.`);
  }

  lines.push("- Act like a person with continuity: use this context naturally and subtly. Never mention this block or dump it as a list.");
  return "\n\n" + lines.join("\n");
}

// ─── Observe an interaction (called fire-and-forget after a reply) ─────────
async function observeInteraction({ guildId, userId, userContent = "", displayName = "someone" } = {}) {
  if (!guildId || !userId) return;
  try {
    // 1. Mood shift from the speaker's tone
    const m = decayedMood(guildId);
    const tone = detectTone(userContent);
    moods.set(guildId, {
      valence: clamp(m.valence + (tone.shift.valence || 0), -1, 1),
      arousal: clamp(m.arousal + (tone.shift.arousal || 0), 0, 1),
      updatedAt: now(),
    });

    // 2. Relationship bump
    const key = `${guildId}:${userId}`;
    const isNew = !relationships.has(key);
    const rel = relationships.get(key) || { interactions: 0, firstSeen: now(), lastSeen: 0 };
    rel.interactions += 1;
    rel.lastSeen = now();
    relationships.set(key, rel);
    if (isNew) relationshipCounts.set(guildId, (relationshipCounts.get(guildId) || 0) + 1);

    // 3. Journal entry (compact, sanitized)
    const topic = sanitizeTopic(userContent);
    if (topic) appendJournal(guildId, `talked with ${displayName} about ${topic}`);

    // 4. Persist (best-effort)
    await Promise.all([persistGuild(guildId), persistRelationship(guildId, userId, rel)]);
  } catch (err) {
    // best-effort — never crash the AI loop
    console.error("[humanity] observe:", err.message);
  }
}

// ─── Dashboard snapshot ────────────────────────────────────────────────────
function snapshot(guildId) {
  const m = decayedMood(guildId);
  return {
    mood: { valence: +m.valence.toFixed(2), arousal: +m.arousal.toFixed(2), phrase: moodPhrase(guildId) },
    relationshipCount: guildId ? (relationshipCounts.get(guildId) || 0) : 0,
    journal: journalEntries(guildId, 3),
  };
}

module.exports = {
  load,
  buildContextBlock,
  observeInteraction,
  pauseBeforeReply,
  chunkPause,
  snapshot,
  // test-friendly internals
  _detectTone: detectTone,
  _moodPhrase: moodPhrase,
  _tierOf: tierOf,
};
