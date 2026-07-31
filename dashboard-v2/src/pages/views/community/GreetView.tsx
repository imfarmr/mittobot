import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useGuild } from "@/hooks/useGuild";
import { guildPath } from "@/lib/api";
import { SaveBar } from "@/components/app/SaveBar";
import { CustomSelect } from "@/components/app/CustomSelect";

interface GreetConfig {
  guildId: string; hasGuild: boolean; guildName: string;
  channels: { id: string; name: string }[];
  config: {
    welcome?: { enabled: boolean; channelId?: string | null; message?: string };
    leave?: { enabled: boolean; channelId?: string | null; message?: string };
    logs?: {
      enabled: boolean;
      channelId?: string | null;
      memberEvents?: boolean;
      messageEvents?: boolean;
      serverEvents?: boolean;
      moderationEvents?: boolean;
      voiceEvents?: boolean;
      inviteEvents?: boolean;
      threadEvents?: boolean;
      bulkMessageEvents?: boolean;
    };
  };
}

export default function GreetView() {
  const { guildId } = useGuild();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<GreetConfig>({
    queryKey: ["greet", guildId],
    queryFn: () => get(guildPath("/api/greet", guildId)),
    enabled: !!guildId,
  });

  const saveMutation = useMutation({
    mutationFn: (body: any) => post(guildPath("/api/greet", guildId), body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["greet", guildId] });
      toast.success("Greet configuration saved successfully");
    },
    onError: (e: any) => toast.error(e.message || "Save failed"),
  });

  const cfg: GreetConfig["config"] = data?.config || {};

  const [welcomeEnabled, setWelcomeEnabled] = useState(false);
  const [welcomeCh, setWelcomeCh] = useState("");
  const [welcomeMsg, setWelcomeMsg] = useState("");
  const [leaveEnabled, setLeaveEnabled] = useState(false);
  const [leaveCh, setLeaveCh] = useState("");
  const [leaveMsg, setLeaveMsg] = useState("");
  const [logsEnabled, setLogsEnabled] = useState(false);
  const [logsCh, setLogsCh] = useState("");
  const [memberEvents, setMemberEvents] = useState(true);
  const [messageEvents, setMessageEvents] = useState(true);
  const [serverEvents, setServerEvents] = useState(true);
  const [moderationEvents, setModerationEvents] = useState(true);
  const [voiceEvents, setVoiceEvents] = useState(true);
  const [inviteEvents, setInviteEvents] = useState(true);
  const [threadEvents, setThreadEvents] = useState(true);
  const [bulkMessageEvents, setBulkMessageEvents] = useState(true);

  // Sync state when data is loaded/updated
  useEffect(() => {
    if (data?.config) {
      setWelcomeEnabled(cfg.welcome?.enabled ?? false);
      setWelcomeCh(cfg.welcome?.channelId || "");
      setWelcomeMsg(cfg.welcome?.message || "");
      setLeaveEnabled(cfg.leave?.enabled ?? false);
      setLeaveCh(cfg.leave?.channelId || "");
      setLeaveMsg(cfg.leave?.message || "");
      setLogsEnabled(cfg.logs?.enabled ?? false);
      setLogsCh(cfg.logs?.channelId || "");
      setMemberEvents(cfg.logs?.memberEvents ?? true);
      setMessageEvents(cfg.logs?.messageEvents ?? true);
      setServerEvents(cfg.logs?.serverEvents ?? true);
      setModerationEvents(cfg.logs?.moderationEvents ?? true);
      setVoiceEvents(cfg.logs?.voiceEvents ?? true);
      setInviteEvents(cfg.logs?.inviteEvents ?? true);
      setThreadEvents(cfg.logs?.threadEvents ?? true);
      setBulkMessageEvents(cfg.logs?.bulkMessageEvents ?? true);
    }
  }, [data]);

  if (!guildId) return <div className="p-6 text-sm text-muted-foreground">Select a guild first.</div>;
  if (isLoading || !data) return <div className="p-6 text-sm text-muted-foreground">Loading greet config...</div>;

  const dirty =
    welcomeEnabled !== (cfg.welcome?.enabled ?? false) ||
    welcomeCh !== (cfg.welcome?.channelId || "") ||
    welcomeMsg !== (cfg.welcome?.message || "") ||
    leaveEnabled !== (cfg.leave?.enabled ?? false) ||
    leaveCh !== (cfg.leave?.channelId || "") ||
    leaveMsg !== (cfg.leave?.message || "") ||
    logsEnabled !== (cfg.logs?.enabled ?? false) ||
    logsCh !== (cfg.logs?.channelId || "") ||
    memberEvents !== (cfg.logs?.memberEvents ?? true) ||
    messageEvents !== (cfg.logs?.messageEvents ?? true) ||
    serverEvents !== (cfg.logs?.serverEvents ?? true) ||
    moderationEvents !== (cfg.logs?.moderationEvents ?? true) ||
    voiceEvents !== (cfg.logs?.voiceEvents ?? true) ||
    inviteEvents !== (cfg.logs?.inviteEvents ?? true) ||
    threadEvents !== (cfg.logs?.threadEvents ?? true) ||
    bulkMessageEvents !== (cfg.logs?.bulkMessageEvents ?? true);

  const handleSave = () => {
    saveMutation.mutate({
      welcome: { enabled: welcomeEnabled, channelId: welcomeCh || null, message: welcomeMsg },
      leave: { enabled: leaveEnabled, channelId: leaveCh || null, message: leaveMsg },
      logs: {
        enabled: logsEnabled,
        channelId: logsCh || null,
        memberEvents,
        messageEvents,
        serverEvents,
        moderationEvents,
        voiceEvents,
        inviteEvents,
        threadEvents,
        bulkMessageEvents,
      },
    });
  };

  const handleReset = () => {
    if (data) {
      setWelcomeEnabled(cfg.welcome?.enabled ?? false);
      setWelcomeCh(cfg.welcome?.channelId || "");
      setWelcomeMsg(cfg.welcome?.message || "");
      setLeaveEnabled(cfg.leave?.enabled ?? false);
      setLeaveCh(cfg.leave?.channelId || "");
      setLeaveMsg(cfg.leave?.message || "");
      setLogsEnabled(cfg.logs?.enabled ?? false);
      setLogsCh(cfg.logs?.channelId || "");
      setMemberEvents(cfg.logs?.memberEvents ?? true);
      setMessageEvents(cfg.logs?.messageEvents ?? true);
      setServerEvents(cfg.logs?.serverEvents ?? true);
      setModerationEvents(cfg.logs?.moderationEvents ?? true);
      setVoiceEvents(cfg.logs?.voiceEvents ?? true);
      setInviteEvents(cfg.logs?.inviteEvents ?? true);
      setThreadEvents(cfg.logs?.threadEvents ?? true);
      setBulkMessageEvents(cfg.logs?.bulkMessageEvents ?? true);
      toast("Changes discarded");
    }
  };

  return (
    <div className="space-y-4">
      <SaveBar
        dirty={dirty}
        saving={saveMutation.isPending}
        onSave={handleSave}
        onReset={handleReset}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-border/40 bg-card/40">
          <CardHeader className="flex flex-row items-center justify-between">
            <div><CardTitle className="text-sm font-semibold">Welcome Messages</CardTitle><CardDescription className="text-xs">Sent when a member joins</CardDescription></div>
            <Switch checked={welcomeEnabled} onCheckedChange={setWelcomeEnabled} />
          </CardHeader>
          <CardContent className="space-y-3">
            <div><label className="text-xs text-muted-foreground">Channel</label>
              <CustomSelect
                value={welcomeCh}
                onChange={setWelcomeCh}
                options={data.channels.map(c => ({ value: c.id, label: `#${c.name}` }))}
                allowNone
                noneLabel="— None —"
                placeholder="Select a channel…"
                aria-label="Welcome channel"
                triggerClassName="mt-1 text-xs font-mono"
              />
            </div>
            <div><label className="text-xs text-muted-foreground">Message ({welcomeMsg.length}/1500)</label>
              <Textarea className="mt-1 text-xs font-mono h-20 resize-y" value={welcomeMsg} onChange={e => setWelcomeMsg(e.target.value.slice(0, 1500))} placeholder="Welcome {user} to {server}!" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/40 bg-card/40">
          <CardHeader className="flex flex-row items-center justify-between">
            <div><CardTitle className="text-sm font-semibold">Leave Messages</CardTitle><CardDescription className="text-xs">Sent when a member leaves</CardDescription></div>
            <Switch checked={leaveEnabled} onCheckedChange={setLeaveEnabled} />
          </CardHeader>
          <CardContent className="space-y-3">
            <div><label className="text-xs text-muted-foreground">Channel</label>
              <CustomSelect
                value={leaveCh}
                onChange={setLeaveCh}
                options={data.channels.map(c => ({ value: c.id, label: `#${c.name}` }))}
                allowNone
                noneLabel="— None —"
                placeholder="Select a channel…"
                aria-label="Leave channel"
                triggerClassName="mt-1 text-xs font-mono"
              />
            </div>
            <div><label className="text-xs text-muted-foreground">Message ({leaveMsg.length}/1500)</label>
              <Textarea className="mt-1 text-xs font-mono h-20 resize-y" value={leaveMsg} onChange={e => setLeaveMsg(e.target.value.slice(0, 1500))} placeholder="{user} left {server}" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/40 bg-card/40">
        <CardHeader className="flex flex-row items-center justify-between">
          <div><CardTitle className="text-sm font-semibold">Server Logging</CardTitle><CardDescription className="text-xs">Choose which server activity should be sent to the log channel</CardDescription></div>
          <Switch checked={logsEnabled} onCheckedChange={setLogsEnabled} />
        </CardHeader>
        <CardContent className="space-y-3">
          <div><label className="text-xs text-muted-foreground">Log Channel</label>
            <CustomSelect
              value={logsCh}
              onChange={setLogsCh}
              options={data.channels.map(c => ({ value: c.id, label: `#${c.name}` }))}
              allowNone
              noneLabel="— None —"
              placeholder="Select a channel…"
              aria-label="Audit log channel"
              triggerClassName="mt-1 text-xs font-mono"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
            <div className="flex items-center gap-2 text-xs">
              <Switch checked={memberEvents} onCheckedChange={setMemberEvents} aria-label="Log member events" />
              <span><strong className="font-medium text-foreground">Member events</strong><span className="block text-[10px] text-muted-foreground">Joins, leaves, nicknames, and roles</span></span>
            </div>
            <div className="flex items-start gap-2 text-xs">
              <Switch checked={messageEvents} onCheckedChange={setMessageEvents} aria-label="Log message events" />
              <span><strong className="font-medium text-foreground">Message events</strong><span className="block text-[10px] text-muted-foreground">Edits and deletions</span></span>
            </div>
            <div className="flex items-start gap-2 text-xs">
              <Switch checked={serverEvents} onCheckedChange={setServerEvents} aria-label="Log server events" />
              <span><strong className="font-medium text-foreground">Server events</strong><span className="block text-[10px] text-muted-foreground">Channel and role changes</span></span>
            </div>
            <div className="flex items-start gap-2 text-xs">
              <Switch checked={moderationEvents} onCheckedChange={setModerationEvents} aria-label="Log moderation events" />
              <span><strong className="font-medium text-foreground">Moderation events</strong><span className="block text-[10px] text-muted-foreground">Bans and unbans</span></span>
            </div>
            <div className="flex items-start gap-2 text-xs">
              <Switch checked={voiceEvents} onCheckedChange={setVoiceEvents} aria-label="Log voice events" />
              <span><strong className="font-medium text-foreground">Voice activity</strong><span className="block text-[10px] text-muted-foreground">Joins, leaves, and moves</span></span>
            </div>
            <div className="flex items-start gap-2 text-xs">
              <Switch checked={inviteEvents} onCheckedChange={setInviteEvents} aria-label="Log invite events" />
              <span><strong className="font-medium text-foreground">Invite events</strong><span className="block text-[10px] text-muted-foreground">Created and deleted invites</span></span>
            </div>
            <div className="flex items-start gap-2 text-xs">
              <Switch checked={threadEvents} onCheckedChange={setThreadEvents} aria-label="Log thread events" />
              <span><strong className="font-medium text-foreground">Thread events</strong><span className="block text-[10px] text-muted-foreground">Created, renamed, and deleted threads</span></span>
            </div>
            <div className="flex items-start gap-2 text-xs">
              <Switch checked={bulkMessageEvents} onCheckedChange={setBulkMessageEvents} aria-label="Log bulk message events" />
              <span><strong className="font-medium text-foreground">Bulk deletions</strong><span className="block text-[10px] text-muted-foreground">Summarize purge events without content</span></span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
