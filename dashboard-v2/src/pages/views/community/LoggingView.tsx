import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { CustomSelect } from "@/components/app/CustomSelect";
import { SaveBar } from "@/components/app/SaveBar";
import { useGuild } from "@/hooks/useGuild";
import { useGreetConfig, type GreetConfig } from "@/hooks/useGreetConfig";
import { ScrollText } from "lucide-react";
import { toast } from "sonner";

const EVENT_OPTIONS = [
  { key: "memberEvents", label: "Member events", description: "Joins, leaves, nicknames, and roles" },
  { key: "messageEvents", label: "Message events", description: "Edits and deletions" },
  { key: "serverEvents", label: "Server events", description: "Channel and role changes" },
  { key: "moderationEvents", label: "Moderation events", description: "Bans and unbans" },
  { key: "voiceEvents", label: "Voice activity", description: "Joins, leaves, and moves" },
  { key: "inviteEvents", label: "Invite events", description: "Created and deleted invites" },
  { key: "threadEvents", label: "Thread events", description: "Created, renamed, and deleted threads" },
  { key: "bulkMessageEvents", label: "Bulk deletions", description: "Summarize purge events without content" },
] as const;

type EventKey = typeof EVENT_OPTIONS[number]["key"];
type LogState = Record<EventKey, boolean> & { enabled: boolean; channelId: string };

const defaultLogState: LogState = {
  enabled: false,
  channelId: "",
  memberEvents: true,
  messageEvents: true,
  serverEvents: true,
  moderationEvents: true,
  voiceEvents: true,
  inviteEvents: true,
  threadEvents: true,
  bulkMessageEvents: true,
};

export default function LoggingView() {
  const { guildId } = useGuild();
  const { data, isLoading, saveMutation } = useGreetConfig(guildId);
  const config: GreetConfig["config"] = data?.config || {};
  const channels = data?.channels || [];
  const [logs, setLogs] = useState<LogState>(defaultLogState);

  useEffect(() => {
    const saved: NonNullable<GreetConfig["config"]["logs"]> = config.logs ?? {
      enabled: false,
      channelId: null,
      memberEvents: true,
      messageEvents: true,
      serverEvents: true,
      moderationEvents: true,
      voiceEvents: true,
      inviteEvents: true,
      threadEvents: true,
      bulkMessageEvents: true,
    };
    setLogs({
      enabled: saved.enabled ?? false,
      channelId: saved.channelId || "",
      memberEvents: saved.memberEvents ?? true,
      messageEvents: saved.messageEvents ?? true,
      serverEvents: saved.serverEvents ?? true,
      moderationEvents: saved.moderationEvents ?? true,
      voiceEvents: saved.voiceEvents ?? true,
      inviteEvents: saved.inviteEvents ?? true,
      threadEvents: saved.threadEvents ?? true,
      bulkMessageEvents: saved.bulkMessageEvents ?? true,
    });
  }, [data]);

  if (!guildId) return <div className="p-6 text-sm text-muted-foreground">Select a guild first.</div>;
  if (isLoading || !data) return <div className="p-6 text-sm text-muted-foreground">Loading server logging settings…</div>;

  const saved: NonNullable<GreetConfig["config"]["logs"]> = config.logs ?? {
    enabled: false,
    channelId: null,
    memberEvents: true,
    messageEvents: true,
    serverEvents: true,
    moderationEvents: true,
    voiceEvents: true,
    inviteEvents: true,
    threadEvents: true,
    bulkMessageEvents: true,
  };
  const dirty = logs.enabled !== (saved.enabled ?? false)
    || logs.channelId !== (saved.channelId || "")
    || EVENT_OPTIONS.some(({ key }) => logs[key] !== (saved[key] ?? true));

  const updateLog = (patch: Partial<LogState>) => setLogs((current) => ({ ...current, ...patch }));
  const reset = () => {
    setLogs({
      enabled: saved.enabled ?? false,
      channelId: saved.channelId || "",
      memberEvents: saved.memberEvents ?? true,
      messageEvents: saved.messageEvents ?? true,
      serverEvents: saved.serverEvents ?? true,
      moderationEvents: saved.moderationEvents ?? true,
      voiceEvents: saved.voiceEvents ?? true,
      inviteEvents: saved.inviteEvents ?? true,
      threadEvents: saved.threadEvents ?? true,
      bulkMessageEvents: saved.bulkMessageEvents ?? true,
    });
    toast("Changes discarded");
  };

  const save = () => {
    saveMutation.mutate({ logs }, {
      onSuccess: () => toast.success("Server logging settings saved"),
      onError: (error: any) => toast.error(error.message || "Save failed"),
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <ScrollText className="mt-0.5 size-5 text-primary" />
        <div>
          <h1 className="text-xl font-bold tracking-tight">Server Logging</h1>
          <p className="mt-1 text-xs text-muted-foreground">Choose which server activity Mitto sends to your Discord log channel{data.guildName ? ` · ${data.guildName}` : ""}.</p>
        </div>
      </div>

      <SaveBar dirty={dirty} saving={saveMutation.isPending} onSave={save} onReset={reset} />

      <Card className="border-border/40 bg-card/40">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div><CardTitle className="text-sm font-semibold">Audit log destination</CardTitle><CardDescription className="text-xs">Logging is disabled until you enable it and select a channel.</CardDescription></div>
          <Switch checked={logs.enabled} onCheckedChange={(enabled) => updateLog({ enabled })} aria-label="Enable server logging" />
        </CardHeader>
        <CardContent>
          <label className="text-xs text-muted-foreground">Log channel</label>
          <CustomSelect value={logs.channelId} onChange={(channelId) => updateLog({ channelId })} options={channels.map((channel) => ({ value: channel.id, label: `#${channel.name}` }))} allowNone noneLabel="— None —" placeholder="Select a channel…" aria-label="Server log channel" triggerClassName="mt-1 text-xs font-mono" />
        </CardContent>
      </Card>

      <Card className="border-border/40 bg-card/40">
        <CardHeader><CardTitle className="text-sm font-semibold">Event categories</CardTitle><CardDescription className="text-xs">Control which activity categories are sent to the selected log channel.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {EVENT_OPTIONS.map(({ key, label, description }) => (
            <div key={key} className="flex items-start gap-2 text-xs">
              <Switch checked={logs[key]} onCheckedChange={(checked) => updateLog({ [key]: checked })} aria-label={`Log ${label}`} />
              <span><strong className="font-medium text-foreground">{label}</strong><span className="block text-[10px] text-muted-foreground">{description}</span></span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
