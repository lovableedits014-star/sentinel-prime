import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Folder,
  Loader2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  gerarRelatorioDuplicidadesPdf,
  gerarRelatorioCasosRecusadosPdf,
  gerarRelatorioOcorrenciasLotePdf,
} from "@/lib/eleicao-duplicidades-pdf";

type DuplicateCase = {
  id: number;
  data_tentativa: string;
  lote_id: string;
  lote_nome: string;
  arquivo_nome: string;
  numero_linha: number;
  nome_tentativa: string | null;
  cpf_tentativa: string | null;
  telefone_tentativa: string | null;
  responsavel_tentativa_nome: string | null;
  responsavel_tentativa_tipo: string | null;
  cadastro_existente_nome: string;
  cadastro_existente_tipo: string;
  cadastro_existente_telefone: string | null;
  responsavel_existente_nome: string | null;
  responsavel_existente_tipo: string | null;
  valor_contratacao: number;
  contrato_inicio: string | null;
  contrato_fim: string | null;
  motivo: string | null;
};

type ImportDuplicateDetail = {
  id: string;
  nome: string;
  tipo: string;
  telefone: string | null;
  cpf: string | null;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  responsavel_tipo: string | null;
  valor_contratacao: number | null;
  is_voluntario: boolean | null;
  contrato_inicio: string | null;
  contrato_fim: string | null;
  importacao_lote_id: string | null;
};

type ImportItem = {
  id: number;
  lote_nome?: string;
  arquivo_nome?: string;
  data_tentativa?: string;
  responsavel_tentativa_id?: string | null;
  responsavel_tentativa_nome?: string | null;
  responsavel_tentativa_tipo?: string | null;
  numero_linha: number;
  nome: string | null;
  cpf_normalizado: string | null;
  telefone_normalizado: string | null;
  classificacao: string;
  motivo: string | null;
  valor_aplicado: number;
  pessoa_existente_id: string | null;
  duplicado: ImportDuplicateDetail | null;
};

type ImportLot = {
  id: string;
  nome: string;
  arquivo_nome: string;
  valor_unitario: number;
  status: string;
  total_linhas: number;
  total_elegiveis: number;
  total_duplicados: number;
  total_invalidos: number;
  custo_bruto: number;
  custo_previsto: number;
  custo_confirmado: number;
  created_at: string;
};

type Analysis = { lote: ImportLot; itens: ImportItem[] };
type DuplicatePerson = {
  id: string;
  nome: string;
  tipo: string;
  telefone: string | null;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  responsavel_tipo: string | null;
  valor_contratacao: number | null;
  is_voluntario: boolean | null;
  contrato_inicio: string | null;
  contrato_fim: string | null;
  importacao_lote_id: string | null;
  importacao_lote_nome: string | null;
  contrato_ativo: boolean;
};
type DuplicateGroup = {
  tipo: "telefone" | "cpf";
  chave: string;
  cadastros: DuplicatePerson[];
};
type DuplicateFolder = {
  key: string;
  name: string;
  role: string;
  groups: DuplicateGroup[];
};
type Parent = {
  id: string;
  nome: string;
  tipo: string;
  escopo: "campo_grande" | "interior";
  regiao: string | null;
  cidade: string | null;
};
type SheetRow = Record<string, unknown>;

// As tabelas/RPCs passam a integrar os tipos gerados depois que a migration for aplicada.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error
    ? error.message
    : typeof error === "object" && error !== null && "message" in error
      ? String(error.message)
      : fallback;
const money = (value: number) =>
  Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const norm = (value: unknown) => String(value ?? "").trim();
const key = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const roleLabel = (role: string | null) =>
  role === "coordenador" ? "Coordenador" : role === "lider" ? "Líder" : "Sem responsável";
const duplicateOwnerKey = (person: DuplicatePerson) => person.responsavel_id || "sem-responsavel";
const duplicateOwnerLabel = (person: DuplicatePerson) =>
  person.responsavel_nome
    ? `${person.responsavel_nome} (${roleLabel(person.responsavel_tipo).toLowerCase()})`
    : "sem responsável";

