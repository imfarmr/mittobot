// Music — per-guild voice queue + playback. State is lazy: a guild's player is
// created on first `play` and torn down when the queue drains or the bot is
// disconnected. Nothing here persists across restarts (an active voice session
// can't survive a process restart anyway), so there is no DB/`load()` — the
// dashboard reads live in-memory state via `getState`.
//
// Audio source: we try to resolve/stream via `play-dl` (an optional dependency).
// If it isn't installed, playback of remote sources is not possible in this
// environment — the queue + all controls still work, and `play` reports the
// limitation instead of silently doing nothing. This keeps the command surface
// fully functional whether or not the streaming lib is available.
//
// v2 additions: per-guild volume (0-200%), repeat modes (off|queue|track),
// autoplay (auto-search a similar track when the queue drains), and queue
// management (remove / clear / shuffle / skip-to) with a recently-played
// history ring.
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  entersState,
  getVoiceConnection,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  NoSubscriberBehavior,
  StreamType,
} = require("@discordjs/voice");

// Optional streaming lib. Loaded lazily & defensively so a missing/broken
// install degrades gracefully rather than crashing the bot at require time.
let playdl = null;
let playdlError = null;
try {
  playdl = require("play-dl");
} catch (e) {
  playdlError = e.message;
}

const STREAMING_AVAILABLE = !!playdl;

// guildId → { connection, player, queue:[track], current:track|null, textChannelId, voiceChannelId, volume, repeat, autoplay, history:[] }
const guilds = new Map();

const MAX_QUEUE = 100;
const MAX_HISTORY = 25;

// Repeat modes. "queue" re-queues the whole played set; "track" replays the
// current track forever; "off" drains normally.
const REPEAT_MODES = ["off", "queue", "track"];

function makeTrack({ title, url, duration, requestedBy, thumbnail }) {
  return {
    title: title || "Unknown track",
    url: url || null,
    duration: duration || 0, // seconds; 0 = unknown/live
    requestedBy: requestedBy || null, // { id, tag }
    thumbnail: thumbnail || null,
  };
}

// Resolve a free-text query or URL into a playable track descriptor. Returns
// null if nothing could be resolved (or streaming is unavailable).
async function resolveQuery(query, requestedBy) {
  if (!STREAMING_AVAILABLE) return null;
  const q = String(query || "").trim();
  if (!q) return null;
  try {
    // Direct URL: validate + read metadata.
    if (/^https?:\/\//i.test(q)) {
      const type = playdl.yt_validate ? playdl.yt_validate(q) : "video";
      if (type === "video" || type === "search") {
        const info = await playdl.video_basic_info(q);
        const d = info?.video_details;
        if (d) return makeTrack({
          title: d.title, url: d.url, duration: d.durationInSec,
          requestedBy, thumbnail: d.thumbnails?.[0]?.url,
        });
      }
      // Fall through to search for non-YouTube URLs.
    }
    // Free-text search → first result.
    const results = await playdl.search(q, { limit: 1 });
    const r = results?.[0];
    if (r) return makeTrack({
      title: r.title, url: r.url, duration: r.durationInSec,
      requestedBy, thumbnail: r.thumbnails?.[0]?.url,
    });
  } catch (e) {
    console.error("[music] resolveQuery:", e.message);
  }
  return null;
}

// Autoplay helper: when enabled and the queue is empty, search for a track
// similar to the last-played title and enqueue it. Best-effort — if the search
// fails we just let the session idle.
async function autoplayNext(guildId) {
  const state = guilds.get(guildId);
  if (!state || !state.autoplay || !STREAMING_AVAILABLE) return;
  const last = state.history[state.history.length - 1];
  if (!last?.title) return;
  try {
    const results = await playdl.search(`${last.title}`, { limit: 1 });
    const r = results?.[0];
    if (r && r.title !== last.title) {
      state.queue.push(makeTrack({
        title: r.title, url: r.url, duration: r.durationInSec,
        requestedBy: { id: "autoplay", tag: "Autoplay" },
        thumbnail: r.thumbnails?.[0]?.url,
      }));
      return true;
    }
  } catch (e) {
    console.error("[music] autoplayNext:", e.message);
  }
  return false;
}

// Build an AudioResource for a track. Throws if streaming is unavailable so the
// caller can surface a clear error instead of a silent no-op.
async function makeResource(track) {
  if (!STREAMING_AVAILABLE) {
    // STREAM STUB: without a source library we can't produce audio bytes. The
    // queue advances so controls stay consistent, but nothing is heard.
    throw new Error("streaming-unavailable");
  }
  const stream = await playdl.stream(track.url);
  const resource = createAudioResource(stream.stream, { inputType: stream.type, metadata: track });
  // Apply the guild's saved volume when the resource supports it.
  const state = [...guilds.values()].find(s => s.current === track);
  if (state && typeof resource.volume?.setVolume === "function") {
    resource.volume.setVolume((state.volume ?? 100) / 100);
  }
  return resource;
}

