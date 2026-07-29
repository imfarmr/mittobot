import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post } from "@/lib/api";
import { guildPath } from "@/lib/api";
import { useGuild } from "@/hooks/useGuild";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Palette, RotateCcw, Check } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/app/ConfirmProvider";
import { SaveBar } from "@/components/app/SaveBar";
import { LoadingFallback } from "@/components/app/LoadingFallback";
import { FadeIn } from "@/components/animations/FadeIn";

const COLOR_KINDS = ["success", "error", "info", "warn", "accent"] as const;
type ColorKind = (typeof COLOR_KINDS)[number];

const COLOR_LABELS: Record<ColorKind, string> = {
  success: "Success",
  error: "Error",
  info: "Info",
  warn: "Warning",
  accent: "Accent",
};

const COLOR_DESCRIPTIONS: Record<ColorKind, string> = {
  success: "Confirmation messages, completed actions",
  error: "Errors, permission denied, failures",
  info: "General information, neutral embeds",
  warn: "Warnings, caution notices",
  accent: "Highlights, special callouts",
};

const EMOJI_STYLES = [
  { id: "classic", label: "Classic", desc: "Standard emoji (✅ ❌ ⚠️ ℹ️)" },
  { id: "pack", label: "Tone Pack", desc: "Emoji from the active tone pack" },
  { id: "minimal", label: "Minimal", desc: "No emoji — clean text only" },
];

interface ThemeConfig {
  tone: string;
  colors: Record<string, number>;
  footer: { enabled: boolean; text: string | null };
  emojiStyle: string;
}

interface ThemeData {
  guildId: string | null;
  hasGuild: boolean;
  guildName: string | null;
  config: ThemeConfig;
  packs: { id: string; label: string }[];
  emojiStyles: string[];
}

// Convert a decimal color number to #RRGGBB hex
function decToHex(n: number | undefined): string {
  if (n === undefined || n === null) return "#5865f2";
  return "#" + (n & 0xffffff).toString(16).padStart(6, "0");
}

// Convert a #RRGGBB hex string to a decimal number
function hexToDec(hex: string): number {
  return parseInt(hex.replace("#", ""), 16) || 0;
}

