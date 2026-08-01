// Social Connectors — announce new RSS / YouTube / Twitch / Reddit / Bluesky
// posts to a channel. A single setInterval tick (index.js) calls poll(client)
// every few minutes; it walks every connector row, checks the source for
// something newer than the stored `last_seen`, and posts to the connector's
// announce channel. State is DB-only (no in-memory cache needed): the tick is
// infrequent and reads are cheap, and keeping last_seen in SQLite makes
// announcements idempotent across restarts. Each connector is polled inside its
// own try/catch so one broken feed never stalls the rest of the loop.
//
// v2 additions: Reddit + Bluesky platforms, rich embed announcements (title +
// color + thumbnail) and include/exclude keyword filters on the post title.
const { EmbedBuilder } = require("discord.js");
const db = require("./db");
const safe = require("./safe");
const settings = require("./settings");

const DEFAULT_TEMPLATE = "📢 New post: **{title}**\n{link}";

// Platform metadata for the dashboard (labels + target hints).
const PLATFORM_META = {
  rss:     { label: "RSS Feed" },
  youtube: { label: "YouTube" },
  twitch:  { label: "Twitch" },
  reddit:  { label: "Reddit" },
  bluesky: { label: "Bluesky" },
};

// ── HTTP helper (global fetch + timeout; no new deps) ─────────────────────
async function fetchWithTimeout(url, opts = {}, ms = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── Tiny RSS/Atom parser ──────────────────────────────────────────────────
// We only need the newest entry, so pull the first <item> (RSS) or <entry>
// (Atom) and read a stable id + title + link out of it with light regex. This
// intentionally avoids an XML dependency; feeds we target (generic RSS +
// YouTube's Atom feed) are well-formed enough for this.
function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
  return m ? decodeEntities(stripCdata(m[1]).trim()) : "";
}
function stripCdata(s) {
  return String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}
function decodeEntities(s) {
  return String(s)
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

// Returns { id, title, link, image } for the newest feed entry, or null.
function parseFirstFeedItem(xml) {
  const itemMatch = xml.match(/<item[\s>][\s\S]*?<\/item>/i) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/i);
  if (!itemMatch) return null;
  const block = itemMatch[0];

  const title = tag(block, "title") || "(untitled)";

  // Link: RSS uses <link>url</link>; Atom uses <link href="url"/> (prefer the
  // alternate/text-html rel, falling back to the first href we find).
  let link = tag(block, "link");
  if (!link) {
    const alt = block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i)
      || block.match(/<link[^>]*href=["']([^"']+)["']/i);
    if (alt) link = decodeEntities(alt[1]);
  }

  // Stable id: prefer explicit guid/id, then a platform-specific video id, then
  // fall back to the link so we can still de-dupe.
  const id = tag(block, "guid")
    || tag(block, "yt:videoId")
    || tag(block, "id")
    || link
    || title;

  // First image (media:content / media:thumbnail / enclosure).
  let image = null;
  const mc = block.match(/<media:content[^>]*url=["']([^"']+)["']/i)
    || block.match(/<media:thumbnail[^>]*url=["']([^"']+)["']/i)
    || block.match(/<enclosure[^>]*url=["']([^"']+)["']/i);
  if (mc) image = decodeEntities(mc[1]);

  return { id: id || null, title, link: link || "", image };
}

// ── Twitch (Helix) ─────────────────────────────────────────────────────────
// App access token cached in-memory until shortly before expiry. Credentials
// come from settings (twitchClientId/twitchClientSecret) or the matching env
// vars; if neither is present, twitch connectors are skipped silently.
let _twitchToken = { value: null, expiresAt: 0 };

function twitchCreds() {
  const clientId = settings.get("twitchClientId") || process.env.TWITCH_CLIENT_ID || "";
  const clientSecret = settings.get("twitchClientSecret") || process.env.TWITCH_CLIENT_SECRET || "";
  return { clientId: String(clientId).trim(), clientSecret: String(clientSecret).trim() };
}

async function getTwitchToken() {
  const { clientId, clientSecret } = twitchCreds();
  if (!clientId || !clientSecret) return null; // not configured — caller skips
  if (_twitchToken.value && Date.now() < _twitchToken.expiresAt) return _twitchToken.value;

  const url = `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(clientId)}`
    + `&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`;
  const res = await fetchWithTimeout(url, { method: "POST" });
  if (!res.ok) throw new Error(`twitch token HTTP ${res.status}`);
  const json = await res.json();
  if (!json.access_token) throw new Error("twitch token missing");
  // Refresh a minute early to avoid using a just-expired token mid-request.
  _twitchToken = { value: json.access_token, expiresAt: Date.now() + Math.max(0, (json.expires_in || 3600) - 60) * 1000 };
  return _twitchToken.value;
}

