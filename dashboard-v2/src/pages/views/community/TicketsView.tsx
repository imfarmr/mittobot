import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, guildPath } from "@/lib/api";
import { useGuild } from "@/hooks/useGuild";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Ticket, RefreshCw, Inbox, Star } from "lucide-react";
import { toast } from "sonner";
import { SaveBar } from "@/components/app/SaveBar";
import { CustomSelect } from "@/components/app/CustomSelect";

interface TicketConfig {
  enabled: boolean;
  categoryId?: string | null;
  supportRoleId?: string | null;
  panelChannelId?: string | null;
  transcriptChannelId?: string | null;
  openMessage: string;
  buttonLabel: string;
}
interface OpenTicket {
  id: number; channel_id: string; user_id: string; status: string; created_at: number;
}
interface ClosedTicket extends OpenTicket {
  closed_at: number | null; closed_by: string | null; close_reason: string | null; rating: number | null;
}
interface TicketsData {
  guildId: string; hasGuild: boolean;
  channels: { id: string; name: string }[];
  roles: { id: string; name: string }[];
  config: TicketConfig;
}
interface TicketsListData {
  tickets: OpenTicket[];
}

export default function TicketsView() {
  const { guildId } = useGuild();
  const queryClient = useQueryClient();
  const [ticketTab, setTicketTab] = useState<"open" | "closed">("open");

  const { data, isLoading } = useQuery<TicketsData>({
    queryKey: ["tickets", guildId],
    queryFn: () => get(guildPath("/api/tickets", guildId)),
    enabled: !!guildId,
  });

  const { data: listData, refetch, isFetching } = useQuery<TicketsListData>({
    queryKey: ["tickets-list", guildId, ticketTab],
    queryFn: () => get(guildPath(`/api/tickets/list?status=${ticketTab}`, guildId)),
    enabled: !!guildId,
  });

  const saveMutation = useMutation({
    mutationFn: (body: any) => post(guildPath("/api/tickets", guildId), body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets", guildId] });
      toast.success("Ticket configuration saved");
    },
    onError: (e: any) => toast.error(e.message || "Save failed"),
  });

  const cfg = data?.config;
  const [enabled, setEnabled] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [supportRoleId, setSupportRoleId] = useState("");
  const [panelChannelId, setPanelChannelId] = useState("");
  const [transcriptChannelId, setTranscriptChannelId] = useState("");
  const [openMessage, setOpenMessage] = useState("");
  const [buttonLabel, setButtonLabel] = useState("");

  useEffect(() => {
    if (cfg) {
      setEnabled(cfg.enabled);
      setCategoryId(cfg.categoryId || "");
      setSupportRoleId(cfg.supportRoleId || "");
      setPanelChannelId(cfg.panelChannelId || "");
      setTranscriptChannelId(cfg.transcriptChannelId || "");
      setOpenMessage(cfg.openMessage || "");
      setButtonLabel(cfg.buttonLabel || "");
    }
  }, [data]);

  if (!guildId) return <div className="p-6 text-sm text-muted-foreground">Select a guild first.</div>;
  if (isLoading || !data) return <div className="p-6 text-sm text-muted-foreground">Loading ticket config...</div>;

  const dirty =
    enabled !== cfg!.enabled ||
    categoryId !== (cfg!.categoryId || "") ||
    supportRoleId !== (cfg!.supportRoleId || "") ||
    panelChannelId !== (cfg!.panelChannelId || "") ||
    transcriptChannelId !== (cfg!.transcriptChannelId || "") ||
    openMessage !== (cfg!.openMessage || "") ||
    buttonLabel !== (cfg!.buttonLabel || "");

  const handleSave = () => saveMutation.mutate({
    enabled,
    categoryId: categoryId || null,
    supportRoleId: supportRoleId || null,
    panelChannelId: panelChannelId || null,
    transcriptChannelId: transcriptChannelId || null,
    openMessage,
    buttonLabel,
  });
  const handleReset = () => {
    if (cfg) {
      setEnabled(cfg.enabled);
      setCategoryId(cfg.categoryId || "");
      setSupportRoleId(cfg.supportRoleId || "");
      setPanelChannelId(cfg.panelChannelId || "");
      setTranscriptChannelId(cfg.transcriptChannelId || "");
      setOpenMessage(cfg.openMessage || "");
      setButtonLabel(cfg.buttonLabel || "");
      toast("Changes discarded");
    }
  };

  const openTickets = listData?.tickets || [];
  const closedTickets = ticketTab === "closed" ? (listData?.tickets as ClosedTicket[] | undefined) || [] : [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2.5">
          <Ticket className="size-5 text-primary" /> Support Tickets
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Let members open private support channels from a panel button. Post the panel with <code className="text-xs">/ticket panel</code>.</p>
      </div>

      <SaveBar dirty={dirty} saving={saveMutation.isPending} onSave={handleSave} onReset={handleReset} />

      <Card className="border-border/40 bg-card/40">
        <CardHeader className="flex flex-row items-center justify-between">
          <div><CardTitle className="text-sm font-semibold">Ticket System</CardTitle><CardDescription className="text-xs">Members press the panel button to open a private ticket</CardDescription></div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Ticket Category (new channels go here)</label>
              <CustomSelect value={categoryId} onChange={setCategoryId} options={data.channels.map(c => ({ value: c.id, label: `#${c.name}` }))} allowNone noneLabel="— None —" placeholder="Select category…" aria-label="Ticket category" triggerClassName="mt-1 text-xs font-mono" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Support Role (can view all tickets)</label>
              <CustomSelect value={supportRoleId} onChange={setSupportRoleId} options={data.roles.map(r => ({ value: r.id, label: `@${r.name}` }))} allowNone noneLabel="— None —" placeholder="Select support role…" aria-label="Ticket support role" triggerClassName="mt-1 text-xs font-mono" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Panel Channel (reference)</label>
              <CustomSelect value={panelChannelId} onChange={setPanelChannelId} options={data.channels.map(c => ({ value: c.id, label: `#${c.name}` }))} allowNone noneLabel="— None —" placeholder="Select channel…" aria-label="Ticket panel channel" triggerClassName="mt-1 text-xs font-mono" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Transcript Channel (archives on close)</label>
              <CustomSelect value={transcriptChannelId} onChange={setTranscriptChannelId} options={data.channels.map(c => ({ value: c.id, label: `#${c.name}` }))} allowNone noneLabel="— None —" placeholder="Select channel…" aria-label="Ticket transcript channel" triggerClassName="mt-1 text-xs font-mono" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Button Label ({buttonLabel.length}/80)</label>
              <Input className="mt-1 text-xs font-mono" value={buttonLabel} onChange={e => setButtonLabel(e.target.value.slice(0, 80))} placeholder="Create Ticket" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Opening Message ({openMessage.length}/1000)</label>
            <Textarea className="mt-1 text-xs font-mono h-16 resize-y" value={openMessage} onChange={e => setOpenMessage(e.target.value.slice(0, 1000))} placeholder="Thanks for reaching out! A member of staff will be with you shortly." />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/40 bg-card/40">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Inbox className="size-4 text-primary" />
              {ticketTab === "open" ? `Open Tickets (${openTickets.length})` : `Closed Tickets (${closedTickets.length})`}
            </CardTitle>
          </div>
          <Tabs value={ticketTab} onValueChange={(v) => setTicketTab(v as "open" | "closed")}>
            <TabsList>
              <TabsTrigger value="open">Open</TabsTrigger>
              <TabsTrigger value="closed">Closed</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="p-0">
          <div className="border-b border-border/20 px-4 py-2 flex justify-end">
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`size-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
          {ticketTab === "open" ? (
            openTickets.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">No open tickets.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-border/30">
                    <TableHead className="text-xs">#</TableHead>
                    <TableHead className="text-xs">Channel</TableHead>
                    <TableHead className="text-xs">Opened By</TableHead>
                    <TableHead className="text-xs">Opened At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {openTickets.map(t => {
                    const channel = data.channels.find(c => c.id === t.channel_id);
                    return (
                      <TableRow key={t.id} className="border-b border-border/20">
                        <TableCell className="text-xs font-mono">{t.id}</TableCell>
                        <TableCell className="text-xs font-mono">#{channel?.name || t.channel_id}</TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">{t.user_id}</TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{t.created_at ? new Date(t.created_at).toLocaleString() : "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )
          ) : closedTickets.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">No closed tickets yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border/30">
                  <TableHead className="text-xs">#</TableHead>
                  <TableHead className="text-xs">Opened By</TableHead>
                  <TableHead className="text-xs">Closed By</TableHead>
                  <TableHead className="text-xs">Reason</TableHead>
                  <TableHead className="text-xs">Rating</TableHead>
                  <TableHead className="text-xs">Closed At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {closedTickets.map(t => (
                  <TableRow key={t.id} className="border-b border-border/20">
                    <TableCell className="text-xs font-mono">{t.id}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{t.user_id}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{t.closed_by || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[220px] truncate" title={t.close_reason || ""}>{t.close_reason || "—"}</TableCell>
                    <TableCell className="text-xs">
                      {t.rating ? <Badge variant="outline" className="text-[10px]"><Star className="size-3 text-warning mr-1" />{t.rating}/5</Badge> : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{t.closed_at ? new Date(t.closed_at).toLocaleString() : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
