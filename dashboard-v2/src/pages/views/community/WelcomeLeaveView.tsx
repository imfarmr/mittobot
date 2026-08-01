import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { CustomSelect } from "@/components/app/CustomSelect";
import { DiscordMessagePreview } from "@/components/app/DiscordMessagePreview";
import { SaveBar } from "@/components/app/SaveBar";
import { useGuild } from "@/hooks/useGuild";
import { useGreetConfig, type GreetConfig } from "@/hooks/useGreetConfig";
import { MessageSquareText, LogIn, LogOut } from "lucide-react";
import { toast } from "sonner";

function previewText(text: string, guildName: string) {
  return text
    .replace(/\{user\}/g, "@Wumpus")
    .replace(/\{tag\}/g, "Wumpus#0001")
    .replace(/\{username\}/g, "Wumpus")
    .replace(/\{server\}/g, guildName || "Your server")
    .replace(/\{count\}/g, "42");
}

export default function WelcomeLeaveView() {
  const { guildId } = useGuild();
  const { data, isLoading, saveMutation } = useGreetConfig(guildId);
  const config: GreetConfig["config"] = data?.config || {};
  const channels = data?.channels || [];

  const [welcomeEnabled, setWelcomeEnabled] = useState(false);
  const [welcomeChannel, setWelcomeChannel] = useState("");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [leaveEnabled, setLeaveEnabled] = useState(false);
  const [leaveChannel, setLeaveChannel] = useState("");
  const [leaveMessage, setLeaveMessage] = useState("");

  useEffect(() => {
    if (!data?.config) return;
    setWelcomeEnabled(config.welcome?.enabled ?? false);
    setWelcomeChannel(config.welcome?.channelId || "");
    setWelcomeMessage(config.welcome?.message || "");
    setLeaveEnabled(config.leave?.enabled ?? false);
    setLeaveChannel(config.leave?.channelId || "");
    setLeaveMessage(config.leave?.message || "");
  }, [data]);

  if (!guildId) return <div className="p-6 text-sm text-muted-foreground">Select a guild first.</div>;
  if (isLoading || !data) return <div className="p-6 text-sm text-muted-foreground">Loading welcome and leave settings…</div>;

  const savedWelcome: NonNullable<GreetConfig["config"]["welcome"]> = config.welcome ?? { enabled: false, channelId: null, message: "" };
  const savedLeave: NonNullable<GreetConfig["config"]["leave"]> = config.leave ?? { enabled: false, channelId: null, message: "" };
  const dirty = welcomeEnabled !== (savedWelcome.enabled ?? false)
    || welcomeChannel !== (savedWelcome.channelId || "")
    || welcomeMessage !== (savedWelcome.message || "")
    || leaveEnabled !== (savedLeave.enabled ?? false)
    || leaveChannel !== (savedLeave.channelId || "")
    || leaveMessage !== (savedLeave.message || "");

  const reset = () => {
    setWelcomeEnabled(savedWelcome.enabled ?? false);
    setWelcomeChannel(savedWelcome.channelId || "");
    setWelcomeMessage(savedWelcome.message || "");
    setLeaveEnabled(savedLeave.enabled ?? false);
    setLeaveChannel(savedLeave.channelId || "");
    setLeaveMessage(savedLeave.message || "");
    toast("Changes discarded");
  };

  const save = () => {
    saveMutation.mutate({
      welcome: { enabled: welcomeEnabled, channelId: welcomeChannel || null, message: welcomeMessage },
      leave: { enabled: leaveEnabled, channelId: leaveChannel || null, message: leaveMessage },
    }, {
      onSuccess: () => toast.success("Welcome and leave settings saved"),
      onError: (error: any) => toast.error(error.message || "Save failed"),
    });
  };

  const channelOptions = channels.map((channel) => ({ value: channel.id, label: `#${channel.name}` }));
  const channelName = (channelId: string) => channels.find((channel) => channel.id === channelId)?.name;
  const guildName = data.guildName || "Your server";

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <MessageSquareText className="mt-0.5 size-5 text-primary" />
        <div>
          <h1 className="text-xl font-bold tracking-tight">Welcome & Leave</h1>
          <p className="mt-1 text-xs text-muted-foreground">Customize the messages Mitto sends when members join or leave {data.guildName ? `· ${data.guildName}` : "this server"}.</p>
        </div>
      </div>

      <SaveBar dirty={dirty} saving={saveMutation.isPending} onSave={save} onReset={reset} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/40 bg-card/40">
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div className="flex items-start gap-3"><div className="flex size-9 items-center justify-center rounded-xl bg-success/12 text-success"><LogIn className="size-4" /></div><div><CardTitle className="text-sm font-semibold">Welcome messages</CardTitle><CardDescription className="text-xs">Sent when a member joins</CardDescription></div></div>
            <Switch checked={welcomeEnabled} onCheckedChange={setWelcomeEnabled} aria-label="Enable welcome messages" />
          </CardHeader>
          <CardContent className="grid gap-5 xl:grid-cols-2">
            <div className="space-y-4">
              <div><label className="text-xs text-muted-foreground">Channel</label><CustomSelect value={welcomeChannel} onChange={setWelcomeChannel} options={channelOptions} allowNone noneLabel="— None —" placeholder="Select a channel…" aria-label="Welcome channel" triggerClassName="mt-1 text-xs font-mono" /></div>
              <div><label className="text-xs text-muted-foreground">Message ({welcomeMessage.length}/1500)</label><Textarea className="mt-1 min-h-28 resize-y text-xs font-mono" value={welcomeMessage} onChange={(event) => setWelcomeMessage(event.target.value.slice(0, 1500))} placeholder="Welcome {user} to **{server}**!" /><p className="mt-1.5 text-[10px] text-muted-foreground">Supports <code>{"{user}"}</code>, <code>{"{tag}"}</code>, <code>{"{server}"}</code>, and <code>{"{count}"}</code>.</p></div>
            </div>
            <DiscordMessagePreview content={previewText(welcomeMessage, guildName)} guildName={guildName} channelName={channelName(welcomeChannel)} enabled={welcomeEnabled} accent="success" eventLabel="welcome" />
          </CardContent>
        </Card>

        <Card className="border-border/40 bg-card/40">
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div className="flex items-start gap-3"><div className="flex size-9 items-center justify-center rounded-xl bg-destructive/12 text-destructive"><LogOut className="size-4" /></div><div><CardTitle className="text-sm font-semibold">Leave messages</CardTitle><CardDescription className="text-xs">Sent when a member leaves</CardDescription></div></div>
            <Switch checked={leaveEnabled} onCheckedChange={setLeaveEnabled} aria-label="Enable leave messages" />
          </CardHeader>
          <CardContent className="grid gap-5 xl:grid-cols-2">
            <div className="space-y-4">
              <div><label className="text-xs text-muted-foreground">Channel</label><CustomSelect value={leaveChannel} onChange={setLeaveChannel} options={channelOptions} allowNone noneLabel="— None —" placeholder="Select a channel…" aria-label="Leave channel" triggerClassName="mt-1 text-xs font-mono" /></div>
              <div><label className="text-xs text-muted-foreground">Message ({leaveMessage.length}/1500)</label><Textarea className="mt-1 min-h-28 resize-y text-xs font-mono" value={leaveMessage} onChange={(event) => setLeaveMessage(event.target.value.slice(0, 1500))} placeholder="{tag} left the server." /><p className="mt-1.5 text-[10px] text-muted-foreground">Use the same member and server placeholders as welcome messages.</p></div>
            </div>
            <DiscordMessagePreview content={previewText(leaveMessage, guildName)} guildName={guildName} channelName={channelName(leaveChannel)} enabled={leaveEnabled} accent="danger" eventLabel="leave" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
