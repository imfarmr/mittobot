import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, patch, del, guildPath } from "@/lib/api";
import { useGuild } from "@/hooks/useGuild";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Share2, Trash2, Plus, Save, X } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/app/ConfirmProvider";
import { CustomSelect } from "@/components/app/CustomSelect";

type Platform = "rss" | "youtube" | "twitch" | "reddit" | "bluesky";

interface Connector {
  id: number;
  guild_id: string;
  platform: Platform;
  target: string;
  announce_channel_id: string;
  message_template: string | null;
  last_seen: string | null;
  enabled: number;
  created_at: number;
  embed_enabled: number;
  embed_title: string | null;
  embed_color: string | null;
  include_keywords: string;
  exclude_keywords: string;
}

interface SocialData {
  guildId: string;
  hasGuild: boolean;
  channels: { id: string; name: string }[];
  connectors: Connector[];
  twitchReady: boolean;
  platforms?: Record<string, { label: string }>;
}

const PLATFORM_LABEL: Record<Platform, string> = {
  rss: "RSS Feed", youtube: "YouTube", twitch: "Twitch", reddit: "Reddit", bluesky: "Bluesky",
};
const TARGET_HINT: Record<Platform, string> = {
  rss: "Feed URL (https://…/feed.xml)",
  youtube: "Channel ID (UC…)",
  twitch: "Twitch login (e.g. ninja)",
  reddit: "Subreddit (e.g. gaming)",
  bluesky: "Bluesky handle (e.g. bsky.app)",
};

function parseKw(raw: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return raw ? raw.split(",").map(s => s.trim()).filter(Boolean) : [];
  }
}

