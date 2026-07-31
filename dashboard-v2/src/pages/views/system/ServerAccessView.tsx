import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, LockKeyhole, Eye, FileText } from "lucide-react";
import { get, put } from "@/lib/api";
import { useGuild } from "@/hooks/useGuild";
import { MultiSelect } from "@/components/app/MultiSelect";
import { PageHeader } from "@/components/app/PageHeader";
import { SaveBar } from "@/components/app/SaveBar";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { DashboardAccessPolicy, DashboardAccessRole } from "@/lib/types";

interface AccessResponse {
  policy: DashboardAccessPolicy;
  roles: DashboardAccessRole[];
  tier: string;
  nativeAdmin: boolean;
}

const emptyPolicy = (guildId: string): DashboardAccessPolicy => ({
  guildId,
  viewerRoles: [],
  managerRoles: [],
  securityAdminRoles: [],
  accessEnabled: true,
  readOnlyMode: false,
  showAuditLogs: true,
  updatedBy: null,
  updatedAt: 0,
});

export default function ServerAccessView() {
  const { guildId, guild } = useGuild();
  const queryClient = useQueryClient();
  const [edits, setEdits] = useState<DashboardAccessPolicy | null>(null);

  const { data, isLoading, isError } = useQuery<AccessResponse>({
    queryKey: ["guild", guildId, "dashboard-access"],
    queryFn: () => get(`/api/guilds/${guildId}/access`),
    enabled: !!guildId && !!guild?.canManageAccess,
  });

  const policy = edits || data?.policy || emptyPolicy(guildId);
  const roles = data?.roles || [];
  const roleItems = useMemo(() => roles.map((role) => ({ id: role.id, name: role.name })), [roles]);
  const dirty = edits !== null;

  const saveMutation = useMutation({
    mutationFn: (next: DashboardAccessPolicy) => put(`/api/guilds/${guildId}/access`, {
      viewerRoles: next.viewerRoles,
      managerRoles: next.managerRoles,
      securityAdminRoles: next.securityAdminRoles,
      accessEnabled: next.accessEnabled,
      readOnlyMode: next.readOnlyMode,
      showAuditLogs: next.showAuditLogs,
    }),
    onSuccess: (result: { policy: DashboardAccessPolicy }) => {
      queryClient.setQueryData(["guild", guildId, "dashboard-access"], (current: AccessResponse | undefined) => ({
        ...(current || { roles }),
        policy: result.policy,
      }));
      queryClient.invalidateQueries({ queryKey: ["me"] });
      setEdits(null);
      toast.success("Server access policy saved");
    },
    onError: (error: Error) => toast.error(error.message || "Unable to save access policy"),
  });

  if (!guildId) return <div className="p-6 text-sm text-muted-foreground">Select a server first.</div>;
  if (!guild?.canManageAccess) {
    return (
      <div className="p-6">
        <PageHeader icon={LockKeyhole} title="Server access" description="Security administrator access is required." />
        <Card className="border-border/40 bg-card/40">
          <CardContent className="p-6 text-sm text-muted-foreground">
            Only the server owner, a Discord Administrator/Manage Server member, or a configured Security Admin role can manage dashboard access tiers.
          </CardContent>
        </Card>
      </div>
    );
  }
  if (isLoading || !data) return <div className="p-6 text-sm text-muted-foreground">Loading server access policy...</div>;
  if (isError) return <div className="p-6 text-sm text-destructive">Unable to load this server's access policy.</div>;

  const update = (patch: Partial<DashboardAccessPolicy>) => setEdits((current) => ({ ...policy, ...current, ...patch }));
  const roleSet = (key: "viewerRoles" | "managerRoles" | "securityAdminRoles") => new Set(policy[key]);

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        icon={ShieldCheck}
        title="Server access"
        description={`Choose who can open and manage ${guild?.name || "this server"}'s dashboard.`}
        actions={<Badge variant="success">Security admin</Badge>}
      />

      <SaveBar
        dirty={dirty}
        saving={saveMutation.isPending}
        onSave={() => saveMutation.mutate(policy)}
        onReset={() => { setEdits(null); toast("Changes discarded"); }}
      />

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex gap-3 p-4 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          <p>
            Discord Administrators and members with <span className="font-semibold text-foreground">Manage Server</span> always retain access. Role tiers only add dashboard access; they never grant Discord permissions or allow users to edit this policy.
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/40 bg-card/40">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Dashboard availability</CardTitle>
          <CardDescription className="text-xs">Control the general access experience for this server.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="flex items-start gap-3 rounded-xl border border-border/30 bg-background-alt/30 p-3">
            <Switch checked={policy.accessEnabled} onCheckedChange={(value) => update({ accessEnabled: value })} />
            <div><p className="text-xs font-semibold">Dashboard access</p><p className="mt-1 text-[10px] text-muted-foreground">Allow configured roles to enter.</p></div>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-border/30 bg-background-alt/30 p-3">
            <Switch checked={policy.readOnlyMode} onCheckedChange={(value) => update({ readOnlyMode: value })} />
            <div><p className="text-xs font-semibold">Read-only mode</p><p className="mt-1 text-[10px] text-muted-foreground">Managers can review, but cannot save.</p></div>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-border/30 bg-background-alt/30 p-3">
            <Switch checked={policy.showAuditLogs} onCheckedChange={(value) => update({ showAuditLogs: value })} />
            <div><p className="text-xs font-semibold">Activity feed</p><p className="mt-1 text-[10px] text-muted-foreground">Show dashboard changes on Overview.</p></div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border/40 bg-card/40">
          <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Eye className="size-4 text-muted-foreground" /> Viewers</CardTitle><CardDescription className="text-xs">Can open server pages and inspect configuration.</CardDescription></CardHeader>
          <CardContent><MultiSelect items={roleItems} selected={roleSet("viewerRoles")} onChange={(value) => update({ viewerRoles: [...value] })} prefix="@" placeholder="Choose viewer roles" searchPlaceholder="Search viewer roles…" aria-label="Viewer roles" /></CardContent>
        </Card>
        <Card className="border-border/40 bg-card/40">
          <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><FileText className="size-4 text-primary" /> Managers</CardTitle><CardDescription className="text-xs">Can edit normal server, community, moderation, and AI behavior settings.</CardDescription></CardHeader>
          <CardContent><MultiSelect items={roleItems} selected={roleSet("managerRoles")} onChange={(value) => update({ managerRoles: [...value] })} prefix="@" placeholder="Choose manager roles" searchPlaceholder="Search manager roles…" aria-label="Manager roles" /></CardContent>
        </Card>
        <Card className="border-border/40 bg-card/40">
          <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><LockKeyhole className="size-4 text-warning" /> Security admins</CardTitle><CardDescription className="text-xs">Can manage access tiers and security-sensitive server controls.</CardDescription></CardHeader>
          <CardContent><MultiSelect items={roleItems} selected={roleSet("securityAdminRoles")} onChange={(value) => update({ securityAdminRoles: [...value] })} prefix="@" placeholder="Choose security roles" searchPlaceholder="Search security roles…" aria-label="Security admin roles" /></CardContent>
        </Card>
      </div>

      <Card className="border-border/40 bg-card/40">
        <CardContent className="p-4 text-[11px] text-muted-foreground">
          A role can only belong to one tier. Global bot settings, provider credentials, custom modules, backups, and destructive actions remain restricted to the bot owner or native Discord administrators.
        </CardContent>
      </Card>
    </div>
  );
}
