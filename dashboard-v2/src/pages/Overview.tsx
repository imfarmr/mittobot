import { useQuery } from "@tanstack/react-query";
import { Zap, Users, Hash, Activity, Cpu, MemoryStick, Timer, Gauge, History } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useGuild, useBotStatus, useGuildMeta } from "@/hooks/useGuild";
import { get, guildPath } from "@/lib/api";
import { formatUptime, timeAgo } from "@/lib/utils";

interface DashboardAuditEntry {
  id: number;
  actor_tag: string;
  action: string;
  created_at: number;
}

export default function Overview() {
  const { guildId, guild } = useGuild();
  const { data: status } = useBotStatus();
  const { data: meta } = useGuildMeta(guildId);

  const { data: auditData, isLoading: loadingAudit } = useQuery<{ entries: DashboardAuditEntry[] }>({
    queryKey: ["guild", guildId, "dashboard-audit"],
    queryFn: () => get(guildPath("/api/dashboard-audit?limit=50", guildId)),
    enabled: !!guildId,
    refetchInterval: 10_000,
  });

  // Live system telemetry from GET /api/status (polled by useBotStatus).
  // Replaces the previous fake "Terminal logs" simulator that fabricated
  // random hardcoded messages every 4.5s and fell back to a literal 42 for
  // the member count.
  const memUsed = status?.memoryUsedMb;
  const memTotal = status?.memoryTotalMb;
  const memPct = typeof memUsed === "number" && typeof memTotal === "number" && memTotal > 0
    ? Math.round((memUsed / memTotal) * 100)
    : null;
  const cpuLoad = status?.cpuLoad;

  const telemetry: { label: string; value: string; sub?: string; icon: typeof Zap }[] = [
    { label: "Server latency", value: status?.ping != null ? `${status.ping}ms` : "—", sub: "Gateway heartbeat", icon: Zap },
    { label: "Process Uptime", value: status?.uptimeMs != null ? formatUptime(status.uptimeMs) : "—", sub: status?.processUptimeSec != null ? `${status.processUptimeSec}s` : undefined, icon: Timer },
    { label: "RAM", value: memUsed != null ? `${memUsed} / ${memTotal ?? "?"} MB` : "—", sub: memPct != null ? `${memPct}% used` : undefined, icon: MemoryStick },
    { label: "commands per min", value: status?.commandsPerMin != null ? String(status.commandsPerMin) : "—", sub: "rolling 60s", icon: Gauge },
    { label: "active ai chats", value: status?.activeAiConversations != null ? String(status.activeAiConversations) : "—", sub: "last 10 min", icon: Activity },
    { label: "CPU Load", value: cpuLoad ? cpuLoad.load1.toFixed(2) : "—", sub: cpuLoad ? `${cpuLoad.cpuCount} cores · 1m avg` : undefined, icon: Cpu },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Overview</h1>
          <p className="text-sm text-muted-foreground">{guild?.name || "Server"}</p>
        </div>
        {status?.tag && (
          <div className="text-xs font-mono text-muted-foreground">
            {status.tag} · {status.ping ? `${status.ping}ms` : "—"}
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-border/40 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Total Members
            </CardTitle>
            <Users className="size-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight font-mono">
              {guild?.memberCount != null ? guild.memberCount.toLocaleString() : "—"}
            </div>
            <p className="text-[10px] text-muted-foreground font-mono mt-1">Online and cached users</p>
          </CardContent>
        </Card>

        <Card className="border-border/40 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Channels
            </CardTitle>
            <Hash className="size-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight font-mono">
              {meta?.channels?.length ?? "—"}
            </div>
            <p className="text-[10px] text-muted-foreground font-mono mt-1">Text, voice, and stages</p>
          </CardContent>
        </Card>

        <Card className="border-border/40 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Bot Guilds
            </CardTitle>
            <Activity className="size-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight font-mono text-warning">
              {status?.guilds != null ? status.guilds.toLocaleString() : "—"}
            </div>
            <p className="text-[10px] text-muted-foreground font-mono mt-1">Servers across all shards</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Side: Live System Telemetry (real, from /api/status) */}
        <Card className="lg:col-span-2 border-border/40 bg-card/40">
          <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-border/20">
            <div className="space-y-0.5">
              <CardTitle className="text-sm font-semibold tracking-wider uppercase text-muted-foreground">
                Bot Status
              </CardTitle>
              <CardDescription className="text-xs">real-time bot api status</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {telemetry.map((m) => (
                <div key={m.label} className="rounded-lg border border-border/30 bg-background-alt/30 p-3">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    <m.icon className="size-3.5" />
                    {m.label}
                  </div>
                  <div className="text-lg font-bold font-mono mt-1">{m.value}</div>
                  {m.sub && <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{m.sub}</div>}
                </div>
              ))}
            </div>
            {status?.nodeRuntime && (
              <div className="mt-3 text-[10px] font-mono text-muted-foreground border-t border-border/20 pt-2">
                Node {status.nodeRuntime.version} · {status.nodeRuntime.platform}/{status.nodeRuntime.arch} · pid {status.nodeRuntime.pid}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right Side: dashboard audit feed */}
        <Card className="border-border/40 bg-card/40 flex flex-col h-[400px]">
          <CardHeader className="pb-4 border-b border-border/20 shrink-0">
            <CardTitle className="text-sm font-semibold tracking-wider uppercase text-muted-foreground flex items-center gap-2">
              <History className="size-4 text-primary" /> Dashboard activity
            </CardTitle>
            <CardDescription className="text-xs">Refreshes every 10 seconds</CardDescription>
          </CardHeader>
          <ScrollArea className="flex-1 p-4">
            {loadingAudit ? (
              <div className="space-y-4">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="space-y-2 py-2">
                    <div className="space-y-1">
                      <div className="h-3 w-40 bg-muted animate-pulse rounded" />
                      <div className="h-3 w-28 bg-muted animate-pulse rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : !auditData?.entries.length ? (
              <p className="py-10 text-center text-xs text-muted-foreground">No dashboard activity recorded yet.</p>
            ) : (
              <div className="space-y-3">
                {auditData.entries.map((entry) => (
                  <div key={entry.id} className="border-l-2 border-primary/50 pl-3 py-0.5">
                    <p className="text-xs text-foreground leading-snug">{entry.action}</p>
                    <div className="mt-1 flex items-center justify-between gap-2 text-[10px] font-mono text-muted-foreground">
                      <span className="truncate">{entry.actor_tag}</span>
                      <span className="shrink-0">{timeAgo(entry.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </Card>
      </div>
    </div>
  );
}