function getGuildState(guildId) {
  return guilds.get(guildId) || null;
}

// Ensure a voice connection + player exist for this guild, joining the given
// voice channel. Idempotent — reuses an existing session if present.
function ensureConnection(voiceChannel, textChannelId) {
  const guildId = voiceChannel.guild.id;
  let state = guilds.get(guildId);
  if (state && state.connection) {
    state.textChannelId = textChannelId || state.textChannelId;
    return state;
  }

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: true,
  });

  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
  });
  connection.subscribe(player);

  state = {
    connection,
    player,
    queue: [],
    current: null,
    textChannelId: textChannelId || null,
    voiceChannelId: voiceChannel.id,
    volume: 100,
    repeat: "off",
    autoplay: false,
    history: [],
  };
  guilds.set(guildId, state);

  // When the current resource finishes (Idle), advance the queue.
  player.on(AudioPlayerStatus.Idle, () => {
    playNext(guildId).catch(e => console.error("[music] playNext:", e.message));
  });
  player.on("error", (err) => {
    console.error("[music] player error:", err.message);
    playNext(guildId).catch(e => console.error("[music] playNext:", e.message));
  });

  // If the connection drops and can't recover, tear the session down.
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
      // Reconnecting — leave state intact.
    } catch {
      destroy(guildId);
    }
  });

  return state;
}

// Pull the next track off the queue and play it. Honors repeat + autoplay:
//   - repeat "track": re-enqueue the current track
//   - repeat "queue": recycle finished tracks back onto the queue
//   - autoplay: when the queue is empty, search a similar track
// The session stays connected so users can queue more.
async function playNext(guildId) {
  const state = guilds.get(guildId);
  if (!state) return;

  // Track-repeat: replay the current track (don't move it to history yet).
  if (state.repeat === "track" && state.current) {
    const again = state.current;
    try {
      const resource = await makeResource(again);
      state.player.play(resource);
      return;
    } catch (e) {
      console.error("[music] track-repeat error:", e.message);
      // fall through — advance normally
    }
  }

  // Move the finished track into history before pulling the next one.
  if (state.current) {
    state.history.push(state.current);
    if (state.history.length > MAX_HISTORY) state.history.shift();
    if (state.repeat === "queue") state.queue.push(state.current);
  }

  let next = state.queue.shift();

  // Autoplay fills the queue when it drains (best-effort).
  if (!next && state.autoplay) {
    await autoplayNext(guildId);
    next = state.queue.shift();
  }

  if (!next) {
    state.current = null;
    return;
  }
  state.current = next;
  try {
    const resource = await makeResource(next);
    state.player.play(resource);
  } catch (e) {
    if (e.message === "streaming-unavailable") {
      // Can't produce audio — skip so the queue doesn't stall forever.
      console.warn("[music] streaming unavailable; skipping track:", next.title);
    } else {
      console.error("[music] play error:", e.message);
    }
    state.current = null;
    // Advance to the next track (guards against a poisoned queue entry).
    return playNext(guildId);
  }
}

// Public: join a voice channel (creates the session if needed).
function join(voiceChannel, textChannelId) {
  return ensureConnection(voiceChannel, textChannelId);
}

// Public: enqueue a resolved query. Joins `voiceChannel` if not already in one.
// Returns { track, position, startedNow } or an error shape.
async function play(voiceChannel, query, requestedBy, textChannelId) {
  if (!STREAMING_AVAILABLE) {
    return { error: "streaming-unavailable", detail: playdlError };
  }
  const track = await resolveQuery(query, requestedBy);
  if (!track) return { error: "not-found" };

  const state = ensureConnection(voiceChannel, textChannelId);
  if (state.queue.length >= MAX_QUEUE) return { error: "queue-full" };

  const idle = !state.current;
  state.queue.push(track);
  if (idle) {
    await playNext(voiceChannel.guild.id);
    return { track, position: 0, startedNow: true };
  }
  return { track, position: state.queue.length, startedNow: false };
}

// Public: skip the current track. Stopping the player fires Idle → playNext.
function skip(guildId) {
  const state = guilds.get(guildId);
  if (!state || !state.current) return null;
  const skipped = state.current;
  state.player.stop(true);
  return skipped;
}

function pause(guildId) {
  const state = guilds.get(guildId);
  if (!state || !state.current) return false;
  return state.player.pause();
}

function resume(guildId) {
  const state = guilds.get(guildId);
  if (!state || !state.current) return false;
  return state.player.unpause();
}

