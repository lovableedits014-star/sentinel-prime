import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
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
type Parent = { id: string; nome: string; tipo: string };
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
  const [auditItems, setAuditItems] = useState<ImportItem[]>([]);
  const [auditLot, setAuditLot] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [start, setStart] = useState(format(new Date(), "yyyy-MM-dd"));
  const [end, setEnd] = useState("");
  const [parentId, setParentId] = useState("none");
  const [scope, setScope] = useState("campo_grande");
  const [region, setRegion] = useState("centro");
  const [city, setCity] = useState("");

  const loadBase = async () => {
    const [parentResult, lotsResult] = await Promise.all([
      db
        .from("eleicao_pessoas")
        .select("id,nome,tipo")
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
    ]);
    if (!parentResult.error) setParents(parentResult.data || []);
    if (!lotsResult.error) setHistory(lotsResult.data || []);
  };

  useEffect(() => {
    void loadBase();
    // loadBase depende apenas do clientId recebido pelo painel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const totals = analysis?.lote;
  const exceptions = useMemo(
    () =>
      analysis?.itens.filter(
        (item) => !["elegivel", "cadastro_sem_contrato", "confirmado"].includes(item.classificacao),
      ) || [],
    [analysis],
  );

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
    if (scope === "interior" && !city.trim()) return toast.error("Informe a cidade padrão.");
    setBusy(true);
    try {
      const { data, error } = await db.rpc("eleicao_cabo_import_analisar", {
        p_client_id: clientId,
        p_nome: name,
        p_arquivo_nome: file.name,
        p_valor_unitario: unitValue,
        p_data_inicio: start,
        p_data_fim: end || null,
        p_parent_id: parentId === "none" ? null : parentId,
        p_escopo: scope,
        p_regiao: scope === "campo_grande" ? region : null,
        p_cidade: scope === "interior" ? city.trim() : null,
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
        .order("numero_linha");
      if (error) throw error;
      setAuditItems(data || []);
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
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem responsável</SelectItem>
                  {parents.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome} · {p.tipo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Escopo</Label>
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="campo_grande">Campo Grande</SelectItem>
                  <SelectItem value="interior">Interior</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {scope === "campo_grande" ? (
              <div className="space-y-1">
                <Label>Região padrão</Label>
                <Select value={region} onValueChange={setRegion}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      "centro",
                      "segredo",
                      "prosa",
                      "bandeira",
                      "anhanduizinho",
                      "lagoa",
                      "moreninha",
                      "imbirussu",
                    ].map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1">
                <Label>Cidade padrão</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
            )}
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
              Colunas reconhecidas: nome, CPF, telefone/celular/WhatsApp, endereço, bairro, cidade e
              região.
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

      <Card>
        <CardHeader>
          <CardTitle>Histórico</CardTitle>
          <CardDescription>
            Lotes analisados e confirmados, inclusive os duplicados identificados.
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
  return (
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
          {items.slice(0, 1000).map((item) => (
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
  );
}
