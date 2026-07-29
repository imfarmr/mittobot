import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, del, guildPath } from "@/lib/api";
import { useGuild } from "@/hooks/useGuild";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Palette, Send, Save, Download, Upload, Trash2, Plus, X, Clock } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/app/ConfirmProvider";
import { LoadingFallback } from "@/components/app/LoadingFallback";
import { FadeIn } from "@/components/animations/FadeIn";

// ─── Types ────────────────────────────────────────────────────────────────
interface EmbedField { _key: string; name: string; value: string; inline: boolean }
interface EmbedData {
  title: string; description: string; url: string; color: number;
  author: { name: string; icon_url: string; url: string };
  footer: { text: string; icon_url: string };
  thumbnail: { url: string }; image: { url: string };
  fields: EmbedField[]; timestamp: boolean;
}
interface Template {
  id: number; name: string; embed_json: string; created_at: string;
}
interface EmbedsData {
  guildId: string; hasGuild: boolean;
  templates: Template[];
}

// ─── Constants ────────────────────────────────────────────────────────────
const COLOR_PRESETS = [
  { label: "Blurple", color: 0x5865F2 },
  { label: "Green",   color: 0x23A55A },
  { label: "Red",     color: 0xED4245 },
  { label: "Orange",  color: 0xF0B232 },
  { label: "Grey",    color: 0x4E5058 },
  { label: "Yellow",  color: 0xFEE75C },
  { label: "Pink",    color: 0xEB459E },
  { label: "Cyan",    color: 0x00AFF4 },
];

const EMPTY_EMBED: EmbedData = {
  title: "", description: "", url: "", color: 0x5865F2,
  author: { name: "", icon_url: "", url: "" },
  footer: { text: "", icon_url: "" },
  thumbnail: { url: "" }, image: { url: "" },
  fields: [], timestamp: true,
};

// Strip empty values so Discord accepts the embed JSON
function cleanEmbed(embed: EmbedData) {
  const out: Record<string, any> = {};
  if (embed.title) out.title = embed.title;
  if (embed.description) out.description = embed.description;
  if (embed.url) out.url = embed.url;
  if (embed.color != null) out.color = embed.color;
  if (embed.author?.name) out.author = { name: embed.author.name, icon_url: embed.author.icon_url || undefined, url: embed.author.url || undefined };
  if (embed.footer?.text) out.footer = { text: embed.footer.text, icon_url: embed.footer.icon_url || undefined };
  if (embed.thumbnail?.url) out.thumbnail = { url: embed.thumbnail.url };
  if (embed.image?.url) out.image = { url: embed.image.url };
  if (embed.fields?.length) out.fields = embed.fields.filter(f => f.name || f.value).map(f => ({ name: f.name || "\u200b", value: f.value || "\u200b", inline: !!f.inline }));
  if (embed.timestamp) out.timestamp = new Date().toISOString();
  return out;
}

