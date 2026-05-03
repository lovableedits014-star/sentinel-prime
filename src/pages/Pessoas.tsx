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
import { Plus, Search, ChevronLeft, ChevronRight, ArrowUpDown, Trash2, TrendingUp, Star, MessageCircle, CheckCircle2, Briefcase, UserPlus, UserMinus, MoreVertical } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { format } from "date-fns";
import NovaPessoaDialog from "@/components/pessoas/NovaPessoaDialog";
import { getWhatsAppLink } from "@/lib/social-url";

const TIPO_LABELS: Record<string, string> = {
  cidadao: "Cidadão", eleitor: "Eleitor", apoiador: "Apoiador", lideranca: "Liderança",
  lider: "Líder", contratado: "Contratado", indicado: "Indicado", liderado: "Liderado",
  jornalista: "Jornalista", influenciador: "Influenciador", voluntario: "Voluntário",
  adversario: "Adversário",
};

const NIVEL_LABELS: Record<string, string> = {
  desconhecido: "Desconhecido", simpatizante: "Simpatizante",
  apoiador: "Apoiador", militante: "Militante", opositor: "Opositor",
};

const NIVEL_COLORS: Record<string, string> = {
  desconhecido: "bg-muted text-muted-foreground",
  simpatizante: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  apoiador: "bg-green-500/10 text-green-600 border-green-500/20",
  militante: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  opositor: "bg-red-500/10 text-red-600 border-red-500/20",
};

const ORIGEM_LABELS: Record<string, string> = {
  rede_social: "Rede Social", formulario: "Formulário", evento: "Evento",
  importacao: "Importação", manual: "Manual",
};

const STATUS_LEAD_LABELS: Record<string, string> = {
  novo: "Novo", contato_whatsapp: "Contato WhatsApp", em_conversa: "Em Conversa",
  proposta_enviada: "Proposta Enviada", fechado: "Fechado", perdido: "Perdido",
};

const STATUS_LEAD_COLORS: Record<string, string> = {
  novo: "bg-muted text-muted-foreground",
  contato_whatsapp: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  em_conversa: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  proposta_enviada: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  fechado: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  perdido: "bg-red-500/10 text-red-600 border-red-500/20",
};

const CLASSIF_POLITICA_LABELS: Record<string, string> = {
  apoiador: "Apoiador", simpatizante: "Simpatizante", indefinido: "Indefinido",
  oposicao: "Oposição", lideranca: "Liderança",
};

const CLASSIF_POLITICA_COLORS: Record<string, string> = {
  apoiador: "bg-green-500/10 text-green-600 border-green-500/20",
  simpatizante: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  indefinido: "bg-muted text-muted-foreground",
  oposicao: "bg-red-500/10 text-red-600 border-red-500/20",
  lideranca: "bg-purple-500/10 text-purple-600 border-purple-500/20",
};

const CLASSIFICATION_LABELS: Record<string, string> = {
  apoiador_ativo: "Ativo",
  apoiador_passivo: "Passivo",
  neutro: "Neutro",
  critico: "Crítico",
};

const CLASSIFICATION_COLORS: Record<string, string> = {
  apoiador_ativo: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  apoiador_passivo: "bg-sky-500/10 text-sky-600 border-sky-500/20",
  neutro: "bg-muted text-muted-foreground",
  critico: "bg-orange-500/10 text-orange-600 border-orange-500/20",
};

function getScoreColor(score: number | null) {
  if (!score || score === 0) return "text-muted-foreground";
  if (score >= 20) return "text-emerald-600";
  if (score >= 10) return "text-sky-600";
  if (score >= 5) return "text-amber-600";
  return "text-muted-foreground";
}

const PAGE_SIZE = 20;
type SortField = "created_at" | "nome";

