import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Search, ChevronLeft, ChevronRight, Trash2, MessageCircle, CheckCircle2, MoreVertical } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import NovaPessoaDialog from "@/components/pessoas/NovaPessoaDialog";
import { getWhatsAppLink } from "@/lib/social-url";
import { normPhone } from "@/lib/funcionario-link";

const ROLE_LABELS: Record<string, string> = {
  apoiador: "Apoiador",
  funcionario: "Funcionário",
  coordenador: "Coordenador",
  lider: "Líder",
  cabo: "Cabo Eleitoral",
};

const ROLE_COLORS: Record<string, string> = {
  apoiador: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  funcionario: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  coordenador: "bg-red-500/10 text-red-700 border-red-500/20",
  lider: "bg-blue-500/10 text-blue-700 border-blue-500/20",
  cabo: "bg-purple-500/10 text-purple-700 border-purple-500/20",
};

const PAGE_SIZE = 30;

type UnifiedRow = {
  key: string;          // unique key for React
  source: "pessoas" | "funcionarios" | "eleicao_pessoas";
  source_id: string;    // primary id of the underlying row (preferred for navigation)
  pessoa_id?: string;   // pessoas.id when present (for /pessoas/:id navigation)
  nome: string;
  telefone: string | null;
  cidade: string | null;
  bairro: string | null;
  whatsapp_confirmado: boolean;
  roles: string[];      // ["apoiador","funcionario",...]
};

