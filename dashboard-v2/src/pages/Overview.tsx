import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Zap, Users, Hash, Activity, Cpu, MemoryStick, Timer, Gauge } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { useGuild, useBotStatus, useGuildMeta } from "@/hooks/useGuild";
import { get, post } from "@/lib/api";
import { formatUptime } from "@/lib/utils";
import { AnimatedNumber } from "@/components/animations/AnimatedNumber";
import { FadeIn } from "@/components/animations/FadeIn";
import { LiveMetric } from "@/components/app/LiveMetric";

interface Feature {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  commands: string[];
}

export default function Overview() {
  const { guildId, guild } = useGuild();
  const queryClient = useQueryClient();
  const { data: status } = useBotStatus(5_000);
  const { data: meta } = useGuildMeta(guildId);

  // Fetch Features
  const { data: featureData, isLoading: loadingFeatures } = useQuery<{ features: Feature[]; prefix: string }>({
    queryKey: ["guild", guildId, "features"],
    queryFn: () => get("/api/features"),
  });

  // Toggle Feature Mutation (optimistic, with rollback)
  const toggleFeature = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      post("/api/features", { id, enabled }),
    onMutate: async ({ id, enabled }) => {
      await queryClient.cancelQueries({ queryKey: ["guild", guildId, "features"] });
      const previous = queryClient.getQueryData<{ features: Feature[]; prefix: string }>(["guild", guildId, "features"]);
      if (previous) {
        queryClient.setQueryData(["guild", guildId, "features"], {
          ...previous,
          features: previous.features.map((f) => (f.id === id ? { ...f, enabled } : f)),
        });
      }
      return { previous };
    },
    onError: (_err, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["guild", guildId, "features"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["guild", guildId, "features"] });
    },
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

  const telemetry: {
    label: string;
    value: number | null;
    unit?: string;
    sub?: string;
    icon: typeof Zap;
    accent?: "default" | "warning" | "success" | "info";
    formatter?: (n: number) => string;
    animated?: boolean;
  }[] = [
    { label: "Shard Latency", value: status?.ping ?? null, unit: "ms", sub: "Gateway heartbeat", icon: Zap, accent: "warning" },
    {
      label: "Process Uptime",
      value: status?.processUptimeSec ?? null,
      icon: Timer,
      animated: false,
      formatter: (n) => formatUptime(Math.round(n) * 1000),
    },
    {
      label: "Commands / min",
      value: status?.commandsPerMin ?? null,
      sub: "rolling 60s",
      icon: Gauge,
    },
    {
      label: "Active AI Convos",
      value: status?.activeAiConversations ?? null,
      sub: "last 10 min",
      icon: Activity,
    },
    {
      label: "CPU Load",
      value: cpuLoad?.load1 ?? null,
      sub: cpuLoad ? `${cpuLoad.cpuCount} cores · 1m avg` : undefined,
      icon: Cpu,
      formatter: (n) => n.toFixed(2),
    },
    {
      label: "Memory",
      value: memPct,
      unit: "%",
      sub: memUsed != null && memTotal != null ? `${memUsed} / ${memTotal} MB` : undefined,
      icon: MemoryStick,
    },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <FadeIn delay={0} y={8}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Mission Control</h1>
            <p className="text-sm text-muted-foreground">Guild Overview for {guild?.name || "Server"}</p>
          </div>
          {status?.tag && (
            <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
              <span className={`size-2 rounded-full ${status.online ? "bg-success animate-pulse" : "bg-destructive"}`} />
              {status.tag}
            </div>
          )}
        </div>
      </FadeIn>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FadeIn delay={0.05} y={8}>
          <Card className="border-border/40 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Total Members
            </CardTitle>
            <Users className="size-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight font-mono">
              {guild?.memberCount != null ? <AnimatedNumber value={guild.memberCount} duration={900} /> : "—"}
            </div>
            <p className="text-[10px] text-muted-foreground font-mono mt-1">Online and cached users</p>
          </CardContent>
        </Card>
        </FadeIn>

        <FadeIn delay={0.1} y={8}>
        <Card className="border-border/40 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Channels
            </CardTitle>
            <Hash className="size-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight font-mono">
              {meta?.channels?.length != null ? <AnimatedNumber value={meta.channels.length} duration={900} /> : "—"}
            </div>
            <p className="text-[10px] text-muted-foreground font-mono mt-1">Text, voice, and stages</p>
          </CardContent>
        </Card>
        </FadeIn>

        <FadeIn delay={0.15} y={8}>
        <Card className="border-border/40 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Shard Latency
            </CardTitle>
            <Zap className="size-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight font-mono text-warning">
              {status?.ping != null ? <><AnimatedNumber value={status.ping} duration={900} />ms</> : "—"}
            </div>
            <p className="text-[10px] text-muted-foreground font-mono mt-1">Heartbeat response time</p>
          </CardContent>
        </Card>
        </FadeIn>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Side: Live System Telemetry (real, from /api/status) */}
        <FadeIn className="lg:col-span-2" delay={0.2} y={8}>
          <Card className="border-border/40 bg-card/40">
            <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-border/20">
              <div className="space-y-0.5">
                <CardTitle className="text-sm font-semibold tracking-wider uppercase text-muted-foreground">
                  System Telemetry
                </CardTitle>
                <CardDescription className="text-xs">Live metrics from the bot process</CardDescription>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-success/10 text-success border border-success/20">
                <span className="size-1.5 rounded-full bg-success animate-pulse" />
                LIVE
              </span>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {telemetry.map((m, idx) => (
                  <FadeIn key={m.label} delay={0.25 + idx * 0.03} y={4}>
                    <LiveMetric
                      label={m.label}
                      value={m.value}
                      unit={m.unit}
                      sub={m.sub}
                      icon={m.icon}
                      accent={m.accent}
                      formatter={m.formatter}
                    />
                  </FadeIn>
                ))}
              </div>
              {status?.nodeRuntime && (
                <div className="mt-3 text-[10px] font-mono text-muted-foreground border-t border-border/20 pt-2">
                  Node {status.nodeRuntime.version} · {status.nodeRuntime.platform}/{status.nodeRuntime.arch} · pid {status.nodeRuntime.pid}
                </div>
              )}
            </CardContent>
          </Card>
        </FadeIn>

        {/* Right Side: Quick Features Rail */}
        <FadeIn delay={0.3} y={8}>
          <Card className="border-border/40 bg-card/40 flex flex-col h-[400px]">
            <CardHeader className="pb-4 border-b border-border/20 shrink-0">
              <CardTitle className="text-sm font-semibold tracking-wider uppercase text-muted-foreground">
                Quick settings
              </CardTitle>
              <CardDescription className="text-xs">Toggle command categories</CardDescription>
            </CardHeader>
            <ScrollArea className="flex-1 p-4">
              {loadingFeatures ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="flex items-center justify-between py-2">
                      <div className="space-y-1">
                        <div className="h-4 w-28 bg-muted animate-pulse rounded" />
                        <div className="h-3 w-40 bg-muted animate-pulse rounded" />
                      </div>
                      <div className="h-6 w-10 bg-muted animate-pulse rounded" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-5">
                  {featureData?.features.map((feat, idx) => (
                    <FadeIn key={feat.id} delay={0.35 + idx * 0.03} y={3}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1 min-w-0">
                          <span className="text-sm font-semibold text-foreground truncate block">
                            {feat.label}
                          </span>
                          <p className="text-xs text-muted-foreground leading-normal">
                            {feat.description}
                          </p>
                        </div>
                        <Switch
                          checked={feat.enabled}
                          onCheckedChange={(checked) =>
                            toggleFeature.mutate({ id: feat.id, enabled: checked })
                          }
                        />
                      </div>
                    </FadeIn>
                  ))}
                </div>
              )}
            </ScrollArea>
          </Card>
        </FadeIn>
      </div>
    </div>
  );
}