function nowPlaying(guildId) {
  const state = guilds.get(guildId);
  return state ? state.current : null;
}

function getQueue(guildId) {
  const state = guilds.get(guildId);
  return state ? state.queue.slice() : [];
}

function isPaused(guildId) {
  const state = guilds.get(guildId);
  return !!state && state.player?.state?.status === AudioPlayerStatus.Paused;
}

// ─── Queue management (v2) ────────────────────────────────────────────────

// Remove a queue entry by 1-based position. Returns the removed track or null.
function removeFromQueue(guildId, position) {
  const state = guilds.get(guildId);
  if (!state || !Number.isInteger(position) || position < 1) return null;
  const idx = position - 1;
  if (idx >= state.queue.length) return null;
  return state.queue.splice(idx, 1)[0] || null;
}

// Clear the pending queue (keeps the current track + connection).
function clearQueue(guildId) {
  const state = guilds.get(guildId);
  if (!state) return 0;
  const cleared = state.queue.length;
  state.queue = [];
  return cleared;
}

// Fisher-Yates shuffle of the pending queue. Returns the shuffled slice.
function shuffleQueue(guildId) {
  const state = guilds.get(guildId);
  if (!state) return [];
  for (let i = state.queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [state.queue[i], state.queue[j]] = [state.queue[j], state.queue[i]];
  }
  return state.queue.slice();
}

// Jump straight to a queue position: the selected track becomes current and
// the rest of the queue after it is preserved. Returns { jumped, removed }
// describing what happened, or null on bad input.
function skipTo(guildId, position) {
  const state = guilds.get(guildId);
  if (!state || !Number.isInteger(position) || position < 1) return null;
  const idx = position - 1;
  if (idx >= state.queue.length) return null;
  const target = state.queue.splice(idx, 1)[0];
  // Discard the skipped-over tracks (positions before the target) and keep the
  // remainder of the queue intact so playback continues after the jump.
  const dropped = state.queue.splice(0, idx);
  const old = state.current;
  if (old) state.history.push(old);
  state.current = target;
  try {
    state.player.stop(true);
  } catch {}
  return { jumped: target, removed: old, dropped };
}

// ─── Volume / repeat / autoplay (v2) ───────────────────────────────────────
function setVolume(guildId, percent) {
  const state = guilds.get(guildId);
  if (!state) return null;
  const v = Math.min(Math.max(parseInt(percent, 10) || 100, 0), 200);
  state.volume = v;
  // Live-adjust the current resource if it supports volume.
  const current = state.player?.state?.resource;
  if (current && typeof current.volume?.setVolume === "function") {
    current.volume.setVolume(v / 100);
  }
  return v;
}

function setRepeat(guildId, mode) {
  const state = guilds.get(guildId);
  if (!state) return null;
  if (!REPEAT_MODES.includes(mode)) return state.repeat;
  state.repeat = mode;
  return mode;
}

function setAutoplay(guildId, enabled) {
  const state = guilds.get(guildId);
  if (!state) return null;
  state.autoplay = !!enabled;
  return state.autoplay;
}

// Public: stop playback, clear the queue, and disconnect.
function stop(guildId) {
  return destroy(guildId);
}

// Tear down a guild's session entirely.
function destroy(guildId) {
  const state = guilds.get(guildId);
  if (!state) return false;
  try { state.player?.stop(true); } catch {}
  try {
    const conn = state.connection || getVoiceConnection(guildId);
    conn?.destroy();
  } catch (e) {
    console.error("[music] destroy:", e.message);
  }
  guilds.delete(guildId);
  return true;
}

// Read-only snapshot for the dashboard/API. Never exposes live Discord objects.
function getState(guildId) {
  const state = guilds.get(guildId);
  if (!state) {
    return {
      connected: false,
      streamingAvailable: STREAMING_AVAILABLE,
      current: null,
      paused: false,
      voiceChannelId: null,
      volume: 100,
      repeat: "off",
      autoplay: false,
      history: [],
      queue: [],
    };
  }
  return {
    connected: !!state.connection,
    streamingAvailable: STREAMING_AVAILABLE,
    current: state.current,
    paused: isPaused(guildId),
    voiceChannelId: state.voiceChannelId,
    volume: state.volume,
    repeat: state.repeat,
    autoplay: state.autoplay,
    history: state.history.slice(),
    queue: state.queue.slice(),
  };
}

module.exports = {
  STREAMING_AVAILABLE,
  join,
  play,
  skip,
  stop,
  pause,
  resume,
  nowPlaying,
  getQueue,
  isPaused,
  removeFromQueue,
  clearQueue,
  shuffleQueue,
  skipTo,
  setVolume,
  setRepeat,
  setAutoplay,
  destroy,
  getState,
};