export default function ThemeView() {
  const { guildId } = useGuild();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const [edits, setEdits] = useState<Partial<ThemeConfig> | null>(null);

  const { data, isLoading } = useQuery<ThemeData>({
    queryKey: ["theme", guildId],
    queryFn: () => get(guildPath("/api/theme", guildId)),
    enabled: !!guildId,
  });

  const cfg = data?.config;
  const current: ThemeConfig = {
    tone: cfg?.tone ?? "neutral",
    colors: { ...(cfg?.colors ?? {}) },
    footer: { ...(cfg?.footer ?? { enabled: false, text: null }) },
    emojiStyle: cfg?.emojiStyle ?? "classic",
    ...(edits || {}),
  } as ThemeConfig;

  const dirty = edits !== null && Object.keys(edits).length > 0;

  const saveMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => post(guildPath("/api/theme", guildId), body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["theme", guildId] });
      setEdits(null);
      toast.success("Theme saved");
    },
    onError: (e: { message?: string }) => toast.error(e.message || "Save failed"),
  });

  const resetMutation = useMutation({
    mutationFn: () => post(guildPath("/api/theme", guildId), { reset: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["theme", guildId] });
      setEdits(null);
      toast.success("Theme reset to defaults");
    },
    onError: (e: { message?: string }) => toast.error(e.message || "Reset failed"),
  });

  if (!guildId) return <div className="p-6 text-sm text-muted-foreground">Select a guild first.</div>;
  if (isLoading || !data) return <LoadingFallback text="Loading theme config..." />;

  const isOwner = user?.isOwner;

  const setColor = (kind: ColorKind, hex: string) => {
    setEdits(prev => ({
      ...(prev || {}),
      colors: { ...current.colors, [kind]: hexToDec(hex) },
    }));
  };

  const setFooter = (patch: Partial<ThemeConfig["footer"]>) => {
    setEdits(prev => ({
      ...(prev || {}),
      footer: { ...current.footer, ...patch },
    }));
  };

  const set = <K extends keyof ThemeConfig>(key: K, value: ThemeConfig[K]) => {
    setEdits(prev => ({ ...(prev || {}), [key]: value }));
  };

  const handleSave = () => {
    if (!edits) return;
    const payload: Record<string, unknown> = {};
    if (edits.tone !== undefined) payload.tone = edits.tone;
    if (edits.emojiStyle !== undefined) payload.emojiStyle = edits.emojiStyle;
    if (edits.colors) payload.colors = edits.colors;
    if (edits.footer) payload.footer = edits.footer;
    saveMutation.mutate(payload);
  };

  const packs = data.packs || [];

  return (
    <>
      <SaveBar dirty={dirty} saving={saveMutation.isPending} onSave={handleSave} onReset={() => setEdits(null)} />
      <FadeIn>
        <div className="space-y-4 pb-24">
        <div className="flex items-center gap-3">
          <Palette className="size-5 text-primary" />
          <div className="flex-1">
            <h1 className="text-xl font-bold tracking-tight">Theme Editor</h1>
            <p className="text-xs text-muted-foreground">Customize embed colors, emoji style, and footer per guild.</p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            disabled={resetMutation.isPending}
            onClick={async () => {
              if (!await confirm({
                title: "Reset theme to defaults?",
                description: "All custom colors, emoji style, and footer settings will be reverted to the built-in defaults.",
                confirmLabel: "Reset",
              })) return;
              resetMutation.mutate();
            }}
          >
            <RotateCcw className="size-3.5 mr-1" /> Reset
          </Button>
        </div>

        {!isOwner && (
          <div className="text-xs text-warning bg-warning/10 border border-warning/30 rounded-lg px-3 py-2">
            Only the bot owner can save theme changes. You can preview but not save.
          </div>
        )}

        {/* Color palette */}
        <Card className="border-border/40 bg-card/40">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Embed Colors</CardTitle>
            <CardDescription className="text-xs">Colors used for each embed type across the bot.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {COLOR_KINDS.map(kind => (
              <div key={kind} className="flex items-center gap-4 p-2.5 rounded-lg bg-background-alt/30 border border-border/20">
                {/* Color preview swatch */}
                <div
                  className="size-10 rounded-lg border-2 border-border/40 shrink-0 shadow-sm"
                  style={{ backgroundColor: decToHex(current.colors[kind]) }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground">{COLOR_LABELS[kind]}</p>
                  <p className="text-[10px] text-muted-foreground">{COLOR_DESCRIPTIONS[kind]}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="color"
                    value={decToHex(current.colors[kind])}
                    onChange={e => setColor(kind, e.target.value)}
                    disabled={!isOwner}
                    className="size-8 rounded cursor-pointer border border-border/40 bg-transparent disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <Input
                    className="w-24 text-xs font-mono"
                    value={decToHex(current.colors[kind]).toUpperCase()}
                    onChange={e => {
                      const v = e.target.value;
                      if (/^#[0-9a-fA-F]{6}$/.test(v)) setColor(kind, v);
                    }}
                    disabled={!isOwner}
                    placeholder="#RRGGBB"
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Emoji style */}
        <Card className="border-border/40 bg-card/40">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Emoji Style</CardTitle>
            <CardDescription className="text-xs">How emoji prefixes appear on bot messages.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {EMOJI_STYLES.map(style => (
              <button
                key={style.id}
                disabled={!isOwner}
                onClick={() => set("emojiStyle", style.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left disabled:cursor-not-allowed disabled:opacity-50 ${
                  current.emojiStyle === style.id
                    ? "border-primary bg-primary/5"
                    : "border-border/30 bg-background-alt/20 hover:border-border/50"
                }`}
              >
                <div className={`size-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                  current.emojiStyle === style.id ? "border-primary" : "border-border/40"
                }`}>
                  {current.emojiStyle === style.id && <Check className="size-3 text-primary" />}
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-foreground">{style.label}</p>
                  <p className="text-[10px] text-muted-foreground">{style.desc}</p>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Tone pack */}
        {packs.length > 0 && (
          <Card className="border-border/40 bg-card/40">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Tone Pack</CardTitle>
              <CardDescription className="text-xs">Language style for bot responses and tone-specific emoji.</CardDescription>
            </CardHeader>
            <CardContent>
              <select
                className="w-full bg-background-alt/50 border border-border/40 rounded-lg p-2 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-50"
                value={current.tone}
                onChange={e => set("tone", e.target.value)}
                disabled={!isOwner}
              >
                {packs.map(p => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <Card className="border-border/40 bg-card/40">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold">Embed Footer</CardTitle>
              <CardDescription className="text-xs">Add a custom footer to every embed the bot sends.</CardDescription>
            </div>
            <Switch
              checked={current.footer.enabled}
              onCheckedChange={v => setFooter({ enabled: v })}
              disabled={!isOwner}
            />
          </CardHeader>
          {current.footer.enabled && (
            <CardContent>
              <label className="text-xs text-muted-foreground">Footer Text <span className="text-muted-foreground/60">({"{guild}"} = server name)</span></label>
              <Input
                className="mt-1 text-xs"
                value={current.footer.text ?? ""}
                onChange={e => setFooter({ text: e.target.value })}
                placeholder="Powered by Mitto • {guild}"
                disabled={!isOwner}
                maxLength={2048}
              />
              {current.footer.text && (
                <div className="mt-2 p-2 rounded bg-background-alt/30 border border-border/20">
                  <p className="text-[10px] text-muted-foreground mb-0.5">Preview:</p>
                  <p className="text-xs text-foreground/80">
                    {current.footer.text.replace("{guild}", data.guildName || "Server Name")}
                  </p>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      </div>
      </FadeIn>
    </>
  );
}
