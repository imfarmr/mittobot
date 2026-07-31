import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, guildPath } from "@/lib/api";
import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ErrorRetry } from "@/components/app/ErrorRetry";
import { Skeleton } from "@/components/ui/skeleton";

import {
  Search, Save, RotateCcw, Plus, X, Terminal, Clock, Shield,
  ChevronDown, ChevronRight, Hash, Settings2,
  Filter, List, LayoutGrid, Box,
} from "lucide-react";
import { toast } from "sonner";
import { useGuild } from "@/hooks/useGuild";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { MultiSelect } from "@/components/app/MultiSelect";
import { CustomSelect } from "@/components/app/CustomSelect";

// Types
interface CommandConfig {
  enabled: boolean;
  permission: string;
  cooldown: number;
  allowedChannels: string[];
  blockedChannels: string[];
  allowedRoles: string[];
  settings?: Record<string, any>;
}
interface CommandDef {
  name: string;
  description: string;
  category: string | null;
  aliases: string[];
  config: CommandConfig;
}
interface CommandsData {
  guildId: string;
  commands: CommandDef[];
  prefix: string;
  permLabels: Record<string, string>;
  permLevels: string[];
  channels: { id: string; name: string }[];
  roles: { id: string; name: string }[];
}

const ALIAS_RE = /^[a-z0-9_-]{1,32}$/;
const MAX_ALIASES = 10;



// Category color classes
const CATEGORY_STYLES: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  moderation: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/20", dot: "bg-red-400" },
  economy: { bg: "bg-yellow-500/10", text: "text-yellow-400", border: "border-yellow-500/20", dot: "bg-yellow-400" },
  fun: { bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-500/20", dot: "bg-purple-400" },
  utility: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20", dot: "bg-blue-400" },
  ai: { bg: "bg-cyan-500/10", text: "text-cyan-400", border: "border-cyan-500/20", dot: "bg-cyan-400" },
  music: { bg: "bg-green-500/10", text: "text-green-400", border: "border-green-500/20", dot: "bg-green-400" },
  leveling: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20", dot: "bg-emerald-400" },
};

function getCategoryStyle(cat: string) {
  return CATEGORY_STYLES[cat] || { bg: "bg-zinc-500/10", text: "text-zinc-400", border: "border-zinc-500/20", dot: "bg-zinc-400" };
}

// Mini section in card for channel/role restrictions
function RestrictionChips({ label, ids, names }: { label: string; ids: string[]; names: Record<string, string> }) {
  if (!ids.length) return null;
  return (
    <div className="flex items-start gap-1.5">
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold mt-0.5 shrink-0">{label}:</span>
      <div className="flex flex-wrap gap-1">
        {ids.slice(0, 3).map((id) => (
          <span key={id} className="inline-flex items-center gap-1 rounded bg-background-alt/50 border border-border/30 text-[10px] font-mono px-1.5 py-0.5">
            {names[id] || id.slice(0, 8)}
          </span>
        ))}
        {ids.length > 3 && (
          <span className="text-[10px] text-muted-foreground font-mono">+{ids.length - 3} more</span>
        )}
      </div>
    </div>
  );
}

