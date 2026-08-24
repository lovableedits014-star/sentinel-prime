import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, CheckCircle2, Database, FileSpreadsheet, Loader2, Megaphone, Upload, Users2, Vote } from "lucide-react";
import { toast } from "sonner";

type Origem = "csv" | "estrutura" | "indicados_eleicao" | "contratados" | "indicados_contratados";
type Row = Record<string, any>;

const ORIGENS: { key: Origem; label: string; icon: any; desc: string }[] = [
  { key: "csv", label: "Lista externa (Excel / CSV)", icon: FileSpreadsheet, desc: "Suba uma planilha com nome e telefone." },
  { key: "estrutura", label: "Estrutura eleitoral", icon: Users2, desc: "Coordenadores, líderes e cabos com telefone." },
  { key: "indicados_eleicao", label: "Indicados (eleição)", icon: Vote, desc: "Pessoas indicadas pela estrutura." },
  { key: "contratados", label: "Contratados / liderados", icon: Database, desc: "Contratados cadastrados." },
  { key: "indicados_contratados", label: "Indicados dos contratados", icon: Megaphone, desc: "Quem cada contratado indicou." },
];

const NONE = "__none__";
const ALL = "__all__";
const onlyDigits = (s: string) => String(s ?? "").replace(/\D/g, "");
const guessCol = (headers: string[], patterns: string[]): string => {
  for (const h of headers) {
    const low = h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (patterns.some(p => low.includes(p))) return h;
  }
  return "";
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  campanhaId: string;
  campanhaNome: string;
  fonteAnterior?: string | null;
  filtroAnterior?: any;
  operadores: { id: string; nome: string; ativo: boolean }[];
  onChanged: () => void;
}

