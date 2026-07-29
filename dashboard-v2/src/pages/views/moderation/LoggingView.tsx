import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, guildPath } from "@/lib/api";
import { useGuild } from "@/hooks/useGuild";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ScrollText } from "lucide-react";
import { toast } from "sonner";
import { SaveBar } from "@/components/app/SaveBar";
import { LoadingFallback } from "@/components/app/LoadingFallback";
import { FadeIn } from "@/components/animations/FadeIn";

interface LoggingConfig {
  enabled: boolean;
  channelId: string | null;
  events: Record<string, boolean>;
  ignoredChannels: string[];
  ignoredRoles: string[];
}
interface LoggingData {
  guildId: string;
  hasGuild: boolean;
  channels: { id: string; name: string }[];
  roles: { id: string; name: string }[];
  config: LoggingConfig;
  eventTypes: Record<string, { label: string; group: string; default: boolean; color: number }>;
}

const GROUP_ORDER = ["Messages", "Members", "Channels", "Roles", "Voice", "Emojis", "Invites"];

const GROUP_ICONS: Record<string, string> = {
  Messages: "📝",
  Members: "👥",
  Channels: "📁",
  Roles: "🎭",
  Voice: "🔊",
  Emojis: "😀",
  Invites: "🔗",
};

export default function LoggingView() {
  const { guildId } = useGuild();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<LoggingData>({
    queryKey: ["logging", guildId],
    queryFn: () => get(guildPath("/api/logging", guildId)),
    enabled: !!guildId,
  });

  const saveMutation = useMutation({
    mutationFn: (body: any) => post(guildPath("/api/logging", guildId), body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["logging", guildId] });
      toast.success("Logging configuration saved");
    },
    onError: (e: any) => toast.error(e.message || "Save failed"),
  });

  const cfg = data?.config;
  const [enabled, setEnabled] = useState(false);
  const [channelId, setChannelId] = useState("");
  const [events, setEvents] = useState<Record<string, boolean>>({});
  const [ignoredChannels, setIgnoredChannels] = useState<string[]>([]);
  const [ignoredRoles, setIgnoredRoles] = useState<string[]>([]);

  useEffect(() => {
    if (cfg) {
      setEnabled(cfg.enabled);
      setChannelId(cfg.channelId || "");
      setEvents({ ...cfg.events });
      setIgnoredChannels(cfg.ignoredChannels || []);
      setIgnoredRoles(cfg.ignoredRoles || []);
    }
  }, [data]);

  // Group event types by their group label
  const groupedEvents = useMemo(() => {
    if (!data?.eventTypes) return {};
    const groups: Record<string, { key: string; label: string }[]> = {};
    for (const [key, meta] of Object.entries(data.eventTypes)) {
      const group = meta.group;
      if (!groups[group]) groups[group] = [];
      groups[group].push({ key, label: meta.label });
    }
    return groups;
  }, [data]);

  if (!guildId) return <div className="p-6 text-sm text-muted-foreground">Select a guild first.</div>;
  if (isLoading || !data) return <LoadingFallback text="Loading logging config..." />;

  const dirty =
    enabled !== cfg!.enabled ||
    channelId !== (cfg!.channelId || "") ||
    JSON.stringify(events) !== JSON.stringify(cfg!.events) ||
    JSON.stringify(ignoredChannels) !== JSON.stringify(cfg!.ignoredChannels || []) ||
    JSON.stringify(ignoredRoles) !== JSON.stringify(cfg!.ignoredRoles || []);

  const handleSave = () => saveMutation.mutate({
    enabled,
    channelId: channelId || null,
    events,
    ignoredChannels,
    ignoredRoles,
  });
  const handleReset = () => {
    if (cfg) {
      setEnabled(cfg.enabled);
      setChannelId(cfg.channelId || "");
      setEvents({ ...cfg.events });
      setIgnoredChannels(cfg.ignoredChannels || []);
      setIgnoredRoles(cfg.ignoredRoles || []);
      toast("Changes discarded");
    }
  };

  const toggleEvent = (key: string) => {
    setEvents(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleIgnoredChannel = (id: string) => {
    setIgnoredChannels(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const toggleIgnoredRole = (id: string) => {
    setIgnoredRoles(prev =>
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
  };

  const enabledEventCount = Object.values(events).filter(Boolean).length;
  const totalEventCount = Object.keys(data.eventTypes).length;

  return (
    <>
      <SaveBar dirty={dirty} saving={saveMutation.isPending} onSave={handleSave} onReset={handleReset} />
      <FadeIn>
        <div className="space-y-4 pb-24">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2.5">
            <ScrollText className="size-5 text-primary" /> Server Logging
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Log server events to a dedicated channel. {enabledEventCount} of {totalEventCount} event types enabled.
          </p>
        </div>

        {/* Main toggle + channel selector */}
        <Card className="border-border/40 bg-card/40">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold">Logging</CardTitle>
              <CardDescription className="text-xs">Send event logs to a text channel</CardDescription>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Log Channel</label>
              <select
                className="w-full mt-1 bg-background-alt/50 border border-border/40 rounded-lg p-2 text-xs font-mono"
                value={channelId}
                onChange={e => setChannelId(e.target.value)}
              >
                <option value="">— None —</option>
                {data.channels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
              </select>
            </div>
          </CardContent>
        </Card>

        {/* Event type toggles grouped by category */}
        {GROUP_ORDER.map(groupName => {
          const items = groupedEvents[groupName];
          if (!items?.length) return null;
          return (
            <Card key={groupName} className="border-border/40 bg-card/40">
              <CardHeader>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <span>{GROUP_ICONS[groupName]}</span>
                  {groupName}
                </CardTitle>
                <CardDescription className="text-xs">
                  {items.filter(i => events[i.key]).length} of {items.length} enabled
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {items.map(item => (
                    <label
                      key={item.key}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border/30 bg-background-alt/30 hover:bg-background-alt/50 transition-colors cursor-pointer"
                    >
                      <span className="text-xs font-medium">{item.label}</span>
                      <Switch
                        checked={!!events[item.key]}
                        onCheckedChange={() => toggleEvent(item.key)}
                      />
                    </label>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}

        {/* Ignored channels */}
        <Card className="border-border/40 bg-card/40">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Ignored Channels</CardTitle>
            <CardDescription className="text-xs">Skip logging events from these channels ({ignoredChannels.length} selected)</CardDescription>
          </CardHeader>
          <CardContent>
            {data.channels.length === 0 ? (
              <p className="text-xs text-muted-foreground">No channels available.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto">
                {data.channels.map(c => (
                  <label
                    key={c.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-background-alt/40 cursor-pointer text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={ignoredChannels.includes(c.id)}
                      onChange={() => toggleIgnoredChannel(c.id)}
                      className="size-3.5 accent-primary"
                    />
                    <span className="truncate">#{c.name}</span>
                  </label>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Ignored roles */}
        <Card className="border-border/40 bg-card/40">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Ignored Roles</CardTitle>
            <CardDescription className="text-xs">Skip logging events from members with these roles ({ignoredRoles.length} selected)</CardDescription>
          </CardHeader>
          <CardContent>
            {data.roles.length === 0 ? (
              <p className="text-xs text-muted-foreground">No roles available.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto">
                {data.roles.map(r => (
                  <label
                    key={r.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-background-alt/40 cursor-pointer text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={ignoredRoles.includes(r.id)}
                      onChange={() => toggleIgnoredRole(r.id)}
                      className="size-3.5 accent-primary"
                    />
                    <span className="truncate">{r.name}</span>
                  </label>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      </FadeIn>
    </>
  );
}
