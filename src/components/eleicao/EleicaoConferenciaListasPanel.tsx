import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  Loader2,
  Search,
  Trash2,
  Upload,
  UserRoundCheck,
  UserRoundX,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  CONFERENCIA_CLASSIFICACOES,
  type ClassificacaoConferencia,
  formatarTelefoneConferencia,
  normalizarLinhasConferencia,
  type LinhaConferencia,
} from "@/lib/eleicao-conferencia-lista";

// As tabelas/RPCs entram nos tipos gerados depois que a migration for aplicada.
/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabase as any;
const PAGE_SIZE = 100;

type Lideranca = {
  id: string;
  nome: string;
  tipo: "coordenador" | "lider";
  parent_id: string | null;
};

type ConferenciaLista = {
  id: string;
  nome: string;
  arquivo_nome: string;
  referencia_em: string;
  lideranca_esperada_id: string | null;
  total_lista: number;
  total_dentro: number;
  total_outra_lideranca: number;
  total_fora: number;
  total_ausentes: number;
  total_atencao: number;
  created_at: string;
};

type ConferenciaItem = {
  id: number;
  origem: "lista" | "sistema";
  numero_linha: number | null;
  nome_informado: string | null;
  telefone_informado: string | null;
  pessoa_id: string | null;
  pessoa_nome: string | null;
  pessoa_telefone: string | null;
  pessoa_tipo: string | null;
  responsavel_nome: string | null;
  metodo_correspondencia: "telefone" | "nome" | null;
  classificacao: ClassificacaoConferencia;
  motivo: string;
  contrato_inicio: string | null;
  contrato_fim: string | null;
  valor_contratacao: number | null;
  conferido: boolean;
  observacoes: string | null;
};

type ReviewState = {
  item: ConferenciaItem;
  conferido: boolean;
  observacoes: string;
};

const roleLabel = (tipo: string) =>
  tipo === "coordenador" ? "Coordenador" : tipo === "lider" ? "Líder" : "Cabo";

const badgeClass: Record<string, string> = {
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  danger: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
  muted: "border-muted-foreground/20 bg-muted text-muted-foreground",
};

const erro = (value: unknown) =>
  value && typeof value === "object" && "message" in value
    ? String(value.message)
    : "Não foi possível concluir a operação.";

const sanitizarBusca = (value: string) => value.replace(/[,()%_]/g, " ").trim();