// Returns the live stream object ({ id, title, ... }) for a login, or null when
// offline / not configured.
async function fetchTwitchStream(login) {
  const { clientId } = twitchCreds();
  const token = await getTwitchToken();
  if (!token) return null;
  const res = await fetchWithTimeout(`https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(login)}`, {
    headers: { "Client-ID": clientId, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`twitch streams HTTP ${res.status}`);
  const json = await res.json();
  return (json.data && json.data[0]) || null;
}

// ── Reddit (public JSON API) ───────────────────────────────────────────────
// target is a subreddit name (with or without r/). No auth required, but the
// API wants a descriptive User-Agent.
async function fetchRedditPost(target) {
  const sub = String(target).replace(/^\/?r\//, "").replace(/\/.*$/, "").trim().toLowerCase();
  if (!sub) return null;
  const res = await fetchWithTimeout(`https://www.reddit.com/r/${encodeURIComponent(sub)}/new.json?limit=1`, {
    headers: { "User-Agent": "mittobot-social/1.0" },
  });
  if (!res.ok) throw new Error(`reddit HTTP ${res.status}`);
  const json = await res.json();
  const post = json?.data?.children?.[0]?.data;
  if (!post) return null;
  return {
    id: `t3_${post.id}`,
    title: post.title || "(untitled post)",
    link: `https://www.reddit.com${post.permalink || ""}`,
    image: (post.url_overridden_by_dest && /\.(png|jpe?g|gif|webp)$/i.test(post.url_overridden_by_dest)) ? post.url_overridden_by_dest : null,
  };
}

// ── Bluesky (public ATProto API) ───────────────────────────────────────────
// target is a handle (e.g. bsky.app). The public API needs no auth token.
async function fetchBlueskyPost(target) {
  const handle = String(target).trim().replace(/^@/, "");
  if (!handle) return null;
  const res = await fetchWithTimeout(
    `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(handle)}&limit=1`,
    { headers: { "User-Agent": "mittobot-social/1.0" } },
  );
  if (!res.ok) throw new Error(`bluesky HTTP ${res.status}`);
  const json = await res.json();
  const item = json?.feed?.[0];
  const post = item?.post;
  if (!post) return null;
  const record = post.record || {};
  const text = (record.text || "").slice(0, 300) || "(new post)";
  const rkey = (post.uri || "").split("/").pop() || "";
  let image = null;
  try {
    const embed = post.embed;
    const img = embed?.images?.[0] || embed?.image;
    if (img?.fullsize) image = img.fullsize;
    else if (img?.image?.fullsize) image = img.image.fullsize;
  } catch { /* keep null */ }
  return {
    id: post.cid || post.uri || text,
    title: text,
    link: `https://bsky.app/profile/${encodeURIComponent(handle)}/post/${rkey}`,
    image,
  };
}

// ── Keyword filters ────────────────────────────────────────────────────────
// includeKeywords: when non-empty, the title must contain at least one.
// excludeKeywords: when non-empty, the title must not contain any.
// Case-insensitive substring matching.
function passesFilters(connector, title) {
  const text = String(title || "").toLowerCase();
  const include = db.safeJsonParse(connector.include_keywords, []);
  const exclude = db.safeJsonParse(connector.exclude_keywords, []);
  if (Array.isArray(include) && include.length && !include.some(k => text.includes(String(k).toLowerCase()))) return false;
  if (Array.isArray(exclude) && exclude.length && exclude.some(k => text.includes(String(k).toLowerCase()))) return false;
  return true;
}

// ── Announcement rendering ─────────────────────────────────────────────────
function renderTemplate(template, fields) {
  return String(template || DEFAULT_TEMPLATE)
    .replace(/\{title\}/g, fields.title || "")
    .replace(/\{link\}/g, fields.link || "")
    .replace(/\{url\}/g, fields.link || "")
    .replace(/\{platform\}/g, fields.platform || "")
    .replace(/\{target\}/g, fields.target || "");
}

// Announce a post. When the connector has embed_enabled it sends a rich embed
// (title/color/thumbnail) instead of the plain-text template.
async function announce(client, connector, fields) {
  const channel = client.channels.cache.get(connector.announce_channel_id);
  if (!channel || typeof channel.send !== "function") return;
  if (!passesFilters(connector, fields.title)) return;

  const embedEnabled = connector.embed_enabled === 1 || connector.embed_enabled === true;
  if (embedEnabled) {
    const embed = new EmbedBuilder()
      .setTitle(String(connector.embed_title || fields.title || "(new post)").slice(0, 256))
      .setURL(fields.link || null)
      .setDescription(fields.title && connector.embed_title ? String(fields.title).slice(0, 1000) : undefined)
      .setTimestamp();
    if (connector.embed_color && /^#?[0-9a-fA-F]{6}$/.test(String(connector.embed_color).replace("#", ""))) {
      embed.setColor(parseInt(String(connector.embed_color).replace("#", ""), 16));
    } else {
      embed.setColor(0x5865f2);
    }
    if (fields.image) embed.setImage(fields.image);
    embed.setFooter({ text: `${fields.platform} · ${fields.target}` });
    await safe.send(channel, { embeds: [embed], allowedMentions: { parse: [] } }, `social embed (${connector.platform})`);
    return;
  }

  const content = renderTemplate(connector.message_template, fields);
  await safe.send(channel, { content, allowedMentions: { parse: ["roles", "users"] } }, `social announce (${connector.platform})`);
}

// ── Per-connector handlers ─────────────────────────────────────────────────
// Each returns the new last_seen value to persist, or null for "nothing new".
async function pollRss(client, connector, feedUrl) {
  const res = await fetchWithTimeout(feedUrl, { headers: { "User-Agent": "mittobot-social/1.0" } });
  if (!res.ok) throw new Error(`feed HTTP ${res.status}`);
  const xml = await res.text();
  const item = parseFirstFeedItem(xml);
  if (!item || !item.id) return null;

  // First time we see this connector: seed last_seen silently so we don't
  // announce an already-old post the moment the connector is created.
  if (!connector.last_seen) return item.id;
  if (item.id === connector.last_seen) return null;

  await announce(client, connector, {
    title: item.title,
    link: item.link,
    image: item.image,
    platform: connector.platform,
    target: connector.target,
  });
  return item.id;
}

async function pollTwitch(client, connector) {
  const stream = await fetchTwitchStream(connector.target);
  if (!stream) {
    // Offline — clear the stored stream id so the next go-live announces again.
    return connector.last_seen ? "" : null;
  }
  if (stream.id === connector.last_seen) return null; // already announced this stream

  const link = `https://twitch.tv/${connector.target}`;
  await announce(client, connector, {
    title: stream.title || `${connector.target} is live!`,
    link,
    image: stream.thumbnail_url ? stream.thumbnail_url.replace("{width}", "640").replace("{height}", "360") : null,
    platform: connector.platform,
    target: connector.target,
  });
  return stream.id;
}

// ── Poll tick (index.js setInterval) ───────────────────────────────────────
async function poll(client) {
  let connectors;
  try {
    connectors = db.getAllSocialConnectors();
  } catch (e) {
    console.error("[social] load connectors:", e.message);
    return;
  }

  for (const c of connectors) {
    if (c.enabled !== 1) continue;
    try {
      let nextSeen = null;
      if (c.platform === "rss") {
        nextSeen = await pollRss(client, c, c.target);
      } else if (c.platform === "youtube") {
        nextSeen = await pollRss(client, c, `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(c.target)}`);
      } else if (c.platform === "twitch") {
        // Skip silently when Twitch app credentials aren't configured.
        const { clientId, clientSecret } = twitchCreds();
        if (!clientId || !clientSecret) continue;
        nextSeen = await pollTwitch(client, c);
      } else if (c.platform === "reddit") {
        const post = await fetchRedditPost(c.target);
        if (!post) { nextSeen = null; }
        else if (!c.last_seen) { nextSeen = post.id; } // seed silently
        else if (post.id !== c.last_seen) {
          await announce(client, c, { title: post.title, link: post.link, image: post.image, platform: "reddit", target: c.target });
          nextSeen = post.id;
        }
      } else if (c.platform === "bluesky") {
        const post = await fetchBlueskyPost(c.target);
        if (!post) { nextSeen = null; }
        else if (!c.last_seen) { nextSeen = post.id; } // seed silently
        else if (post.id !== c.last_seen) {
          await announce(client, c, { title: post.title, link: post.link, image: post.image, platform: "bluesky", target: c.target });
          nextSeen = post.id;
        }
      }
      if (nextSeen !== null && nextSeen !== c.last_seen) {
        db.setSocialConnectorLastSeen(c.id, nextSeen);
      }
    } catch (e) {
      console.error(`[social] connector #${c.id} (${c.platform}:${c.target}):`, e.message);
    }
  }
}

// Small embed used by the $social list command.
function listEmbed(guildId) {
  const rows = db.getSocialConnectors(guildId);
  const embed = new EmbedBuilder().setColor(0x9146ff).setTitle("📡 Social Connectors");
  if (!rows.length) {
    embed.setDescription("No connectors yet. Add one from the dashboard **Community → Social** tab.");
    return embed;
  }
  embed.setDescription(rows.map(r => {
    const meta = PLATFORM_META[r.platform] || { label: r.platform };
    const filters = [];
    const inc = db.safeJsonParse(r.include_keywords, []);
    const exc = db.safeJsonParse(r.exclude_keywords, []);
    if (inc.length) filters.push(`include: ${inc.join(", ")}`);
    if (exc.length) filters.push(`exclude: ${exc.join(", ")}`);
    return `**#${r.id}** \`${meta.label}\` → <#${r.announce_channel_id}>\n\`${r.target}\`${r.enabled ? "" : " *(disabled)*"}${r.embed_enabled ? " *(embed)*" : ""}${filters.length ? `\nFilters: ${filters.join(" · ")}` : ""}`;
  }).join("\n\n"));
  return embed;
}

module.exports = { poll, listEmbed, DEFAULT_TEMPLATE, PLATFORM_META };
