#!/usr/bin/env node
// ─── Convert Apple macOS 27 SVG cursors → CSS data URIs ────────────────────
// Usage: node scripts/convert-cursors.js
// Outputs CSS cursor definitions for dashboard-v2/src/index.css

const fs = require("fs");
const path = require("path");

const CURSOR_DIR = path.resolve(__dirname, "../apple-ui-kit/Pointers");
const OUTPUT_FILE = path.resolve(__dirname, "../dashboard-v2/src/cursors.css");

// Map SVG filenames to CSS cursor names
const CURSOR_MAP = {
  "Default-1.svg": "default",
  "Default.svg": "default-alt",
  "Hand (Pointing).svg": "pointer",
  "Hand (Open).svg": "grab",
  "Hand (Grabbing).svg": "grabbing",
  "Text Cursor.svg": "text",
  "Beachball.svg": "wait",
  "Cross.svg": "crosshair",
  "Move.svg": "move",
  "Zoom In.svg": "zoom-in",
  "Zoom Out.svg": "zoom-out",
  "Resize (Left-Right).svg": "ew-resize",
  "Resize (Up-Down).svg": "ns-resize",
  "Resize North-East South-West.svg": "nesw-resize",
  "Resize North-West South-East.svg": "nwse-resize",
  "Resize (Left).svg": "w-resize",
  "Resize (Right).svg": "e-resize",
  "Resize (Up).svg": "n-resize",
  "Resize (Down).svg": "s-resize",
  "Resize North-South.svg": "ns-resize-alt",
  "Resize West-East.svg": "ew-resize-alt",
  "Resize North-South-1.svg": "ns-resize-alt2",
};

function svgToDataUri(svgPath) {
  const svg = fs.readFileSync(svgPath, "utf8");
  // Minify SVG a bit: remove XML declaration, comments, extra whitespace
  const minified = svg
    .replace(/<\?xml[^>]*\?>/g, "")
    .replace(/<!--.*?-->/gs, "")
    .replace(/>\s+</g, "><")
    .replace(/\s{2,}/g, " ")
    .trim();
  const base64 = Buffer.from(minified, "utf8").toString("base64");
  return `data:image/svg+xml;base64,${base64}`;
}

function generate() {
  const lines = [
    "/* ════════════════════════════════════════════════════════════════════════════",
    "   Apple macOS 27 Custom Cursors",
    "   Generated from apple-ui-kit/Pointers/*.svg",
    "   ════════════════════════════════════════════════════════════════════════════ */",
    "",
    ":root {",
  ];

  // Generate CSS custom properties for each cursor
  const hotspot = { x: 0, y: 0 };
  // Hotspots determined by each SVG's design center
  const hotspots = {
    default: [2, 2],
    "default-alt": [2, 2],
    pointer: [4, 4],
    grab: [16, 4],
    grabbing: [16, 4],
    text: [16, 16],
    wait: [6, 6],
    crosshair: [16, 16],
    move: [16, 16],
    "zoom-in": [16, 16],
    "zoom-out": [16, 16],
  };

  for (const [filename, cssName] of Object.entries(CURSOR_MAP)) {
    const svgPath = path.join(CURSOR_DIR, filename);
    if (!fs.existsSync(svgPath)) {
      console.warn(`  ⚠ File not found: ${filename}`);
      continue;
    }
    const uri = svgToDataUri(svgPath);
    const [hx, hy] = hotspots[cssName] || [4, 4];
    // generate both the var and the fallback-friendly CSS
    lines.push(`  --cursor-${cssName}: url("${uri}") ${hx} ${hy}, auto;`);
  }

  lines.push("}", "");

  // Global cursor override — use the custom macOS arrow everywhere
  lines.push("html {");
  lines.push("  cursor: var(--cursor-default);");
  lines.push("}", "");

  // Interactive elements
  lines.push([
    "a, button, [role='button'], input[type='submit'], input[type='button'],",
    "input[type='reset'], summary, select, .cursor-pointer, [data-cursor='pointer']",
  ].join("\n  "));
  lines.push("  cursor: var(--cursor-pointer) !important;");
  lines.push("}", "");

  // Text inputs
  lines.push([
    "input[type='text'], input[type='search'], input[type='email'],",
    "input[type='url'], input[type='password'], input[type='number'],",
    "input[type='tel'], textarea, [contenteditable], .cursor-text",
  ].join("\n  "));
  lines.push("  cursor: var(--cursor-text);");
  lines.push("}", "");

  // Grab / Grabbing
  lines.push("[data-cursor='grab'], .cursor-grab { cursor: var(--cursor-grab); }");
  lines.push("[data-cursor='grabbing'], .cursor-grabbing { cursor: var(--cursor-grabbing); }");
  lines.push("");

  // Move
  lines.push("[data-cursor='move'], .cursor-move { cursor: var(--cursor-move); }");
  lines.push("");

  // Loading / wait state
  lines.push(".cursor-wait, [data-cursor='wait'] { cursor: var(--cursor-wait); }");
  lines.push("");

  // Resize cursors
  lines.push("[data-cursor='ew-resize'] { cursor: var(--cursor-ew-resize); }");
  lines.push("[data-cursor='ns-resize'] { cursor: var(--cursor-ns-resize); }");
  lines.push("[data-cursor='nesw-resize'] { cursor: var(--cursor-nesw-resize); }");
  lines.push("[data-cursor='nwse-resize'] { cursor: var(--cursor-nwse-resize); }");
  lines.push("[data-cursor='e-resize'] { cursor: var(--cursor-e-resize); }");
  lines.push("[data-cursor='w-resize'] { cursor: var(--cursor-w-resize); }");
  lines.push("[data-cursor='n-resize'] { cursor: var(--cursor-n-resize); }");
  lines.push("[data-cursor='s-resize'] { cursor: var(--cursor-s-resize); }");
  lines.push("");

  // Zoom
  lines.push("[data-cursor='zoom-in'] { cursor: var(--cursor-zoom-in); }");
  lines.push("[data-cursor='zoom-out'] { cursor: var(--cursor-zoom-out); }");
  lines.push("");

  // Crosshair
  lines.push("[data-cursor='crosshair'] { cursor: var(--cursor-crosshair); }");

  const fullCSS = lines.join("\n");
  fs.writeFileSync(OUTPUT_FILE, fullCSS, "utf8");
  console.log(`✅ Generated ${OUTPUT_FILE}`);
  console.log(`   ${Object.keys(CURSOR_MAP).length} cursor assets processed`);
}

generate();
