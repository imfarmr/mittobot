// Music commands — join the caller's voice channel and control playback.
// Thin command layer over `src/music.js` (all voice/queue logic lives there).
// Category "fun" so it can be toggled off with the other fun features.
// v2 surface: queue management (remove/clear/shuffle/skip-to), volume,
// repeat modes, autoplay, and lyrics lookup.
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const music = require("../music");
const theme = require("../theme");

// Format seconds as m:ss / h:mm:ss. 0 (unknown/live) → "live".
function fmtDuration(sec) {
  if (!sec || sec <= 0) return "live";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const pad = n => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// Resolve the caller's current voice channel, or null. Works for both message
// and interaction sources (both carry a GuildMember at `.member`).
function callerVoiceChannel(member) {
  return member?.voice?.channel || null;
}

function botCanJoin(voiceChannel, meId) {
  const perms = voiceChannel.permissionsFor(meId);
  if (!perms) return true; // be permissive if we can't compute
  return perms.has(PermissionFlagsBits.Connect) && perms.has(PermissionFlagsBits.Speak);
}

// Shared handlers, source-agnostic. `reply(embed)` abstracts message vs slash.
async function doPlay(guild, member, query, textChannelId, reply) {
  const vc = callerVoiceChannel(member);
  if (!vc) return reply(theme.error(guild.id, "You need to be in a voice channel first."));
  if (!query) return reply(theme.error(guild.id, "What should I play? `$play <song name or url>`"));
  if (!botCanJoin(vc, guild.members.me?.id || member.client.user.id))
    return reply(theme.error(guild.id, `I need **Connect** and **Speak** permissions in **${vc.name}**.`));

  const res = await music.play(vc, query, { id: member.id, tag: member.user.tag }, textChannelId);
  if (res.error === "streaming-unavailable")
    return reply(theme.error(guild.id, "Music streaming isn't available on this instance (the `play-dl` library isn't installed). The queue and controls work, but audio can't be streamed."));
  if (res.error === "not-found")
    return reply(theme.error(guild.id, "Couldn't find anything for that query."));
  if (res.error === "queue-full")
    return reply(theme.error(guild.id, "The queue is full (100 tracks). Try again later."));

  const t = res.track;
  if (res.startedNow)
    return reply(theme.success(guild.id, `▶️ Now playing **${t.title}** \`[${fmtDuration(t.duration)}]\``));
  return reply(theme.success(guild.id, `➕ Queued **${t.title}** \`[${fmtDuration(t.duration)}]\` — position **${res.position}**`));
}

function doSkip(guild, member, reply) {
  if (!callerVoiceChannel(member)) return reply(theme.error(guild.id, "You need to be in a voice channel."));
  const skipped = music.skip(guild.id);
  if (!skipped) return reply(theme.error(guild.id, "Nothing is playing."));
  return reply(theme.success(guild.id, `⏭️ Skipped **${skipped.title}**.`));
}

function doStop(guild, member, reply) {
  if (!callerVoiceChannel(member)) return reply(theme.error(guild.id, "You need to be in a voice channel."));
  const ok = music.stop(guild.id);
  if (!ok) return reply(theme.error(guild.id, "I'm not connected to a voice channel."));
  return reply(theme.success(guild.id, "⏹️ Stopped playback, cleared the queue, and left the channel."));
}

function doPause(guild, member, reply) {
  if (!callerVoiceChannel(member)) return reply(theme.error(guild.id, "You need to be in a voice channel."));
  const ok = music.pause(guild.id);
  return reply(ok ? theme.success(guild.id, "⏸️ Paused.") : theme.error(guild.id, "Nothing is playing."));
}

function doResume(guild, member, reply) {
  if (!callerVoiceChannel(member)) return reply(theme.error(guild.id, "You need to be in a voice channel."));
  const ok = music.resume(guild.id);
  return reply(ok ? theme.success(guild.id, "▶️ Resumed.") : theme.error(guild.id, "Nothing is paused."));
}

// $volume <0-200> — set (or show) the playback volume.
function doVolume(guild, member, arg, reply) {
  const vc = callerVoiceChannel(member);
  if (!vc) return reply(theme.error(guild.id, "You need to be in a voice channel."));
  if (!arg) {
    const state = music.getState(guild.id);
    return reply(theme.info(guild.id, `🔊 Current volume is **${state.volume ?? 100}%**. Use \`$volume <0-200>\` to change it.`));
  }
  const v = parseInt(arg, 10);
  if (!Number.isInteger(v) || v < 0 || v > 200) return reply(theme.error(guild.id, "Volume must be a number between 0 and 200."));
  const set = music.setVolume(guild.id, v);
  return reply(theme.success(guild.id, `🔊 Volume set to **${set}%**.`));
}

// $repeat <off|queue|track> — cycle or set the repeat mode.
function doRepeat(guild, member, arg, reply) {
  const vc = callerVoiceChannel(member);
  if (!vc) return reply(theme.error(guild.id, "You need to be in a voice channel."));
  const current = music.getState(guild.id).repeat || "off";
  const mode = arg ? String(arg).toLowerCase() : null;
  if (!mode || !["off", "queue", "track"].includes(mode)) {
    return reply(theme.info(guild.id,
      `🔁 Repeat is currently **${current}**. Options: \`off\` (default), \`queue\` (loop the played tracks), \`track\` (loop the current song).`));
  }
  const set = music.setRepeat(guild.id, mode);
  return reply(theme.success(guild.id, `🔁 Repeat mode set to **${set}**.`));
}

// $autoplay [on|off] — toggle auto-search when the queue drains.
function doAutoplay(guild, member, arg, reply) {
  const vc = callerVoiceChannel(member);
  if (!vc) return reply(theme.error(guild.id, "You need to be in a voice channel."));
  const current = music.getState(guild.id).autoplay || false;
  if (!arg) {
    return reply(theme.info(guild.id, `🎧 Autoplay is **${current ? "on" : "off"}**. Use \`$autoplay on|off\` to toggle it.`));
  }
  const on = /^(on|true|1|yes)$/i.test(arg);
  const off = /^(off|false|0|no)$/i.test(arg);
  if (!on && !off) return reply(theme.error(guild.id, "Usage: `$autoplay on` or `$autoplay off`."));
  const set = music.setAutoplay(guild.id, on);
  return reply(theme.success(guild.id, `🎧 Autoplay **${set ? "enabled" : "disabled"}**. When the queue drains I'll try to keep the music going.`));
}

// $remove <position> — remove a specific queued track.
function doRemove(guild, member, arg, reply) {
  const vc = callerVoiceChannel(member);
  if (!vc) return reply(theme.error(guild.id, "You need to be in a voice channel."));
  const pos = parseInt(arg, 10);
  if (!Number.isInteger(pos) || pos < 1) return reply(theme.error(guild.id, "Usage: `$remove <position>` — the number shown next to the track in `$queue`."));
  const removed = music.removeFromQueue(guild.id, pos);
  if (!removed) return reply(theme.error(guild.id, `No track at position **${pos}**. Check \`$queue\`.`));
  return reply(theme.success(guild.id, `🗑️ Removed **${removed.title}** from the queue.`));
}

// $clear — empty the pending queue (keeps the current track playing).
function doClear(guild, member, reply) {
  const vc = callerVoiceChannel(member);
  if (!vc) return reply(theme.error(guild.id, "You need to be in a voice channel."));
  const cleared = music.clearQueue(guild.id);
  if (cleared === 0) return reply(theme.info(guild.id, "The queue is already empty."));
  return reply(theme.success(guild.id, `🧹 Cleared **${cleared}** track${cleared === 1 ? "" : "s"} from the queue.`));
}

// $shuffle — randomize the pending queue.
function doShuffle(guild, member, reply) {
  const vc = callerVoiceChannel(member);
  if (!vc) return reply(theme.error(guild.id, "You need to be in a voice channel."));
  const q = music.shuffleQueue(guild.id);
  if (!q.length) return reply(theme.info(guild.id, "There's nothing to shuffle yet."));
  return reply(theme.success(guild.id, `🔀 Shuffled **${q.length}** queued track${q.length === 1 ? "" : "s"}.`));
}

// $skipto <position> — jump straight to a queued track.
function doSkipTo(guild, member, arg, reply) {
  const vc = callerVoiceChannel(member);
  if (!vc) return reply(theme.error(guild.id, "You need to be in a voice channel."));
  const pos = parseInt(arg, 10);
  if (!Number.isInteger(pos) || pos < 1) return reply(theme.error(guild.id, "Usage: `$skipto <position>`."));
  const result = music.skipTo(guild.id, pos);
  if (!result) return reply(theme.error(guild.id, `No track at position **${pos}**.`));
  return reply(theme.success(guild.id, `⏭️ Jumped to **${result.jumped.title}**.`));
}

// $lyrics [query] — fetch lyrics for the current track or a search query.
// Uses the free lyrics.ovh API (no key); parses "Artist - Title" from track
// titles when possible and degrades gracefully when lyrics aren't available.
async function doLyrics(guild, member, arg, reply) {
  let query = arg;
  let fromCurrent = false;
  if (!query) {
    const current = music.nowPlaying(guild.id);
    if (!current) return reply(theme.error(guild.id, "Nothing is playing, so provide a search: `$lyrics <artist - title>`."));
    query = current.title;
    fromCurrent = true;
  }

  // Split "Artist - Title" heuristically; fall back to the whole string as the title.
  let artist = "";
  let title = query;
  const m = query.match(/^(.*?)\s+[-–—]\s+(.+)$/);
  if (m) { artist = m[1].trim(); title = m[2].trim(); }

  const tryFetch = async (art, ttl) => {
    const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(art || " ")}/${encodeURIComponent(ttl)}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "mittobot-music/2.0" } });
      if (!res.ok) return null;
      const json = await res.json();
      return json.lyrics ? String(json.lyrics).replace(/\r/g, "").trim().slice(0, 5000) : null;
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    // Try "Artist - Title" first; if that misses, retry with the raw query as
    // the song name so artist-less queries still have a chance.
    let text = artist ? await tryFetch(artist, title) : null;
    let usedArtist = artist;
    if (!text) {
      text = await tryFetch("", title);
      usedArtist = "";
    }
    if (!text) throw new Error("no lyrics");

    const embed = theme.embed(guild.id, "accent", text.slice(0, 3800))
      .setTitle(`🎤 ${title}`)
      .setURL(fromCurrent && music.nowPlaying(guild.id)?.url || undefined)
      .setFooter({ text: usedArtist ? `by ${usedArtist}` : "Lyrics via lyrics.ovh" });
    return reply(embed);
  } catch {
    return reply(theme.error(guild.id, `Couldn't find lyrics for **${query.slice(0, 60)}**. Try \`$lyrics <artist - title>\`.`));
  }
}

