import { useRef, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, guildPath } from "@/lib/api";
import { useGuild } from "@/hooks/useGuild";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Music, Pause, Play, ListMusic, SkipForward, Square, Volume2, Repeat, Repeat1,
  Shuffle, Trash2, SearchX, History, Music2,
} from "lucide-react";
import { toast } from "sonner";

interface Track {
  title: string;
  url: string | null;
  duration: number; // seconds; 0 = unknown/live
  requestedBy: { id: string; tag: string } | null;
  thumbnail: string | null;
}

interface MusicState {
  connected: boolean;
  streamingAvailable: boolean;
  current: Track | null;
  paused: boolean;
  voiceChannelId: string | null;
  volume: number;
  repeat: "off" | "queue" | "track";
  autoplay: boolean;
  history: Track[];
  queue: Track[];
}

interface MusicData {
  guildId: string;
  hasGuild: boolean;
  state: MusicState;
}

function fmtDuration(sec: number): string {
  if (!sec || sec <= 0) return "live";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export default function MusicView() {
  const { guildId } = useGuild();
  const queryClient = useQueryClient();

  // Poll — playback state changes outside the dashboard, so refresh often.
  const { data, isLoading } = useQuery<MusicData>({
    queryKey: ["music", guildId],
    queryFn: () => get(guildPath("/api/music", guildId)),
    enabled: !!guildId,
    refetchInterval: 5000,
  });

  const control = useMutation({
    mutationFn: (body: { action: string; value?: unknown }) => post(guildPath("/api/music/control", guildId), body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["music", guildId] }),
    onError: (e: any) => toast.error(e.message || "Command failed"),
  });

  // Volume slider: keep a local copy for instant feedback and commit the
  // mutation after the user stops dragging (debounced) to avoid request spam.
  const [localVolume, setLocalVolume] = useState<number | null>(null);
  const volumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setLocalVolume(null);
    if (volumeTimer.current) clearTimeout(volumeTimer.current);
  }, [data?.state?.volume]);
  const commitVolume = (v: number) => {
    setLocalVolume(v);
    if (volumeTimer.current) clearTimeout(volumeTimer.current);
    volumeTimer.current = setTimeout(() => {
      if (connected) control.mutate({ action: "volume", value: v });
    }, 250);
  };

  if (!guildId) return <div className="p-6 text-sm text-muted-foreground">Select a guild first.</div>;
  if (isLoading || !data) return <div className="p-6 text-sm text-muted-foreground">Loading music state...</div>;

  const st = data.state;
  const current = st.current;
  const connected = st.connected;

  const send = (action: string, value?: unknown) => {
    if (!connected && action !== "stop") {
      toast.error("The bot isn't connected to a voice channel in this server.");
      return;
    }
    control.mutate({ action, value });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2.5">
          <Music className="size-5 text-primary" /> Music Stream
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Live view of the voice-channel playback queue — control it from here.</p>
      </div>

      {!st.streamingAvailable && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="py-3 text-xs text-warning">
            Audio streaming is not available on this instance (the <code>play-dl</code> library isn't installed).
            Commands and the queue still work, but audio can't be streamed.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Now Playing + transport controls */}
        <Card className="border-border/40 bg-card/40 lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                {st.paused ? <Pause className="size-4 text-primary" /> : <Play className="size-4 text-primary" />}
                Now Playing
              </CardTitle>
              <CardDescription className="text-xs">
                {connected ? "Connected to a voice channel" : "Not connected"}
              </CardDescription>
            </div>
            {current && <Badge variant={st.paused ? "secondary" : "default"}>{st.paused ? "Paused" : "Playing"}</Badge>}
          </CardHeader>
          <CardContent className="space-y-4">
            {!current ? (
              <p className="text-xs text-muted-foreground">Nothing is playing right now. Use <span className="font-mono">/music play</span> in Discord.</p>
            ) : (
              <div className="flex items-center gap-3">
                {current.thumbnail ? (
                  <img src={current.thumbnail} alt="" className="size-14 rounded-lg object-cover border border-border/40" />
                ) : (
                  <div className="size-14 rounded-lg bg-background-alt/50 border border-border/40 flex items-center justify-center">
                    <Music className="size-5 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{current.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {fmtDuration(current.duration)}
                    {current.requestedBy ? ` • requested by ${current.requestedBy.tag}` : ""}
                  </div>
                </div>
              </div>
            )}

            {/* Transport */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <Button size="sm" variant="ghost" className="h-8" disabled={!current || control.isPending} onClick={() => send(st.paused ? "resume" : "pause")} title={st.paused ? "Resume" : "Pause"}>
                {st.paused ? <Play className="size-4" /> : <Pause className="size-4" />}
              </Button>
              <Button size="sm" variant="ghost" className="h-8" disabled={!current || control.isPending} onClick={() => send("skip")} title="Skip track">
                <SkipForward className="size-4" />
              </Button>
              <Button size="sm" variant="ghost" className="h-8 text-destructive" disabled={!connected || control.isPending} onClick={() => send("stop")} title="Stop & leave">
                <Square className="size-4" />
              </Button>
              <span className="w-px h-5 bg-border/40 mx-1" />
              <Volume2 className="size-4 text-muted-foreground" />
              <input
                type="range" min={0} max={200} value={localVolume ?? st.volume ?? 100}
                onChange={(e) => commitVolume(Number(e.target.value))}
                className="w-32 accent-primary"
                title="Volume (0-200%)"
              />
              <span className="text-[10px] font-mono text-muted-foreground w-8">{localVolume ?? st.volume ?? 100}%</span>
              <span className="w-px h-5 bg-border/40 mx-1" />
              <Select value={st.repeat || "off"} onValueChange={(v) => send("repeat", v)} disabled={!connected}>
                <SelectTrigger className="h-8 w-28 text-xs" aria-label="Repeat mode">
                  <SelectValue placeholder="Repeat" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="off"><span className="flex items-center gap-1.5"><Repeat className="size-3.5" /> Off</span></SelectItem>
                  <SelectItem value="queue"><span className="flex items-center gap-1.5"><Repeat className="size-3.5" /> Queue</span></SelectItem>
                  <SelectItem value="track"><span className="flex items-center gap-1.5"><Repeat1 className="size-3.5" /> Track</span></SelectItem>
                </SelectContent>
              </Select>
              <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer ml-1">
                <Switch checked={!!st.autoplay} onCheckedChange={(v) => send("autoplay", v)} disabled={!connected} />
                Autoplay
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Queue */}
        <Card className="border-border/40 bg-card/40 flex flex-col h-[400px]">
          <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-border/20 shrink-0">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <ListMusic className="size-4 text-primary" /> Up Next ({st.queue.length})
              </CardTitle>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={!st.queue.length || control.isPending} onClick={() => send("shuffle")} title="Shuffle queue">
                <Shuffle className="size-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" disabled={!st.queue.length || control.isPending} onClick={() => send("clear")} title="Clear queue">
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-3 overflow-y-auto flex-1">
            {!st.queue.length ? (
              <p className="text-xs text-muted-foreground text-center py-10">
                <SearchX className="size-5 mx-auto mb-2 opacity-50" />
                The queue is empty.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {st.queue.map((t, i) => (
                  <li key={i} className="group flex items-center gap-2 text-xs rounded-md px-1.5 py-1 hover:bg-background-alt/50">
                    <span className="text-muted-foreground w-5 shrink-0 text-right">{i + 1}.</span>
                    <span className="truncate flex-1">{t.title}</span>
                    <span className="text-muted-foreground font-mono shrink-0">{fmtDuration(t.duration)}</span>
                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 text-destructive" disabled={control.isPending} onClick={() => send("remove", i + 1)} title={`Remove #${i + 1}`}>
                      <Trash2 className="size-3" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recently played */}
      <Card className="border-border/40 bg-card/40">
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <History className="size-4 text-primary" /> Recently Played ({st.history?.length ?? 0})
          </CardTitle>
          <CardDescription className="text-xs">Last {25} finished tracks (cleared on disconnect).</CardDescription>
        </CardHeader>
        <CardContent>
          {!st.history?.length ? (
            <p className="text-xs text-muted-foreground">No history yet.</p>
          ) : (
            <ul className="space-y-1">
              {[...(st.history || [])].reverse().slice(0, 10).map((t, i) => (
                <li key={i} className="flex items-center gap-2 text-xs">
                  <Music2 className="size-3 text-muted-foreground shrink-0" />
                  <span className="truncate">{t.title}</span>
                  <span className="text-muted-foreground font-mono ml-auto shrink-0">{fmtDuration(t.duration)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
