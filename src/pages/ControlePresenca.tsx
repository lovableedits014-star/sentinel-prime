import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  CalendarCheck, AlertTriangle, Users, Search, Download, Loader2, Send, ShieldCheck, CheckCircle2, XCircle, Zap,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Row = {
  person_type: "funcionario" | "lider" | "liderado" | "apoiador";
  person_id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  presenca_obrigatoria: boolean;
  last_checkin_date: string | null;
  days_since_checkin: number;
  notified_at: string | null;
};

const TYPE_LABEL: Record<Row["person_type"], string> = {
  funcionario: "Funcionário",
  lider: "Líder",
  liderado: "Liderado",
  apoiador: "Apoiador",
};

const TYPE_TABLE: Record<Row["person_type"], "funcionarios" | "contratados" | "supporter_accounts"> = {
  funcionario: "funcionarios",
  lider: "contratados",
  liderado: "contratados",
  apoiador: "supporter_accounts",
};

export default function ControlePresenca() {
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState<"all" | Row["person_type"]>("all");
  const [view, setView] = useState<"all" | "obrigados" | "ausentes">("obrigados");
  const [search, setSearch] = useState("");
  const [running, setRunning] = useState(false);

  const { data: client } = useQuery({
    queryKey: ["my-client-presenca"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("clients")
        .select("id, name, presence_absence_days_threshold")
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
  });

  const clientId = client?.id;
  const threshold = client?.presence_absence_days_threshold ?? 3;

  const { data: rows, isLoading } = useQuery({
    queryKey: ["presence-overview", clientId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_presence_overview" as any, {
        p_client_id: clientId!,
      });
      if (error) throw error;
      return (data || []) as Row[];
    },
    enabled: !!clientId,
  });

  const toggleObrigatoria = useMutation({
    mutationFn: async ({ row, value }: { row: Row; value: boolean }) => {
      const table = TYPE_TABLE[row.person_type];
      const { error } = await supabase
        .from(table as any)
        .update({ presenca_obrigatoria: value })
        .eq("id", row.person_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["presence-overview", clientId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Não foi possível atualizar"),
  });

  const bulkToggle = useMutation({
    mutationFn: async ({ type, value }: { type: Row["person_type"] | "all"; value: boolean }) => {
      if (!clientId) return { affected: 0 };
      const targets: Array<{ table: string; isLider?: boolean }> =
        type === "funcionario" ? [{ table: "funcionarios" }]
        : type === "lider" ? [{ table: "contratados", isLider: true }]
        : type === "liderado" ? [{ table: "contratados", isLider: false }]
        : type === "apoiador" ? [{ table: "supporter_accounts" }]
        : [
            { table: "funcionarios" },
            { table: "contratados" },
            { table: "supporter_accounts" },
          ];

      let affected = 0;
      for (const t of targets) {
        let q: any = supabase
          .from(t.table as any)
          .update({ presenca_obrigatoria: value })
          .eq("client_id", clientId)
          .select("id");
        if (t.table === "contratados" && typeof t.isLider === "boolean") {
          q = q.eq("is_lider", t.isLider);
        }
        const { error, data } = await q;
        if (error) throw error;
        affected += data?.length ?? 0;
      }
      return { affected };
    },
    onSuccess: ({ affected }, vars) => {
      const label = vars.type === "all" ? "todas as pessoas" : `todos os ${TYPE_LABEL[vars.type as Row["person_type"]]}s`.toLowerCase();
      toast.success(`${vars.value ? "Marcados" : "Desmarcados"} ${affected} registros (${label})`);
      queryClient.invalidateQueries({ queryKey: ["presence-overview", clientId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha na ação em massa"),
  });

  const filtered = useMemo(() => {
    if (!rows) return [] as Row[];
    let list = rows;
    if (typeFilter !== "all") list = list.filter((r) => r.person_type === typeFilter);
    if (view === "obrigados") list = list.filter((r) => r.presenca_obrigatoria);
    if (view === "ausentes") list = list.filter((r) => r.presenca_obrigatoria && r.days_since_checkin >= threshold);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((r) => r.nome.toLowerCase().includes(q) || (r.telefone || "").includes(q));
    return [...list].sort((a, b) => b.days_since_checkin - a.days_since_checkin);
  }, [rows, typeFilter, view, search, threshold]);

  const stats = useMemo(() => {
    const obrigados = (rows || []).filter((r) => r.presenca_obrigatoria);
    const ausentes = obrigados.filter((r) => r.days_since_checkin >= threshold);
    const notificados = obrigados.filter((r) => !!r.notified_at);
    return {
      total: rows?.length ?? 0,
      obrigados: obrigados.length,
      ausentes: ausentes.length,
      notificados: notificados.length,
    };
  }, [rows, threshold]);

  const runCheck = async () => {
    if (!clientId) return;
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("check-presence-absences", {
        body: { client_id: clientId },
      });
      if (error) throw error;
      toast.success(`Verificação concluída — enviados: ${data?.sent ?? 0} | falhas: ${data?.failed ?? 0} | pulados: ${data?.skipped ?? 0}`);
      queryClient.invalidateQueries({ queryKey: ["presence-overview", clientId] });
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao executar verificação");
    } finally {
      setRunning(false);
    }
  };

  const exportCsv = () => {
    if (!filtered.length) return;
    const header = ["Tipo", "Nome", "Telefone", "Email", "Obrigado", "Último check-in", "Dias sem acesso", "Notificado em"];
    const lines = filtered.map((r) => [
      TYPE_LABEL[r.person_type],
      r.nome,
      r.telefone || "",
      r.email || "",
      r.presenca_obrigatoria ? "Sim" : "Não",
      r.last_checkin_date || "Nunca",
      r.days_since_checkin === 9999 ? "Nunca" : r.days_since_checkin,
      r.notified_at ? new Date(r.notified_at).toLocaleString("pt-BR") : "",
    ].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","));
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `controle-presenca-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!clientId) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CalendarCheck className="w-6 h-6 text-primary" />
          Controle de Presença
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Marque quem é obrigado a fazer check-in diário no portal. O sistema envia um lembrete automático no WhatsApp para quem fica <strong>{threshold}+ dias</strong> sem acessar e gera um alerta com o relatório completo.
        </p>
        <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2.5 py-1">
          <Zap className="w-3 h-3" />
          Envio 100% automático: a verificação roda todo dia às 08:30 (BRT) e dispara o WhatsApp sem ação manual.
        </div>
      </div>

      {/* Bulk actions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            Ações em massa por grupo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            Aplique a obrigatoriedade a um grupo inteiro com um clique. Útil quando você decide que todo um time deve marcar presença.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {(["funcionario", "lider", "liderado", "apoiador"] as const).map((t) => {
              const pending = bulkToggle.isPending && bulkToggle.variables?.type === t;
              const groupRows = (rows || []).filter((r) => r.person_type === t);
              const groupTotal = groupRows.length;
              const groupObrigados = groupRows.filter((r) => r.presenca_obrigatoria).length;
              const allObrigados = groupTotal > 0 && groupObrigados === groupTotal;
              return (
              <div key={t} className="flex flex-col gap-2 p-3 rounded-lg border bg-muted/20 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium truncate">{TYPE_LABEL[t]}s</span>
                  <Badge variant={allObrigados ? "default" : "secondary"} className="text-[10px] shrink-0">
                    {groupObrigados}/{groupTotal}
                  </Badge>
                </div>
                <div className="flex flex-col gap-1.5">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant={allObrigados ? "default" : "outline"}
                        className="w-full h-8 text-xs px-2"
                        disabled={bulkToggle.isPending || allObrigados}
                      >
                        {pending && bulkToggle.variables?.value === true ? (
                          <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin shrink-0" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1 shrink-0" />
                        )}
                        <span className="truncate">{allObrigados ? "Todos obrigados" : "Obrigar todos"}</span>
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Marcar todos como obrigados?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Todos os <strong>{TYPE_LABEL[t]}s</strong> deste cliente passarão a ser obrigados a fazer check-in diário.
                          Quem ficar {threshold}+ dias sem acessar receberá lembrete automático no WhatsApp.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => bulkToggle.mutate({ type: t, value: true })}>
                          Confirmar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant={groupObrigados === 0 ? "default" : "outline"}
                        className="w-full h-8 text-xs px-2"
                        disabled={bulkToggle.isPending || groupObrigados === 0}
                      >
                        {pending && bulkToggle.variables?.value === false ? (
                          <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin shrink-0" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 mr-1 shrink-0" />
                        )}
                        <span className="truncate">{groupObrigados === 0 ? "Nenhum obrigado" : "Desmarcar todos"}</span>
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Desmarcar todos os {TYPE_LABEL[t]}s?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Nenhum {TYPE_LABEL[t]} receberá mais lembrete automático de presença até ser marcado novamente.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => bulkToggle.mutate({ type: t, value: false })}>
                          Confirmar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Total no sistema</p>
            </div>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="w-3.5 h-3.5 text-primary" />
              <p className="text-xs text-muted-foreground">Obrigados</p>
            </div>
            <p className="text-2xl font-bold text-primary">{stats.obrigados}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
              <p className="text-xs text-muted-foreground">Ausentes ≥ {threshold}d</p>
            </div>
            <p className="text-2xl font-bold text-destructive">{stats.ausentes}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Send className="w-3.5 h-3.5 text-emerald-500" />
              <p className="text-xs text-muted-foreground">Já notificados</p>
            </div>
            <p className="text-2xl font-bold text-emerald-600">{stats.notificados}</p>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={view} onValueChange={(v) => setView(v as any)}>
          <TabsList>
            <TabsTrigger value="obrigados">Obrigados</TabsTrigger>
            <TabsTrigger value="ausentes">Ausentes</TabsTrigger>
            <TabsTrigger value="all">Todos</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={!filtered.length}>
            <Download className="w-4 h-4 mr-1.5" /> Exportar CSV
          </Button>
          <Button size="sm" onClick={runCheck} disabled={running}>
            {running ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />}
            Disparar lembretes agora
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou telefone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Tabs value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
          <TabsList>
            <TabsTrigger value="all">Todos</TabsTrigger>
            <TabsTrigger value="funcionario">Funcionários</TabsTrigger>
            <TabsTrigger value="lider">Líderes</TabsTrigger>
            <TabsTrigger value="liderado">Liderados</TabsTrigger>
            <TabsTrigger value="apoiador">Apoiadores</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{filtered.length} pessoa(s)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhuma pessoa encontrada</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Último check-in</TableHead>
                    <TableHead>Dias</TableHead>
                    <TableHead>Notificado</TableHead>
                    <TableHead className="text-right">Obrigado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const isAbsent = r.presenca_obrigatoria && r.days_since_checkin >= threshold;
                    return (
                      <TableRow key={`${r.person_type}:${r.person_id}`}>
                        <TableCell className="font-medium">{r.nome}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">{TYPE_LABEL[r.person_type]}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">
                          {r.telefone || <span className="italic">—</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.last_checkin_date ? new Date(r.last_checkin_date).toLocaleDateString("pt-BR") : <span className="italic">Nunca</span>}
                        </TableCell>
                        <TableCell>
                          <Badge variant={isAbsent ? "destructive" : r.days_since_checkin === 0 ? "default" : "secondary"} className="text-xs">
                            {r.days_since_checkin === 9999 ? "Nunca" : `${r.days_since_checkin}d`}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.notified_at ? new Date(r.notified_at).toLocaleDateString("pt-BR") : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Switch
                            checked={r.presenca_obrigatoria}
                            onCheckedChange={(value) => toggleObrigatoria.mutate({ row: r, value })}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}