export default function Pessoas() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<UnifiedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCidade, setFilterCidade] = useState("all");
  const [filterTipo, setFilterTipo] = useState("all");
  const [filterWhatsapp, setFilterWhatsapp] = useState("all");
  const [page, setPage] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UnifiedRow | null>(null);
  const [cidades, setCidades] = useState<string[]>([]);

  useEffect(() => { resolveClient(); }, []);
  useEffect(() => { if (clientId) fetchAll(); }, [clientId]);

  async function resolveClient() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: client } = await supabase.from("clients").select("id").eq("user_id", session.user.id).maybeSingle();
    if (client) { setClientId(client.id); return; }
    const { data: tm } = await supabase.from("team_members").select("client_id").eq("user_id", session.user.id).eq("status", "active").maybeSingle();
    if (tm) setClientId(tm.client_id);
  }

  async function fetchAll() {
    if (!clientId) return;
    setLoading(true);

    const [pRes, fRes, eRes] = await Promise.all([
      supabase.from("pessoas")
        .select("id, nome, telefone, cidade, bairro, whatsapp_confirmado, tipo_pessoa")
        .eq("client_id", clientId)
        .eq("tipo_pessoa", "apoiador" as any),
      supabase.from("funcionarios")
        .select("id, nome, telefone, cidade, bairro, whatsapp_confirmado")
        .eq("client_id", clientId),
      supabase.from("eleicao_pessoas" as any)
        .select("id, nome, telefone, cidade, endereco, tipo, funcionario_id")
        .eq("client_id", clientId)
        .in("tipo", ["coordenador", "lider", "cabo"]),
    ]);

    // Deduplicate by normalized phone
    const byPhone = new Map<string, UnifiedRow>();
    const standalone: UnifiedRow[] = [];

    function pushRole(row: UnifiedRow, role: string) {
      if (!row.roles.includes(role)) row.roles.push(role);
    }

    function add(row: UnifiedRow) {
      const ph = normPhone(row.telefone || "");
      if (ph.length >= 10) {
        const key = ph.slice(-10);
        const existing = byPhone.get(key);
        if (existing) {
          row.roles.forEach(r => pushRole(existing, r));
          // prefer richer fields
          if (!existing.cidade && row.cidade) existing.cidade = row.cidade;
          if (!existing.bairro && row.bairro) existing.bairro = row.bairro;
          if (!existing.pessoa_id && row.pessoa_id) existing.pessoa_id = row.pessoa_id;
          if (row.whatsapp_confirmado) existing.whatsapp_confirmado = true;
          // prefer the most complete name (more words / longer)
          const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
          if (
            wordCount(row.nome) > wordCount(existing.nome) ||
            (wordCount(row.nome) === wordCount(existing.nome) && row.nome.length > existing.nome.length)
          ) {
            existing.nome = row.nome;
          }
          return;
        }
        byPhone.set(key, row);
      } else {
        standalone.push(row);
      }
    }

    (pRes.data || []).forEach((p: any) => add({
      key: `p:${p.id}`,
      source: "pessoas",
      source_id: p.id,
      pessoa_id: p.id,
      nome: p.nome,
      telefone: p.telefone,
      cidade: p.cidade,
      whatsapp_confirmado: !!p.whatsapp_confirmado,
      roles: ["apoiador"],
    }));

    (fRes.data || []).forEach((f: any) => add({
      key: `f:${f.id}`,
      source: "funcionarios",
      source_id: f.id,
      nome: f.nome,
      telefone: f.telefone,
      cidade: f.cidade,
      whatsapp_confirmado: !!f.whatsapp_confirmado,
      roles: ["funcionario"],
    }));

    (eRes.data as any[] || []).forEach((e: any) => add({
      key: `e:${e.id}`,
      source: "eleicao_pessoas",
      source_id: e.id,
      nome: e.nome,
      telefone: e.telefone,
      cidade: e.cidade,
      whatsapp_confirmado: false,
      roles: [e.tipo],
    }));

    const all = [...byPhone.values(), ...standalone];
    all.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    setRows(all);

    const cidSet = new Set<string>();
    all.forEach(r => { if (r.cidade) cidSet.add(r.cidade); });
    setCidades(Array.from(cidSet).sort());

    setLoading(false);
  }

  // Apply filters in memory
  const filtered = rows.filter(r => {
    if (search.trim() && !r.nome.toLowerCase().includes(search.trim().toLowerCase())) return false;
    if (filterCidade !== "all" && r.cidade !== filterCidade) return false;
    if (filterTipo !== "all" && !r.roles.includes(filterTipo)) return false;
    if (filterWhatsapp === "sim" && !r.whatsapp_confirmado) return false;
    if (filterWhatsapp === "nao" && r.whatsapp_confirmado) return false;
    return true;
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useEffect(() => { setPage(0); }, [search, filterCidade, filterTipo, filterWhatsapp]);

  async function handleDelete() {
    if (!deleteTarget) return;
    const t = deleteTarget;
    let error: any = null;
    if (t.source === "pessoas") {
      const r = await supabase.from("pessoas").delete().eq("id", t.source_id);
      error = r.error;
    } else if (t.source === "funcionarios") {
      const r = await supabase.from("funcionarios").delete().eq("id", t.source_id);
      error = r.error;
    } else {
      const r = await supabase.from("eleicao_pessoas" as any).delete().eq("id", t.source_id);
      error = r.error;
    }
    if (error) {
      toast.error("Erro ao excluir");
    } else {
      toast.success("Excluído com sucesso");
      fetchAll();
    }
    setDeleteTarget(null);
  }

  async function openProfile(r: UnifiedRow) {
    if (r.pessoa_id) {
      navigate(`/pessoas/${r.pessoa_id}`);
      return;
    }
    if (!clientId) return;
    try {
      // Try to find existing pessoa by normalized phone
      const ph = normPhone(r.telefone || "");
      if (ph.length >= 10) {
        const { data: existing } = await supabase
          .from("pessoas")
          .select("id, telefone")
          .eq("client_id", clientId)
          .ilike("telefone", `%${ph.slice(-9)}%`)
          .limit(20);
        const match = (existing || []).find((p: any) => normPhone(p.telefone || "").slice(-10) === ph.slice(-10));
        if (match) {
          navigate(`/pessoas/${match.id}`);
          return;
        }
      }
      // Create a pessoas record so user can edit/add notes/socials
      const tipo = r.roles.includes("funcionario")
        ? "voluntario"
        : r.roles.includes("coordenador") || r.roles.includes("lider") || r.roles.includes("cabo")
          ? "lideranca"
          : "apoiador";
      const { data: created, error } = await supabase
        .from("pessoas")
        .insert({
          client_id: clientId,
          nome: r.nome,
          telefone: r.telefone,
          cidade: r.cidade,
          tipo_pessoa: tipo as any,
        })
        .select("id")
        .single();
      if (error || !created) {
        toast.error("Não foi possível abrir o perfil: " + (error?.message || "erro"));
        return;
      }
      toast.success("Perfil criado para edição");
      navigate(`/pessoas/${created.id}`);
    } catch (e: any) {
      toast.error("Erro ao abrir perfil: " + e.message);
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pessoas</h1>
          <p className="text-sm text-muted-foreground">
            Sua base política unificada — apoiadores, funcionários, coordenadores, líderes e cabos eleitorais em uma única lista. A mesma pessoa aparece uma só vez, mesmo que tenha vários papéis.
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {total} {total === 1 ? "pessoa" : "pessoas"}
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Nova Pessoa
        </Button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterCidade} onValueChange={setFilterCidade}>
          <SelectTrigger><SelectValue placeholder="Cidade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas cidades</SelectItem>
            {cidades.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterTipo} onValueChange={setFilterTipo}>
          <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {Object.entries(ROLE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterWhatsapp} onValueChange={setFilterWhatsapp}>
          <SelectTrigger><SelectValue placeholder="WhatsApp" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">WhatsApp: Todos</SelectItem>
            <SelectItem value="sim">✅ Confirmado</SelectItem>
            <SelectItem value="nao">⏳ Pendente</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Cidade</TableHead>
                <TableHead>Papéis</TableHead>
                <TableHead>
                  <div className="flex items-center gap-1">
                    <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                  </div>
                </TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Carregando...</TableCell>
                </TableRow>
              ) : paged.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Nenhuma pessoa encontrada</TableCell>
                </TableRow>
              ) : (
                paged.map((r) => (
                  <TableRow key={r.key} className="cursor-pointer hover:bg-muted/50" onClick={() => openProfile(r)}>
                    <TableCell className="font-medium">{r.nome}</TableCell>
                    <TableCell className="text-sm">
                      <div className="flex items-center gap-1.5">
                        <span>{r.telefone || "—"}</span>
                        {(() => {
                          const waLink = getWhatsAppLink(r.telefone);
                          return waLink ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <a href={waLink} target="_blank" rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center justify-center h-6 w-6 rounded text-emerald-600 hover:bg-emerald-500/10 transition-colors shrink-0">
                                  <MessageCircle className="w-3.5 h-3.5" />
                                </a>
                              </TooltipTrigger>
                              <TooltipContent>Conversar no WhatsApp</TooltipContent>
                            </Tooltip>
                          ) : null;
                        })()}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{r.cidade || "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {r.roles.map(role => (
                          <Badge key={role} variant="outline" className={`text-xs ${ROLE_COLORS[role] || ""}`}>
                            {ROLE_LABELS[role] || role}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {r.whatsapp_confirmado ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenuItem
                            onClick={() => setDeleteTarget(r)}
                            className="gap-2 text-destructive focus:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" /> Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Página {page + 1} de {totalPages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {clientId && (
        <NovaPessoaDialog open={dialogOpen} onOpenChange={setDialogOpen} clientId={clientId} onSuccess={fetchAll} />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cadastro</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deleteTarget?.nome}</strong>? Esta ação não pode ser desfeita.
              {deleteTarget && deleteTarget.roles.length > 1 && (
                <span className="block mt-2 text-xs text-amber-600">
                  Atenção: esta pessoa também tem outros papéis. A exclusão removerá apenas o registro de <strong>{ROLE_LABELS[deleteTarget.roles[0]]}</strong>.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