const aliases: Record<string, string[]> = {
  nome: ["nome", "nomecompleto", "cabo", "caboseleitorais"],
  cpf: ["cpf", "documento"],
  telefone: ["telefone", "celular", "whatsapp", "fone"],
  endereco: ["endereco", "logradouro"],
  bairro: ["bairro"],
  cidade: ["cidade", "municipio"],
  regiao: ["regiao", "regional"],
};

function normalizeRows(rows: SheetRow[]) {
  return rows
    .map((row) => {
      const indexed = Object.fromEntries(
        Object.entries(row).map(([header, value]) => [key(header), value]),
      );
      const get = (field: string) =>
        aliases[field].map((alias) => indexed[alias]).find((value) => value !== undefined);
      return {
        nome: norm(get("nome")),
        cpf: digits(get("cpf")),
        telefone: digits(get("telefone")),
        endereco: norm(get("endereco")),
        bairro: norm(get("bairro")),
        cidade: norm(get("cidade")),
        regiao: key(norm(get("regiao"))).replace("regiao", ""),
      };
    })
    .filter((row) => Object.values(row).some(Boolean));
}

const classificationLabel: Record<string, string> = {
  elegivel: "Elegível",
  cadastro_sem_contrato: "Cadastro reaproveitado",
  confirmado: "Confirmado",
  duplicado_contrato_ativo: "Contrato ativo",
  duplicado_no_arquivo: "Repetido na planilha",
  conflito_identidade: "Conflito de identidade",
  dados_invalidos: "Dados inválidos",
};