export default function SocialView() {
  const { guildId } = useGuild();
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const { data, isLoading } = useQuery<SocialData>({
    queryKey: ["social", guildId],
    queryFn: () => get(guildPath("/api/social", guildId)),
    enabled: !!guildId,
  });

  const [platform, setPlatform] = useState<Platform>("rss");
  const [target, setTarget] = useState("");
  const [channelId, setChannelId] = useState("");
  const [template, setTemplate] = useState("");
  const [embedEnabled, setEmbedEnabled] = useState(false);
  const [embedTitle, setEmbedTitle] = useState("");
  const [embedColor, setEmbedColor] = useState("#5865F2");
  const [includeKw, setIncludeKw] = useState("");
  const [excludeKw, setExcludeKw] = useState("");

  // Row-level editing state: connectorId → editable draft
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTemplate, setEditTemplate] = useState("");
  const [editEnabled, setEditEnabled] = useState(true);
  const [editEmbedEnabled, setEditEmbedEnabled] = useState(false);
  const [editEmbedTitle, setEditEmbedTitle] = useState("");
  const [editEmbedColor, setEditEmbedColor] = useState("#5865F2");
  const [editInclude, setEditInclude] = useState("");
  const [editExclude, setEditExclude] = useState("");

  const createMutation = useMutation({
    mutationFn: (body: any) => post(guildPath("/api/social", guildId), body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["social", guildId] });
      setTarget(""); setTemplate(""); setIncludeKw(""); setExcludeKw(""); setEmbedTitle("");
      toast.success("Connector added");
    },
    onError: (e: any) => toast.error(e.message || "Failed to add connector"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => patch(guildPath(`/api/social/${id}`, guildId), body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["social", guildId] });
      setEditingId(null);
      toast.success("Connector updated");
    },
    onError: (e: any) => toast.error(e.message || "Update failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => del(guildPath(`/api/social/${id}`, guildId)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["social", guildId] });
      toast.success("Connector removed");
    },
    onError: (e: any) => toast.error(e.message || "Failed to remove connector"),
  });

  if (!guildId) return <div className="p-6 text-sm text-muted-foreground">Select a guild first.</div>;
  if (isLoading || !data) return <div className="p-6 text-sm text-muted-foreground">Loading social connectors...</div>;

  const connectors = data.connectors || [];
  const canAdd = !!target.trim() && !!channelId;

  const handleAdd = () => {
    if (!canAdd) return;
    createMutation.mutate({
      platform, target: target.trim(), announceChannelId: channelId,
      messageTemplate: template.trim() || undefined,
      embedEnabled, embedTitle: embedTitle.trim() || undefined,
      embedColor, includeKeywords: includeKw.split(",").map(s => s.trim()).filter(Boolean),
      excludeKeywords: excludeKw.split(",").map(s => s.trim()).filter(Boolean),
    });
  };

  const startEdit = (c: Connector) => {
    setEditingId(c.id);
    setEditTemplate(c.message_template || "");
    setEditEnabled(c.enabled === 1);
    setEditEmbedEnabled(c.embed_enabled === 1);
    setEditEmbedTitle(c.embed_title || "");
    setEditEmbedColor(c.embed_color || "#5865F2");
    setEditInclude(parseKw(c.include_keywords).join(", "));
    setEditExclude(parseKw(c.exclude_keywords).join(", "));
  };

  const saveEdit = (c: Connector) => {
    updateMutation.mutate({
      id: c.id,
      body: {
        enabled: editEnabled,
        messageTemplate: editTemplate,
        embedEnabled: editEmbedEnabled,
        embedTitle: editEmbedTitle,
        embedColor: editEmbedColor,
        includeKeywords: editInclude.split(",").map(s => s.trim()).filter(Boolean),
        excludeKeywords: editExclude.split(",").map(s => s.trim()).filter(Boolean),
      },
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2.5">
          <Share2 className="size-5 text-primary" /> Social Connectors
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Announce new RSS, YouTube, Twitch, Reddit, or Bluesky posts to a channel. Polls every ~5 minutes.</p>
      </div>

      {!data.twitchReady && (
        <div className="text-xs text-warning bg-warning/10 border border-warning/30 rounded-lg px-3 py-2">
          Twitch connectors require <span className="font-mono">twitchClientId</span> / <span className="font-mono">twitchClientSecret</span> to be configured. RSS, YouTube, Reddit &amp; Bluesky work without any keys.
        </div>
      )}

      <Card className="border-border/40 bg-card/40">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Add Connector</CardTitle>
          <CardDescription className="text-xs">Pick a platform, its target, and where to announce. Optional: rich embed + keyword filters.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Platform</label>
              <CustomSelect value={platform} onChange={value => setPlatform(value as Platform)} options={[
                { value: "rss", label: "RSS Feed" }, { value: "youtube", label: "YouTube" },
                { value: "twitch", label: "Twitch" }, { value: "reddit", label: "Reddit" }, { value: "bluesky", label: "Bluesky" },
              ]} aria-label="Social platform" triggerClassName="mt-1 text-xs" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Target</label>
              <Input className="mt-1 text-xs font-mono" value={target} onChange={e => setTarget(e.target.value)} placeholder={TARGET_HINT[platform]} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Announce Channel</label>
              <CustomSelect value={channelId} onChange={setChannelId} options={data.channels.map(c => ({ value: c.id, label: `#${c.name}` }))} allowNone noneLabel="— Select —" placeholder="Select channel…" aria-label="Announcement channel" triggerClassName="mt-1 text-xs font-mono" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Message Template <span className="text-muted-foreground/60">(plain text — {"{title}"}, {"{link}"}, {"{platform}"})</span></label>
              <Input className="mt-1 text-xs" value={template} onChange={e => setTemplate(e.target.value)} placeholder="📢 New post: {title} — {link}" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Include keywords <span className="text-muted-foreground/60">(comma-separated; announce only if the title has one)</span></label>
              <Input className="mt-1 text-xs" value={includeKw} onChange={e => setIncludeKw(e.target.value)} placeholder="patch, update, release" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Switch checked={embedEnabled} onCheckedChange={setEmbedEnabled} /> Rich embed announcement
            </label>
            <div>
              <label className="text-xs text-muted-foreground">Embed title <span className="text-muted-foreground/60">(optional; defaults to post title)</span></label>
              <Input className="mt-1 text-xs" value={embedTitle} onChange={e => setEmbedTitle(e.target.value)} placeholder="New on {platform}" disabled={!embedEnabled} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Embed color</label>
              <div className="flex items-center gap-2 mt-1">
                <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(embedColor) ? embedColor : "#5865F2"} onChange={e => setEmbedColor(e.target.value)} className="h-8 w-10 rounded border border-border/40 bg-transparent cursor-pointer" disabled={!embedEnabled} />
                <Input className="text-xs font-mono" value={embedColor} onChange={e => setEmbedColor(e.target.value)} placeholder="#5865F2" disabled={!embedEnabled} />
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Exclude keywords <span className="text-muted-foreground/60">(comma-separated; skip if the title has any)</span></label>
            <Input className="mt-1 text-xs" value={excludeKw} onChange={e => setExcludeKw(e.target.value)} placeholder="spoiler, nsfw" />
          </div>

          <div className="flex justify-end">
            <Button size="sm" disabled={!canAdd || createMutation.isPending} onClick={handleAdd}>
              <Plus className="size-3.5 mr-1" /> Add Connector
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/40 bg-card/40">
        <CardHeader><CardTitle className="text-sm font-semibold">Connectors ({connectors.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {connectors.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No connectors yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border/30">
                  <TableHead className="text-xs w-12">ID</TableHead>
                  <TableHead className="text-xs">Platform</TableHead>
                  <TableHead className="text-xs">Target</TableHead>
                  <TableHead className="text-xs">Channel</TableHead>
                  <TableHead className="text-xs">Options</TableHead>
                  <TableHead className="text-xs w-40"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {connectors.map(c => {
                  const channel = data.channels.find(ch => ch.id === c.announce_channel_id);
                  const isEditing = editingId === c.id;
                  const options = [
                    c.enabled === 1 ? "on" : "off",
                    c.embed_enabled === 1 ? "embed" : null,
                    parseKw(c.include_keywords).length ? `inc ${parseKw(c.include_keywords).length}` : null,
                    parseKw(c.exclude_keywords).length ? `exc ${parseKw(c.exclude_keywords).length}` : null,
                  ].filter(Boolean);

                  return (
                    <TableRow key={c.id} className="border-b border-border/20">
                      <TableCell className="text-xs font-mono text-muted-foreground">#{c.id}</TableCell>
                      <TableCell className="text-xs"><Badge variant="outline" className="text-[10px]">{PLATFORM_LABEL[c.platform] || c.platform}</Badge></TableCell>
                      <TableCell className="text-xs font-mono max-w-[140px] truncate" title={c.target}>{c.target}</TableCell>
                      <TableCell className="text-xs font-mono">#{channel?.name || c.announce_channel_id}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {options.length ? options.join(" · ") : "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="flex justify-end gap-1">
                          {isEditing ? (
                            <>
                              <Button size="sm" variant="ghost" className="text-success" disabled={updateMutation.isPending} onClick={() => saveEdit(c)}>
                                <Save className="size-3.5 mr-1" /> Save
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                                <X className="size-3.5" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Switch checked={c.enabled === 1} onCheckedChange={(v) => updateMutation.mutate({ id: c.id, body: { enabled: v } })} aria-label={`Toggle ${c.target}`} />
                              <Button size="sm" variant="ghost" onClick={() => startEdit(c)}>Edit</Button>
                              <Button size="sm" variant="ghost" className="text-destructive" disabled={deleteMutation.isPending} onClick={async () => {
                                if (!await confirm({
                                  title: "Remove connector?",
                                  description: `Stop announcing ${PLATFORM_LABEL[c.platform] || c.platform} "${c.target}".`,
                                  confirmLabel: "Remove",
                                })) return;
                                deleteMutation.mutate(c.id);
                              }}>
                                <Trash2 className="size-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {/* Inline editor panel for the row being edited */}
          {editingId != null && (() => {
            const c = connectors.find(x => x.id === editingId);
            if (!c) return null;
            return (
              <div className="border-t border-border/30 p-4 space-y-3 bg-background-alt/30">
                <div className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Editing #{c.id} — {PLATFORM_LABEL[c.platform] || c.platform}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Message Template</label>
                    <Input className="mt-1 text-xs" value={editTemplate} onChange={e => setEditTemplate(e.target.value)} placeholder="📢 New post: {title} — {link}" />
                  </div>
                  <div className="flex items-end gap-3">
                    <label className="flex items-center gap-2 text-xs cursor-pointer pb-2">
                      <Switch checked={editEnabled} onCheckedChange={setEditEnabled} /> Enabled
                    </label>
                    <label className="flex items-center gap-2 text-xs cursor-pointer pb-2">
                      <Switch checked={editEmbedEnabled} onCheckedChange={setEditEmbedEnabled} /> Embed
                    </label>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Embed Title</label>
                    <Input className="mt-1 text-xs" value={editEmbedTitle} onChange={e => setEditEmbedTitle(e.target.value)} disabled={!editEmbedEnabled} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Embed Color</label>
                    <div className="flex items-center gap-2 mt-1">
                      <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(editEmbedColor) ? editEmbedColor : "#5865F2"} onChange={e => setEditEmbedColor(e.target.value)} className="h-8 w-10 rounded border border-border/40 bg-transparent cursor-pointer" disabled={!editEmbedEnabled} />
                      <Input className="text-xs font-mono" value={editEmbedColor} onChange={e => setEditEmbedColor(e.target.value)} disabled={!editEmbedEnabled} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Include keywords (comma-separated)</label>
                    <Input className="mt-1 text-xs" value={editInclude} onChange={e => setEditInclude(e.target.value)} placeholder="patch, update" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Exclude keywords (comma-separated)</label>
                    <Input className="mt-1 text-xs" value={editExclude} onChange={e => setEditExclude(e.target.value)} placeholder="spoiler, nsfw" />
                  </div>
                </div>
              </div>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}
