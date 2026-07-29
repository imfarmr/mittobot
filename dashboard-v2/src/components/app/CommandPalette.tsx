import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Command as CommandPrimitive,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandInput,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { useGuild } from "@/hooks/useGuild";
import { toast } from "sonner";
import {
  Home, ShieldAlert, ShieldBan, Flame, FolderOpen, ScrollText, StickyNote, Zap,
  MessageSquareText, UserCheck, Users, FolderSync, BarChart3, Ticket, Gift,
  Star, MessageCircle, Cake, Link2, Share2, Clock, HardDrive, Palette, FileText,
  Coins, Bookmark, Music, Sparkles, Cpu, Brain, TrendingUp, History,
  Settings, LayoutDashboard,
  Terminal, LogOut, Copy, RefreshCw, type LucideIcon,
} from "lucide-react";

interface PaletteAction {
  id: string;
  label: string;
  icon: LucideIcon;
  group: string;
  action: () => void;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { guildId } = useGuild();
  const { user, logout } = useAuth();

  // Listen for Cmd+K / Ctrl+K to toggle the palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(v => !v);
      }
      // Escape closes
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // Build the navigation items — only show guild-scoped pages when a guild is selected
  const navItems = useMemo(() => {
    if (!guildId) return [];
    const g = guildId;
    return [
      { id: "overview", label: "Overview", icon: Home, group: "General", path: `/g/${g}/overview` },
      { id: "commands", label: "Commands", icon: LayoutDashboard, group: "General", path: `/g/${g}/commands` },
      // Moderation
      { id: "automod", label: "Automod", icon: ShieldAlert, group: "Moderation", path: `/g/${g}/moderation/automod` },
      { id: "automodv2", label: "Automod v2", icon: Sparkles, group: "Moderation", path: `/g/${g}/moderation/automodv2` },
      { id: "antiraid", label: "Anti-raid", icon: ShieldBan, group: "Moderation", path: `/g/${g}/moderation/antiraid` },
      { id: "dangerzone", label: "Dangerzone", icon: Flame, group: "Moderation", path: `/g/${g}/moderation/dangerzone` },
      { id: "cases", label: "Cases", icon: FolderOpen, group: "Moderation", path: `/g/${g}/moderation/cases` },
      { id: "modlog", label: "Mod Log", icon: ScrollText, group: "Moderation", path: `/g/${g}/moderation/modlog` },
      { id: "logging", label: "Server Logging", icon: FileText, group: "Moderation", path: `/g/${g}/moderation/logging` },
      { id: "notes", label: "User Notes", icon: StickyNote, group: "Moderation", path: `/g/${g}/moderation/notes` },
      { id: "rules", label: "Auto Rules", icon: Zap, group: "Moderation", path: `/g/${g}/moderation/rules` },
      // Community
      { id: "greet", label: "Greet & Welcome", icon: MessageSquareText, group: "Community", path: `/g/${g}/community/greet` },
      { id: "roles", label: "Roles", icon: UserCheck, group: "Community", path: `/g/${g}/community/roles` },
      { id: "members", label: "Role Members", icon: Users, group: "Community", path: `/g/${g}/community/members` },
      { id: "channels", label: "Channels", icon: FolderSync, group: "Community", path: `/g/${g}/community/channels` },
      { id: "levels", label: "Levels & XP", icon: BarChart3, group: "Community", path: `/g/${g}/community/levels` },
      { id: "tickets", label: "Tickets", icon: Ticket, group: "Community", path: `/g/${g}/community/tickets` },
      { id: "giveaways", label: "Giveaways", icon: Gift, group: "Community", path: `/g/${g}/community/giveaways` },
      { id: "starboard", label: "Starboard", icon: Star, group: "Community", path: `/g/${g}/community/starboard` },
      { id: "suggestions", label: "Suggestions", icon: MessageCircle, group: "Community", path: `/g/${g}/community/suggestions` },
      { id: "birthdays", label: "Birthdays", icon: Cake, group: "Community", path: `/g/${g}/community/birthdays` },
      { id: "invites", label: "Invites", icon: Link2, group: "Community", path: `/g/${g}/community/invites` },
      { id: "social", label: "Social", icon: Share2, group: "Community", path: `/g/${g}/community/social` },
      { id: "schedule", label: "Schedule", icon: Clock, group: "Community", path: `/g/${g}/community/schedule` },
      { id: "backups", label: "Backups", icon: HardDrive, group: "Community", path: `/g/${g}/community/backups` },
      { id: "embeds", label: "Embed Builder", icon: Palette, group: "Community", path: `/g/${g}/community/embeds` },
      // Engagement
      { id: "economy", label: "Economy", icon: Coins, group: "Engagement", path: `/g/${g}/engagement/economy` },
      { id: "tags", label: "Tags", icon: Bookmark, group: "Engagement", path: `/g/${g}/engagement/tags` },
      { id: "music", label: "Music", icon: Music, group: "Engagement", path: `/g/${g}/engagement/music` },
      // AI
      { id: "ai-config", label: "AI Configuration", icon: Sparkles, group: "AI Engine", path: `/g/${g}/ai/config` },
      { id: "ai-chat", label: "AI Test Chat", icon: Cpu, group: "AI Engine", path: `/g/${g}/ai/chat` },
      { id: "ai-memory", label: "AI Memory", icon: Brain, group: "AI Engine", path: `/g/${g}/ai/memory` },
      { id: "ai-analytics", label: "AI Analytics", icon: TrendingUp, group: "AI Engine", path: `/g/${g}/ai/analytics` },
      { id: "ai-conversations", label: "AI Conversations", icon: History, group: "AI Engine", path: `/g/${g}/ai/conversations` },
    ] as const;
  }, [guildId]);

  // Build quick actions
  const actions = useMemo<PaletteAction[]>(() => {
    const items: PaletteAction[] = [
      {
        id: "refresh",
        label: "Refresh page data",
        icon: RefreshCw,
        group: "Actions",
        action: () => { window.location.reload(); },
      },
    ];
    if (guildId) {
      items.push({
        id: "copy-guild-id",
        label: "Copy guild ID",
        icon: Copy,
        group: "Actions",
        action: () => {
          navigator.clipboard?.writeText(guildId);
          toast.success("Guild ID copied");
        },
      });
    }
    items.push({
      id: "goto-system",
      label: "System Settings",
      icon: Settings,
      group: "Actions",
      action: () => navigate("/system/status"),
    });
    if (user) {
      items.push({
        id: "logout",
        label: "Log out",
        icon: LogOut,
        group: "Actions",
        action: () => logout(),
      });
    }
    return items;
  }, [guildId, user, navigate, logout]);

  const handleSelect = (id: string) => {
    const navItem = navItems.find(n => n.id === id);
    if (navItem) {
      navigate(navItem.path);
      setOpen(false);
      return;
    }
    const action = actions.find(a => a.id === id);
    if (action) {
      action.action();
      setOpen(false);
    }
  };

  // Group nav items by their group label
  const groupedNav = useMemo(() => {
    const groups: Record<string, Array<typeof navItems[number]>> = {};
    for (const item of navItems) {
      if (!groups[item.group]) groups[item.group] = [];
      groups[item.group].push(item);
    }
    return groups;
  }, [navItems]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-xl p-0 gap-0 border-border/60 bg-popover/95 backdrop-blur-xl overflow-hidden rounded-xl" >
        <CommandPrimitive className="rounded-xl">
          <CommandInput placeholder="Search pages and actions…" />
          <CommandList className="max-h-[400px]">
            <CommandEmpty>No results found.</CommandEmpty>

            {/* Navigation groups */}
            {Object.entries(groupedNav).map(([group, items]) => (
              <CommandGroup key={group} heading={group}>
                {items.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={`${item.label} ${group}`}
                    onSelect={() => handleSelect(item.id)}
                    className="gap-2.5 text-xs"
                  >
                    <item.icon className="size-3.5 text-muted-foreground shrink-0" />
                    <span>{item.label}</span>
                    {location.pathname === item.path && (
                      <span className="ml-auto text-[9px] text-primary font-mono">current</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}

            {/* Actions */}
            <CommandGroup heading="Actions">
              {actions.map((action) => (
                <CommandItem
                  key={action.id}
                  value={action.label}
                  onSelect={() => handleSelect(action.id)}
                  className="gap-2.5 text-xs"
                >
                  <action.icon className="size-3.5 text-muted-foreground shrink-0" />
                  <span>{action.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>

          {/* Footer */}
          <div className="border-t border-border/30 px-3 py-2 flex items-center justify-between text-[10px] text-muted-foreground font-mono">
            <span className="flex items-center gap-1.5">
              <Terminal className="size-3" />
              ggboi command palette
            </span>
            <span>↑↓ navigate · ↵ select · esc close</span>
          </div>
        </CommandPrimitive>
      </DialogContent>
    </Dialog>
  );
}
