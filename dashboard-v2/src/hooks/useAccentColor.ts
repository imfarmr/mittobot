import { useEffect, useState } from "react";

const STORAGE_KEY = "ggboi-dashboard-accent";
const DEFAULT_ACCENT = "#6366f1";

const PRESETS = [
  { id: "indigo", label: "Indigo", value: "#6366f1" },
  { id: "rose", label: "Rose", value: "#f43f5e" },
  { id: "emerald", label: "Emerald", value: "#10b981" },
  { id: "amber", label: "Amber", value: "#f59e0b" },
  { id: "violet", label: "Violet", value: "#8b5cf6" },
  { id: "cyan", label: "Cyan", value: "#06b6d4" },
];

/** Compute a readable foreground color (black or white) for a hex background. */
function contrastFor(hex: string): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  // Standard luminance formula
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#000000" : "#ffffff";
}

function isValidHex(hex: string): boolean {
  return /^#([A-Fa-f0-9]{6})$/.test(hex);
}

export function useAccentColor() {
  const [color, setColorState] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_ACCENT;
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_ACCENT;
  });

  const setColor = (value: string) => {
    const normalized = value.startsWith("#") ? value : `#${value}`;
    if (!isValidHex(normalized)) return;
    setColorState(normalized.toLowerCase());
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, color);
    document.documentElement.style.setProperty("--primary", color);
    document.documentElement.style.setProperty("--primary-foreground", contrastFor(color));
  }, [color]);

  return { color, setColor, presets: PRESETS, isValidHex };
}

export type AccentColor = typeof PRESETS[number];