export default function Pessoas() {
  const navigate = useNavigate();
  const [pessoas, setPessoas] = useState<any[]>([]);
  const [supporterMap, setSupporterMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCidade, setFilterCidade] = useState("all");
  const [filterBairro, setFilterBairro] = useState("all");
  const [filterTipo, setFilterTipo] = useState("all");
  const [filterNivel, setFilterNivel] = useState("all");
  const [filterOrigem, setFilterOrigem] = useState("all");
  const [filterWhatsapp, setFilterWhatsapp] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterClassifPolitica, setFilterClassifPolitica] = useState("all");
  const [filterTagId, setFilterTagId] = useState("all");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [cidades, setCidades] = useState<string[]>([]);
  const [bairros, setBairros] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<any[]>([]);
  const [pessoaTagsMap, setPessoaTagsMap] = useState<Record<string, any[]>>({});
  const [funcionarioMap, setFuncionarioMap] = useState<Record<string, any>>({});
  const [promoteTarget, setPromoteTarget] = useState<any>(null);
  const [demoteTarget, setDemoteTarget] = useState<any>(null);
  useEffect(() => { resolveClient(); }, []);

  useEffect(() => {
    if (clientId) {
      fetchPessoas();
      fetchFilterOptions();
    }
  }, [clientId, search, filterCidade, filterBairro, filterTipo, filterNivel, filterOrigem, filterWhatsapp, filterStatus, filterClassifPolitica, filterTagId, sortField, sortAsc, page]);

  async function resolveClient() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: client } = await supabase.from("clients").select("id").eq("user_id", session.user.id).maybeSingle();
    if (client) { setClientId(client.id); return; }
    const { data: tm } = await supabase.from("team_members").select("client_id").eq("user_id", session.user.id).eq("status", "active").maybeSingle();
    if (tm) setClientId(tm.client_id);
  }

  async function fetchFilterOptions() {
    if (!clientId) return;
    const [pessoaRes, tagsRes] = await Promise.all([
      supabase.from("pessoas").select("cidade, bairro").eq("client_id", clientId),
      supabase.from("tags").select("id, nome").eq("client_id", clientId).order("nome") as any,
    ]);
    if (pessoaRes.data) {
      const cidSet = new Set<string>();
      const baiSet = new Set<string>();
      pessoaRes.data.forEach((p: any) => {
        if (p.cidade) cidSet.add(p.cidade);
        if (p.bairro) baiSet.add(p.bairro);
      });
      setCidades(Array.from(cidSet).sort());
      setBairros(Array.from(baiSet).sort());
    }
    setAvailableTags(tagsRes.data || []);
  }

  async function fetchPessoas() {
    if (!clientId) return;
    setLoading(true);

    // If filtering by tag, first get matching pessoa_ids
    let tagFilterIds: string[] | null = null;
    if (filterTagId !== "all") {
      const { data: ptData } = await supabase
        .from("pessoas_tags")
        .select("pessoa_id")
        .eq("tag_id", filterTagId) as any;
      tagFilterIds = (ptData || []).map((pt: any) => pt.pessoa_id);
      if (tagFilterIds.length === 0) {
        setPessoas([]);
        setTotal(0);
        setSupporterMap({});
        setPessoaTagsMap({});
        setLoading(false);
        return;
      }
    }

    let query = supabase.from("pessoas").select("*", { count: "exact" }).eq("client_id", clientId);
    if (tagFilterIds) query = query.in("id", tagFilterIds);
    if (search.trim()) query = query.ilike("nome", `%${search.trim()}%`);
    if (filterCidade !== "all") query = query.eq("cidade", filterCidade);
    if (filterBairro !== "all") query = query.eq("bairro", filterBairro);
    if (filterTipo !== "all") query = query.eq("tipo_pessoa", filterTipo as any);
    if (filterNivel !== "all") query = query.eq("nivel_apoio", filterNivel as any);
    if (filterOrigem !== "all") query = query.eq("origem_contato", filterOrigem as any);
    if (filterWhatsapp === "sim") query = query.eq("whatsapp_confirmado", true) as any;
    if (filterWhatsapp === "nao") query = query.eq("whatsapp_confirmado", false) as any;
    if (filterStatus !== "all") query = query.eq("status_lead", filterStatus) as any;
    if (filterClassifPolitica !== "all") query = query.eq("classificacao_politica", filterClassifPolitica) as any;
    query = query.order(sortField, { ascending: sortAsc });
    query = query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    const { data, count, error } = await query;
    if (error) {
      toast.error("Erro ao carregar pessoas");
    } else {
      setPessoas(data || []);
      setTotal(count || 0);

      const pessoaIds = (data || []).map((p: any) => p.id);
      const supporterIds = (data || []).map((p: any) => p.supporter_id).filter(Boolean);
      const phones = (data || []).map((p: any) => p.telefone).filter(Boolean);

      // Fetch supporter data, tags, and funcionarios in parallel
      const [suppResult, tagsResult, funcResult] = await Promise.all([
        supporterIds.length > 0
          ? supabase.from("supporters").select("id, engagement_score, classification").in("id", supporterIds)
          : Promise.resolve({ data: [] }),
        pessoaIds.length > 0
          ? supabase.from("pessoas_tags").select("pessoa_id, tag_id, tags:tag_id(id, nome)").in("pessoa_id", pessoaIds) as any
          : Promise.resolve({ data: [] }),
        clientId
          ? supabase.from("funcionarios").select("id, nome, telefone, status").eq("client_id", clientId)
          : Promise.resolve({ data: [] }),
      ]);

      if (suppResult.data) {
        const map: Record<string, any> = {};
        (suppResult.data as any[]).forEach(s => { map[s.id] = s; });
        setSupporterMap(map);
      } else {
        setSupporterMap({});
      }

      // Build funcionario map by phone
      const fMap: Record<string, any> = {};
      (funcResult.data || []).forEach((f: any) => {
        if (f.telefone) fMap[f.telefone] = f;
      });
      setFuncionarioMap(fMap);

      // Build tags map: pessoaId -> tags[]
      const tMap: Record<string, any[]> = {};
      (tagsResult.data || []).forEach((pt: any) => {
        if (!tMap[pt.pessoa_id]) tMap[pt.pessoa_id] = [];
        tMap[pt.pessoa_id].push(pt.tags);
      });
      setPessoaTagsMap(tMap);
    }
    setLoading(false);
  }

  function toggleSort(field: SortField) {
    if (sortField === field) { setSortAsc(!sortAsc); } 
    else { setSortField(field); setSortAsc(field === "nome"); }
    setPage(0);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    // Also delete linked supporter + profiles if exists
    if (deleteTarget.supporter_id) {
      await supabase.from("supporter_profiles").delete().eq("supporter_id", deleteTarget.supporter_id);
      await supabase.from("supporters").delete().eq("id", deleteTarget.supporter_id);
    }
    await supabase.from("pessoa_social").delete().eq("pessoa_id", deleteTarget.id);
    const { error } = await supabase.from("pessoas").delete().eq("id", deleteTarget.id);
    if (error) {
      toast.error("Erro ao excluir pessoa");
    } else {
      toast.success("Pessoa excluída com sucesso");
      fetchPessoas();
      fetchFilterOptions();
    }
    setDeleteTarget(null);
  }

  async function handlePromoteToFuncionario() {
    if (!promoteTarget || !clientId) return;
    const { error } = await supabase.from("funcionarios").insert({
      client_id: clientId,
      nome: promoteTarget.nome,
      telefone: promoteTarget.telefone || "",
      email: promoteTarget.email || null,
      cidade: promoteTarget.cidade || null,
      bairro: promoteTarget.bairro || null,
      endereco: promoteTarget.endereco || null,
    } as any);
    if (error) {
      toast.error("Erro ao transformar em funcionário");
      console.error(error);
    } else {
      toast.success(`${promoteTarget.nome} agora é funcionário!`);
      fetchPessoas();
    }
    setPromoteTarget(null);
  }

  async function handleDemoteFuncionario() {
    if (!demoteTarget) return;
    const func = funcionarioMap[demoteTarget.telefone];
    if (!func) return;
    const { error } = await supabase.from("funcionarios").delete().eq("id", func.id);
    if (error) {
      toast.error("Erro ao remover funcionário");
      console.error(error);
    } else {
      toast.success(`${demoteTarget.nome} removido dos funcionários`);
      fetchPessoas();
    }
    setDemoteTarget(null);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pessoas</h1>
          <p className="text-sm text-muted-foreground">
            Sua base política completa — todos os contatos cadastrados (eleitores, apoiadores, lideranças, voluntários, etc.) em um CRM unificado. Aqui você busca, filtra, edita e acompanha o nível de apoio de cada pessoa.
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {total} {total === 1 ? "pessoa cadastrada" : "pessoas cadastradas"}
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Nova Pessoa
        </Button>
      </div>

      {/* Search + Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative sm:col-span-2 lg:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-9"
          />
        </div>
        <Select value={filterCidade} onValueChange={(v) => { setFilterCidade(v); setPage(0); }}>
          <SelectTrigger><SelectValue placeholder="Cidade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas cidades</SelectItem>
            {cidades.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterTipo} onValueChange={(v) => { setFilterTipo(v); setPage(0); }}>
          <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos tipos</SelectItem>
            {Object.entries(TIPO_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterNivel} onValueChange={(v) => { setFilterNivel(v); setPage(0); }}>
          <SelectTrigger><SelectValue placeholder="Nível" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos níveis</SelectItem>
            {Object.entries(NIVEL_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterOrigem} onValueChange={(v) => { setFilterOrigem(v); setPage(0); }}>
          <SelectTrigger><SelectValue placeholder="Origem" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas origens</SelectItem>
            {Object.entries(ORIGEM_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterWhatsapp} onValueChange={(v) => { setFilterWhatsapp(v); setPage(0); }}>
          <SelectTrigger><SelectValue placeholder="WhatsApp" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">WhatsApp: Todos</SelectItem>
            <SelectItem value="sim">✅ Confirmado</SelectItem>
            <SelectItem value="nao">⏳ Pendente</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(0); }}>
          <SelectTrigger><SelectValue placeholder="Status Lead" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            {Object.entries(STATUS_LEAD_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterClassifPolitica} onValueChange={(v) => { setFilterClassifPolitica(v); setPage(0); }}>
          <SelectTrigger><SelectValue placeholder="Classificação" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas classificações</SelectItem>
            {Object.entries(CLASSIF_POLITICA_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterTagId} onValueChange={(v) => { setFilterTagId(v); setPage(0); }}>
          <SelectTrigger><SelectValue placeholder="TAG" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas tags</SelectItem>
            {availableTags.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("nome")}>
                  <div className="flex items-center gap-1">Nome <ArrowUpDown className="w-3 h-3" /></div>
                </TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Cidade / Bairro</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Nível</TableHead>
                <TableHead>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1 cursor-help">
                        <TrendingUp className="w-3.5 h-3.5" />
                        Score
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[200px]">
                      <p className="text-xs">Pontuação de engajamento nas redes sociais (curtidas, comentários, compartilhamentos)</p>
                    </TooltipContent>
                  </Tooltip>
                </TableHead>
                <TableHead>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1 cursor-help">
                        <Star className="w-3.5 h-3.5" />
                        Status
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[200px]">
                      <p className="text-xs">Classificação baseada no engajamento: Ativo, Passivo, Neutro ou Crítico</p>
                    </TooltipContent>
                  </Tooltip>
                </TableHead>
                <TableHead>
                  <div className="flex items-center gap-1">
                    <MessageCircle className="w-3.5 h-3.5" />
                    WhatsApp
                  </div>
                </TableHead>
                <TableHead>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1 cursor-help">Status Lead</div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[200px]">
                      <p className="text-xs">Status atual do atendimento</p>
                    </TooltipContent>
                  </Tooltip>
                </TableHead>
                <TableHead>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1 cursor-help">Classificação</div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[200px]">
                      <p className="text-xs">Classificação política do contato</p>
                    </TooltipContent>
                  </Tooltip>
                </TableHead>
                <TableHead>TAGS</TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("created_at")}>
                  <div className="flex items-center gap-1">Criação <ArrowUpDown className="w-3 h-3" /></div>
                </TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                   <TableCell colSpan={13} className="text-center py-10 text-muted-foreground">Carregando...</TableCell>
                </TableRow>
              ) : pessoas.length === 0 ? (
                <TableRow>
                   <TableCell colSpan={13} className="text-center py-10 text-muted-foreground">Nenhuma pessoa encontrada</TableCell>
                </TableRow>
              ) : (
                pessoas.map((p) => {
                  const supporter = p.supporter_id ? supporterMap[p.supporter_id] : null;
                  const score = supporter?.engagement_score ?? null;
                  const classification = supporter?.classification ?? null;
                  const isFuncionario = !!(p.telefone && funcionarioMap[p.telefone]);
                  return (
                    <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/pessoas/${p.id}`)}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-1.5">
                          {p.nome}
                          {isFuncionario && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-700 border-amber-500/20 gap-0.5">
                                  <Briefcase className="w-2.5 h-2.5" />
                                  Func.
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>Esta pessoa é um funcionário</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-1.5">
                          <span>{p.telefone || "—"}</span>
                          {(() => {
                            const waLink = getWhatsAppLink(p.telefone);
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
                      <TableCell className="text-sm">
                        {p.cidade || "—"}{p.bairro ? ` / ${p.bairro}` : ""}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{TIPO_LABELS[p.tipo_pessoa] || p.tipo_pessoa}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${NIVEL_COLORS[p.nivel_apoio] || ""}`}>
                          {NIVEL_LABELS[p.nivel_apoio] || p.nivel_apoio}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {score !== null && score > 0 ? (
                          <span className={`text-sm font-bold ${getScoreColor(score)}`}>{score}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {classification ? (
                          <Badge variant="outline" className={`text-xs ${CLASSIFICATION_COLORS[classification] || ""}`}>
                            {CLASSIFICATION_LABELS[classification] || classification}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {p.whatsapp_confirmado ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="outline" className={`text-xs ${STATUS_LEAD_COLORS[(p as any).status_lead] || ""}`}>
                              {STATUS_LEAD_LABELS[(p as any).status_lead] || (p as any).status_lead || "Novo"}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>Status atual do atendimento</TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="outline" className={`text-xs ${CLASSIF_POLITICA_COLORS[(p as any).classificacao_politica] || ""}`}>
                              {CLASSIF_POLITICA_LABELS[(p as any).classificacao_politica] || (p as any).classificacao_politica || "Indefinido"}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>Classificação política do contato</TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const tags = pessoaTagsMap[p.id] || [];
                          if (tags.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
                          const shown = tags.slice(0, 3);
                          const extra = tags.length - 3;
                          return (
                            <div className="flex flex-wrap gap-1">
                              {shown.map((t: any) => (
                                <Badge key={t.id} variant="secondary" className="text-[10px] px-1.5 py-0">{t.nome}</Badge>
                              ))}
                              {extra > 0 && <span className="text-[10px] text-muted-foreground">+{extra}</span>}
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(p.created_at), "dd/MM/yyyy")}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline" size="icon"
                              className="h-7 w-7"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                            {isFuncionario ? (
                              <DropdownMenuItem onClick={() => setDemoteTarget(p)} className="gap-2 text-amber-700">
                                <UserMinus className="w-4 h-4" />
                                Remover de Funcionários
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={() => {
                                  if (!p.telefone) {
                                    toast.error("Pessoa precisa ter telefone para ser funcionário");
                                    return;
                                  }
                                  setPromoteTarget(p);
                                }}
                                className="gap-2"
                              >
                                <UserPlus className="w-4 h-4" />
                                Transformar em Funcionário
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => setDeleteTarget(p)}
                              className="gap-2 text-destructive focus:text-destructive"
                            >
                              <Trash2 className="w-4 h-4" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination */}
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
        <NovaPessoaDialog open={dialogOpen} onOpenChange={setDialogOpen} clientId={clientId} onSuccess={() => { fetchPessoas(); fetchFilterOptions(); }} />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir pessoa</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deleteTarget?.nome}</strong>?
              {deleteTarget?.supporter_id && " O perfil de engajamento vinculado também será removido."}
              {" "}Esta ação não pode ser desfeita.
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

      {/* Promote to Funcionário */}
      <AlertDialog open={!!promoteTarget} onOpenChange={(open) => !open && setPromoteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Transformar em Funcionário</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja transformar <strong>{promoteTarget?.nome}</strong> em funcionário? Um novo registro será criado no módulo de Funcionários com os dados desta pessoa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handlePromoteToFuncionario}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Demote from Funcionário */}
      <AlertDialog open={!!demoteTarget} onOpenChange={(open) => !open && setDemoteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover de Funcionários</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja remover <strong>{demoteTarget?.nome}</strong> da lista de funcionários? O registro de funcionário será excluído, mas a pessoa continuará cadastrada aqui.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDemoteFuncionario} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
