import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { get, post, put, del, guildPath } from "@/lib/api";
import { useGuild } from "@/hooks/useGuild";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CustomSelect } from "@/components/app/CustomSelect";
import { UserCheck, Plus, Trash2, PanelTop, Send, Pencil, X, GripVertical } from "lucide-react";
import { toast } from "sonner";

interface Role {
  id: string;
  name: string;
  color?: number;
  position?: number;
}

interface Channel {
  id: string;
  name: string;
  type?: string;
}

interface RoleOption {
  label: string;
  roleId: string;
  emoji?: string;
  description?: string;
  style?: "secondary" | "success" | "danger";
}

interface RolePanel {
  id: number;
  guildId: string;
  name: string;
  description: string;
  channelId: string | null;
  messageId: string | null;
  panelType: "button" | "select";
  options: RoleOption[];
  exclusive: boolean;
  requiredRole: string | null;
  enabled: boolean;
  createdAt?: number;
  updatedAt?: number;
}

interface RolesData {
  guildId: string;
  hasGuild: boolean;
  guildName: string;
  prefix: string;
  roles: Role[];
  autoroles: string[];
  reactionRoles: Record<string, Record<string, string>>;
}

interface ChannelsData {
  channels?: Channel[];
}

type PanelDraft = Omit<RolePanel, "id" | "guildId" | "createdAt" | "updatedAt"> & { id?: number };

const emptyOption = (): RoleOption => ({ label: "", roleId: "", emoji: "", description: "", style: "secondary" });
const emptyDraft = (): PanelDraft => ({
  name: "",
  description: "",
  channelId: null,
  messageId: null,
  panelType: "button",
  options: [emptyOption()],
  exclusive: false,
  requiredRole: null,
  enabled: true,
});

function clonePanel(panel: RolePanel): PanelDraft {
  return {
    id: panel.id,
    name: panel.name,
    description: panel.description,
    channelId: panel.channelId,
    messageId: panel.messageId,
    panelType: panel.panelType,
    options: panel.options.map((option) => ({ ...option })),
    exclusive: panel.exclusive,
    requiredRole: panel.requiredRole,
    enabled: panel.enabled,
  };
}

