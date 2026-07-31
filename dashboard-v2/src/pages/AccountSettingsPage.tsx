import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ImagePlus, LogOut, RefreshCw, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { usePerformanceMode } from "@/hooks/usePerformanceMode";
import { useCustomBackground } from "@/hooks/useCustomBackground";
import { avatarUrl, guildIconUrl } from "@/lib/utils";

interface AccountSettingsPageProps {
  onClose?: () => void;
}

export default function AccountSettingsPage({ onClose }: AccountSettingsPageProps) {
  const { user, guilds, loading, refresh, logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { performanceMode, setPerformanceMode } = usePerformanceMode();
  const {
    backgroundImage,
    backgroundOpacity,
    opacityPersistenceFailed,
    setBackgroundImage,
    setOpacity,
  } = useCustomBackground();

  if (!user) return null;

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(user.id);
      setCopied(true);
      toast.success("User ID copied");
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Could not copy user ID");
    }
  };

  const refreshAccount = async () => {
    setRefreshing(true);
    try {
      await refresh();
      queryClient.invalidateQueries({ queryKey: ["status"] });
      toast.success("Account refreshed");
    } finally {
      setRefreshing(false);
    }
  };

  const handleBackgroundUpload = (file?: File) => {
    if (!file) return;
    const supportedTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/avif"]);
    if (!supportedTypes.has(file.type)) {
      toast.error("Choose a PNG, JPEG, WebP, or AVIF image");
      return;
    }
    if (file.size > 1_500_000) {
      toast.error("Image must be smaller than 1.5 MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) {
        toast.error("Could not read this image");
        return;
      }
      if (!setBackgroundImage(result)) {
        toast.error("Could not save this image. Browser storage may be full.");
        return;
      }
      toast.success("Background updated");
    };
    reader.onerror = () => toast.error("Could not read this image");
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-4">
      <DialogHeader className="pr-8">
        <DialogTitle className="flex items-center gap-2 text-lg">
          <UserRound className="size-5 text-primary" /> Account Settings
        </DialogTitle>
        <DialogDescription>Manage your Mitto dashboard session and account details.</DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="overflow-hidden border-border/40 bg-card/40">
          <div className="h-20 bg-gradient-to-br from-primary/30 via-primary/10 to-transparent" />
          <CardContent className="relative px-5 pb-5">
            <img
              src={avatarUrl(user)}
              alt={user.tag}
              className="absolute -top-9 size-18 rounded-full border-4 border-card bg-background shadow-lg"
              referrerPolicy="no-referrer"
            />
            <div className="pt-12">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold tracking-tight">{user.tag}</h2>
                <Badge variant={user.isOwner ? "warning" : "secondary"}>
                  <ShieldCheck /> {user.isOwner ? "Bot owner" : "Server admin"}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Manage your dashboard session and Discord account access.</p>

              <div className="mt-5 rounded-xl border border-border/40 bg-background-alt/40 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Discord user ID</p>
                    <p className="mt-1 truncate font-mono text-xs text-foreground">{user.id}</p>
                  </div>
                  <Button variant="ghost" size="icon-sm" onClick={copyId} title="Copy user ID" aria-label="Copy user ID">
                    {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/40 bg-card/40">
          <CardHeader>
            <CardTitle className="text-sm">Session</CardTitle>
            <CardDescription className="text-xs">Your current dashboard access</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-border/30 bg-background-alt/30 px-3 py-3">
              <span className="text-xs text-muted-foreground">Status</span>
              <Badge variant="success">Active</Badge>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border/30 bg-background-alt/30 px-3 py-3">
              <div>
                <span className="block text-xs text-foreground">Performance mode</span>
                <span className="text-[10px] text-muted-foreground">Reduce blur, shadows, and motion</span>
              </div>
              <Switch
                checked={performanceMode}
                onCheckedChange={setPerformanceMode}
                aria-label="Enable performance mode"
              />
            </div>
            <div className="rounded-xl border border-border/30 bg-background-alt/30 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <span className="flex items-center gap-2 text-xs text-foreground"><ImagePlus className="size-3.5 text-primary" /> Custom background</span>
                  <span className="text-[10px] text-muted-foreground">Stored locally in this browser · disabled in Performance Mode</span>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/[0.14] bg-white/[0.06] px-3 py-1.5 text-[10px] font-medium transition-colors hover:bg-white/[0.1]">
                  <ImagePlus className="size-3.5" />
                  {backgroundImage ? "Change" : "Choose image"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/avif"
                    className="sr-only"
                    onChange={event => {
                      handleBackgroundUpload(event.target.files?.[0]);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>
              {backgroundImage && (
                <>
                  <div className="relative mt-3 h-20 overflow-hidden rounded-lg border border-border/40 bg-black/40">
                    <img src={backgroundImage} alt="Custom dashboard background preview" className="size-full object-cover" style={{ opacity: backgroundOpacity }} />
                    <div className="absolute inset-0 bg-black/25" />
                    <button
                      type="button"
                      onClick={() => { setBackgroundImage(""); toast.success("Background cleared"); }}
                      className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white transition-colors hover:bg-destructive"
                      aria-label="Clear custom background"
                      title="Clear background"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <label htmlFor="background-opacity" className="shrink-0 text-[10px] text-muted-foreground">Opacity</label>
                    <input
                      id="background-opacity"
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={backgroundOpacity}
                      onChange={event => setOpacity(Number(event.target.value))}
                      className="min-w-0 flex-1"
                    />
                    <span className="w-9 text-right font-mono text-[10px] text-foreground">{Math.round(backgroundOpacity * 100)}%</span>
                  </div>
                  {opacityPersistenceFailed && (
                    <p className="mt-2 text-[10px] text-warning" role="status">
                      Opacity preview updated, but browser storage is unavailable, so it may reset after reload.
                    </p>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border/30 bg-background-alt/30 px-3 py-3">
              <span className="text-xs text-muted-foreground">Servers available</span>
              <span className="font-mono text-sm font-semibold">{guilds.length}</span>
            </div>
            <Button
              variant="destructive"
              className="mt-2 w-full"
              onClick={() => {
                onClose?.();
                logout();
              }}
            >
              <LogOut className="size-4" />
              Log out
            </Button>
            <Button variant="outline" className="w-full" onClick={refreshAccount} disabled={refreshing || loading}>
              <RefreshCw className={refreshing ? "size-4 animate-spin" : "size-4"} />
              Refresh account
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/40 bg-card/40">
        <CardHeader>
          <CardTitle className="text-sm">Server access</CardTitle>
          <CardDescription className="text-xs">Servers where your Discord permissions allow dashboard management</CardDescription>
        </CardHeader>
        <CardContent>
          {guilds.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No manageable servers were found.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {guilds.map((guild) => (
                <button
                  key={guild.id}
                  type="button"
                  onClick={() => {
                    onClose?.();
                    navigate(`/g/${guild.id}`);
                  }}
                  className="flex items-center gap-3 rounded-xl border border-border/30 bg-background-alt/30 p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary font-mono text-[10px] font-bold text-muted-foreground">
                    {guild.icon ? <img src={guildIconUrl(guild)!} alt="" className="size-full object-cover" /> : guild.name.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="truncate text-xs font-medium">{guild.name}</span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
