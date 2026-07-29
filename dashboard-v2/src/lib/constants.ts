/**
 * Shared Tailwind classes for moderation action badges.
 * Keep in sync with the semantic `--status-*` CSS variables in index.css.
 */
export const ACTION_BADGE_CLASSES: Record<string, string> = {
  warn: "bg-status-warn/20 text-status-warn border-status-warn/30",
  mute: "bg-status-mute/20 text-status-mute border-status-mute/30",
  timeout: "bg-status-mute/20 text-status-mute border-status-mute/30",
  kick: "bg-status-kick/20 text-status-kick border-status-kick/30",
  ban: "bg-status-ban/20 text-status-ban border-status-ban/30",
  softban: "bg-status-ban/20 text-status-ban border-status-ban/30",
  tempban: "bg-status-ban/20 text-status-ban border-status-ban/30",
  unban: "bg-status-undo/20 text-status-undo border-status-undo/30",
  unmute: "bg-status-undo/20 text-status-undo border-status-undo/30",
};