function nowPlayingEmbed(guild) {
  const current = music.nowPlaying(guild.id);
  const state = music.getState(guild.id);
  if (!current) return theme.info(guild.id, "Nothing is playing right now.");
  const by = current.requestedBy ? ` • requested by ${current.requestedBy.tag}` : "";
  const extras = [];
  if (state.volume != null && state.volume !== 100) extras.push(`🔊 ${state.volume}%`);
  if (state.repeat !== "off") extras.push(`🔁 ${state.repeat}`);
  if (state.autoplay) extras.push("🎧 autoplay");
  const e = theme.embed(guild.id, "accent",
    `**${current.title}**\n\`[${fmtDuration(current.duration)}]\`${by}`).setTitle("🎵 Now Playing");
  if (current.thumbnail) e.setThumbnail(current.thumbnail);
  if (current.url) e.setURL?.(current.url);
  if (extras.length) e.addFields({ name: "Controls", value: extras.join(" · "), inline: true });
  return e;
}

function queueEmbed(guild) {
  const current = music.nowPlaying(guild.id);
  const state = music.getState(guild.id);
  const queue = music.getQueue(guild.id);
  if (!current && !queue.length) return theme.info(guild.id, "The queue is empty. Add something with `$play <query>`.");
  const lines = [];
  if (current) lines.push(`**Now:** ${current.title} \`[${fmtDuration(current.duration)}]\``);
  queue.slice(0, 15).forEach((t, i) => lines.push(`\`${i + 1}.\` ${t.title} \`[${fmtDuration(t.duration)}]\``));
  if (queue.length > 15) lines.push(`…and **${queue.length - 15}** more`);
  const header = `🎶 Queue (${queue.length})`;
  const e = theme.embed(guild.id, "info", lines.join("\n")).setTitle(header);
  const footer = [];
  if (state.volume != null) footer.push(`🔊 ${state.volume}%`);
  if (state.repeat !== "off") footer.push(`🔁 ${state.repeat}`);
  if (state.autoplay) footer.push("🎧 autoplay");
  if (footer.length) e.setFooter({ text: footer.join(" · ") });
  return e;
}