export default function AdicionarContatosDialog({
  open, onOpenChange, clientId, campanhaId, campanhaNome,
  fonteAnterior, filtroAnterior, operadores, onChanged,
}: Props) {
  const [origem, setOrigem] = useState<Origem>("indicados_eleicao");
  const [cidade, setCidade] = useState("");
  const [bairro, setBairro] = useState("");
  const [tipo, setTipo] = useState(ALL);
  const [indicadorId, setIndicadorId] = useState(ALL);
  const [apenasPendentes, setApenasPendentes] = useState(true);
  const [substituir, setSubstituir] = useState(false);
  const [indicadores, setIndicadores] = useState<{ id: string; nome: string; tipo: string }[]>([]);
  const [designar, setDesignar] = useState<string>(ALL);
  const [busy, setBusy] = useState(false);

  // CSV
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [colNome, setColNome] = useState("");
  const [colTel, setColTel] = useState("");
  const [colCidade, setColCidade] = useState(NONE);
  const [colBairro, setColBairro] = useState(NONE);
  const [parsing, setParsing] = useState(false);

  const [preview, setPreview] = useState<{ total: number; pendentes: number; ja_em_outra_fila: number } | null>(null);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    if (!open) return;
    const f = filtroAnterior || {};
    setOrigem((fonteAnterior as Origem) || "indicados_eleicao");
    setCidade(String(f.cidade || "").replace(/%/g, ""));
    setBairro(String(f.bairro || "").replace(/%/g, ""));
    setTipo(f.tipo ? String(f.tipo) : ALL);
    setIndicadorId(f.indicador_id ? String(f.indicador_id) : ALL);
    setApenasPendentes(f.apenas_pendentes !== false);
    setSubstituir(false);
    setDesignar(ALL);
    setFileName(""); setHeaders([]); setRows([]);
    setColNome(""); setColTel(""); setColCidade(NONE); setColBairro(NONE);
    if (fileRef.current) fileRef.current.value = "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !clientId) return;
    supabase.rpc("tele_list_indicadores" as any, { _client_id: clientId })
      .then(({ data }) => setIndicadores((data as any[]) || []));
  }, [open, clientId]);

  const opsAtivos = useMemo(() => operadores.filter(o => o.ativo), [operadores]);

  const tipoOptions = (): { value: string; label: string }[] => {
    if (origem === "estrutura" || origem === "indicados_eleicao") {
      return [
        { value: "coordenador", label: "Coordenador" },
        { value: "lider", label: "Líder" },
        { value: "cabo", label: "Cabo" },
      ];
    }
    if (origem === "contratados") return [{ value: "lider", label: "Líder" }, { value: "liderado", label: "Liderado" }];
    return [];
  };

  const csvRows = useMemo(() => {
    if (!colNome || !colTel) return [] as { nome: string; telefone: string; cidade?: string; bairro?: string }[];
    const out: { nome: string; telefone: string; cidade?: string; bairro?: string }[] = [];
    for (const r of rows) {
      const nm = String(r[colNome] || "").trim();
      const tel = onlyDigits(String(r[colTel] || ""));
      if (!nm || tel.length < 8) continue;
      out.push({
        nome: nm, telefone: tel,
        cidade: colCidade !== NONE ? String(r[colCidade] || "").trim() || undefined : undefined,
        bairro: colBairro !== NONE ? String(r[colBairro] || "").trim() || undefined : undefined,
      });
    }
    return out;
  }, [rows, colNome, colTel, colCidade, colBairro]);

  const buildFiltros = () => ({
    cidade: cidade.trim(),
    bairro: bairro.trim(),
    tipo: tipo === ALL ? "" : tipo,
    indicador_id: indicadorId === ALL ? "" : indicadorId,
    apenas_pendentes: apenasPendentes,
    substituir,
  });

  const onFile = async (file: File) => {
    setParsing(true);
    try {
      let data: Row[] = [];
      const ext = file.name.toLowerCase().split(".").pop() || "";
      if (ext === "csv" || file.type === "text/csv") {
        const text = await file.text();
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (!lines.length) { toast.warning("Arquivo vazio"); return; }
        const sep = lines[0].includes(";") ? ";" : lines[0].includes("\t") ? "\t" : ",";
        const hs = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ""));
        data = lines.slice(1).map(l => {
          const parts = l.split(sep).map(p => p.trim().replace(/^"|"$/g, ""));
          const row: Row = {};
          hs.forEach((h, i) => { row[h] = parts[i] ?? ""; });
          return row;
        });
        setHeaders(hs);
      } else {
        const XLSX = await import("xlsx");
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        data = XLSX.utils.sheet_to_json<Row>(ws, { defval: "", raw: false });
        if (!data.length) { toast.warning("Planilha vazia"); return; }
        setHeaders(Object.keys(data[0]));
      }
      setRows(data);
      setFileName(file.name);
      const hs = data.length ? Object.keys(data[0]) : [];
      setColNome(guessCol(hs, ["nome", "name"]) || hs[0] || "");
      setColTel(guessCol(hs, ["telefone", "celular", "phone", "whats", "fone"]) || hs[1] || "");
      setColCidade(guessCol(hs, ["cidade", "city"]) || NONE);
      setColBairro(guessCol(hs, ["bairro", "regiao", "região"]) || NONE);
      toast.success(`${data.length} linhas lidas`);
    } catch (e: any) {
      toast.error("Falha ao ler arquivo", { description: e?.message });
    } finally {
      setParsing(false);
    }
  };

  const carregarPreview = async () => {
    setPreviewing(true);
    setPreview(null);
    const { data, error } = await supabase.rpc("tele_preview_fila" as any, {
      _client_id: clientId,
      _origem: origem,
      _filtros: buildFiltros(),
      _csv_count: origem === "csv" ? csvRows.length : 0,
    });
    setPreviewing(false);
    if (error) { toast.error("Erro na prévia: " + error.message); return; }
    const r = (data as any) || {};
    setPreview({
      total: Number(r.total || 0),
      pendentes: Number(r.pendentes || 0),
      ja_em_outra_fila: Number(r.ja_em_outra_fila || 0),
    });
  };

  useEffect(() => {
    if (!open || !clientId) return;
    if (origem === "csv" && !csvRows.length) { setPreview(null); return; }
    const t = setTimeout(() => { carregarPreview(); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clientId, origem, cidade, bairro, tipo, indicadorId, apenasPendentes, substituir, csvRows.length]);

  const entrarao = preview
    ? Math.max(0, (apenasPendentes ? preview.pendentes : preview.total) - (substituir ? 0 : preview.ja_em_outra_fila))
    : 0;

  const confirmar = async () => {
    setBusy(true);
    try {
      let adicionados = 0;
      if (origem === "csv") {
        if (!csvRows.length) { toast.error("Nenhuma linha válida na planilha"); return; }
        const { data, error } = await supabase.rpc("tele_import_contato_avulso_batch" as any, {
          _client_id: clientId,
          _campanha_id: campanhaId,
          _rows: csvRows as any,
          _assigned_operador_id: designar === ALL ? null : designar,
          _skip_global_dupes: true,
          _lista_nome: null,
        });
        if (error) { toast.error("Erro ao importar: " + error.message); return; }
        const r = (data as any) || {};
        adicionados = Number(r.inserted || 0);
        if (r.skipped_global) toast.info(`${r.skipped_global} duplicado(s) ignorado(s)`);
      } else {
        const { data, error } = await supabase.rpc("tele_popular_fila" as any, {
          _client_id: clientId,
          _campanha_id: campanhaId,
          _origem: origem,
          _filtros: buildFiltros(),
          _csv_rows: [],
        });
        if (error) { toast.error("Erro ao adicionar contatos: " + error.message); return; }
        adicionados = Number((data as any)?.total || 0);

        if (adicionados > 0 && designar !== ALL) {
          const { data: lista } = await supabase.rpc("tele_admin_listar_avulsos" as any, {
            _client_id: clientId, _campanha_id: campanhaId,
          });
          const ids = ((lista as any[]) || [])
            .filter((c: any) => (!c.ligacao_status || c.ligacao_status === "pendente") && !c.assigned_operador_id)
            .map((c: any) => c.id);
          if (ids.length) {
            await supabase.rpc("tele_assign_contatos" as any, {
              _client_id: clientId, _campanha_id: campanhaId,
              _contato_ids: ids, _operador_id: designar,
            });
          }
        }
      }

      if (adicionados === 0) {
        toast.warning("Nenhum contato novo foi adicionado", { description: "Todos já estavam nesta fila ou não atendem aos filtros." });
      } else {
        toast.success(`${adicionados} contato(s) adicionado(s) à fila`);
      }
      onChanged();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adicionar contatos — {campanhaNome}</DialogTitle>
          <DialogDescription>
            Complemente a fila sem recriá-la. Contatos que já estão nesta fila não são duplicados.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>De onde vêm os novos contatos?</Label>
            <div className="grid sm:grid-cols-2 gap-2">
              {ORIGENS.map(o => {
                const Icon = o.icon;
                return (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => setOrigem(o.key)}
                    className={`text-left p-2.5 border rounded-lg flex items-start gap-2 transition-colors ${
                      origem === o.key ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <Icon className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium">{o.label}</p>
                      <p className="text-[11px] text-muted-foreground">{o.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {origem === "csv" ? (
            <div className="space-y-3">
              {!fileName ? (
                <Card className="p-6 text-center border-dashed border-2 cursor-pointer hover:bg-muted/40" onClick={() => fileRef.current?.click()}>
                  {parsing ? <Loader2 className="w-8 h-8 mx-auto animate-spin" /> : <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />}
                  <div className="font-medium text-sm">Escolher arquivo (.xlsx, .xls, .csv)</div>
                  <input
                    ref={fileRef} type="file" className="hidden" accept=".xlsx,.xls,.csv"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
                  />
                </Card>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">{fileName} · {rows.length} linhas · {csvRows.length} válidas</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Coluna do nome</Label>
                      <Select value={colNome} onValueChange={setColNome}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>{headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Coluna do telefone</Label>
                      <Select value={colTel} onValueChange={setColTel}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>{headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Cidade (opcional)</Label>
                      <Select value={colCidade} onValueChange={setColCidade}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>— nenhuma —</SelectItem>
                          {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Bairro (opcional)</Label>
                      <Select value={colBairro} onValueChange={setColBairro}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>— nenhum —</SelectItem>
                          {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => { setFileName(""); setRows([]); setHeaders([]); }}>
                    Trocar arquivo
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Cidade contém</Label>
                  <Input className="h-9" value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Ex: Campo Grande" />
                </div>
                <div>
                  <Label className="text-xs">Bairro contém</Label>
                  <Input className="h-9" value={bairro} onChange={(e) => setBairro(e.target.value)} placeholder="Ex: Centro" />
                </div>
                {tipoOptions().length > 0 && (
                  <div>
                    <Label className="text-xs">Cargo / tipo</Label>
                    <Select value={tipo} onValueChange={setTipo}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL}>Todos</SelectItem>
                        {tipoOptions().map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <Label className="text-xs">Indicado por</Label>
                  <Select value={indicadorId} onValueChange={setIndicadorId}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Todos</SelectItem>
                      {indicadores.map(i => <SelectItem key={i.id} value={i.id}>{i.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={apenasPendentes} onCheckedChange={(v) => setApenasPendentes(!!v)} />
                Apenas contatos ainda não ligados
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={substituir} onCheckedChange={(v) => setSubstituir(!!v)} />
                Mover para cá quem já está em outra fila (por padrão, são ignorados)
              </label>
            </div>
          )}

          <div>
            <Label className="text-xs">Designar os novos contatos para</Label>
            <Select value={designar} onValueChange={setDesignar}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Pool livre (qualquer operador)</SelectItem>
                {opsAtivos.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border p-3 text-sm">
            {previewing ? (
              <span className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Calculando prévia…</span>
            ) : preview ? (
              <div className="space-y-1">
                <p className="font-medium flex items-center gap-2">
                  {entrarao > 0
                    ? <><CheckCircle2 className="w-4 h-4 text-emerald-600" /> {origem === "csv" ? csvRows.length : entrarao} contato(s) serão adicionados</>
                    : <><AlertCircle className="w-4 h-4 text-amber-600" /> Nenhum contato atende a esses filtros</>}
                </p>
                {origem !== "csv" && (
                  <p className="text-xs text-muted-foreground">
                    {preview.total} encontrado(s) · {preview.pendentes} ainda não ligados
                    {preview.ja_em_outra_fila > 0 && ` · ${preview.ja_em_outra_fila} em outra fila (${substituir ? "serão movidos" : "ignorados"})`}
                  </p>
                )}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">
                {origem === "csv" ? "Suba um arquivo para ver a prévia." : "Prévia indisponível."}
              </span>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button
            onClick={confirmar}
            disabled={busy || (origem === "csv" ? csvRows.length === 0 : entrarao === 0)}
          >
            {busy ? "Adicionando…" : "Adicionar à fila"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
