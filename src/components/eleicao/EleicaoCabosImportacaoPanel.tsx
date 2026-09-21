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
import { gerarRelatorioDuplicidadesPdf } from "@/lib/eleicao-duplicidades-pdf";

type ImportItem = {
  id: number;
  numero_linha: number;
  nome: string | null;
  cpf_normalizado: string | null;
  telefone_normalizado: string | null;
  classificacao: string;
  motivo: string | null;
  valor_aplicado: number;
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
  responsavel_nome: string | null;
  valor_contratacao: number | null;
  is_voluntario: boolean | null;
  contrato_fim: string | null;
};
type DuplicateGroup = {
  tipo: "telefone" | "cpf";
  chave: string;
  cadastros: DuplicatePerson[];
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
    const [parentResult, lotsResult, duplicatesResult] = await Promise.all([
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
        .limit(30),
      db.rpc("eleicao_auditar_duplicidades", { p_client_id: clientId }),
    ]);
    if (!parentResult.error) setParents(parentResult.data || []);
    if (!lotsResult.error) setHistory(lotsResult.data || []);
    if (!duplicatesResult.error)
      setDatabaseDuplicates(Array.isArray(duplicatesResult.data) ? duplicatesResult.data : []);
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
  const duplicateFolders = useMemo(() => {
    const folders = new Map<string, DuplicateGroup[]>();
    for (const group of databaseDuplicates) {
      const names = new Set(
        group.cadastros.map(
          (person) =>
            person.responsavel_nome ||
            (person.tipo === "coordenador" || person.tipo === "lider"
              ? person.nome
              : "Sem responsável"),
        ),
      );
      for (const folderName of names) {
        const groups = folders.get(folderName) || [];
        groups.push(group);
        folders.set(folderName, groups);
      }
    }
    return Array.from(folders.entries()).sort(([a], [b]) => a.localeCompare(b, "pt-BR"));
  }, [databaseDuplicates]);

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
      const { data, error } = await db.rpc("eleicao_cabo_import_analisar", {
        p_client_id: clientId,
        p_nome: name,
        p_arquivo_nome: file.name,
        p_valor_unitario: unitValue,
        p_data_inicio: start,
        p_data_fim: end || null,
        p_parent_id: selectedParent.id,
        p_escopo: selectedParent.escopo,
        p_regiao: selectedParent.escopo === "campo_grande" ? selectedParent.regiao : null,
        p_cidade: selectedParent.escopo === "interior" ? selectedParent.cidade : null,
        p_linhas: rows,
      });
      if (error) throw error;
      setAnalysis(data as Analysis);
      await loadBase();
      toast.success("Análise concluída. Confira a previsão antes de confirmar.");
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Falha ao analisar a planilha."));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!analysis) return;
    setBusy(true);
    try {
      const { data, error } = await db.rpc("eleicao_cabo_import_confirmar", {
        p_lote_id: analysis.lote.id,
      });
      if (error) throw error;
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
      toast.error(errorMessage(error, "Falha ao confirmar a importação."));
    } finally {
      setBusy(false);
    }
  };

  const loadAudit = async (lotId: string) => {
    setBusy(true);
    try {
      const allItems: ImportItem[] = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await db
          .from("eleicao_cabo_import_itens")
          .select("*")
          .eq("lote_id", lotId)
          .in("classificacao", [
            "duplicado_contrato_ativo",
            "duplicado_no_arquivo",
            "conflito_identidade",
            "dados_invalidos",
          ])
          .order("numero_linha")
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const page = (data || []) as ImportItem[];
        allItems.push(...page);
        if (page.length < pageSize) break;
      }
      setAuditItems(allItems);
      setAuditLot(lotId);
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Falha ao abrir a auditoria."));
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
              <Button onClick={confirm} disabled={busy || !totals.total_elegiveis}>
                {busy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                Confirmar {totals.total_elegiveis} contratações — {money(totals.custo_previsto)}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className={databaseDuplicates.length ? "border-destructive/40" : "border-emerald-300"}>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Duplicidades na base</CardTitle>
            <div className="flex items-center gap-2">
              {!!databaseDuplicates.length && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void gerarRelatorioDuplicidadesPdf(databaseDuplicates)}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Baixar PDF detalhado
                </Button>
              )}
              <Badge variant={databaseDuplicates.length ? "destructive" : "outline"}>
                {databaseDuplicates.length} conflito(s)
              </Badge>
            </div>
          </div>
          <CardDescription>
            Varredura de todos os cadastros ativos do cliente por telefone normalizado e CPF,
            independentemente do líder ou coordenador responsável.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!databaseDuplicates.length ? (
            <div className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              Nenhuma duplicidade ativa encontrada na base.
            </div>
          ) : (
            <div className="space-y-2">
              {duplicateFolders.map(([folderName, groups]) => (
                <details key={folderName} className="group rounded-lg border bg-background">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40">
                    <span className="flex min-w-0 items-center gap-2 font-medium">
                      <Folder className="h-5 w-5 shrink-0 text-amber-500" />
                      <span className="truncate">{folderName}</span>
                    </span>
                    <Badge variant="secondary">{groups.length} conflito(s)</Badge>
                  </summary>
                  <div className="max-h-[420px] space-y-3 overflow-y-auto border-t p-3">
                    {groups.map((group) => (
                      <div
                        key={`${folderName}:${group.tipo}:${group.chave}`}
                        className="rounded-lg border p-3"
                      >
                        <p className="mb-2 text-sm font-semibold">
                          Mesmo {group.tipo}:{" "}
                          {group.tipo === "cpf" ? `***${group.chave.slice(-4)}` : group.chave}
                        </p>
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
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Responsável: {person.responsavel_nome || "sem responsável"}
                              </p>
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
              {history.map((lot) => (
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
                    {money(lot.status === "confirmado" ? lot.custo_confirmado : lot.custo_previsto)}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!lot.total_duplicados && !lot.total_invalidos}
                      onClick={() => void loadAudit(lot.id)}
                    >
                      Ver ocorrências
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!history.length && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    Nenhuma importação realizada.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {auditLot && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="font-medium">Duplicados e inválidos do lote</p>
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
                <TableCell className="text-right">{money(item.valor_aplicado)}</TableCell>
              </TableRow>
            ))}
            {!items.length && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
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