export default function EleicaoCabosImportacaoPanel({
  clientId,
  onChanged,
}: {
  clientId: string;
  onChanged: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [parents, setParents] = useState<Parent[]>([]);
  const [history, setHistory] = useState<ImportLot[]>([]);
  const [databaseDuplicates, setDatabaseDuplicates] = useState<DuplicateGroup[]>([]);
  const [duplicateCases, setDuplicateCases] = useState<DuplicateCase[]>([]);
  const [selectedCaseIds, setSelectedCaseIds] = useState<Set<number>>(new Set());
  const [auditItems, setAuditItems] = useState<ImportItem[]>([]);
  const [auditLot, setAuditLot] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [start, setStart] = useState(format(new Date(), "yyyy-MM-dd"));
  const [end, setEnd] = useState("");
  const [parentId, setParentId] = useState("");

  const loadBase = async () => {
    await db.rpc("eleicao_cabo_import_limpar_rascunhos", { p_client_id: clientId });
    const [parentResult, lotsResult, duplicatesResult, casesResult] = await Promise.all([
      db
        .from("eleicao_pessoas")
        .select("id,nome,tipo,escopo,regiao,cidade")
        .eq("client_id", clientId)
        .is("arquivado_em", null)
        .in("tipo", ["coordenador", "lider"])
        .order("nome"),
      db
        .from("eleicao_cabo_import_lotes")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(100),
      db.rpc("eleicao_auditar_duplicidades", { p_client_id: clientId }),
      db.rpc("eleicao_casos_duplicados_ativos", { p_client_id: clientId }),
    ]);
    if (!parentResult.error) setParents(parentResult.data || []);
    if (!lotsResult.error) setHistory(lotsResult.data || []);
    if (!duplicatesResult.error)
      setDatabaseDuplicates(Array.isArray(duplicatesResult.data) ? duplicatesResult.data : []);
    if (!casesResult.error)
      setDuplicateCases(Array.isArray(casesResult.data) ? casesResult.data : []);
  };

  useEffect(() => {
    void loadBase();
    // loadBase depende apenas do clientId recebido pelo painel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const totals = analysis?.lote;
  const selectedParent = useMemo(
    () => parents.find((parent) => parent.id === parentId) || null,
    [parentId, parents],
  );
  const exceptions = useMemo(
    () =>
      analysis?.itens.filter(
        (item) => !["elegivel", "cadastro_sem_contrato", "confirmado"].includes(item.classificacao),
      ) || [],
    [analysis],
  );
  const activeContractDuplicates = useMemo(
    () =>
      databaseDuplicates
        .map((group) => ({
          ...group,
          cadastros: group.cadastros.filter((person) => person.contrato_ativo),
        }))
        .filter((group) => group.cadastros.length > 1),
    [databaseDuplicates],
  );
  const contractsAtRisk = useMemo(() => {
    const people = new Map<string, DuplicatePerson>();
    for (const group of activeContractDuplicates) {
      for (const person of group.cadastros) people.set(person.id, person);
    }
    return Array.from(people.values());
  }, [activeContractDuplicates]);
  const riskValue = useMemo(
    () =>
      contractsAtRisk.reduce((total, person) => total + Number(person.valor_contratacao || 0), 0),
    [contractsAtRisk],
  );
  const activeHistory = useMemo(
    () => history.filter((lot) => lot.status === "confirmado"),
    [history],
  );
  const canceledHistory = useMemo(
    () => history.filter((lot) => lot.status === "cancelado"),
    [history],
  );
  const selectedCases = useMemo(
    () => duplicateCases.filter((item) => selectedCaseIds.has(item.id)),
    [duplicateCases, selectedCaseIds],
  );
  const toggleCase = (id: number) =>
    setSelectedCaseIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const duplicateFolders = useMemo(() => {
    const folders = new Map<string, DuplicateFolder>();
    for (const group of activeContractDuplicates) {
      const owners = new Map<string, { name: string; role: string }>();
      for (const person of group.cadastros) {
        const ownerId = duplicateOwnerKey(person);
        owners.set(ownerId, {
          name: person.responsavel_nome || "Sem responsável",
          role: person.responsavel_tipo || "",
        });
      }
      for (const [ownerId, owner] of owners) {
        const folder = folders.get(ownerId) || {
          key: ownerId,
          name: owner.name,
          role: owner.role,
          groups: [],
        };
        folder.groups.push(group);
        folders.set(ownerId, folder);
      }
    }
    return Array.from(folders.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [activeContractDuplicates]);

  const readFile = async (selected: File) => {
    setBusy(true);
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await selected.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const parsed = normalizeRows(
        XLSX.utils.sheet_to_json<SheetRow>(sheet, { defval: "", raw: false }),
      );
      if (!parsed.length)
        throw new Error("A planilha está vazia ou não possui cabeçalhos reconhecidos.");
      if (parsed.length > 10000) throw new Error("Cada importação aceita no máximo 10.000 linhas.");
      setFile(selected);
      setRows(parsed);
      setName(selected.name.replace(/\.[^.]+$/, ""));
      setAnalysis(null);
      toast.success(`${parsed.length} linhas lidas da planilha.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível ler a planilha.");
    } finally {
      setBusy(false);
    }
  };

  const analyzeParams = () => ({
    p_client_id: clientId,
    p_nome: name,
    p_arquivo_nome: file?.name || "planilha.xlsx",
    p_valor_unitario: Number(value.replace(/\./g, "").replace(",", ".")),
    p_data_inicio: start,
    p_data_fim: end || null,
    p_parent_id: selectedParent?.id || null,
    p_escopo: selectedParent?.escopo || null,
    p_regiao: selectedParent?.escopo === "campo_grande" ? selectedParent.regiao : null,
    p_cidade: selectedParent?.escopo === "interior" ? selectedParent.cidade : null,
    p_linhas: rows,
  });

  const analyze = async () => {
    const unitValue = Number(value.replace(/\./g, "").replace(",", "."));
    if (!file || !rows.length) return toast.error("Selecione uma planilha.");
    if (!unitValue || unitValue <= 0)
      return toast.error("Informe um valor por cabo maior que zero.");
    if (!selectedParent) return toast.error("Selecione o líder ou coordenador responsável.");
    if (selectedParent.escopo === "campo_grande" && !selectedParent.regiao)
      return toast.error("O responsável selecionado não possui região cadastrada.");
    if (selectedParent.escopo === "interior" && !selectedParent.cidade)
      return toast.error("O responsável selecionado não possui cidade cadastrada.");
    setBusy(true);
    try {
      const { data, error } = await db.rpc("eleicao_cabo_import_analisar", analyzeParams());
      if (error) throw error;
      const preview = data as Analysis;
      const { error: discardError } = await db.rpc("eleicao_cabo_import_descartar", {
        p_lote_id: preview.lote.id,
      });
      if (discardError) throw discardError;
      setAnalysis(preview);
      toast.success("Prévia concluída. Nada foi salvo; confirme para realizar a importação.");
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Falha ao analisar a planilha."));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!analysis) return;
    setBusy(true);
    let pendingLotId: string | null = null;
    try {
      const { data: analyzedData, error: analyzeError } = await db.rpc(
        "eleicao_cabo_import_analisar",
        analyzeParams(),
      );
      if (analyzeError) throw analyzeError;
      pendingLotId = (analyzedData as Analysis).lote.id;

      const { data, error } = await db.rpc("eleicao_cabo_import_confirmar", {
        p_lote_id: pendingLotId,
      });
      if (error) throw error;
      pendingLotId = null;
      toast.success(`${data.confirmados} cabos confirmados — ${money(data.custo_confirmado)}.`);
      setAnalysis(null);
      setFile(null);
      setRows([]);
      setName("");
      setValue("");
      setParentId("");
      await loadBase();
      onChanged();
    } catch (error: unknown) {
      if (pendingLotId) {
        await db.rpc("eleicao_cabo_import_descartar", { p_lote_id: pendingLotId });
      }
      toast.error(errorMessage(error, "Falha ao confirmar a importação."));
    } finally {
      setBusy(false);
    }
  };

  const loadAudit = async (lotId: string) => {
    setBusy(true);
    try {
      const { data, error } = await db.rpc("eleicao_cabo_import_ocorrencias", {
        p_lote_id: lotId,
      });
      if (error) throw error;
      setAuditItems(Array.isArray(data) ? (data as ImportItem[]) : []);
      setAuditLot(lotId);
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Falha ao abrir a auditoria."));
    } finally {
      setBusy(false);
    }
  };

  const resolveActiveDuplicate = async (group: DuplicateGroup, keep: DuplicatePerson) => {
    const archive = group.cadastros.filter((person) => person.id !== keep.id);
    if (
      !window.confirm(
        `Manter o contrato de ${keep.nome}, vinculado a ${duplicateOwnerLabel(keep)}, e arquivar ${archive.length} cadastro(s) duplicado(s)? A correção fica registrada e é reversível.`,
      )
    )
      return;
    setBusy(true);
    try {
      const { data, error } = await db.rpc("eleicao_resolver_contratos_duplicados", {
        p_client_id: clientId,
        p_manter_id: keep.id,
        p_arquivar_ids: archive.map((person) => person.id),
      });
      if (error) throw error;
      await loadBase();
      onChanged();
      toast.success(
        `${Number(data?.arquivados || archive.length)} contrato(s) duplicado(s) arquivado(s).`,
      );
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Falha ao corrigir os contratos duplicados."));
    } finally {
      setBusy(false);
    }
  };

  const exportExceptions = async () => {
    if (!exceptions.length) return;
    const XLSX = await import("xlsx");
    const worksheet = XLSX.utils.json_to_sheet(
      exceptions.map((item) => ({
        linha: item.numero_linha,
        nome: item.nome,
        cpf: item.cpf_normalizado,
        telefone: item.telefone_normalizado,
        situacao: classificationLabel[item.classificacao],
        motivo: item.motivo,
      })),
    );
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Duplicados e inválidos");
    XLSX.writeFile(workbook, `auditoria-${analysis?.lote.nome || "cabos"}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Importar cabos eleitorais</CardTitle>
          <CardDescription>
            Envie Excel ou CSV, defina o valor e confira duplicados antes de alterar a previsão de
            custos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1">
              <Label>Nome da importação</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Cabos Região Lagoa"
              />
            </div>
            <div className="space-y-1">
              <Label>Valor por cabo</Label>
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                inputMode="decimal"
                placeholder="500,00"
              />
            </div>
            <div className="space-y-1">
              <Label>Início</Label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Término (opcional)</Label>
              <Input type="date" min={start} value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Responsável padrão</Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um líder ou coordenador" />
                </SelectTrigger>
                <SelectContent>
                  {parents.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome} · {p.tipo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Local herdado do responsável</Label>
              <div className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm">
                {selectedParent
                  ? selectedParent.escopo === "interior"
                    ? selectedParent.cidade || "Cidade não cadastrada"
                    : `Campo Grande · ${selectedParent.regiao || "região não cadastrada"}`
                  : "Selecione o responsável"}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Planilha</Label>
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => e.target.files?.[0] && void readFile(e.target.files[0])}
              />
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={() => inputRef.current?.click()}
                disabled={busy}
              >
                <Upload className="mr-2 h-4 w-4" />
                {file ? file.name : "Selecionar Excel ou CSV"}
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>
              Colunas reconhecidas: nome, CPF, telefone/celular/WhatsApp, endereço e bairro. Escopo,
              região ou cidade serão herdados automaticamente do responsável.
            </span>
            <Button onClick={analyze} disabled={busy || !rows.length}>
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="mr-2 h-4 w-4" />
              )}
              Analisar {rows.length || ""} registros
            </Button>
          </div>
        </CardContent>
      </Card>

      {totals && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle>Prévia da importação</CardTitle>
            <CardDescription>Nenhum cadastro ou valor foi confirmado ainda.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
              {[
                ["Linhas", totals.total_linhas],
                ["Elegíveis", totals.total_elegiveis],
                ["Duplicados", totals.total_duplicados],
                ["Inválidos", totals.total_invalidos],
              ].map(([label, n]) => (
                <div key={String(label)} className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-2xl font-bold">{n}</p>
                </div>
              ))}
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Custo bruto</p>
                <p className="font-bold">{money(totals.custo_bruto)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Excluído</p>
                <p className="font-bold text-destructive">
                  {money(totals.custo_bruto - totals.custo_previsto)}
                </p>
              </div>
              <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 dark:bg-emerald-950/20">
                <p className="text-xs text-muted-foreground">Previsão final</p>
                <p className="font-bold text-emerald-700">{money(totals.custo_previsto)}</p>
              </div>
            </div>
            <Tabs defaultValue="aptos">
              <TabsList>
                <TabsTrigger value="aptos">Aptos ({totals.total_elegiveis})</TabsTrigger>
                <TabsTrigger value="exceptions">
                  Duplicados e inválidos ({exceptions.length})
                </TabsTrigger>
              </TabsList>
              <TabsContent value="aptos">
                <ItemTable
                  items={analysis!.itens.filter((i) =>
                    ["elegivel", "cadastro_sem_contrato"].includes(i.classificacao),
                  )}
                />
              </TabsContent>
              <TabsContent value="exceptions">
                <div className="mb-2 flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={exportExceptions}
                    disabled={!exceptions.length}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Exportar auditoria
                  </Button>
                </div>
                <ItemTable items={exceptions} />
              </TabsContent>
            </Tabs>
            <div className="flex justify-end">
              <Button
                onClick={confirm}
                disabled={
                  busy ||
                  (!totals.total_elegiveis &&
                    !analysis.itens.some(
                      (item) => item.classificacao === "duplicado_contrato_ativo",
                    ))
                }
              >
                {busy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                {totals.total_elegiveis
                  ? `Confirmar ${totals.total_elegiveis} contratações — ${money(totals.custo_previsto)}`
                  : "Finalizar auditoria sem contratações"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-amber-300">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Central de duplicados recusados</CardTitle>
              <CardDescription>
                Somente tentativas recusadas porque o cabo já possuía contrato ativo.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!duplicateCases.length}
                onClick={() =>
                  setSelectedCaseIds(
                    selectedCaseIds.size === duplicateCases.length
                      ? new Set()
                      : new Set(duplicateCases.map((item) => item.id)),
                  )
                }
              >
                {selectedCaseIds.size === duplicateCases.length
                  ? "Limpar seleção"
                  : "Selecionar todos"}
              </Button>
              <Button
                size="sm"
                disabled={!selectedCases.length}
                onClick={() => void gerarRelatorioCasosRecusadosPdf(selectedCases)}
              >
                <Download className="mr-2 h-4 w-4" />
                Gerar relatório ({selectedCases.length})
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!duplicateCases.length ? (
            <div className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              Nenhuma tentativa recusada por contrato ativo.
            </div>
          ) : (
            <div className="space-y-2">
              {duplicateCases.map((item) => (
                <div key={item.id} className="flex items-start gap-3 rounded-lg border p-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={selectedCaseIds.has(item.id)}
                    onChange={() => toggleCase(item.id)}
                    aria-label={`Selecionar caso de ${item.nome_tentativa || "cabo"}`}
                  />
                  <details className="min-w-0 flex-1">
                    <summary className="cursor-pointer list-none">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold">{item.nome_tentativa || "Sem nome"}</p>
                          <p className="text-xs text-muted-foreground">
                            Tentativa para {item.responsavel_tentativa_nome || "sem responsável"} •{" "}
                            {format(new Date(item.data_tentativa), "dd/MM/yyyy HH:mm")}
                          </p>
                        </div>
                        <Badge variant="destructive">Contrato ativo encontrado</Badge>
                      </div>
                    </summary>
                    <div className="mt-3 grid gap-3 border-t pt-3 md:grid-cols-2">
                      <div className="rounded-md bg-muted/40 p-3 text-sm">
                        <p className="font-medium">Tentativa recusada</p>
                        <p>Líder/coordenador: {item.responsavel_tentativa_nome || "—"}</p>
                        <p>Telefone informado: {item.telefone_tentativa || "—"}</p>
                        <p>Arquivo: {item.arquivo_nome}</p>
                        <p>Linha: {item.numero_linha + 1}</p>
                      </div>
                      <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm">
                        <p className="font-medium">Onde já está contratado</p>
                        <p>{item.cadastro_existente_nome}</p>
                        <p>
                          Responsável: {item.responsavel_existente_nome || "sem responsável"}
                          {item.responsavel_existente_tipo
                            ? ` (${roleLabel(item.responsavel_existente_tipo).toLowerCase()})`
                            : ""}
                        </p>
                        <p>Contrato: {money(item.valor_contratacao)}</p>
                        <p>
                          Período:{" "}
                          {item.contrato_inicio
                            ? format(new Date(`${item.contrato_inicio}T12:00:00`), "dd/MM/yyyy")
                            : "não informado"}
                          {" até "}
                          {item.contrato_fim
                            ? format(new Date(`${item.contrato_fim}T12:00:00`), "dd/MM/yyyy")
                            : "sem término"}
                        </p>
                      </div>
                    </div>
                  </details>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card
        className={activeContractDuplicates.length ? "border-destructive/60" : "border-emerald-300"}
      >
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Auditoria financeira — contratos ativos duplicados</CardTitle>
            <div className="flex items-center gap-2">
              {!!activeContractDuplicates.length && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void gerarRelatorioDuplicidadesPdf(activeContractDuplicates)}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Baixar relatório completo
                </Button>
              )}
              <Badge variant={activeContractDuplicates.length ? "destructive" : "outline"}>
                {activeContractDuplicates.length} conflito(s) financeiro(s)
              </Badge>
            </div>
          </div>
          <CardDescription>
            Varredura de ponta a ponta por telefone e CPF. Mostra somente os casos em que dois ou
            mais cadastros da mesma pessoa possuem contrato ativo simultaneamente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!activeContractDuplicates.length ? (
            <div className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              Nenhum contrato ativo duplicado encontrado. Existem {databaseDuplicates.length}{" "}
              conflito(s) cadastral(is) sem risco de pagamento duplo.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border bg-destructive/5 p-3">
                  <p className="text-xs text-muted-foreground">Conflitos financeiros</p>
                  <p className="text-xl font-bold text-destructive">
                    {activeContractDuplicates.length}
                  </p>
                </div>
                <div className="rounded-lg border bg-destructive/5 p-3">
                  <p className="text-xs text-muted-foreground">Contratos sob revisão</p>
                  <p className="text-xl font-bold text-destructive">{contractsAtRisk.length}</p>
                </div>
                <div className="rounded-lg border bg-destructive/5 p-3">
                  <p className="text-xs text-muted-foreground">Valor total sob risco</p>
                  <p className="text-xl font-bold text-destructive">{money(riskValue)}</p>
                </div>
              </div>
              {duplicateFolders.map((folder) => (
                <details key={folder.key} className="group rounded-lg border bg-background">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40">
                    <span className="flex min-w-0 items-center gap-2 font-medium">
                      <Folder className="h-5 w-5 shrink-0 text-amber-500" />
                      <span className="truncate">{folder.name}</span>
                      <Badge variant="outline">{roleLabel(folder.role)}</Badge>
                    </span>
                    <Badge variant="secondary">{folder.groups.length} conflito(s)</Badge>
                  </summary>
                  <div className="max-h-[420px] space-y-3 overflow-y-auto border-t p-3">
                    <p className="text-xs text-muted-foreground">
                      Duplicidades dos cadastros que pertencem a {folder.name} (
                      {roleLabel(folder.role).toLowerCase()}).
                    </p>
                    {folder.groups.map((group) => (
                      <div
                        key={`${folder.key}:${group.tipo}:${group.chave}`}
                        className="rounded-lg border p-3"
                      >
                        <p className="mb-2 text-sm font-semibold">
                          Mesmo {group.tipo}:{" "}
                          {group.tipo === "cpf" ? `***${group.chave.slice(-4)}` : group.chave}
                        </p>
                        <div className="mb-3 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs">
                          <strong>Duplicado também encontrado em:</strong>{" "}
                          {Array.from(
                            new Set(
                              group.cadastros
                                .filter((person) => duplicateOwnerKey(person) !== folder.key)
                                .map(duplicateOwnerLabel),
                            ),
                          ).join(", ") || "na própria equipe"}
                        </div>
                        <div className="space-y-2">
                          {group.cadastros.map((person) => (
                            <div
                              key={person.id}
                              className="rounded-md bg-muted/40 px-3 py-2 text-sm"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <strong>{person.nome}</strong>
                                <Badge variant="outline">{person.tipo}</Badge>
                                <span className="text-xs text-muted-foreground">
                                  {person.is_voluntario
                                    ? "Voluntário"
                                    : Number(person.valor_contratacao || 0) > 0
                                      ? `Contrato de ${money(person.valor_contratacao)}`
                                      : "Sem contrato"}
                                </span>
                                <Badge
                                  variant={
                                    duplicateOwnerKey(person) === folder.key
                                      ? "secondary"
                                      : "destructive"
                                  }
                                >
                                  {duplicateOwnerKey(person) === folder.key
                                    ? "Cadastro desta equipe"
                                    : "Duplicado em outra equipe"}
                                </Badge>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Localização do cadastro: {duplicateOwnerLabel(person)}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Contrato: {money(person.valor_contratacao || 0)}
                                {person.contrato_inicio
                                  ? ` • início ${format(new Date(`${person.contrato_inicio}T12:00:00`), "dd/MM/yyyy")}`
                                  : ""}
                                {person.contrato_fim
                                  ? ` • término ${format(new Date(`${person.contrato_fim}T12:00:00`), "dd/MM/yyyy")}`
                                  : " • sem término"}
                                {person.importacao_lote_nome
                                  ? ` • lote ${person.importacao_lote_nome}`
                                  : " • cadastro manual"}
                              </p>
                              {group.cadastros
                                .filter((other) => other.id !== person.id)
                                .every((other) => other.tipo === "cabo") && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="mt-2"
                                  disabled={busy}
                                  onClick={() => void resolveActiveDuplicate(group, person)}
                                >
                                  Manter este contrato e arquivar os duplicados
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico</CardTitle>
          <CardDescription>
            Lotes analisados e confirmados. Use “Ver ocorrências” para abrir os duplicados e
            inválidos encontrados em cada planilha.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Lote</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Linhas</TableHead>
                <TableHead>Duplicados</TableHead>
                <TableHead>Inválidos</TableHead>
                <TableHead className="text-right">Custo</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeHistory.map((lot) => (
                <TableRow key={lot.id}>
                  <TableCell>{format(new Date(lot.created_at), "dd/MM/yyyy HH:mm")}</TableCell>
                  <TableCell>
                    <p className="font-medium">{lot.nome}</p>
                    <p className="text-xs text-muted-foreground">{lot.arquivo_nome}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{lot.status}</Badge>
                  </TableCell>
                  <TableCell>{lot.total_linhas}</TableCell>
                  <TableCell>{lot.total_duplicados}</TableCell>
                  <TableCell>{lot.total_invalidos}</TableCell>
                  <TableCell className="text-right">
                    {money(
                      lot.status === "confirmado"
                        ? lot.custo_confirmado
                        : lot.status === "cancelado"
                          ? 0
                          : lot.custo_previsto,
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!lot.total_duplicados && !lot.total_invalidos}
                        onClick={() => void loadAudit(lot.id)}
                      >
                        Ver ocorrências
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!activeHistory.length && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    Nenhuma importação realizada.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {!!canceledHistory.length && (
            <details className="rounded-lg border border-dashed bg-muted/20">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                Análises canceladas ({canceledHistory.length}) — sem alteração de cadastros ou
                custos
              </summary>
              <div className="space-y-2 border-t px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  Estes arquivos foram apenas analisados e depois cancelados. Não criaram contratos
                  e não entram na auditoria financeira.
                </p>
                {canceledHistory.map((lot) => (
                  <div
                    key={lot.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium">{lot.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(lot.created_at), "dd/MM/yyyy HH:mm")} • {lot.arquivo_nome}{" "}
                        • {lot.total_linhas} linhas
                      </p>
                    </div>
                    <Badge variant="outline">Cancelado — R$ 0,00</Badge>
                  </div>
                ))}
              </div>
            </details>
          )}
          {auditLot && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="font-medium">Duplicados e inválidos do lote</p>
                <div className="flex items-center gap-2">
                  {!!auditItems.length && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void gerarRelatorioOcorrenciasLotePdf(
                          history.find((lot) => lot.id === auditLot)?.nome || "Importação",
                          auditItems,
                        )
                      }
                    >
                      <Download className="mr-2 h-4 w-4" />
                      {auditItems[0]?.responsavel_tentativa_nome
                        ? `Baixar relatório para ${auditItems[0].responsavel_tentativa_nome}`
                        : "Baixar relatório deste lote"}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setAuditLot(null);
                      setAuditItems([]);
                    }}
                  >
                    Fechar
                  </Button>
                </div>
              </div>
              <ItemTable items={auditItems} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ItemTable({ items }: { items: ImportItem[] }) {
  const visibleItems = items.slice(0, 1000);
  return (
    <div className="space-y-2">
      {items.length > visibleItems.length && (
        <p className="text-xs text-muted-foreground">
          Exibindo 1.000 de {items.length.toLocaleString("pt-BR")} registros para manter a tela
          rápida. Todos foram processados e continuam disponíveis na exportação.
        </p>
      )}
      <div className="max-h-[420px] overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Linha</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>CPF</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead>Onde está o contrato ativo</TableHead>
              <TableHead className="text-right">Valor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleItems.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.numero_linha + 1}</TableCell>
                <TableCell>{item.nome || "—"}</TableCell>
                <TableCell>
                  {item.cpf_normalizado
                    ? `***.***.${item.cpf_normalizado.slice(-5, -2)}-${item.cpf_normalizado.slice(-2)}`
                    : "—"}
                </TableCell>
                <TableCell>{item.telefone_normalizado || "—"}</TableCell>
                <TableCell>
                  <Badge variant={item.classificacao === "confirmado" ? "default" : "outline"}>
                    {classificationLabel[item.classificacao] || item.classificacao}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-xs text-xs">{item.motivo}</TableCell>
                <TableCell className="min-w-[280px] text-xs">
                  {item.duplicado ? (
                    <div className="space-y-1 rounded-md border border-destructive/20 bg-destructive/5 p-2">
                      <p>
                        <strong>{item.duplicado.nome}</strong> ({item.duplicado.tipo})
                      </p>
                      <p>
                        Responsável: {item.duplicado.responsavel_nome || "sem responsável"}
                        {item.duplicado.responsavel_tipo
                          ? ` (${roleLabel(item.duplicado.responsavel_tipo).toLowerCase()})`
                          : ""}
                      </p>
                      <p>
                        Contrato: {money(item.duplicado.valor_contratacao || 0)}
                        {item.duplicado.contrato_inicio
                          ? ` • início ${format(new Date(`${item.duplicado.contrato_inicio}T12:00:00`), "dd/MM/yyyy")}`
                          : ""}
                        {item.duplicado.contrato_fim
                          ? ` • término ${format(new Date(`${item.duplicado.contrato_fim}T12:00:00`), "dd/MM/yyyy")}`
                          : " • sem término"}
                      </p>
                      <p>Telefone cadastrado: {item.duplicado.telefone || "—"}</p>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">
                      Não se aplica ou duplicado somente dentro da planilha.
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">{money(item.valor_aplicado)}</TableCell>
              </TableRow>
            ))}
            {!items.length && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  <AlertTriangle className="mx-auto mb-2 h-5 w-5" />
                  Nenhum registro nesta categoria.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