export default function RolesView() {
  const { guildId } = useGuild();
  const queryClient = useQueryClient();
  const [newAutorole, setNewAutorole] = useState("");
  const [autorolesDirty, setAutorolesDirty] = useState<string[] | null>(null);
  const [draft, setDraft] = useState<PanelDraft | null>(null);

  const { data, isLoading } = useQuery<RolesData>({
    queryKey: ["roles", guildId],
    queryFn: () => get(guildPath("/api/roles", guildId)),
    enabled: !!guildId,
  });

  const { data: panelsData, isLoading: panelsLoading } = useQuery<{ panels: RolePanel[] }>({
    queryKey: ["role-panels", guildId],
    queryFn: () => get(guildPath("/api/role-panels", guildId)),
    enabled: !!guildId,
  });

  const { data: channelsData } = useQuery<ChannelsData>({
    queryKey: ["channels", guildId],
    queryFn: () => get(guildPath("/api/channels", guildId)),
    enabled: !!guildId,
  });

  useEffect(() => {
    if (data?.autoroles) setAutorolesDirty(null);
  }, [data]);

  const panels = panelsData?.panels || [];
  const roles = data?.roles || [];
  const channels = (channelsData?.channels || []).filter((channel) => channel.type === "Text");
  const roleOptions = useMemo(
    () => roles.map((role) => ({ value: role.id, label: `@${role.name}` })),
    [roles],
  );
  const channelOptions = useMemo(
    () => channels.map((channel) => ({ value: channel.id, label: `#${channel.name}` })),
    [channels],
  );

  const saveAutoroles = useMutation({
    mutationFn: (body: { roleIds: string[] }) => post(guildPath("/api/roles/autoroles", guildId), body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles", guildId] });
      setAutorolesDirty(null);
      toast.success("Autoroles updated");
    },
    onError: (error: any) => toast.error(error.message || "Save failed"),
  });

  const removeRR = useMutation({
    mutationFn: (body: { messageId: string; key?: string }) => post(guildPath("/api/roles/reaction/remove", guildId), body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles", guildId] });
      toast.success("Reaction role mapping removed");
    },
    onError: (error: any) => toast.error(error.message || "Remove failed"),
  });

  const savePanel = useMutation({
    mutationFn: async (value: PanelDraft) => {
      const body = {
        name: value.name.trim(),
        description: value.description.trim(),
        channelId: value.channelId || null,
        panelType: value.panelType,
        options: value.options,
        exclusive: value.panelType === "select" && value.exclusive,
        requiredRole: value.requiredRole || null,
        enabled: value.enabled,
      };
      if (value.id) return put(guildPath(`/api/role-panels/${value.id}`, guildId), body);
      return post(guildPath("/api/role-panels", guildId), body);
    },
    onSuccess: (result: { panel: RolePanel }) => {
      queryClient.invalidateQueries({ queryKey: ["role-panels", guildId] });
      setDraft(result.panel ? clonePanel(result.panel) : null);
      toast.success(result.panel?.id ? "Role panel saved" : "Role panel created");
    },
    onError: (error: any) => toast.error(error.message || "Could not save panel"),
  });

  const deletePanel = useMutation({
    mutationFn: (id: number) => del(guildPath(`/api/role-panels/${id}`, guildId)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["role-panels", guildId] });
      setDraft(null);
      toast.success("Role panel deleted");
    },
    onError: (error: any) => toast.error(error.message || "Could not delete panel"),
  });

  const publishPanel = useMutation({
    mutationFn: (value: { id: number; channelId: string }) => post(guildPath(`/api/role-panels/${value.id}/publish`, guildId), { channelId: value.channelId }),
    onSuccess: (result: { channelId?: string; messageId?: string }) => {
      queryClient.invalidateQueries({ queryKey: ["role-panels", guildId] });
      setDraft((current) => current ? { ...current, channelId: result.channelId || current.channelId, messageId: result.messageId || current.messageId } : current);
      toast.success("Panel published to Discord");
    },
    onError: (error: any) => toast.error(error.message || "Could not publish panel"),
  });

  if (!guildId) return <div className="p-6 text-sm text-muted-foreground">Select a guild first.</div>;
  if (isLoading || !data) return <div className="p-6 text-sm text-muted-foreground">Loading roles…</div>;

  const currentAutoroles = autorolesDirty ?? data.autoroles ?? [];
  const autorolesAreDirty = autorolesDirty !== null && JSON.stringify(autorolesDirty) !== JSON.stringify(data.autoroles ?? []);
  const rrEntries = Object.entries(data.reactionRoles || {});

  const updateDraft = (patch: Partial<PanelDraft>) => setDraft((current) => current ? { ...current, ...patch } : current);
  const updateOption = (index: number, patch: Partial<RoleOption>) => {
    setDraft((current) => {
      if (!current) return current;
      return { ...current, options: current.options.map((option, optionIndex) => optionIndex === index ? { ...option, ...patch } : option) };
    });
  };
  const removeOption = (index: number) => {
    setDraft((current) => {
      if (!current) return current;
      return { ...current, options: current.options.filter((_, optionIndex) => optionIndex !== index) };
    });
  };

  const validateAndSavePanel = () => {
    if (!draft) return;
    if (!draft.name.trim()) return toast.error("Give the panel a name first");
    if (!draft.options.length) return toast.error("Add at least one role option");
    if (draft.options.length > 25) return toast.error("Discord panels support up to 25 options");
    if (draft.options.some((option) => !option.label.trim() || !option.roleId)) return toast.error("Every option needs a label and role");
    if (new Set(draft.options.map((option) => option.roleId)).size !== draft.options.length) return toast.error("Each role can only appear once in a panel");
    savePanel.mutate(draft);
  };

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <UserCheck className="size-5 text-primary" />
          <div>
            <h1 className="text-xl font-bold tracking-tight">Roles</h1>
            <p className="text-xs text-muted-foreground">Autoroles, legacy reactions, and interactive role panels</p>
          </div>
        </div>
        <Button size="sm" onClick={() => setDraft(emptyDraft())}>
          <Plus className="size-3.5" /> New role panel
        </Button>
      </div>

      <Card className="border-border/40 bg-card/40">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Autoroles</CardTitle>
          <CardDescription className="text-xs">Roles automatically granted to new members on join</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <CustomSelect value={newAutorole} onChange={setNewAutorole} options={roleOptions.filter((role) => !currentAutoroles.includes(role.value))} allowNone noneLabel="— Select role —" placeholder="Select role…" aria-label="Autorole" triggerClassName="flex-1 text-xs font-mono" />
            <Button size="sm" disabled={!newAutorole} onClick={() => {
              if (currentAutoroles.includes(newAutorole)) return toast.error("Already in autoroles");
              setAutorolesDirty([...currentAutoroles, newAutorole]);
              setNewAutorole("");
            }}>
              <Plus className="size-3.5" /> Add
            </Button>
            {autorolesAreDirty && <Button size="sm" variant="outline" disabled={saveAutoroles.isPending} onClick={() => saveAutoroles.mutate({ roleIds: currentAutoroles })}>{saveAutoroles.isPending ? "Saving…" : "Save"}</Button>}
          </div>
          {currentAutoroles.length === 0 ? (
            <div className="py-2 text-xs text-muted-foreground">No autoroles configured.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {currentAutoroles.map((roleId) => {
                const role = roles.find((item) => item.id === roleId);
                return <Badge key={roleId} variant="outline" className="flex items-center gap-1 px-2 py-1"><span className="text-xs">@{role?.name || roleId}</span><button className="ml-1 text-destructive" onClick={() => setAutorolesDirty(currentAutoroles.filter((id) => id !== roleId))}>×</button></Badge>;
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/40 bg-card/40">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Role panels</CardTitle>
          <CardDescription className="text-xs">Modern Discord buttons and select menus. Draft a panel, then publish it to a text channel.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {panelsLoading ? <div className="text-xs text-muted-foreground">Loading panels…</div> : panels.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/50 px-4 py-8 text-center">
              <PanelTop className="mx-auto mb-2 size-6 text-muted-foreground/60" />
              <p className="text-sm font-medium">No role panels yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Create a button grid or multi-role select menu for your members.</p>
              <Button size="sm" className="mt-4" onClick={() => setDraft(emptyDraft())}><Plus className="size-3.5" /> Create your first panel</Button>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {panels.map((panel) => (
                <button key={panel.id} className={`group rounded-xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/[0.04] ${draft?.id === panel.id ? "border-primary/60 bg-primary/[0.06]" : "border-border/40 bg-background/20"}`} onClick={() => setDraft(clonePanel(panel))}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><div className="flex items-center gap-2"><PanelTop className="size-4 text-primary" /><span className="truncate text-sm font-semibold">{panel.name}</span></div><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{panel.description || "No description"}</p></div>
                    <Badge variant={panel.enabled ? "success" : "outline"}>{panel.enabled ? "Live" : "Off"}</Badge>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground"><Badge variant="outline">{panel.panelType === "select" ? "Select menu" : "Buttons"}</Badge><span>{panel.options.length}/25 roles</span>{panel.messageId && <span className="text-success">Published</span>}</div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {draft && (
        <Card className="border-primary/30 bg-card/50 shadow-[0_16px_60px_rgba(0,0,0,0.18)]">
          <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-border/30">
            <div><CardTitle className="flex items-center gap-2 text-sm font-semibold"><Pencil className="size-4 text-primary" />{draft.id ? "Edit role panel" : "New role panel"}</CardTitle><CardDescription className="mt-1 text-xs">Members will receive or lose the selected roles when they interact.</CardDescription></div>
            <Button variant="ghost" size="icon-sm" onClick={() => setDraft(null)} aria-label="Close editor"><X className="size-4" /></Button>
          </CardHeader>
          <CardContent className="space-y-5 pt-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="panel-name">Panel name</Label><Input id="panel-name" value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} placeholder="Choose your roles" maxLength={100} /></div>
              <div className="space-y-2"><Label>Component style</Label><CustomSelect value={draft.panelType} onChange={(value) => updateDraft({ panelType: value as "button" | "select", exclusive: value === "button" ? false : draft.exclusive })} options={[{ value: "button", label: "Button grid · up to 25" }, { value: "select", label: "Select menu · up to 25" }]} aria-label="Panel type" /></div>
            </div>
            <div className="space-y-2"><Label htmlFor="panel-description">Description / instructions</Label><Textarea id="panel-description" value={draft.description} onChange={(event) => updateDraft({ description: event.target.value })} placeholder="Select the roles you want…" maxLength={200} className="min-h-[72px]" /></div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label>Publish channel</Label><CustomSelect value={draft.channelId || ""} onChange={(value) => updateDraft({ channelId: value || null })} options={channelOptions} allowNone noneLabel="— Choose later —" placeholder="Select a text channel…" aria-label="Publish channel" /></div>
              <div className="space-y-2"><Label>Required role <span className="font-normal text-muted-foreground">(optional)</span></Label><CustomSelect value={draft.requiredRole || ""} onChange={(value) => updateDraft({ requiredRole: value || null })} options={roleOptions} allowNone noneLabel="Anyone can use it" placeholder="Restrict by role…" aria-label="Required role" /></div>
            </div>
            <div className="flex flex-wrap items-center gap-5 rounded-xl border border-border/30 bg-background/20 px-4 py-3">
              <label className="flex cursor-pointer items-center gap-2 text-xs"><Switch checked={draft.enabled} onCheckedChange={(checked) => updateDraft({ enabled: checked })} /> Panel enabled</label>
              {draft.panelType === "select" && <label className="flex cursor-pointer items-center gap-2 text-xs"><Switch checked={draft.exclusive} onCheckedChange={(checked) => updateDraft({ exclusive: checked })} /> One role at a time</label>}
              <span className="ml-auto text-[10px] font-mono text-muted-foreground">{draft.options.length}/25 options</span>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between"><div><h3 className="text-sm font-semibold">Role options</h3><p className="text-xs text-muted-foreground">Each role can appear only once in a panel.</p></div><Button size="sm" variant="outline" disabled={draft.options.length >= 25} onClick={() => updateDraft({ options: [...draft.options, emptyOption()] })}><Plus className="size-3.5" /> Add option</Button></div>
              <div className="space-y-2">
                {draft.options.map((option, index) => (
                  <div key={`${index}-${option.roleId}`} className="grid gap-2 rounded-xl border border-border/35 bg-background/20 p-3 md:grid-cols-[auto_1fr_1fr_1.3fr_auto] md:items-end">
                    <GripVertical className="mb-3 hidden size-4 text-muted-foreground/50 md:block" />
                    <div className="space-y-1"><Label className="text-[11px]">Label</Label><Input value={option.label} onChange={(event) => updateOption(index, { label: event.target.value })} placeholder="Notifications" maxLength={100} /></div>
                    <div className="space-y-1"><Label className="text-[11px]">Emoji <span className="font-normal text-muted-foreground">(optional)</span></Label><Input value={option.emoji || ""} onChange={(event) => updateOption(index, { emoji: event.target.value })} placeholder="🔔" maxLength={32} /></div>
                    <div className="space-y-1"><Label className="text-[11px]">Role</Label><CustomSelect value={option.roleId} onChange={(value) => updateOption(index, { roleId: value })} options={roleOptions} allowNone noneLabel="— Select role —" placeholder="Select a role…" aria-label={`Role option ${index + 1}`} /></div>
                    <Button variant="ghost" size="icon-sm" className="text-destructive" disabled={draft.options.length <= 1} onClick={() => removeOption(index)} aria-label={`Remove option ${index + 1}`}><Trash2 className="size-4" /></Button>
                    <div className="space-y-1 md:col-start-2 md:col-span-3"><Label className="text-[11px]">Helper text <span className="font-normal text-muted-foreground">(select menus only)</span></Label><Input value={option.description || ""} onChange={(event) => updateOption(index, { description: event.target.value })} placeholder="What this role is for" maxLength={100} /></div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-border/30 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-2">{draft.id && <Button variant="destructive" size="sm" disabled={deletePanel.isPending} onClick={() => deletePanel.mutate(draft.id!)}><Trash2 className="size-3.5" /> Delete</Button>}{draft.id && draft.channelId && <Button variant="outline" size="sm" disabled={publishPanel.isPending} onClick={() => publishPanel.mutate({ id: draft.id!, channelId: draft.channelId! })}><Send className="size-3.5" /> {publishPanel.isPending ? "Publishing…" : "Publish / update"}</Button>}</div>
              <div className="flex gap-2"><Button variant="ghost" size="sm" onClick={() => setDraft(null)}>Cancel</Button><Button size="sm" disabled={savePanel.isPending} onClick={validateAndSavePanel}>{savePanel.isPending ? "Saving…" : "Save panel"}</Button>{draft.id && draft.channelId && <Button size="sm" variant="success" disabled={publishPanel.isPending} onClick={() => publishPanel.mutate({ id: draft.id!, channelId: draft.channelId! })}><Send className="size-3.5" /> Publish</Button>}</div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-border/40 bg-card/40">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Reaction roles</CardTitle>
          <CardDescription className="text-xs">Legacy message-based emoji → role bindings</CardDescription>
        </CardHeader>
        <CardContent>
          {rrEntries.length === 0 ? <div className="py-2 text-xs text-muted-foreground">No reaction-role mappings configured.</div> : <div className="space-y-3">{rrEntries.map(([messageId, emojis]) => <div key={messageId} className="rounded-lg border border-border/40 bg-background-alt/30 p-3"><div className="mb-2 flex items-center justify-between"><span className="text-xs font-mono">msg:{messageId}</span><Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeRR.mutate({ messageId })}><Trash2 className="size-3.5" /></Button></div><div className="flex flex-wrap gap-1.5">{Object.entries(emojis).map(([emoji, roleId]) => <Badge key={emoji} variant="outline" className="text-xs">{emoji} → @{roles.find((role) => role.id === roleId)?.name || roleId}</Badge>)}</div></div>)}</div>}
          <p className="mt-3 text-[10px] text-muted-foreground/60">Use <code className="font-mono">{data.prefix}reactionrole</code> in Discord for legacy mappings.</p>
        </CardContent>
      </Card>
    </div>
  );
}
