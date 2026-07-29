// ─── Rank card image generator ─────────────────────────────────────────────
// Uses @napi-rs/canvas to render a Discord-style rank card PNG buffer.
// Keeps all canvas logic isolated so commands and API can share it.

const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");
const fs = require("fs");
const path = require("path");

// Try to register a nice font if one exists in the project, otherwise fall
// back to the system's sans-serif stack.
const FONTS = [
  path.join(__dirname, "../../assets/fonts/Inter-Bold.ttf"),
  path.join(__dirname, "../../assets/fonts/Inter-SemiBold.ttf"),
];
for (const fontPath of FONTS) {
  if (fs.existsSync(fontPath)) {
    try {
      GlobalFonts.registerFromPath(fontPath, "Inter");
    } catch (err) {
      console.warn("[rankCard] Could not register font:", err.message);
    }
  }
}
const SANS = GlobalFonts.has("Inter") ? "Inter" : "sans-serif";

/** Fetch a remote image (avatar) and return a canvas Image. */
async function loadRemoteImage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return loadImage(buf);
}

/** Draw a rounded rectangle path. */
function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/** Render a rank card as a PNG buffer. */
async function generateRankCard(user, data) {
  const width = 880;
  const height = 260;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // ── Background ────────────────────────────────────────────────────────────
  // Dark slate gradient with a subtle highlight at the top.
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, "#1e1e24");
  bg.addColorStop(1, "#131316");
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, width, height, 24);
  ctx.fill();

  // Accent bar on the left side.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(24, 0);
  ctx.lineTo(28, 0);
  ctx.lineTo(28, height);
  ctx.lineTo(24, height);
  roundRect(ctx, 0, 0, 28, height, 24);
  ctx.clip();
  ctx.fillStyle = "#6366f1";
  ctx.fillRect(0, 0, 28, height);
  ctx.restore();

  // ── Avatar ────────────────────────────────────────────────────────────────
  const avatarSize = 170;
  const avatarX = 54;
  const avatarY = (height - avatarSize) / 2;
  let avatar = null;
  try {
    const avatarUrl = user.displayAvatarURL?.({ extension: "png", size: 256 }) || user.displayAvatarURL;
    if (avatarUrl) avatar = await loadRemoteImage(avatarUrl);
  } catch (err) {
    console.warn("[rankCard] Could not load avatar:", err.message);
  }

  // White ring behind the avatar.
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 6, 0, Math.PI * 2);
  ctx.fillStyle = "#27272a";
  ctx.fill();

  if (avatar) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
    ctx.restore();
  } else {
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = "#3f3f46";
    ctx.fill();
  }

  // ── Text info ─────────────────────────────────────────────────────────────
  const textX = avatarX + avatarSize + 36;
  const textY = 74;

  // Username.
  ctx.fillStyle = "#fafafa";
  ctx.font = `bold 36px "${SANS}", sans-serif`;
  ctx.textBaseline = "top";
  const username = user.username || user.tag || "Unknown";
  ctx.fillText(truncate(ctx, username, width - textX - 40, 36, true), textX, textY);

  // Rank / Level badges.
  ctx.font = `20px "${SANS}", sans-serif`;
  ctx.fillStyle = "#a1a1aa";
  ctx.fillText(`Rank #${data.rank || "—"}  •  Level ${data.level || 0}`, textX, textY + 48);

  // ── XP Progress bar ──────────────────────────────────────────────────────
  const barX = textX;
  const barY = textY + 92;
  const barW = width - textX - 54;
  const barH = 16;
  const progress = Math.max(0, Math.min(1, data.neededXp > 0 ? data.currentXp / data.neededXp : 0));

  // Track.
  ctx.fillStyle = "#3f3f46";
  roundRect(ctx, barX, barY, barW, barH, barH / 2);
  ctx.fill();

  // Fill (gradient).
  const fillW = Math.max(barH, barW * progress);
  const grad = ctx.createLinearGradient(barX, barY, barX + barW, barY);
  grad.addColorStop(0, "#6366f1");
  grad.addColorStop(1, "#818cf8");
  ctx.fillStyle = grad;
  roundRect(ctx, barX, barY, fillW, barH, barH / 2);
  ctx.fill();

  // XP labels under the bar.
  ctx.font = `14px "${SANS}", sans-serif`;
  ctx.fillStyle = "#a1a1aa";
  ctx.textBaseline = "top";
  ctx.fillText(`${(data.currentXp || 0).toLocaleString()} / ${(data.neededXp || 0).toLocaleString()} XP`, barX, barY + 28);
  ctx.textAlign = "right";
  ctx.fillText(`${(data.xp || 0).toLocaleString()} total XP`, barX + barW, barY + 28);
  ctx.textAlign = "left";

  // ── Extra stats ───────────────────────────────────────────────────────────
  const stats = [];
  if (data.messages != null) stats.push({ label: "Messages", value: data.messages.toLocaleString() });
  if (data.voiceMinutes) stats.push({ label: "Voice", value: `${data.voiceMinutes}m` });
  if (stats.length) {
    ctx.font = `14px "${SANS}", sans-serif`;
    let statX = textX;
    const statY = barY + 66;
    for (const s of stats) {
      const labelWidth = ctx.measureText(s.label).width;
      const valueWidth = ctx.measureText(s.value).width;
      const totalWidth = Math.max(labelWidth, valueWidth);

      ctx.fillStyle = "#71717a";
      ctx.fillText(s.label, statX, statY);
      ctx.fillStyle = "#fafafa";
      ctx.font = `bold 16px "${SANS}", sans-serif`;
      ctx.fillText(s.value, statX, statY + 18);
      ctx.font = `14px "${SANS}", sans-serif`;

      statX += totalWidth + 44;
    }
  }

  return canvas.encode("png");
}

/** Truncate text to fit a max width with an optional ellipsis. */
function truncate(ctx, text, maxWidth, fontSize, bold = false) {
  ctx.font = `${bold ? "bold " : ""}${fontSize}px "${SANS}", sans-serif`;
  let str = String(text);
  if (ctx.measureText(str).width <= maxWidth) return str;
  while (str.length > 1 && ctx.measureText(str + "…").width > maxWidth) {
    str = str.slice(0, -1);
  }
  return str + "…";
}

module.exports = { generateRankCard, loadRemoteImage };
