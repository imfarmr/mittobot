import { Fragment } from "react";
import { Eye, Hash } from "lucide-react";

function renderMessageContent(content: string) {
  const parts = content.split(/(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\n)/g);
  return parts.map((part, index) => {
    if (part === "\n") return <br key={index} />;
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("__") && part.endsWith("__")) {
      return <u key={index}>{part.slice(2, -2)}</u>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index} className="rounded bg-black/30 px-1 py-0.5 font-mono text-[0.9em] text-[#dbdee1]">{part.slice(1, -1)}</code>;
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

interface DiscordMessagePreviewProps {
  content: string;
  guildName: string;
  channelName?: string;
  enabled: boolean;
  accent: "success" | "danger";
  eventLabel: string;
}

export function DiscordMessagePreview({
  content,
  guildName,
  channelName,
  enabled,
  accent,
  eventLabel,
}: DiscordMessagePreviewProps) {
  const previewContent = content.trim() || "Your message preview will appear here…";
  const accentClass = accent === "success" ? "bg-[#23a559]" : "bg-[#da373c]";
  const fallbackChannel = accent === "success" ? "welcome-channel" : "leave-channel";

  return (
    <div className="overflow-hidden rounded-xl border border-[#1e1f22] bg-[#313338] shadow-[0_12px_35px_rgba(0,0,0,0.28)]" aria-label={`${eventLabel} Discord preview`}>
      <div className="flex items-center justify-between border-b border-white/[0.06] bg-[#2b2d31] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-[#b5bac1]">
          <Eye className="size-3.5 text-[#949ba4]" />
          <span className="truncate">Live {eventLabel} preview</span>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${enabled ? "bg-[#23a559]/15 text-[#57f287]" : "bg-white/[0.08] text-[#949ba4]"}`}>
          {enabled ? "Enabled" : "Disabled"}
        </span>
      </div>

      <div className="min-h-[190px] p-4">
        <div className="mb-3 flex items-center gap-1.5 text-xs text-[#949ba4]">
          <Hash className="size-3.5" />
          <span>{channelName || fallbackChannel}</span>
          <span className="ml-auto text-[10px] text-[#6d7078]">{guildName || "Your server"}</span>
        </div>

        <div className="group flex gap-3">
          <div className={`flex size-10 shrink-0 items-center justify-center rounded-full p-1 ${accentClass}`}>
            <img src="/emojinobg.png" alt="Mitto" className="size-full rounded-full object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-1.5">
              <span className="text-[15px] font-semibold text-white">Mitto</span>
              <span className="rounded-[3px] bg-[#5865f2] px-1 py-0.5 text-[9px] font-bold uppercase leading-none text-white">APP</span>
              <span className="text-[10px] text-[#949ba4]">Today at 12:00 PM</span>
            </div>
            <div className="mt-1 whitespace-normal break-words text-[14px] leading-[1.35] text-[#dbdee1]">
              {renderMessageContent(previewContent)}
            </div>
            <div className="mt-2 text-[10px] text-[#6d7078]">Preview member: <span className="text-[#b5bac1]">Wumpus</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
