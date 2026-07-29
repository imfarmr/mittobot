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
import { ScrollText } from "lucide-react";
import { LoadingFallback } from "@/components/app/LoadingFallback";
import { FadeIn } from "@/components/animations/FadeIn";

interface GreetConfig {
  guildId: string; hasGuild: boolean; guildName: string;
  channels: { id: string; name: string }[];
  config: {
    welcome?: { enabled: boolean; channelId?: string | null; message?: string };
    leave?: { enabled: boolean; channelId?: string | null; message?: string };
    logs?: { enabled: boolean; channelId?: string | null; memberEvents?: boolean; messageEvents?: boolean };
  };
}
// Note: Server logging has been moved to a dedicated module under Moderation → Server Logging.
// The logs config is still returned by the API for backward compat but is no longer editable here.

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
  // Sync state when data is loaded/updated
  useEffect(() => {
    if (data?.config) {
      setWelcomeEnabled(cfg.welcome?.enabled ?? false);
      setWelcomeCh(cfg.welcome?.channelId || "");
      setWelcomeMsg(cfg.welcome?.message || "");
      setLeaveEnabled(cfg.leave?.enabled ?? false);
      setLeaveCh(cfg.leave?.channelId || "");
      setLeaveMsg(cfg.leave?.message || "");
    }
  }, [data]);

  if (!guildId) return <div className="p-6 text-sm text-muted-foreground">Select a guild first.</div>;
  if (isLoading || !data) return <LoadingFallback text="Loading greet config..." />;

  const dirty =
    welcomeEnabled !== (cfg.welcome?.enabled ?? false) ||
    welcomeCh !== (cfg.welcome?.channelId || "") ||
    welcomeMsg !== (cfg.welcome?.message || "") ||
    leaveEnabled !== (cfg.leave?.enabled ?? false) ||
    leaveCh !== (cfg.leave?.channelId || "") ||
    leaveMsg !== (cfg.leave?.message || "");

  const handleSave = () => {
    saveMutation.mutate({
      welcome: { enabled: welcomeEnabled, channelId: welcomeCh || null, message: welcomeMsg },
      leave: { enabled: leaveEnabled, channelId: leaveCh || null, message: leaveMsg },
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
      toast("Changes discarded");
    }
  };

  return (
    <>
      <SaveBar
        dirty={dirty}
        saving={saveMutation.isPending}
        onSave={handleSave}
        onReset={handleReset}
      />
      <FadeIn>
        <div className="space-y-4 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-border/40 bg-card/40">
            <CardHeader className="flex flex-row items-center justify-between">
              <div><CardTitle className="text-sm font-semibold">Welcome Messages</CardTitle><CardDescription className="text-xs">Sent when a member joins</CardDescription></div>
              <Switch checked={welcomeEnabled} onCheckedChange={setWelcomeEnabled} />
            </CardHeader>
            <CardContent className="space-y-3">
              <div><label className="text-xs text-muted-foreground">Channel</label>
                <select className="w-full mt-1 bg-background-alt/50 border border-border/40 rounded-lg p-2 text-xs font-mono" value={welcomeCh} onChange={e => setWelcomeCh(e.target.value)}>
                  <option value="">— None —</option>
                  {data.channels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
                </select>
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
                <select className="w-full mt-1 bg-background-alt/50 border border-border/40 rounded-lg p-2 text-xs font-mono" value={leaveCh} onChange={e => setLeaveCh(e.target.value)}>
                  <option value="">— None —</option>
                  {data.channels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
                </select>
              </div>
              <div><label className="text-xs text-muted-foreground">Message ({leaveMsg.length}/1500)</label>
                <Textarea className="mt-1 text-xs font-mono h-20 resize-y" value={leaveMsg} onChange={e => setLeaveMsg(e.target.value.slice(0, 1500))} placeholder="{user} left {server}" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/40 bg-card/40">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ScrollText className="size-4 text-primary shrink-0" />
              <span>
                Server logging has moved to{" "}
                <a href={`#/g/${guildId}/moderation/logging`} className="text-primary font-medium hover:underline">
                  Moderation → Server Logging
                </a>
                — now with 22 individually toggleable event types.
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
      </FadeIn>
    </>
  );
}