export default function CommandsPage() {
  const { guildId } = useGuild();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);
  const activeGuildIdRef = useRef(guildId);
  activeGuildIdRef.current = guildId;

  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const [edits, setEdits] = useState<Record<string, { enabled?: boolean; permission?: string; cooldown?: number; aliases?: string[]; allowedRoles?: string[]; allowedChannels?: string[]; blockedChannels?: string[]; settings?: Record<string, any> }>>({});
  const [aliasDraft, setAliasDraft] = useState<Record<string, string>>({});

  // Drafts are guild-specific. Clear them when switching servers so a pending
  // edit from one guild can never be submitted to another guild by accident.
  useEffect(() => {
    setSearch("");
    setCatFilter("all");
    setExpandedCards({});
    setEdits({});
    setAliasDraft({});
    setPrefixDraft(null);
  }, [guildId]);

  // Keyboard shortcut: Ctrl/Cmd+K to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const { data, isLoading, isError, error, refetch } = useQuery<CommandsData>({
    queryKey: ["commands", guildId],
    queryFn: () => get(guildPath("/api/commands", guildId)),
    enabled: !!guildId,
  });

  const saveMutation = useMutation({
    mutationFn: ({ targetGuildId, name, body }: { targetGuildId: string; name: string; body: any }) =>
      post(`/api/commands/${encodeURIComponent(name)}`, { ...body, guildId: targetGuildId }),
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["commands", vars.targetGuildId] });
      if (vars.targetGuildId !== activeGuildIdRef.current) return;
      setEdits(prev => { const next = { ...prev }; delete next[vars.name]; return next; });
      setAliasDraft(prev => { const next = { ...prev }; delete next[vars.name]; return next; });
      toast.success(`Saved ${vars.name}`);
    },
    onError: (e: any) => toast.error(e.message || "Save failed"),
  });

  const resetMutation = useMutation({
    mutationFn: ({ targetGuildId, name }: { targetGuildId: string; name: string }) =>
      post(`/api/commands/${encodeURIComponent(name)}`, { guildId: targetGuildId, reset: true }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["commands", vars.targetGuildId] });
      if (vars.targetGuildId !== activeGuildIdRef.current) return;
      setEdits(prev => { const next = { ...prev }; delete next[vars.name]; return next; });
      setAliasDraft(prev => { const next = { ...prev }; delete next[vars.name]; return next; });
      toast.success(`Reset ${vars.name} to defaults`);
    },
    onError: (e: any) => toast.error(e.message || "Reset failed"),
  });

  const [prefixDraft, setPrefixDraft] = useState<string | null>(null);
  const prefixMutation = useMutation({
    mutationFn: ({ value, targetGuildId }: { value: string; targetGuildId: string }) =>
      post("/api/settings", { key: "prefix", value, guildId: targetGuildId }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["commands", vars.targetGuildId] });
      if (vars.targetGuildId !== activeGuildIdRef.current) return;
      setPrefixDraft(null);
      toast.success("Prefix updated");
    },
    onError: (e: any) => toast.error(e.message || "Prefix must be 1-3 characters"),
  });

  // These derived values must stay above the loading/error returns. The old
  // implementation called useMemo only after an early return, which caused the
  // Commands page to change its hook order between loading and loaded renders.
  const commands = Array.isArray(data?.commands) ? data.commands : [];
  const channels = Array.isArray(data?.channels) ? data.channels : [];
  const roles = Array.isArray(data?.roles) ? data.roles : [];
  const prefix = data?.prefix || "$";
  const permLabels = data?.permLabels || {};
  const permLevels = data?.permLevels ?? [];

  const commandsByCategory = useMemo(() => {
    const groups: Record<string, CommandDef[]> = {};
    for (const cmd of commands) {
      const cat = cmd.category || "uncategorized";
      (groups[cat] ??= []).push(cmd);
    }
    return groups;
  }, [commands]);

  const categoryOrder = Object.keys(commandsByCategory).sort();
  const totalCommands = commands.length;

  const channelNames = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of channels) m[c.id] = `#${c.name}`;
    return m;
  }, [channels]);
  const roleNames = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of roles) m[r.id] = r.name;
    return m;
  }, [roles]);

  const filteredGroups = useMemo(() => {
    const result: Record<string, CommandDef[]> = {};
    const q = search.trim().toLowerCase();
    for (const [cat, cmds] of Object.entries(commandsByCategory)) {
      if (catFilter !== "all" && cat !== catFilter) continue;
      const filtered = cmds.filter(c => !q ||
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        (c.aliases || []).some(a => a.toLowerCase().includes(q))
      );
      if (filtered.length) result[cat] = filtered;
    }
    return result;
  }, [commandsByCategory, catFilter, search]);

  if (!guildId) return <div className="p-6 text-sm text-muted-foreground">Select a guild first.</div>;
  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="space-y-2"><Skeleton className="h-7 w-40" /><Skeleton className="h-4 w-80" /></div>
        <Skeleton className="h-20 w-full" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map(n => <Skeleton key={n} className="h-32 w-full" />)}
        </div>
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="p-6">
        <ErrorRetry message={error instanceof Error ? error.message : "Unable to load commands."} onRetry={() => refetch()} />
      </div>
    );
  }

  const getEdit = (name: string) => edits[name] || {};
  const isDirty = (name: string) => edits[name] !== undefined;
  const setField = (name: string, field: string, value: any) =>
    setEdits(prev => ({ ...prev, [name]: { ...(prev[name] || {}), [field]: value } }));

  const getAliases = (cmd: CommandDef) => getEdit(cmd.name).aliases ?? cmd.aliases ?? [];
  const setAliases = (name: string, aliases: string[]) =>
    setEdits(prev => ({ ...prev, [name]: { ...(prev[name] || {}), aliases } }));

  const addAlias = (cmd: CommandDef) => {
    const draft = (aliasDraft[cmd.name] || "").trim().toLowerCase();
    if (!draft) return;
    if (!ALIAS_RE.test(draft)) { toast.error("Alias must use lowercase letters, numbers, _ and - (1-32 chars)"); return; }
    const current = getAliases(cmd);
    if (current.includes(draft)) { toast.error("Alias already exists"); return; }
    if (draft === cmd.name) { toast.error("Alias can't be the same as the command name"); return; }
    if (current.length >= MAX_ALIASES) { toast.error(`Max ${MAX_ALIASES} aliases`); return; }
    const conflicts = commands.some(c => c.name === draft || (c.aliases || []).includes(draft));
    if (conflicts) { toast.error(`"${draft}" is already a command or alias`); return; }
    setAliases(cmd.name, [...current, draft]);
    setAliasDraft(prev => { const next = { ...prev }; delete next[cmd.name]; return next; });
  };

  const removeAlias = (cmd: CommandDef, alias: string) =>
    setAliases(cmd.name, getAliases(cmd).filter(a => a !== alias));

  const handleSave = (cmd: CommandDef) => {
    const edit = getEdit(cmd.name);
    if (!Object.keys(edit).length) return;
    const body: any = {};
    if (edit.enabled !== undefined) body.enabled = edit.enabled;
    if (edit.permission !== undefined) body.permission = edit.permission;
    if (edit.cooldown !== undefined) body.cooldown = edit.cooldown;
    if (edit.aliases !== undefined) body.aliases = edit.aliases;
    if (edit.allowedRoles !== undefined) body.allowedRoles = edit.allowedRoles;
    if (edit.allowedChannels !== undefined) body.allowedChannels = edit.allowedChannels;
    if (edit.blockedChannels !== undefined) body.blockedChannels = edit.blockedChannels;
    if (edit.settings !== undefined) body.settings = edit.settings;
    saveMutation.mutate({ targetGuildId: guildId, name: cmd.name, body });
  };

  const toggleExpanded = (name: string) => {
    setExpandedCards(prev => ({ ...prev, [name]: !prev[name] }));
  };

  // Build permission label mapping
  const permLevelNames: Record<string, string> = {};
  for (const k of Object.keys(permLabels)) permLevelNames[k] = permLabels[k];

  const renderCommandCard = (cmd: CommandDef) => {
    const edit = getEdit(cmd.name);
    const dirty = isDirty(cmd.name);
    const enabled = edit.enabled !== undefined ? edit.enabled : cmd.config.enabled;
    const permission = edit.permission ?? cmd.config.permission;
    const cooldown = edit.cooldown ?? cmd.config.cooldown;
    const allowedChannels = edit.allowedChannels ?? cmd.config.allowedChannels ?? [];
    const blockedChannels = edit.blockedChannels ?? cmd.config.blockedChannels ?? [];
    const allowedRoles = edit.allowedRoles ?? cmd.config.allowedRoles ?? [];
    const aliases = getAliases(cmd);
    const cat = cmd.category || "uncategorized";
    const catStyle = getCategoryStyle(cat);
    const expanded = expandedCards[cmd.name] || false;
    const hasSettings = cmd.config.settings && Object.keys(cmd.config.settings).length > 0;

    return (
      <Card
        key={cmd.name}
        className={cn(
          "border-border/40 transition-all",
          !enabled ? "bg-card/20 opacity-70" : "bg-card/40",
          dirty && "ring-1 ring-primary/40",
          viewMode === "grid" ? "" : ""
        )}
      >
        <CardHeader className="flex flex-row items-start justify-between gap-2 py-3 px-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn("text-sm font-semibold font-mono", !enabled && "line-through text-muted-foreground")}>
                {prefix}{cmd.name}
              </span>
              {cmd.category && (
                <span className={cn("text-[9px] font-mono px-1.5 py-0.5 rounded-full border", catStyle.bg, catStyle.text, catStyle.border)}>
                  {cat}
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{cmd.description}</p>
            {dirty && <span className="text-[9px] text-primary font-mono mt-1 inline-block">unsaved changes</span>}
          </div>
          <div className="flex items-center gap-1.5">
            <Switch checked={enabled} onCheckedChange={v => setField(cmd.name, "enabled", v)} />
            <button
              type="button"
              onClick={() => toggleExpanded(cmd.name)}
                aria-label={`${expanded ? "Collapse" : "Expand"} ${cmd.name} settings`}
                className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"

            >
              {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            </button>
          </div>
        </CardHeader>

        {expanded && (
          <CardContent className="px-4 pb-4 space-y-3 border-t border-border/20 pt-3">
            {/* Aliases */}
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Hash className="size-2.5 text-muted-foreground" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Aliases</span>
                <span className="text-[9px] text-muted-foreground/60">{aliases.length}/{MAX_ALIASES}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 items-center">
                {aliases.map(a => (
                  <span key={a} className="inline-flex items-center gap-1 rounded bg-primary/10 text-primary text-[10px] font-mono px-1.5 py-0.5">
                    {prefix}{a}
                    <button
                      type="button"
                      aria-label={`Remove alias ${a}`}
                      title={`Remove alias ${a}`}
                      className="text-primary/60 hover:text-destructive"
                      onClick={() => removeAlias(cmd, a)}
                    >
                      <X className="size-2.5" />
                    </button>
                  </span>
                ))}
                {aliases.length < MAX_ALIASES && (
                  <div className="inline-flex items-center gap-1">
                    <input
                      aria-label={`Add alias for ${cmd.name}`}
                      className="w-16 rounded-lg border border-white/[0.12] bg-white/[0.055] px-1.5 py-0.5 text-[10px] font-mono shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/25"
                      placeholder="add"
                      value={aliasDraft[cmd.name] || ""}
                      onChange={e => setAliasDraft(prev => ({ ...prev, [cmd.name]: e.target.value }))}
                      onKeyDown={e => { if (e.key === "Enter") addAlias(cmd); }}
                    />
                    <button
                      type="button"
                      aria-label={`Add alias for ${cmd.name}`}
                      title="Add alias"
                      className="text-muted-foreground hover:text-primary"
                      onClick={() => addAlias(cmd)}
                    >
                      <Plus className="size-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Permission + cooldown */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Shield className="size-2.5" /> Permission
                </label>
                <CustomSelect
                  value={permission}
                  onChange={value => setField(cmd.name, "permission", value)}
                  options={permLevels.map(p => ({ value: p, label: permLevelNames[p] || p }))}
                  aria-label={`Permission for ${cmd.name}`}
                  triggerClassName="mt-0.5 h-8 rounded-lg px-2 text-[10px] font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Clock className="size-2.5" /> Cooldown (s)
                </label>                  <Input
                    type="number" min={0} max={86400}
                    aria-label={`Cooldown in seconds for ${cmd.name}`}
                    className="mt-0.5 text-[10px] font-mono h-7"

                  value={cooldown}
                  onChange={e => {
                    const value = Number.parseInt(e.target.value, 10);
                    setField(cmd.name, "cooldown", Number.isFinite(value) ? Math.max(0, Math.min(86400, value)) : 0);
                  }}
                />
              </div>
            </div>

            {/* Channel restrictions */}
            <div>
              <label className="text-[10px] text-muted-foreground flex items-center gap-1 mb-1">
                <Hash className="size-2.5" /> Allowed channels
              </label>
              <MultiSelect
                items={channels}
                selected={new Set(allowedChannels)}
                onChange={selected => setField(cmd.name, "allowedChannels", Array.from(selected))}
                prefix="#"
                placeholder="Select allowed channels…"
                aria-label={`Allowed channels for ${cmd.name}`}
              />
            </div>

            {/* Role restrictions */}
            <div>
              <label className="mb-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                <Shield className="size-2.5" /> Allowed roles
              </label>
              <MultiSelect
                items={roles}
                selected={new Set(allowedRoles)}
                onChange={selected => setField(cmd.name, "allowedRoles", Array.from(selected))}
                prefix="@"
                placeholder="Select allowed roles…"
                aria-label={`Allowed roles for ${cmd.name}`}
              />
            </div>

            {/* Blocked channels */}
            <div>
              <label className="mb-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                <Hash className="size-2.5" /> Blocked channels
              </label>
              <MultiSelect
                items={channels}
                selected={new Set(blockedChannels)}
                onChange={selected => setField(cmd.name, "blockedChannels", Array.from(selected))}
                prefix="#"
                placeholder="Select blocked channels…"
                aria-label={`Blocked channels for ${cmd.name}`}
              />
            </div>

            {/* Settings bag preview */}
            {hasSettings && (
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <Settings2 className="size-2.5 text-muted-foreground" />
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Settings</span>
                </div>
                <div className="rounded bg-background-alt/30 border border-border/30 p-2 max-h-24 overflow-y-auto">
                  {Object.entries(cmd.config.settings || {}).slice(0, 6).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between py-0.5">
                      <span className="text-[9px] font-mono text-muted-foreground">{k}</span>
                      <span className="text-[9px] font-mono text-foreground truncate max-w-[120px]">{String(v).slice(0, 30)}</span>
                    </div>
                  ))}
                  {Object.keys(cmd.config.settings || {}).length > 6 && (
                    <p className="text-[8px] text-muted-foreground pt-1">+{Object.keys(cmd.config.settings || {}).length - 6} more</p>
                  )}
                </div>
              </div>
            )}

            {/* Save / reset */}
            <div className="flex items-center justify-end gap-1 pt-1 border-t border-border/20">
              <Button
                variant="ghost" size="sm"
                className="h-6 text-[10px] text-destructive px-2"
                onClick={() => resetMutation.mutate({ targetGuildId: guildId, name: cmd.name })}
                disabled={resetMutation.isPending}
                title="Reset to defaults"
              >
                <RotateCcw className="size-3" />
              </Button>
              <Button
                size="sm" className="h-6 text-[10px] px-3"
                disabled={!dirty || saveMutation.isPending}
                onClick={() => handleSave(cmd)}
              >
                <Save className="size-3 mr-1" /> Save
              </Button>
            </div>
          </CardContent>
        )}

        {!expanded && (
          <CardContent className="px-4 pb-3 pt-0">
            {/* Restriction chips */}
            {allowedRoles.length > 0 && (
              <RestrictionChips label="Roles" ids={allowedRoles} names={roleNames} />
            )}
            {allowedChannels.length > 0 && (
              <RestrictionChips label="Channels" ids={allowedChannels} names={channelNames} />
            )}
            {blockedChannels.length > 0 && (
              <RestrictionChips label="Blocked" ids={blockedChannels} names={channelNames} />
            )}
            {aliases.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {aliases.slice(0, 3).map(a => (
                  <span key={a} className="text-[9px] font-mono text-primary/70 bg-primary/5 rounded px-1">{prefix}{a}</span>
                ))}
                {aliases.length > 3 && (
                  <span className="text-[9px] text-muted-foreground">+{aliases.length - 3}</span>
                )}
              </div>
            )}
          </CardContent>
        )}
      </Card>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Commands" description="Configure commands: permissions, aliases, cooldowns, and channel restrictions" />

      {/* Prefix banner */}
      <Card className="border-border/40 bg-card/40">
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <Terminal className="size-5 text-primary" />
            <div>
              <div className="text-xs text-muted-foreground">Command prefix <span className="text-[10px]">(bot-wide)</span></div>
              <div className="text-lg font-bold font-mono">{prefix}</div>
            </div>
          </div>
          {user?.isOwner ? (
            <div className="flex items-center gap-2">
              {prefixDraft !== null ? (
                <>
                  <Input
                    className="w-20 font-mono text-sm"
                    value={prefixDraft}
                    maxLength={3}
                    onChange={e => setPrefixDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && prefixDraft.length >= 1 && prefixDraft.length <= 3) {
                        prefixMutation.mutate({ value: prefixDraft, targetGuildId: guildId });
                      }
                      if (e.key === "Escape") setPrefixDraft(null);
                    }}
                    placeholder={prefix}
                  />
                  <Button
                      size="sm"
                      disabled={prefixMutation.isPending || prefixDraft.length < 1}
                      onClick={() => prefixMutation.mutate({ value: prefixDraft, targetGuildId: guildId })}
                    >Save</Button>

                  <Button size="sm" variant="ghost" onClick={() => setPrefixDraft(null)}>Cancel</Button>
                </>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setPrefixDraft(prefix)}>Edit prefix</Button>
              )}
            </div>
          ) : (
            <Badge variant="outline" className="text-[10px]">owner-only edit</Badge>
          )}
        </CardContent>
      </Card>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground pointer-events-none" />
          <Input
            ref={searchRef}
            className="pl-9 pr-12"
            placeholder="Search commands or aliases... (Ctrl+K)"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <kbd className="absolute right-2.5 top-2 hidden sm:inline-flex items-center gap-0.5 rounded border border-border/40 bg-background-alt/50 px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground">
            <span className="text-[10px]">⌘</span>K
          </kbd>
        </div>

        <div className="flex items-center gap-2">
          {/* Category filter */}
          <div className="flex items-center gap-1.5 bg-background-alt/30 border border-border/40 rounded-lg px-2 py-1.5">
            <Filter className="size-3 text-muted-foreground" />
            <CustomSelect
              value={catFilter}
              onChange={setCatFilter}
              options={[
                { value: "all", label: `All (${totalCommands})` },
                ...categoryOrder.map(c => ({ value: c, label: `${c} (${commandsByCategory[c].length})` })),
              ]}
              aria-label="Filter commands by category"
              triggerClassName="h-7 min-w-32 border-0 bg-transparent px-1.5 text-xs font-mono shadow-none backdrop-blur-none hover:bg-white/[0.06] focus:ring-0"
            />
          </div>

          {/* View toggle */}
          <div className="flex items-center bg-background-alt/30 border border-border/40 rounded-lg p-0.5">
            <button
              type="button"
              aria-label="Grid view"
              className={cn("rounded-full p-1.5 transition-colors", viewMode === "grid" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}
              onClick={() => setViewMode("grid")}
              title="Grid view"
            >
              <LayoutGrid className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="List view"
              className={cn("rounded-full p-1.5 transition-colors", viewMode === "list" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}
              onClick={() => setViewMode("list")}
              title="List view"
            >
              <List className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Command groups */}
      {Object.entries(filteredGroups).map(([cat, cmds]) => {
        const catStyle = getCategoryStyle(cat);
        return (
          <div key={cat} className="space-y-3">
            {/* Category header */}
            <div className={cn("flex items-center gap-2 px-3 py-2 rounded-lg border", catStyle.border, catStyle.bg)}>
              <span className={cn("size-2 rounded-full shrink-0", catStyle.dot)} />
              <span className={cn("text-xs font-semibold capitalize", catStyle.text)}>{cat}</span>
              <span className="text-[10px] font-mono text-muted-foreground">{cmds.length} commands</span>
            </div>

            {/* Command cards */}
            <div className={cn(
              viewMode === "grid"
                ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2"
                : "space-y-1"
            )}>
              {cmds.map(renderCommandCard)}
            </div>
          </div>
        );
      })}

      {Object.keys(filteredGroups).length === 0 && (
        <div className="py-16 text-center space-y-2">
          <Box className="size-8 text-muted-foreground/40 mx-auto" />
          <p className="text-sm text-muted-foreground">No commands match your search.</p>
          <Button size="sm" variant="outline" onClick={() => { setSearch(""); setCatFilter("all"); }}>
            Clear filters
          </Button>
        </div>
      )}
    </div>
  );
}