export default function EleicaoConferenciaListasPanel({ clientId }: { clientId: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [liderancas, setLiderancas] = useState<Lideranca[]>([]);
  const [listas, setListas] = useState<ConferenciaLista[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [itens, setItens] = useState<ConferenciaItem[]>([]);
  const [itemCount, setItemCount] = useState(0);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<string>("todos");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<LinhaConferencia[]>([]);
  const [name, setName] = useState("");
  const [referenceDate, setReferenceDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [leaderId, setLeaderId] = useState<string>("all");
  const [review, setReview] = useState<ReviewState | null>(null);

  const activeList = useMemo(
    () => listas.find((lista) => lista.id === activeId) || null,
    [activeId, listas],
  );
  const leaderName = useMemo(
    () =>
      activeList?.lideranca_esperada_id
        ? liderancas.find((item) => item.id === activeList.lideranca_esperada_id)?.nome ||
          "Liderança removida"
        : "Toda a campanha",
    [activeList, liderancas],
  );
  const totalPages = Math.max(1, Math.ceil(itemCount / PAGE_SIZE));

  const loadBase = useCallback(async () => {
    const [leadersResult, listsResult] = await Promise.all([
      db
        .from("eleicao_pessoas")
        .select("id,nome,tipo,parent_id")
        .eq("client_id", clientId)
        .is("arquivado_em", null)
        .in("tipo", ["coordenador", "lider"])
        .order("nome"),
      db
        .from("eleicao_conferencia_listas")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    if (leadersResult.error) toast.error(erro(leadersResult.error));
    else setLiderancas((leadersResult.data || []) as Lideranca[]);
    if (listsResult.error) toast.error(erro(listsResult.error));
    else {
      const loaded = (listsResult.data || []) as ConferenciaLista[];
      setListas(loaded);
      setActiveId((current) =>
        loaded.some((lista) => lista.id === current) ? current : loaded[0]?.id || "",
      );
    }
  }, [clientId]);

  const applyItemFilters = useCallback(
    (query: any) => {
      let next = query.eq("lista_id", activeId);
      if (filter === "atencao") {
        next = next.in("classificacao", [
          "sem_contrato",
          "arquivado",
          "possivel_correspondencia",
          "conflito_nome",
          "repetido_lista",
          "dados_invalidos",
        ]);
      } else if (filter !== "todos") {
        next = next.eq("classificacao", filter);
      }
      const term = sanitizarBusca(search);
      if (term) {
        next = next.or(
          `nome_informado.ilike.%${term}%,pessoa_nome.ilike.%${term}%,telefone_informado.ilike.%${term}%,pessoa_telefone.ilike.%${term}%`,
        );
      }
      return next;
    },
    [activeId, filter, search],
  );

  const loadItems = useCallback(async () => {
    if (!activeId) {
      setItens([]);
      setItemCount(0);
      return;
    }
    setLoadingItems(true);
    try {
      let query = db.from("eleicao_conferencia_itens").select("*", { count: "exact" });
      query = applyItemFilters(query)
        .order("origem", { ascending: true })
        .order("numero_linha", { ascending: true, nullsFirst: false })
        .order("id", { ascending: true })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      const { data, error, count } = await query;
      if (error) throw error;
      setItens((data || []) as ConferenciaItem[]);
      setItemCount(count || 0);
    } catch (error) {
      toast.error(erro(error));
    } finally {
      setLoadingItems(false);
    }
  }, [activeId, applyItemFilters, page]);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  useEffect(() => {
    setPage(0);
  }, [activeId, filter, search]);

  const readFile = async (selected: File) => {
    setBusy(true);
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await selected.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const parsed = normalizarLinhasConferencia(
        XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false }),
      );
      if (!parsed.length) {
        throw new Error(
          "A planilha está vazia ou não tem colunas de nome e telefone reconhecidas.",
        );
      }
      if (parsed.length > 20000) throw new Error("O limite é de 20.000 linhas por conferência.");
      setFile(selected);
      setRows(parsed);
      setName(selected.name.replace(/\.[^.]+$/, ""));
      toast.success(`${parsed.length.toLocaleString("pt-BR")} pessoas prontas para comparar.`);
    } catch (error) {
      toast.error(erro(error));
    } finally {
      setBusy(false);
    }
  };

  const processList = async () => {
    if (!file || !rows.length) return toast.error("Selecione uma planilha.");
    if (!name.trim()) return toast.error("Informe o nome desta conferência.");
    if (!referenceDate) return toast.error("Informe a data de referência.");
    setBusy(true);
    try {
      const { data, error } = await db.rpc("eleicao_conferencia_processar", {
        p_client_id: clientId,
        p_nome: name.trim(),
        p_arquivo_nome: file.name,
        p_referencia_em: referenceDate,
        p_lideranca_esperada_id: leaderId === "all" ? null : leaderId,
        p_linhas: rows,
      });
      if (error) throw error;
      const created = data?.lista as ConferenciaLista;
      setFile(null);
      setRows([]);
      setName("");
      if (fileRef.current) fileRef.current.value = "";
      await loadBase();
      if (created?.id) setActiveId(created.id);
      setFilter("todos");
      setPage(0);
      toast.success("Pente-fino concluído. O resultado foi salvo no histórico.");
    } catch (error) {
      const message = erro(error);
      toast.error(
        message.toLowerCase().includes("statement timeout")
          ? "A comparação excedeu o tempo do banco. Aplique a migration de otimização e tente novamente."
          : message,
      );
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = async () => {
    const XLSX = await import("xlsx");
    const sheet = XLSX.utils.json_to_sheet([
      { Nome: "Maria da Silva", Telefone: "(67) 99999-0000" },
      { Nome: "João Souza", Telefone: "67988880000" },
    ]);
    sheet["!cols"] = [{ wch: 36 }, { wch: 22 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Lista externa");
    XLSX.writeFile(workbook, "modelo-pente-fino-nome-telefone.xlsx");
  };

  const fetchAllFiltered = async () => {
    const all: ConferenciaItem[] = [];
    for (let offset = 0; ; offset += 1000) {
      let query = db.from("eleicao_conferencia_itens").select("*");
      query = applyItemFilters(query)
        .order("origem", { ascending: true })
        .order("numero_linha", { ascending: true, nullsFirst: false })
        .range(offset, offset + 999);
      const { data, error } = await query;
      if (error) throw error;
      const chunk = (data || []) as ConferenciaItem[];
      all.push(...chunk);
      if (chunk.length < 1000) break;
    }
    return all;
  };

  const exportResult = async () => {
    if (!activeList) return;
    setBusy(true);
    try {
      const data = await fetchAllFiltered();
      const XLSX = await import("xlsx");
      const sheet = XLSX.utils.json_to_sheet(
        data.map((item) => ({
          Origem: item.origem === "lista" ? "Lista externa" : "Sistema (ausente na lista)",
          Linha: item.numero_linha || "",
          Classificação: CONFERENCIA_CLASSIFICACOES[item.classificacao].label,
          "Nome informado": item.nome_informado || "",
          "Telefone informado": item.telefone_informado || "",
          "Cadastro localizado": item.pessoa_nome || "",
          "Telefone cadastrado": item.pessoa_telefone || "",
          Cargo: item.pessoa_tipo ? roleLabel(item.pessoa_tipo) : "",
          Liderança: item.responsavel_nome || "",
          Motivo: item.motivo,
          "Contrato início": item.contrato_inicio || "",
          "Contrato fim": item.contrato_fim || "",
          Valor: item.valor_contratacao ?? "",
          Conferido: item.conferido ? "Sim" : "Não",
          Observações: item.observacoes || "",
        })),
      );
      sheet["!cols"] = [12, 8, 22, 30, 20, 30, 20, 14, 26, 48, 15, 15, 14, 12, 40].map((wch) => ({
        wch,
      }));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, "Resultado");
      XLSX.writeFile(workbook, `pente-fino-${activeList.nome.replace(/[^a-z0-9]+/gi, "-")}.xlsx`);
    } catch (error) {
      toast.error(erro(error));
    } finally {
      setBusy(false);
    }
  };

  const saveReview = async () => {
    if (!review) return;
    setBusy(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const payload = {
        conferido: review.conferido,
        observacoes: review.observacoes.trim() || null,
        conferido_por: review.conferido ? authData.user?.id || null : null,
        conferido_em: review.conferido ? new Date().toISOString() : null,
      };
      const { error } = await db
        .from("eleicao_conferencia_itens")
        .update(payload)
        .eq("id", review.item.id)
        .eq("client_id", clientId);
      if (error) throw error;
      setReview(null);
      await loadItems();
      toast.success("Revisão salva.");
    } catch (error) {
      toast.error(erro(error));
    } finally {
      setBusy(false);
    }
  };

  const deleteList = async () => {
    if (!activeList || busy) return;
    if (!window.confirm(`Excluir a conferência “${activeList.nome}” e todo o resultado salvo?`))
      return;
    setBusy(true);
    try {
      const { error } = await db
        .from("eleicao_conferencia_listas")
        .delete()
        .eq("id", activeList.id)
        .eq("client_id", clientId);
      if (error) throw error;
      setActiveId("");
      await loadBase();
      toast.success("Conferência excluída.");
    } catch (error) {
      toast.error(erro(error));
    } finally {
      setBusy(false);
    }
  };

  const metricCards = activeList
    ? [
        {
          key: "dentro",
          label: "Dentro",
          value: activeList.total_dentro,
          help: "Contrato ativo na liderança esperada",
          icon: UserRoundCheck,
          className: "text-emerald-600",
        },
        {
          key: "nao_encontrado",
          label: "Fora do sistema",
          value: activeList.total_fora,
          help: "Veio na lista, mas não foi cadastrado",
          icon: UserRoundX,
          className: "text-red-600",
        },
        {
          key: "ausente_lista",
          label: "Saiu / ausente",
          value: activeList.total_ausentes,
          help: "Contrato ativo que não veio na lista",
          icon: UsersRound,
          className: "text-red-600",
        },
        {
          key: "outra_lideranca",
          label: "Outra liderança",
          value: activeList.total_outra_lideranca,
          help: "Contrato ativo fora da equipe esperada",
          icon: AlertTriangle,
          className: "text-amber-600",
        },
        {
          key: "atencao",
          label: "Precisa conferir",
          value: activeList.total_atencao,
          help: "Sem contrato, arquivado ou divergente",
          icon: ClipboardCheck,
          className: "text-amber-600",
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Nova conferência de lista
          </CardTitle>
          <CardDescription>
            Suba Excel ou CSV com Nome e Telefone. A ferramenta grava somente este histórico de
            conferência; cadastros, contratos, valores e lideranças não são alterados.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="conferencia-nome">Nome da conferência</Label>
              <Input
                id="conferencia-nome"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ex.: Lista do líder João - outubro"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conferencia-data">Data de referência</Label>
              <Input
                id="conferencia-data"
                type="date"
                value={referenceDate}
                onChange={(event) => setReferenceDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Liderança esperada</Label>
              <Select value={leaderId} onValueChange={setLeaderId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toda a campanha</SelectItem>
                  {liderancas.map((lideranca) => (
                    <SelectItem key={lideranca.id} value={lideranca.id}>
                      {lideranca.nome} · {roleLabel(lideranca.tipo)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="conferencia-arquivo">Arquivo</Label>
              <Input
                ref={fileRef}
                id="conferencia-arquivo"
                type="file"
                accept=".xlsx,.xls,.csv"
                disabled={busy}
                onChange={(event) => {
                  const selected = event.target.files?.[0];
                  if (selected) void readFile(selected);
                }}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
            <div className="text-sm">
              {file ? (
                <>
                  <strong>{file.name}</strong> · {rows.length.toLocaleString("pt-BR")} linhas
                  reconhecidas
                </>
              ) : (
                "Use colunas Nome e Telefone; formatos comuns de cabeçalho são reconhecidos."
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void downloadTemplate()} disabled={busy}>
                <Download className="mr-2 h-4 w-4" /> Baixar modelo
              </Button>
              <Button onClick={() => void processList()} disabled={busy || !rows.length}>
                {busy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                Comparar e salvar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {listas.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            Envie a primeira lista para criar seu histórico de pente-fino.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-col gap-3 pt-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="w-full max-w-xl space-y-2">
                <Label>Histórico de conferências</Label>
                <Select value={activeId} onValueChange={setActiveId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {listas.map((lista) => (
                      <SelectItem key={lista.id} value={lista.id}>
                        {lista.nome} ·{" "}
                        {new Date(`${lista.referencia_em}T12:00:00`).toLocaleDateString("pt-BR")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => void exportResult()}
                  disabled={busy || !activeList}
                >
                  <Download className="mr-2 h-4 w-4" /> Exportar resultado
                </Button>
                <Button
                  variant="outline"
                  className="text-destructive"
                  onClick={() => void deleteList()}
                  disabled={busy}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Excluir
                </Button>
              </div>
            </CardContent>
          </Card>

          {activeList && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {metricCards.map((metric) => {
                  const Icon = metric.icon;
                  return (
                    <Card
                      key={metric.key}
                      className="cursor-pointer transition-colors hover:bg-muted/30"
                      onClick={() => {
                        setFilter(metric.key);
                        setPage(0);
                      }}
                    >
                      <CardContent className="pt-5">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{metric.label}</span>
                          <Icon className={`h-5 w-5 ${metric.className}`} />
                        </div>
                        <div className="mt-2 text-3xl font-bold">
                          {metric.value.toLocaleString("pt-BR")}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{metric.help}</p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>{activeList.nome}</CardTitle>
                  <CardDescription>
                    {activeList.total_lista.toLocaleString("pt-BR")} linhas · {leaderName} ·
                    referência em{" "}
                    {new Date(`${activeList.referencia_em}T12:00:00`).toLocaleDateString("pt-BR")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_240px]">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        className="pl-9"
                        placeholder="Buscar nome ou telefone"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                      />
                    </div>
                    <Select value={filter} onValueChange={setFilter}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todas as classificações</SelectItem>
                        <SelectItem value="atencao">Precisa conferir</SelectItem>
                        {Object.entries(CONFERENCIA_CLASSIFICACOES).map(([value, meta]) => (
                          <SelectItem key={value} value={value}>
                            {meta.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="overflow-x-auto rounded-md border">
                    <Table className="min-w-[1120px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-14">Linha</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Lista externa</TableHead>
                          <TableHead>Cadastro no sistema</TableHead>
                          <TableHead>Liderança atual</TableHead>
                          <TableHead>Contrato</TableHead>
                          <TableHead>Diagnóstico</TableHead>
                          <TableHead className="text-right">Revisão</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loadingItems ? (
                          <TableRow>
                            <TableCell colSpan={8} className="h-32 text-center">
                              <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                            </TableCell>
                          </TableRow>
                        ) : itens.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={8}
                              className="h-32 text-center text-muted-foreground"
                            >
                              Nenhum resultado para estes filtros.
                            </TableCell>
                          </TableRow>
                        ) : (
                          itens.map((item) => {
                            const meta = CONFERENCIA_CLASSIFICACOES[item.classificacao];
                            return (
                              <TableRow
                                key={item.id}
                                className={item.conferido ? "bg-emerald-500/[0.04]" : undefined}
                              >
                                <TableCell>{item.numero_linha || "—"}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={badgeClass[meta.tone]}>
                                    {meta.label}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <div className="font-medium">{item.nome_informado || "—"}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {formatarTelefoneConferencia(item.telefone_informado)}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="font-medium">{item.pessoa_nome || "—"}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {item.pessoa_telefone
                                      ? formatarTelefoneConferencia(item.pessoa_telefone)
                                      : "Não localizado"}
                                    {item.pessoa_tipo ? ` · ${roleLabel(item.pessoa_tipo)}` : ""}
                                  </div>
                                </TableCell>
                                <TableCell>{item.responsavel_nome || "—"}</TableCell>
                                <TableCell className="text-xs">
                                  {item.contrato_inicio || item.contrato_fim ? (
                                    <>
                                      {item.contrato_inicio || "…"} até{" "}
                                      {item.contrato_fim || "indeterminado"}
                                    </>
                                  ) : (
                                    "—"
                                  )}
                                </TableCell>
                                <TableCell className="max-w-[280px] text-xs text-muted-foreground">
                                  {item.motivo}
                                  {item.observacoes && (
                                    <div className="mt-1 font-medium text-foreground">
                                      Obs.: {item.observacoes}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    size="sm"
                                    variant={item.conferido ? "outline" : "ghost"}
                                    onClick={() =>
                                      setReview({
                                        item,
                                        conferido: item.conferido,
                                        observacoes: item.observacoes || "",
                                      })
                                    }
                                  >
                                    {item.conferido ? (
                                      <CheckCircle2 className="mr-1 h-4 w-4 text-emerald-600" />
                                    ) : (
                                      <ClipboardCheck className="mr-1 h-4 w-4" />
                                    )}
                                    {item.conferido ? "Conferido" : "Revisar"}
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                    <span>
                      {itemCount.toLocaleString("pt-BR")} resultados · página {page + 1} de{" "}
                      {totalPages}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={page === 0 || loadingItems}
                        onClick={() => setPage((value) => Math.max(0, value - 1))}
                      >
                        Anterior
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={page + 1 >= totalPages || loadingItems}
                        onClick={() => setPage((value) => value + 1)}
                      >
                        Próxima
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}

      <Dialog open={!!review} onOpenChange={(open) => !open && setReview(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revisar ocorrência</DialogTitle>
            <DialogDescription>
              Registre o que foi verificado sem alterar automaticamente o cadastro ou o contrato.
            </DialogDescription>
          </DialogHeader>
          {review && (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <div className="font-medium">
                  {review.item.nome_informado || review.item.pessoa_nome}
                </div>
                <div className="text-muted-foreground">{review.item.motivo}</div>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="item-conferido"
                  checked={review.conferido}
                  onCheckedChange={(checked) =>
                    setReview({ ...review, conferido: checked === true })
                  }
                />
                <Label htmlFor="item-conferido">Marcar como conferido</Label>
              </div>
              <div className="space-y-2">
                <Label htmlFor="item-observacoes">Observações / providência tomada</Label>
                <Textarea
                  id="item-observacoes"
                  rows={4}
                  value={review.observacoes}
                  onChange={(event) => setReview({ ...review, observacoes: event.target.value })}
                  placeholder="Ex.: confirmado com a liderança; será cadastrado amanhã."
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReview(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void saveReview()} disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar revisão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