// ─── Live Preview Component ───────────────────────────────────────────────
function EmbedPreview({ embed }: { embed: ReturnType<typeof cleanEmbed> }) {
  const colorHex = `#${(embed.color || 0x5865F2).toString(16).padStart(6, "0")}`;
  const hasContent = embed.title || embed.description || embed.fields?.length || embed.author?.name || embed.footer?.text || embed.image?.url || embed.thumbnail?.url;

  if (!hasContent) {
    return <div className="text-xs text-muted-foreground py-8 text-center">Your embed preview will appear here.</div>;
  }

  return (
    <FadeIn>
      <div className="rounded-lg overflow-hidden border border-r-4 max-w-md" style={{ borderRightColor: colorHex, borderRightWidth: 4, borderColor: "var(--border)" }}>
        <div className="bg-background-alt/40 p-3.5 space-y-2">
          {embed.author?.name && (
            <div className="flex items-center gap-2">
              {embed.author.icon_url && <img src={embed.author.icon_url} alt="" className="size-6 rounded-full object-cover" />}
              <span className="text-xs font-semibold">{embed.author.name}</span>
            </div>
          )}
          {embed.title && (
            <div className="text-sm font-semibold">
              {embed.url ? <a href={embed.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{embed.title}</a> : embed.title}
            </div>
          )}
          {embed.description && <div className="text-xs whitespace-pre-wrap leading-relaxed">{embed.description}</div>}
          {embed.fields?.length > 0 && (
            <div className="grid grid-cols-1 gap-1.5">
              {embed.fields.map((f: any, i: number) => (
                <div key={i} className={f.inline ? "col-span-1" : "col-span-full"}>
                  <div className="text-[10px] font-semibold text-primary">{f.name}</div>
                  <div className="text-xs">{f.value}</div>
                </div>
              ))}
            </div>
          )}
          {embed.image?.url && <img src={embed.image.url} alt="" className="rounded max-w-full mt-1" />}
          {embed.thumbnail?.url && (
            <img src={embed.thumbnail.url} alt="" className="float-right ml-3 mb-1 rounded size-20 object-cover" />
          )}
          {embed.footer?.text && (
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground pt-1 clear-both">
              {embed.footer.icon_url && <img src={embed.footer.icon_url} alt="" className="size-4 rounded-full" />}
              <span>{embed.footer.text}</span>
              {embed.timestamp && <span>• {new Date().toLocaleDateString()}</span>}
            </div>
          )}
          {embed.timestamp && !embed.footer?.text && (
            <div className="text-[10px] text-muted-foreground pt-1 clear-both">{new Date().toLocaleDateString()}</div>
          )}
        </div>
      </div>
    </FadeIn>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────
export default function EmbedBuilderView() {
  const { guildId } = useGuild();
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const [embed, setEmbed] = useState<EmbedData>({ ...EMPTY_EMBED, fields: [] });
  const [content, setContent] = useState("");
  const [saveName, setSaveName] = useState("");
  const [showSave, setShowSave] = useState(false);
  const [sendChannel, setSendChannel] = useState("");
  const [showJson, setShowJson] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState("");

  // Fetch templates + channels
  const { data, isLoading } = useQuery<EmbedsData & { channels?: { id: string; name: string }[] }>({
    queryKey: ["embeds", guildId],
    queryFn: () => get(guildPath("/api/embeds", guildId)),
    enabled: !!guildId,
  });

  // Also fetch channels for the send dropdown
  const { data: channelsData } = useQuery<{ channels: { id: string; name: string }[] }>({
    queryKey: ["channels-embed", guildId],
    queryFn: () => get(guildPath("/api/channels", guildId)),
    enabled: !!guildId,
  });

  // Reset on guild change
  useEffect(() => { setEmbed({ ...EMPTY_EMBED, fields: [] }); setContent(""); setSendChannel(""); }, [guildId]);

  // ── Mutations ──────────────────────────────────────────────────────────
  const saveTemplateMut = useMutation({
    mutationFn: (body: { name: string; embed: any; id?: number }) => post(guildPath("/api/embeds", guildId), body),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["embeds", guildId] }); setSaveName(""); setShowSave(false); toast.success("Template saved"); },
    onError: (e: any) => toast.error(e.message || "Save failed"),
  });

  const deleteTemplateMut = useMutation({
    mutationFn: (id: number) => del(`/api/embeds/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["embeds", guildId] }); toast.success("Template deleted"); },
    onError: (e: any) => toast.error(e.message || "Delete failed"),
  });

  const sendMut = useMutation({
    mutationFn: (body: { channelId: string; content?: string; embed?: any }) => post(guildPath("/api/embeds/send", guildId), body),
    onSuccess: () => toast.success("Embed sent to channel!"),
    onError: (e: any) => toast.error(e.message || "Send failed"),
  });

  // ── Field helpers ──────────────────────────────────────────────────────
  const addField = () => setEmbed(e => ({ ...e, fields: [...e.fields, { _key: Math.random().toString(36), name: "", value: "", inline: false }] }));
  const updateField = (k: string, patch: Partial<EmbedField>) => setEmbed(e => ({ ...e, fields: e.fields.map(f => f._key === k ? { ...f, ...patch } : f) }));
  const removeField = (k: string) => setEmbed(e => ({ ...e, fields: e.fields.filter(f => f._key !== k) }));

  // ── Template helpers ───────────────────────────────────────────────────
  const handleSaveTemplate = () => {
    if (!saveName.trim()) { toast.error("Template name required"); return; }
    saveTemplateMut.mutate({ name: saveName.trim(), embed: cleanEmbed(embed) });
  };

  const loadTemplate = (t: Template) => {
    try {
      const parsed = JSON.parse(t.embed_json);
      setEmbed({ ...EMPTY_EMBED, ...parsed, fields: (parsed.fields || []).map((f: any) => ({ ...f, _key: Math.random().toString(36) })) });
      toast.success(`Loaded "${t.name}"`);
    } catch { toast.error("Failed to parse template JSON"); }
  };

  // ── Send ───────────────────────────────────────────────────────────────
  const handleSend = () => {
    if (!sendChannel) { toast.error("Select a channel first"); return; }
    const cleaned = cleanEmbed(embed);
    sendMut.mutate({ channelId: sendChannel, content: content || undefined, embed: cleaned });
  };

  // ── JSON ───────────────────────────────────────────────────────────────
  const openJsonExport = () => {
    setJsonText(JSON.stringify(cleanEmbed(embed), null, 2));
    setJsonError("");
    setShowJson(true);
  };

  const importJson = () => {
    try {
      const parsed = JSON.parse(jsonText);
      if (typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Expected an object");
      setEmbed({ ...EMPTY_EMBED, ...parsed, fields: (parsed.fields || []).map((f: any) => ({ ...f, _key: Math.random().toString(36) })) });
      setShowJson(false);
      toast.success("Embed imported from JSON");
    } catch (e: any) { setJsonError(e.message); }
  };

  if (!guildId) return <div className="p-6 text-sm text-muted-foreground">Select a guild first.</div>;
  if (isLoading) return <LoadingFallback text="Loading embed builder..." />;

  const templates = data?.templates || [];
  const channels = channelsData?.channels || [];
  const colorHex = `#${(embed.color || 0x5865F2).toString(16).padStart(6, "0").toUpperCase()}`;
  const cleaned = cleanEmbed(embed);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2.5">
          <Palette className="size-5 text-primary" /> Embed Builder
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Design Discord embeds visually with a live preview. Save templates and send to channels.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ─── Left: Editor ─── */}
        <div className="space-y-4">
          {/* Color */}
          <Card className="border-border/40 bg-card/40">
            <CardHeader><CardTitle className="text-sm font-semibold">Color</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {COLOR_PRESETS.map(p => (
                  <button key={p.color} onClick={() => setEmbed({ ...embed, color: p.color })}
                    className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${embed.color === p.color ? "bg-primary text-primary-foreground" : "bg-background-alt/50 border border-border/40 hover:bg-background-alt"}`}>
                    <span className="inline-block size-2.5 rounded-full mr-1 align-middle" style={{ background: `#${p.color.toString(16).padStart(6, "0")}` }} />
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input type="color" value={colorHex.toLowerCase()} onChange={e => setEmbed({ ...embed, color: parseInt(e.target.value.slice(1), 16) })} className="size-8 rounded cursor-pointer bg-transparent border border-border/40" />
                <code className="text-xs font-mono">{colorHex}</code>
              </div>
            </CardContent>
          </Card>

          {/* Content */}
          <Card className="border-border/40 bg-card/40">
            <CardHeader><CardTitle className="text-sm font-semibold">Content</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div><label className="text-xs text-muted-foreground">Author Name</label><Input className="mt-1 text-xs" value={embed.author.name} onChange={e => setEmbed({ ...embed, author: { ...embed.author, name: e.target.value } })} placeholder="e.g. Server Welcome" /></div>
              <div><label className="text-xs text-muted-foreground">Author Icon URL</label><Input className="mt-1 text-xs font-mono" value={embed.author.icon_url} onChange={e => setEmbed({ ...embed, author: { ...embed.author, icon_url: e.target.value } })} placeholder="https://..." /></div>
              <div><label className="text-xs text-muted-foreground">Title</label><Input className="mt-1 text-xs" value={embed.title} onChange={e => setEmbed({ ...embed, title: e.target.value })} placeholder="Embed title" /></div>
              <div><label className="text-xs text-muted-foreground">Title URL</label><Input className="mt-1 text-xs font-mono" value={embed.url} onChange={e => setEmbed({ ...embed, url: e.target.value })} placeholder="https://..." /></div>
              <div><label className="text-xs text-muted-foreground">Description ({embed.description.length}/2048)</label><Textarea className="mt-1 text-xs h-24 resize-y" value={embed.description} onChange={e => setEmbed({ ...embed, description: e.target.value.slice(0, 2048) })} placeholder="Embed description text..." /></div>
            </CardContent>
          </Card>

          {/* Fields */}
          <Card className="border-border/40 bg-card/40">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold">Fields ({embed.fields.length})</CardTitle>
              <Button size="sm" variant="outline" onClick={addField}><Plus className="size-3.5 mr-1" /> Add Field</Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {embed.fields.length === 0 && <p className="text-xs text-muted-foreground py-2">No fields yet. Add one to include structured data in your embed.</p>}
              {embed.fields.map((f, i) => (
                <div key={f._key} className="rounded-lg border border-border/40 bg-background-alt/30 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Field {i + 1}</span>
                    <Button size="sm" variant="ghost" className="size-6 text-destructive" onClick={() => removeField(f._key)}><X className="size-3" /></Button>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    <Input className="text-xs" value={f.name} onChange={e => updateField(f._key, { name: e.target.value })} placeholder="Field name" />
                    <Input className="text-xs" value={f.value} onChange={e => updateField(f._key, { value: e.target.value })} placeholder="Field value" />
                  </div>
                  <label className="flex items-center gap-2 text-[10px] cursor-pointer">
                    <input type="checkbox" checked={f.inline} onChange={e => updateField(f._key, { inline: e.target.checked })} className="size-3 accent-primary" />
                    Inline
                  </label>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Images + Footer */}
          <Card className="border-border/40 bg-card/40">
            <CardHeader><CardTitle className="text-sm font-semibold">Images & Footer</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div><label className="text-xs text-muted-foreground">Thumbnail URL (small, top-right)</label><Input className="mt-1 text-xs font-mono" value={embed.thumbnail.url} onChange={e => setEmbed({ ...embed, thumbnail: { url: e.target.value } })} placeholder="https://..." /></div>
              <div><label className="text-xs text-muted-foreground">Image URL (large, bottom)</label><Input className="mt-1 text-xs font-mono" value={embed.image.url} onChange={e => setEmbed({ ...embed, image: { url: e.target.value } })} placeholder="https://..." /></div>
              <div><label className="text-xs text-muted-foreground">Footer Text</label><Input className="mt-1 text-xs" value={embed.footer.text} onChange={e => setEmbed({ ...embed, footer: { ...embed.footer, text: e.target.value } })} placeholder="Footer text" /></div>
              <div><label className="text-xs text-muted-foreground">Footer Icon URL</label><Input className="mt-1 text-xs font-mono" value={embed.footer.icon_url} onChange={e => setEmbed({ ...embed, footer: { ...embed.footer, icon_url: e.target.value } })} placeholder="https://..." /></div>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={embed.timestamp} onChange={e => setEmbed({ ...embed, timestamp: e.target.checked })} className="size-3.5 accent-primary" />
                <Clock className="size-3.5 text-muted-foreground" /> Show timestamp
              </label>
            </CardContent>
          </Card>
        </div>

        {/* ─── Right: Preview + Templates + Send ─── */}
        <div className="space-y-4">
          {/* Live Preview */}
          <Card className="border-border/40 bg-card/40 lg:sticky lg:top-4">
            <CardHeader><CardTitle className="text-sm font-semibold">Live Preview</CardTitle></CardHeader>
            <CardContent>
              <EmbedPreview embed={cleaned} />
            </CardContent>
          </Card>

          {/* Send to Channel */}
          <Card className="border-border/40 bg-card/40">
            <CardHeader><CardTitle className="text-sm font-semibold flex items-center gap-2"><Send className="size-4 text-primary" /> Send to Channel</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div><label className="text-xs text-muted-foreground">Message Content (optional, above embed)</label><Textarea className="mt-1 text-xs h-16 resize-y" value={content} onChange={e => setContent(e.target.value)} placeholder="Text above the embed..." /></div>
              <div>
                <label className="text-xs text-muted-foreground">Channel</label>
                <select className="w-full mt-1 bg-background-alt/50 border border-border/40 rounded-lg p-2 text-xs font-mono" value={sendChannel} onChange={e => setSendChannel(e.target.value)}>
                  <option value="">— Select channel —</option>
                  {channels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
                </select>
              </div>
              <Button size="sm" className="w-full" disabled={!sendChannel || sendMut.isPending} onClick={handleSend}>
                <Send className="size-3.5 mr-1" /> {sendMut.isPending ? "Sending…" : "Send Embed"}
              </Button>
            </CardContent>
          </Card>

          {/* Templates */}
          <Card className="border-border/40 bg-card/40">
            <CardHeader><CardTitle className="text-sm font-semibold flex items-center gap-2"><Save className="size-4 text-primary" /> Templates ({templates.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {templates.length === 0 && <p className="text-xs text-muted-foreground py-2">No templates saved yet.</p>}
              {templates.map(t => (
                <div key={t.id} className="flex items-center justify-between rounded-lg border border-border/40 bg-background-alt/30 px-3 py-2">
                  <span className="text-xs font-medium truncate">{t.name}</span>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => loadTemplate(t)}>Load</Button>
                    <Button size="sm" variant="ghost" className="h-6 text-destructive" onClick={async () => {
                      if (!await confirm({ title: `Delete template "${t.name}"?`, description: "This template will be permanently removed.", confirmLabel: "Delete" })) return;
                      deleteTemplateMut.mutate(t.id);
                    }}><Trash2 className="size-3" /></Button>
                  </div>
                </div>
              ))}
              {showSave ? (
                <div className="flex gap-2 pt-2">
                  <Input className="text-xs flex-1" value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="Template name…" onKeyDown={e => e.key === "Enter" && handleSaveTemplate()} autoFocus />
                  <Button size="sm" onClick={handleSaveTemplate} disabled={saveTemplateMut.isPending}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowSave(false)}>Cancel</Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" className="w-full" onClick={() => setShowSave(true)}><Save className="size-3.5 mr-1" /> Save As Template</Button>
              )}
            </CardContent>
          </Card>

          {/* JSON Import/Export */}
          <Card className="border-border/40 bg-card/40">
            <CardHeader><CardTitle className="text-sm font-semibold flex items-center gap-2"><Download className="size-4 text-primary" /> JSON</CardTitle></CardHeader>
            <CardContent>
              {showJson ? (
                <div className="space-y-2">
                  <Textarea className="text-xs font-mono h-40 resize-y" value={jsonText} onChange={e => { setJsonText(e.target.value); setJsonError(""); }} />
                  {jsonError && <p className="text-[10px] text-destructive">{jsonError}</p>}
                  <div className="flex gap-2">
                    <Button size="sm" onClick={importJson}><Upload className="size-3.5 mr-1" /> Import</Button>
                    <Button size="sm" variant="outline" onClick={() => { navigator.clipboard?.writeText(jsonText); toast.success("Copied"); }}>Copy</Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowJson(false)}>Close</Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={openJsonExport}><Download className="size-3.5 mr-1" /> Edit as JSON</Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
