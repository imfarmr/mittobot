import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { get, post } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ErrorRetry } from "@/components/app/ErrorRetry";
import { Activity, Wifi, Layers, Users, MemoryStick, Cpu, Clock, Bot, Radio } from "lucide-react";
import { toast } from "sonner";
import { LoadingFallback } from "@/components/app/LoadingFallback";
import { FadeIn } from "@/components/animations/FadeIn";

interface BotStatus {
  online: boolean; prefix: string; tag: string; uptimeMs: number; ping: number;
  guilds: number; users: number; memoryUsedMb: number; memoryTotalMb: number;
  cpuLoad: { load1: number; load5: number; load15: number; cpuCount: number };
  processUptimeSec: number; nodeRuntime: { version: string; platform: string; arch: string; pid: number };
  activeAiConversations: number; commandsPerMin: number;
  activity: { name: string; type: number } | null;
}

function formatUptime(ms: number) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h ${m % 60}m`;
}

function StatCard({ icon: Icon, label, value, sub, accent }: { icon: any; label: string; value: string; sub?: string; accent?: string }) {
  return (
    <FadeIn>
      <Card className="border-border/40 bg-card/50">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</CardTitle>
          <Icon className={`size-4 ${accent || "text-primary"}`} />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold tracking-tight font-mono">{value}</div>
          {sub && <p className="text-[10px] text-muted-foreground font-mono mt-1">{sub}</p>}
        </CardContent>
      </Card>
    </FadeIn>
  );
}

const ACTIVITY_TYPES: Record<number, string> = {
  0: "Playing", 1: "Streaming", 2: "Listening", 3: "Watching",
  4: "Custom", 5: "Competing",
};

export default function StatusView() {
  const { user } = useAuth();
  const { data, isLoading, error } = useQuery<BotStatus>({
    queryKey: ["status"], queryFn: () => get("/api/status"),
    refetchInterval: 10_000,
  });

  // Presence editor state
  const [presenceText, setPresenceText] = useState("");
  const [presenceType, setPresenceType] = useState(3);

  useEffect(() => {
    if (data?.activity) {
      setPresenceText(data.activity.name);
      setPresenceType(data.activity.type);
    }
  }, [data?.activity]);

  const presenceMut = useMutation({
    mutationFn: (body: { text: string; type: number }) => post("/api/presence", body),
    onSuccess: () => toast.success("Presence updated"),
    onError: (e: any) => toast.error(e.message || "Update failed"),
  });

  const handleSavePresence = () => {
    if (!presenceText.trim()) { toast.error("Presence text required"); return; }
    presenceMut.mutate({ text: presenceText.trim(), type: presenceType });
  };

  if (isLoading) return <LoadingFallback text="Loading status..." />;
  if (error || !data) return <ErrorRetry message="Failed to load bot status" onRetry={() => window.location.reload()} />;

  const memPct = data.memoryTotalMb > 0 ? Math.round((data.memoryUsedMb / data.memoryTotalMb) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Activity} label="Status" value={data.online ? "Online" : "Offline"} sub={data.tag} accent={data.online ? "text-success" : "text-destructive"} />
        <StatCard icon={Wifi} label="Latency" value={`${data.ping}ms`} sub="WebSocket heartbeat" accent="text-warning" />
        <StatCard icon={Layers} label="Guilds" value={String(data.guilds)} sub="Servers connected" />
        <StatCard icon={Users} label="Users" value={data.users.toLocaleString()} sub="Across all guilds" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Clock} label="Bot Uptime" value={formatUptime(data.uptimeMs)} sub="Since last ready" />
        <StatCard icon={Cpu} label="Process Uptime" value={formatUptime(data.processUptimeSec * 1000)} sub="Node.js process" />
        <StatCard icon={MemoryStick} label="Memory" value={`${data.memoryUsedMb}MB / ${data.memoryTotalMb}MB`} sub={`${memPct}% of system RAM`} />
        <StatCard icon={Bot} label="Commands/min" value={String(data.commandsPerMin)} sub="Rolling 60s window" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-border/40 bg-card/40">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Memory</CardTitle>
            <CardDescription className="text-xs">System RAM usage</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-mono">{data.memoryUsedMb} MB / {data.memoryTotalMb} MB</span>
              <span className="text-xs text-muted-foreground font-mono">{memPct}% used</span>
            </div>
            <div className="h-2 w-full rounded-full bg-background-alt/50 overflow-hidden">
              <div
                className="h-full rounded-full bg-info transition-all duration-500"
                style={{ width: `${Math.min(memPct, 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">Memory consumption of the bot process relative to total system RAM.</p>
          </CardContent>
        </Card>

        <Card className="border-border/40 bg-card/40">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">CPU Load</CardTitle>
            <CardDescription className="text-xs">Load average over 1, 5 and 15 minutes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              { label: "1 min", value: data.cpuLoad.load1 },
              { label: "5 min", value: data.cpuLoad.load5 },
              { label: "15 min", value: data.cpuLoad.load15 },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground text-xs font-mono">{label}</span>
                <span className="font-mono">{value.toFixed(2)}</span>
              </div>
            ))}
            <p className="text-xs text-muted-foreground pt-1">{data.cpuLoad.cpuCount} logical cores available</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/40 bg-card/40">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Runtime</CardTitle>
          <CardDescription className="text-xs">Node.js runtime details</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div className="space-y-0.5">
            <span className="text-xs text-muted-foreground block">Node.js</span>
            <span className="font-mono">{data.nodeRuntime.version}</span>
          </div>
          <div className="space-y-0.5">
            <span className="text-xs text-muted-foreground block">Platform</span>
            <span className="font-mono">{data.nodeRuntime.platform} / {data.nodeRuntime.arch}</span>
          </div>
          <div className="space-y-0.5">
            <span className="text-xs text-muted-foreground block">PID</span>
            <span className="font-mono">{data.nodeRuntime.pid}</span>
          </div>
          <div className="space-y-0.5">
            <span className="text-xs text-muted-foreground block">Prefix</span>
            <span className="font-mono">{data.prefix || "$"}</span>
          </div>
        </CardContent>
      </Card>

      {/* Presence Editor — owner only */}
      {user?.isOwner && (
        <Card className="border-border/40 bg-card/40">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2"><Radio className="size-4 text-primary" /> Bot Presence</CardTitle>
            <CardDescription className="text-xs">Set the bot's activity status (owner only)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_160px] gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Activity Text</label>
                <Input className="mt-1 text-xs" value={presenceText} onChange={e => setPresenceText(e.target.value.slice(0, 128))} placeholder="$help | mambo" onKeyDown={e => e.key === "Enter" && handleSavePresence()} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Type</label>
                <select className="w-full mt-1 bg-background-alt/50 border border-border/40 rounded-lg p-2 text-xs font-mono" value={presenceType} onChange={e => setPresenceType(parseInt(e.target.value))}>
                  {Object.entries(ACTIVITY_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button size="sm" onClick={handleSavePresence} disabled={presenceMut.isPending || !presenceText.trim()}>
                {presenceMut.isPending ? "Saving…" : "Set Presence"}
              </Button>
              {data.activity && (
                <span className="text-[10px] text-muted-foreground font-mono">
                  Current: {ACTIVITY_TYPES[data.activity.type] || "Unknown"} {data.activity.name}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
