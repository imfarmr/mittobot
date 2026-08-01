import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, patch, del, guildPath } from "@/lib/api";
import { useGuild } from "@/hooks/useGuild";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Bookmark, Plus, Trash2, Save, X, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/app/ConfirmProvider";
import { CustomSelect } from "@/components/app/CustomSelect";

interface Tag { id: number; name: string; content: string; created_by?: string; uses: number; created_at?: number; last_used?: number | null; aliases?: string; allowed_roles?: string; }
interface TagsData { guildId: string; hasGuild: boolean; tags: Tag[]; roles?: { id: string; name: string }[]; }

function parseJsonArray(raw: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export default function TagsView() {
  const { guildId } = useGuild();
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const { data, isLoading } = useQuery<TagsData>({
    queryKey: ["tags", guildId],
    queryFn: () => get(guildPath("/api/tags", guildId)),
    enabled: !!guildId,
  });

  const [name, setName] = useState("");
  const [content, setContent] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editAliases, setEditAliases] = useState("");
  const [editRoles, setEditRoles] = useState<string[]>([]);

  const createMutation = useMutation({
    mutationFn: (body: any) => post(guildPath("/api/tags", guildId), body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags", guildId] });
      setName(""); setContent("");
      toast.success("Tag saved");
    },
    onError: (e: any) => toast.error(e.message || "Save failed"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ tagName, body }: { tagName: string; body: any }) => patch(guildPath(`/api/tags/${encodeURIComponent(tagName)}`, guildId), body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags", guildId] });
      setEditingId(null);
      toast.success("Tag updated");
    },
    onError: (e: any) => toast.error(e.message || "Update failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: (tagName: string) => del(guildPath(`/api/tags/${encodeURIComponent(tagName)}`, guildId)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags", guildId] });
      toast.success("Tag deleted");
    },
    onError: (e: any) => toast.error(e.message || "Delete failed"),
  });

  if (!guildId) return <div className="p-6 text-sm text-muted-foreground">Select a guild first.</div>;

  const nameValid = /^[a-z0-9_-]{1,32}$/.test(name.toLowerCase());
  const roles = data?.roles || [];

  const startEdit = (t: Tag) => {
    setEditingId(t.id);
    setEditContent(t.content || "");
    setEditAliases(parseJsonArray(t.aliases).join(", "));
    setEditRoles(parseJsonArray(t.allowed_roles));
  };

  const saveEdit = (t: Tag) => {
    const aliases = editAliases.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    updateMutation.mutate({
      tagName: t.name,
      body: {
        content: editContent,
        aliases,
        allowedRoles: editRoles,
      },
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2.5">
          <Bookmark className="size-5 text-primary" /> Custom Tags
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Reusable snippets invoked in chat with <code className="text-xs">$tag &lt;name&gt;</code> or <code className="text-xs">/tag show</code>. Placeholders: {"{user}"} {"{server}"} {"{count}"}. Supports aliases, role restrictions, and usage stats.</p>
      </div>

      <Card className="border-border/40 bg-card/40">
        <CardHeader><CardTitle className="text-sm font-semibold">Create / Edit Tag</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Name (a-z, 0-9, -, _)</label>
              <Input className="mt-1 text-xs font-mono" value={name} onChange={e => setName(e.target.value.toLowerCase().slice(0, 32))} placeholder="rules" />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground">Content ({content.length}/2000)</label>
              <Textarea className="mt-1 text-xs font-mono h-16 resize-y" value={content} onChange={e => setContent(e.target.value.slice(0, 2000))} placeholder="Read the rules in #welcome, {user}!" />
            </div>
          </div>
          <Button size="sm" disabled={!nameValid || !content || createMutation.isPending} onClick={() => createMutation.mutate({ name: name.toLowerCase(), content })}>
            <Plus className="size-3.5 mr-1" /> Save Tag
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border/40 bg-card/40">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading tags...</div>
          ) : !data?.tags?.length ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No tags yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border/30">
                  <TableHead className="text-xs">Name</TableHead>
                  <TableHead className="text-xs">Content</TableHead>
                  <TableHead className="text-xs w-16">Uses</TableHead>
                  <TableHead className="text-xs w-36">Aliases</TableHead>
                  <TableHead className="text-xs w-24">Access</TableHead>
                  <TableHead className="text-xs w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.tags.map(t => {
                  const aliases = parseJsonArray(t.aliases);
                  const roleIds = parseJsonArray(t.allowed_roles);
                  const isEditing = editingId === t.id;
                  return (
                    <TableRow key={t.id} className="border-b border-border/20">
                      <TableCell className="text-xs font-semibold font-mono">{t.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{t.content}</TableCell>
                      <TableCell className="text-xs font-mono">{t.uses}</TableCell>
                      <TableCell className="text-xs text-muted-foreground truncate max-w-[130px]">{aliases.length ? aliases.join(", ") : "—"}</TableCell>
                      <TableCell className="text-xs">
                        {roleIds.length ? (
                          <Badge variant="outline" className="text-[9px]">🔒 {roleIds.length} role{roleIds.length === 1 ? "" : "s"}</Badge>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">everyone</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="flex justify-end gap-1">
                          {isEditing ? (
                            <>
                              <Button size="sm" variant="ghost" className="text-success" disabled={updateMutation.isPending} onClick={() => saveEdit(t)}>
                                <Save className="size-3.5 mr-1" /> Save
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                                <X className="size-3.5" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => startEdit(t)}>
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => {
                                if (!await confirm({ title: `Delete tag "${t.name}"?`, description: "This permanently removes the tag.", confirmLabel: "Delete" })) return;
                                deleteMutation.mutate(t.name);
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

          {editingId != null && (() => {
            const t = data?.tags.find(x => x.id === editingId);
            if (!t) return null;
            return (
              <div className="border-t border-border/30 p-4 space-y-3 bg-background-alt/30">
                <div className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Editing <span className="font-mono">"{t.name}"</span></div>
                <div>
                  <label className="text-xs text-muted-foreground">Content ({editContent.length}/2000)</label>
                  <Textarea className="mt-1 text-xs font-mono h-20 resize-y" value={editContent} onChange={e => setEditContent(e.target.value.slice(0, 2000))} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Aliases (comma-separated)</label>
                    <Input className="mt-1 text-xs font-mono" value={editAliases} onChange={e => setEditAliases(e.target.value)} placeholder="faq, help" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Restrict to roles (multi-select; empty = everyone)</label>
                    <CustomSelect
                      value={editRoles[0] || ""}
                      onChange={(v) => {
                        if (!v) { setEditRoles([]); return; }
                        const next = editRoles.includes(v) ? editRoles.filter(x => x !== v) : [...editRoles, v];
                        setEditRoles(next);
                      }}
                      options={roles.map(r => ({ value: r.id, label: `@${r.name}` }))}
                      allowNone noneLabel="Everyone" placeholder="Select roles…" aria-label="Tag allowed roles" triggerClassName="mt-1 text-xs font-mono"
                    />
                    {editRoles.length > 1 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {editRoles.map(id => {
                          const role = roles.find(r => r.id === id);
                          return <Badge key={id} variant="outline" className="text-[9px]">{role?.name || id} <button className="ml-1 text-muted-foreground hover:text-destructive" onClick={() => setEditRoles(editRoles.filter(x => x !== id))}>×</button></Badge>;
                        })}
                      </div>
                    )}
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