// Prefix commands stay as individual `$play` / `$skip` / … entries (so their
// short aliases keep working); the slash surface is consolidated into a single
// `/music` subcommand group below to stay under Discord's 100 global-command cap.
module.exports = [
  {
    name: "play",
    description: "Play a song or add it to the queue",
    aliases: ["p"],
    category: "fun",
    prefix: async (m, args) => {
      const reply = embed => m.reply({ embeds: [embed] });
      return doPlay(m.guild, m.member, args.join(" "), m.channel.id, reply);
    },
  },
  {
    name: "skip",
    description: "Skip the current track",
    category: "fun",
    prefix: async (m) => doSkip(m.guild, m.member, e => m.reply({ embeds: [e] })),
  },
  {
    name: "stop",
    description: "Stop playback, clear the queue, and leave the voice channel",
    category: "fun",
    prefix: async (m) => doStop(m.guild, m.member, e => m.reply({ embeds: [e] })),
  },
  {
    name: "pause",
    description: "Pause playback",
    category: "fun",
    prefix: async (m) => doPause(m.guild, m.member, e => m.reply({ embeds: [e] })),
  },
  {
    name: "resume",
    description: "Resume playback",
    aliases: ["unpause"],
    category: "fun",
    prefix: async (m) => doResume(m.guild, m.member, e => m.reply({ embeds: [e] })),
  },
  {
    name: "volume",
    description: "Set or show the playback volume (0-200%)",
    aliases: ["vol"],
    category: "fun",
    prefix: async (m, args) => doVolume(m.guild, m.member, args[0], e => m.reply({ embeds: [e] })),
  },
  {
    name: "repeat",
    description: "Loop playback: off, queue, or track",
    aliases: ["loop"],
    category: "fun",
    prefix: async (m, args) => doRepeat(m.guild, m.member, args[0], e => m.reply({ embeds: [e] })),
  },
  {
    name: "autoplay",
    description: "Toggle auto-playing similar tracks when the queue drains",
    category: "fun",
    prefix: async (m, args) => doAutoplay(m.guild, m.member, args[0], e => m.reply({ embeds: [e] })),
  },
  {
    name: "remove",
    description: "Remove a track from the queue by position",
    aliases: ["rm"],
    category: "fun",
    prefix: async (m, args) => doRemove(m.guild, m.member, args[0], e => m.reply({ embeds: [e] })),
  },
  {
    name: "clear",
    description: "Clear the pending queue",
    category: "fun",
    prefix: async (m) => doClear(m.guild, m.member, e => m.reply({ embeds: [e] })),
  },
  {
    name: "shuffle",
    description: "Shuffle the pending queue",
    aliases: ["shuf"],
    category: "fun",
    prefix: async (m) => doShuffle(m.guild, m.member, e => m.reply({ embeds: [e] })),
  },
  {
    name: "skipto",
    description: "Jump straight to a queued track by position",
    aliases: ["jump"],
    category: "fun",
    prefix: async (m, args) => doSkipTo(m.guild, m.member, args[0], e => m.reply({ embeds: [e] })),
  },
  {
    name: "lyrics",
    description: "Show lyrics for the current track or a search query",
    aliases: ["ly"],
    category: "fun",
    prefix: async (m, args) => doLyrics(m.guild, m.member, args.join(" "), e => m.reply({ embeds: [e] })),
  },
  {
    name: "queue",
    description: "Show the music queue",
    aliases: ["q"],
    category: "fun",
    prefix: async (m) => m.reply({ embeds: [queueEmbed(m.guild)] }),
  },
  {
    name: "nowplaying",
    description: "Show the currently playing track",
    aliases: ["np"],
    category: "fun",
    prefix: async (m) => m.reply({ embeds: [nowPlayingEmbed(m.guild)] }),
  },
  {
    // Consolidated slash surface: `/music play|skip|stop|pause|resume|queue|nowplaying|volume|repeat|autoplay|remove|clear|shuffle|skipto|lyrics`.
    name: "music",
    description: "Music player controls",
    category: "fun",
    slash: new SlashCommandBuilder().setName("music").setDescription("Music player controls")
      .addSubcommand(c => c.setName("play").setDescription("Play a song or add it to the queue")
        .addStringOption(o => o.setName("query").setDescription("Song name or URL").setRequired(true)))
      .addSubcommand(c => c.setName("skip").setDescription("Skip the current track"))
      .addSubcommand(c => c.setName("stop").setDescription("Stop playback and leave the voice channel"))
      .addSubcommand(c => c.setName("pause").setDescription("Pause playback"))
      .addSubcommand(c => c.setName("resume").setDescription("Resume playback"))
      .addSubcommand(c => c.setName("queue").setDescription("Show the music queue"))
      .addSubcommand(c => c.setName("nowplaying").setDescription("Show the currently playing track"))
      .addSubcommand(c => c.setName("volume").setDescription("Set the playback volume (0-200)")
        .addIntegerOption(o => o.setName("percent").setDescription("0-200").setMinValue(0).setMaxValue(200)))
      .addSubcommand(c => c.setName("repeat").setDescription("Loop playback")
        .addStringOption(o => o.setName("mode").setDescription("off | queue | track")
          .addChoices({ name: "Off", value: "off" }, { name: "Queue", value: "queue" }, { name: "Track", value: "track" })))
      .addSubcommand(c => c.setName("autoplay").setDescription("Auto-play similar tracks when the queue drains")
        .addStringOption(o => o.setName("state").setDescription("on or off")
          .addChoices({ name: "On", value: "on" }, { name: "Off", value: "off" })))
      .addSubcommand(c => c.setName("remove").setDescription("Remove a track from the queue")
        .addIntegerOption(o => o.setName("position").setDescription("Position in the queue").setRequired(true).setMinValue(1)))
      .addSubcommand(c => c.setName("clear").setDescription("Clear the pending queue"))
      .addSubcommand(c => c.setName("shuffle").setDescription("Shuffle the pending queue"))
      .addSubcommand(c => c.setName("skipto").setDescription("Jump to a queued track")
        .addIntegerOption(o => o.setName("position").setDescription("Position in the queue").setRequired(true).setMinValue(1)))
      .addSubcommand(c => c.setName("lyrics").setDescription("Show lyrics for the current track or a query")
        .addStringOption(o => o.setName("query").setDescription("Artist - Title (optional; defaults to current track)"))),
    execute: async (i) => {
      const sub = i.options.getSubcommand();
      const reply = e => i.reply({ embeds: [e], flags: 64 });
      const replyPublic = e => i.reply({ embeds: [e] });

      if (sub === "play") {
        await i.deferReply();
        return doPlay(i.guild, i.member, i.options.getString("query"), i.channel.id, e => i.editReply({ embeds: [e] }));
      }
      switch (sub) {
        case "skip": return doSkip(i.guild, i.member, reply);
        case "stop": return doStop(i.guild, i.member, reply);
        case "pause": return doPause(i.guild, i.member, reply);
        case "resume": return doResume(i.guild, i.member, reply);
        case "queue": return replyPublic(queueEmbed(i.guild));
        case "nowplaying": return replyPublic(nowPlayingEmbed(i.guild));
        case "volume": return doVolume(i.guild, i.member, i.options.getInteger("percent") != null ? String(i.options.getInteger("percent")) : null, reply);
        case "repeat": return doRepeat(i.guild, i.member, i.options.getString("mode"), reply);
        case "autoplay": return doAutoplay(i.guild, i.member, i.options.getString("state"), reply);
        case "remove": return doRemove(i.guild, i.member, String(i.options.getInteger("position")), reply);
        case "clear": return doClear(i.guild, i.member, reply);
        case "shuffle": return doShuffle(i.guild, i.member, reply);
        case "skipto": return doSkipTo(i.guild, i.member, String(i.options.getInteger("position")), reply);
        case "lyrics": return doLyrics(i.guild, i.member, i.options.getString("query") || "", replyPublic);
      }
    },
  },
];
