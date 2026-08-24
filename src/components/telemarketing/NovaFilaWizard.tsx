import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { ArrowLeft, ArrowRight, Check, Database, FileSpreadsheet, Megaphone, Upload, Users2, Vote, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

type Origem = "csv" | "estrutura" | "indicados_eleicao" | "contratados" | "indicados_contratados";
type ModoDesignacao = "pool" | "um" | "dividir";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  onCreated: (campanhaId: string) => void;
}

interface Operador { id: string; nome: string; ativo: boolean }

const ORIGEM_INFO: Record<Origem, { label: string; icon: any; desc: string }> = {
  csv: { label: "Lista externa (Excel / CSV)", icon: FileSpreadsheet, desc: "Suba uma planilha .xlsx, .xls ou .csv. Mapeie as colunas e importe. Se preferir, ainda dá para colar como texto." },
  estrutura: { label: "Estrutura eleitoral", icon: Users2, desc: "Coordenadores, líderes e cabos cadastrados na sua estrutura (com telefone)." },
  indicados_eleicao: { label: "Indicados (eleição)", icon: Vote, desc: "Pessoas indicadas pela estrutura na eleição atual." },
  contratados: { label: "Contratados / liderados", icon: Database, desc: "Pessoas contratadas que aceitaram o termo (líderes e liderados)." },
  indicados_contratados: { label: "Indicados dos contratados", icon: Megaphone, desc: "Quem cada contratado indicou organicamente." },
};

const NONE = "__none__";
type Row = Record<string, any>;
const onlyDigits = (s: string) => String(s ?? "").replace(/\D/g, "");
const guessCol = (headers: string[], patterns: string[]): string => {
  for (const h of headers) {
    const low = h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (patterns.some(p => low.includes(p))) return h;
  }
  return "";
};

export default function NovaFilaWizard({ open, onOpenChange, clientId, onCreated }: Props) {
  const [step, setStep] = useState(1);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [origem, setOrigem] = useState<Origem>("estrutura");

  // CSV / Excel upload
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [colNome, setColNome] = useState("");
  const [colTel, setColTel] = useState("");
  const [colCidade, setColCidade] = useState(NONE);
  const [colBairro, setColBairro] = useState(NONE);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [skipGlobalDupes, setSkipGlobalDupes] = useState(true);
  const [parsing, setParsing] = useState(false);

  // Filtros para as demais origens
  const [cidade, setCidade] = useState("");
  const [bairro, setBairro] = useState("");
  const [tipo, setTipo] = useState<string>("__all__");
  const [indicadorId, setIndicadorId] = useState<string>("__all__");
  const [apenasPendentes, setApenasPendentes] = useState(true);
  const [substituir, setSubstituir] = useState(false);
  const [indicadores, setIndicadores] = useState<{ id: string; nome: string; tipo: string }[]>([]);

  // Script
  const [intro, setIntro] = useState("");
  const [perguntas, setPerguntas] = useState("");
  const [tags, setTags] = useState("Não mora mais aqui\nNúmero errado\nPediu retorno");
  const [whatsappTemplate, setWhatsappTemplate] = useState("");

  // Designação
  const [operadores, setOperadores] = useState<Operador[]>([]);
  const [modoDesignacao, setModoDesignacao] = useState<ModoDesignacao>("pool");
  const [operadorUnico, setOperadorUnico] = useState<string>("");
  const [operadoresDividir, setOperadoresDividir] = useState<Set<string>>(new Set());
  const [nomeLista, setNomeLista] = useState("");


  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setNome(""); setDescricao(""); setOrigem("estrutura");
    setFileName(""); setHeaders([]); setRows([]);
    setColNome(""); setColTel(""); setColCidade(NONE); setColBairro(NONE);
    setPasteMode(false); setPasteText(""); setSkipGlobalDupes(true);
    setCidade(""); setBairro(""); setTipo("__all__"); setIndicadorId("__all__");
    setApenasPendentes(true); setSubstituir(false);
    setIntro(""); setPerguntas(""); setTags("Não mora mais aqui\nNúmero errado\nPediu retorno"); setWhatsappTemplate("");
    setModoDesignacao("pool"); setOperadorUnico(""); setOperadoresDividir(new Set());
    setNomeLista("");
    if (fileRef.current) fileRef.current.value = "";

  }, [open]);

  useEffect(() => {
    if (!clientId || !open) return;
    supabase.rpc("tele_list_indicadores" as any, { _client_id: clientId }).then(({ data }) => {
      setIndicadores((data as any[]) || []);
    });
    supabase.from("telemarketing_operadores")
      .select("id, nome, ativo")
      .eq("client_id", clientId)
      .order("nome")
      .then(({ data }) => setOperadores(((data as any[]) || []).map(o => ({ id: o.id, nome: o.nome, ativo: !!o.ativo }))));
  }, [clientId, open]);

  const opsAtivos = useMemo(() => operadores.filter(o => o.ativo), [operadores]);

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
      const cid = guessCol(hs, ["cidade", "city"]);
      const bar = guessCol(hs, ["bairro", "regiao", "região"]);
      setColCidade(cid || NONE);
      setColBairro(bar || NONE);
      toast.success(`${data.length} linhas lidas`);
    } catch (e: any) {
      toast.error("Falha ao ler arquivo", { description: e?.message });
    } finally {
      setParsing(false);
    }
  };

  const csvRows = useMemo(() => {
    // Modo colar texto
    if (pasteMode) {
      const lines = pasteText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (!lines.length) return [] as { nome: string; telefone: string; cidade?: string; bairro?: string }[];
      const header = lines[0].toLowerCase().split(/[,;\t]/).map(h => h.trim());
      const hasHeader = header.includes("nome") && (header.includes("telefone") || header.includes("celular"));
      const cN = hasHeader ? header.indexOf("nome") : 0;
      const cT = hasHeader ? (header.indexOf("telefone") >= 0 ? header.indexOf("telefone") : header.indexOf("celular")) : 1;
      const cC = hasHeader ? header.indexOf("cidade") : -1;
      const cB = hasHeader ? header.indexOf("bairro") : -1;
      return (hasHeader ? lines.slice(1) : lines).map(l => {
        const p = l.split(/[,;\t]/).map(s => s.trim().replace(/^"|"$/g, ""));
        return { nome: p[cN] || "", telefone: onlyDigits(p[cT] || ""), cidade: cC >= 0 ? p[cC] : undefined, bairro: cB >= 0 ? p[cB] : undefined };
      }).filter(r => r.nome && r.telefone && r.telefone.length >= 8);
    }
    // Modo upload
    if (!colNome || !colTel) return [];
    const out: { nome: string; telefone: string; cidade?: string; bairro?: string }[] = [];
    for (const r of rows) {
      const nm = String(r[colNome] || "").trim();
      const tel = onlyDigits(String(r[colTel] || ""));
      if (!nm || !tel || tel.length < 8) continue;
      out.push({
        nome: nm, telefone: tel,
        cidade: colCidade !== NONE ? String(r[colCidade] || "").trim() || undefined : undefined,
        bairro: colBairro !== NONE ? String(r[colBairro] || "").trim() || undefined : undefined,
      });
    }
    return out;
  }, [rows, colNome, colTel, colCidade, colBairro, pasteMode, pasteText]);

  const tipoOptionsByOrigem = (): { value: string; label: string }[] => {
    if (origem === "estrutura" || origem === "indicados_eleicao") {
      return [
        { value: "coordenador", label: "Coordenador" },
        { value: "lider", label: "Líder" },
        { value: "cabo", label: "Cabo" },
      ];
    }
    if (origem === "contratados") {
      return [{ value: "lider", label: "Líder" }, { value: "liderado", label: "Liderado" }];
    }
    return [];
  };

  const canNext = () => {
    if (step === 1) return nome.trim().length > 0;
    if (step === 2) return true;
    if (step === 3) {
      if (origem === "csv") return csvRows.length > 0;
      return true;
    }
    if (step === 4) return true;
    if (step === 5) {
      if (modoDesignacao === "um") return !!operadorUnico;
      if (modoDesignacao === "dividir") return operadoresDividir.size >= 2;
      return true;
    }
    return true;
  };

  const buildFiltros = () => ({
    cidade: cidade.trim(),
    bairro: bairro.trim(),
    tipo: tipo === "__all__" ? "" : tipo,
    indicador_id: indicadorId === "__all__" ? "" : indicadorId,
    apenas_pendentes: apenasPendentes,
    substituir,
  });

  // Prévia unificada (passo 6)
  const [preview, setPreview] = useState<{ total: number; pendentes: number; ja_em_outra_fila: number } | null>(null);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    if (!open || step !== 6 || !clientId) return;
    let cancel = false;
    setPreviewing(true);
    setPreview(null);
    supabase
      .rpc("tele_preview_fila" as any, {
        _client_id: clientId,
        _origem: origem,
        _filtros: buildFiltros(),
        _csv_count: origem === "csv" ? csvRows.length : 0,
      })
      .then(({ data, error }) => {
        if (cancel) return;
        setPreviewing(false);
        if (error) { toast.error("Não foi possível calcular a prévia: " + error.message); return; }
        const r = (data as any) || {};
        setPreview({
          total: Number(r.total || 0),
          pendentes: Number(r.pendentes || 0),
          ja_em_outra_fila: Number(r.ja_em_outra_fila || 0),
        });
      });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, clientId, origem, cidade, bairro, tipo, indicadorId, apenasPendentes, substituir, csvRows.length]);

  const previewEntrarao = preview
    ? (apenasPendentes ? preview.pendentes : preview.total) - (substituir ? 0 : preview.ja_em_outra_fila)
    : 0;

  const finish = async () => {
    if (origem !== "csv" && preview && Math.max(0, previewEntrarao) === 0) {
      toast.error("Nenhum contato atende a esses filtros.", {
        description: "Ajuste os filtros no passo 3 antes de criar a fila — ela ficaria vazia.",
      });
      return;
    }
    setBusy(true);
    const perguntasArr = perguntas.split("\n").map(s => s.trim()).filter(Boolean);
    const tagsArr = tags.split("\n").map(s => s.trim()).filter(Boolean);
    const filtros: any = buildFiltros();


    // Se origem é CSV/Excel, criamos a fila SEM contatos (envia [] para o wizard) e depois importamos
    // com dedup pelo tele_import_contato_avulso_batch. Se for outra origem, o wizard já popula.
    const opUnicoParaCriar = modoDesignacao === "um" ? operadorUnico : null;

    const { data, error } = await supabase.rpc("tele_create_fila_wizard" as any, {
      _client_id: clientId,
      _nome: nome.trim(),
      _descricao: descricao.trim() || null,
      _script_intro: intro.trim() || null,
      _script_perguntas: perguntasArr,
      _tags_rapidas: tagsArr,
      _origem: origem,
      _filtros: filtros,
      _csv_rows: [],
    });
    if (error) {
      setBusy(false);
      toast.error("Não foi possível criar a fila.", {
        description: error.message || "Tente novamente; se persistir, me chame com o print.",
      });
      return;
    }
    const campanhaId = (data as any)?.campanha_id;
    let total = Number((data as any)?.total || 0);

    // Se CSV/Excel, importa via RPC com dedup
    if (origem === "csv" && csvRows.length) {
      const { data: impData, error: impErr } = await supabase.rpc("tele_import_contato_avulso_batch" as any, {
        _client_id: clientId,
        _campanha_id: campanhaId,
        _rows: csvRows as any,
        _assigned_operador_id: opUnicoParaCriar,
        _skip_global_dupes: skipGlobalDupes,
        _lista_nome: nomeLista.trim() || null,
      });

      if (impErr) { setBusy(false); toast.error("Fila criada, mas falhou a importação: " + impErr.message); return; }
      const r = (impData as any) || {};
      total = Number(r.inserted || 0);
      const parts: string[] = [];
      if (r.skipped_global) parts.push(`${r.skipped_global} duplicados ignorados`);
      if (parts.length) toast.info(parts.join(" · "), { duration: 5000 });
    }

    // Salva whatsapp_template se preenchido
    if (whatsappTemplate.trim()) {
      await supabase.from("telemarketing_campanhas")
        .update({ whatsapp_template: whatsappTemplate.trim() } as any)
        .eq("id", campanhaId);
    }

    // Se dividir entre N operadores, buscar contatos criados e distribuir
    if (modoDesignacao === "dividir" && operadoresDividir.size >= 2 && campanhaId) {
      const { data: lista } = await supabase.rpc("tele_admin_listar_avulsos" as any, {
        _client_id: clientId, _campanha_id: campanhaId,
      });
      const ids = ((lista as any[]) || [])
        .filter((c: any) => !c.ligacao_status || c.ligacao_status === "pendente")
        .map((c: any) => c.id);
      if (ids.length) {
        await supabase.rpc("tele_distribute_contatos" as any, {
          _client_id: clientId, _campanha_id: campanhaId,
          _contato_ids: ids, _operador_ids: Array.from(operadoresDividir),
        });
      }
    }
    // Se "um" e origem NÃO for CSV, atribuir todos os contatos criados
    if (modoDesignacao === "um" && operadorUnico && origem !== "csv" && campanhaId) {
      const { data: lista } = await supabase.rpc("tele_admin_listar_avulsos" as any, {
        _client_id: clientId, _campanha_id: campanhaId,
      });
      const ids = ((lista as any[]) || [])
        .filter((c: any) => !c.ligacao_status || c.ligacao_status === "pendente")
        .map((c: any) => c.id);
      if (ids.length) {
        await supabase.rpc("tele_assign_contatos" as any, {
          _client_id: clientId, _campanha_id: campanhaId,
          _contato_ids: ids, _operador_id: operadorUnico,
        });
      }
    }

    setBusy(false);
    toast.success(`Fila criada com ${total} contato(s)`);
    onCreated(campanhaId);
    onOpenChange(false);
  };

  const totalSteps = 6;
  const invalidCount = pasteMode ? 0 : Math.max(0, rows.length - csvRows.length);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova fila de ligação — Passo {step} de {totalSteps}</DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 mb-2">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded ${i + 1 <= step ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Dê um nome reconhecível. Os operadores vão escolher a fila pelo nome.</p>
            <div>
              <Label>Nome da fila *</Label>
              <Input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Centro - 1ª rodada" />
            </div>
            <div>
              <Label>Descrição (opcional)</Label>
              <Textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Objetivo, prazo, observações…" />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">De onde vêm os contatos desta fila?</p>
            {(Object.keys(ORIGEM_INFO) as Origem[]).map(k => {
              const Info = ORIGEM_INFO[k];
              const Icon = Info.icon;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setOrigem(k)}
                  className={`w-full text-left p-3 border rounded-lg flex items-start gap-3 transition-colors ${
                    origem === k ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                  }`}
                >
                  <Icon className="w-5 h-5 mt-0.5 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{Info.label}</p>
                    <p className="text-xs text-muted-foreground">{Info.desc}</p>
                  </div>
                  {origem === k && <Check className="w-4 h-4 text-primary shrink-0 ml-auto" />}
                </button>
              );
            })}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            {origem === "csv" ? (
              <>
                {!pasteMode && !fileName && (
                  <div className="space-y-4">
                    <Card
                      className="p-8 text-center border-dashed border-2 cursor-pointer hover:bg-muted/40"
                      onClick={() => fileRef.current?.click()}
                    >
                      <Upload className="w-10 h-10 mx-auto mb-2 text-muted-foreground" />
                      <div className="font-medium">Clique para escolher um arquivo</div>
                      <div className="text-xs text-muted-foreground mt-1">Aceita .xlsx, .xls e .csv</div>
                      <input
                        ref={fileRef} type="file" className="hidden"
                        accept=".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
                      />
                      {parsing && <div className="mt-3 text-sm flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Lendo…</div>}
                      <div className="mt-4 text-xs">
                        <button type="button" className="underline text-muted-foreground hover:text-foreground" onClick={() => setPasteMode(true)}>
                          Prefiro colar texto
                        </button>
                      </div>
                    </Card>

                    <div className="bg-muted/50 p-4 rounded-lg border space-y-3">
                      <Label className="flex items-center gap-2">
                        <Database className="w-4 h-4 text-primary" /> Nome desta lista para relatórios
                      </Label>
                      <Input 
                        placeholder="Ex: Lote 1 - Bairro Centro" 
                        value={nomeLista} 
                        onChange={(e) => setNomeLista(e.target.value)} 
                      />
                      <p className="text-[10px] text-muted-foreground italic">
                        Ao salvar com um nome, o sistema cria um agrupamento permanente para você gerar relatórios individuais deste lote depois.
                      </p>
                    </div>
                  </div>
                )}


                {!pasteMode && fileName && (
                  <div className="space-y-3">
                    <Card className="p-3 flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileSpreadsheet className="w-5 h-5 text-emerald-600 shrink-0" />
                        <div className="min-w-0">
                          <div className="font-medium truncate">{fileName}</div>
                          <div className="text-xs text-muted-foreground">{rows.length} linhas · {headers.length} colunas</div>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => {
                        setFileName(""); setRows([]); setHeaders([]);
                        setColNome(""); setColTel(""); setColCidade(NONE); setColBairro(NONE);
                        if (fileRef.current) fileRef.current.value = "";
                      }}>Trocar arquivo</Button>
                    </Card>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Nome *</Label>
                        <Select value={colNome} onValueChange={setColNome}>
                          <SelectTrigger><SelectValue placeholder="Escolher…" /></SelectTrigger>
                          <SelectContent>{headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Telefone *</Label>
                        <Select value={colTel} onValueChange={setColTel}>
                          <SelectTrigger><SelectValue placeholder="Escolher…" /></SelectTrigger>
                          <SelectContent>{headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Cidade</Label>
                        <Select value={colCidade} onValueChange={setColCidade}>
                          <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>— Nenhuma —</SelectItem>
                            {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Bairro</Label>
                        <Select value={colBairro} onValueChange={setColBairro}>
                          <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>— Nenhum —</SelectItem>
                            {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <Card className={`p-3 flex items-center gap-3 ${invalidCount > 0 ? "border-amber-400" : "border-emerald-400"}`}>
                      {invalidCount > 0
                        ? <AlertCircle className="w-5 h-5 text-amber-600" />
                        : <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
                      <div className="text-sm">
                        <strong>{csvRows.length}</strong> contato(s) válido(s)
                        {invalidCount > 0 && <span className="text-muted-foreground"> · {invalidCount} ignorado(s) (sem nome ou telefone)</span>}
                      </div>
                    </Card>
                  </div>
                )}

                {pasteMode && (
                  <>
                    <div className="flex items-center justify-between">
                      <Label>Cole o texto (nome, telefone, cidade, bairro)</Label>
                      <button type="button" className="text-xs underline text-muted-foreground hover:text-foreground" onClick={() => { setPasteMode(false); setPasteText(""); }}>
                        ← Voltar para upload
                      </button>
                    </div>
                    <Textarea
                      rows={9} value={pasteText} onChange={(e) => setPasteText(e.target.value)}
                      placeholder={"nome,telefone,cidade,bairro\nMaria Silva,11999990000,São Paulo,Centro"}
                      className="font-mono text-xs"
                    />
                    <p className="text-xs text-muted-foreground">
                      {csvRows.length > 0 ? `${csvRows.length} linha(s) válida(s) detectadas.` : "Cole linhas com nome e telefone."}
                    </p>
                  </>
                )}

                <label className="flex items-center gap-2 text-xs text-muted-foreground border rounded-md p-2">
                  <input type="checkbox" checked={skipGlobalDupes} onChange={(e) => setSkipGlobalDupes(e.target.checked)} />
                  <span><strong>Ignorar contatos que já estão em outra fila</strong> deste cliente (evita ligações duplicadas).</span>
                </label>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">Filtre quem entra na fila. Deixe em branco para incluir todos.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Cidade</Label>
                    <Input value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Ex: São Paulo" />
                  </div>
                  <div>
                    <Label>Bairro</Label>
                    <Input value={bairro} onChange={(e) => setBairro(e.target.value)} placeholder="Ex: Centro" />
                  </div>
                </div>
                {tipoOptionsByOrigem().length > 0 && (
                  <div>
                    <Label>Tipo</Label>
                    <Select value={tipo} onValueChange={setTipo}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">Todos</SelectItem>
                        {tipoOptionsByOrigem().map(o => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {origem === "indicados_eleicao" && indicadores.length > 0 && (
                  <div>
                    <Label className="flex items-center gap-1">
                      Indicador específico (opcional) <TeleHelp text={TELE_HELP.indicadoPor} />
                    </Label>
                    <IndicadorCombobox
                      value={indicadorId}
                      onChange={setIndicadorId}
                      options={indicadores}
                    />
                  </div>
                )}
                <div className="space-y-2 pt-2 border-t">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={apenasPendentes} onCheckedChange={(v) => setApenasPendentes(!!v)} />
                    Apenas contatos ainda não ligados
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={substituir} onCheckedChange={(v) => setSubstituir(!!v)} />
                    Substituir vínculo se o contato já estiver em outra fila
                  </label>
                </div>
              </>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Script e tags ajudam o operador na hora da ligação. Tudo opcional.</p>
            <div>
              <Label>Introdução (lida pelo operador)</Label>
              <Textarea rows={2} value={intro} onChange={(e) => setIntro(e.target.value)} placeholder="Bom dia, aqui é {operador} falando em nome do candidato…" />
            </div>
            <div>
              <Label>Perguntas do roteiro (uma por linha)</Label>
              <Textarea rows={4} value={perguntas} onChange={(e) => setPerguntas(e.target.value)} placeholder={"Você costuma votar nas eleições municipais?\nO que mais te preocupa hoje no bairro?"} />
            </div>
            <div>
              <Label>Tags rápidas (uma por linha)</Label>
              <Textarea rows={3} value={tags} onChange={(e) => setTags(e.target.value)} />
            </div>
            <div>
              <Label>Mensagem inicial do WhatsApp (opcional)</Label>
              <Textarea rows={2} value={whatsappTemplate} onChange={(e) => setWhatsappTemplate(e.target.value)} placeholder="Olá {{nome}}, aqui é da campanha…" />
              <p className="text-[11px] text-muted-foreground mt-1">Aparece pré-preenchida quando o operador clicar em "Abrir WhatsApp". Use {"{{nome}}"} para inserir o nome do contato.</p>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Quem vai ligar para esses contatos?</p>

            <button
              type="button"
              onClick={() => setModoDesignacao("pool")}
              className={`w-full text-left p-3 border rounded-lg ${modoDesignacao === "pool" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
            >
              <p className="font-medium text-sm">Pool livre <span className="text-xs text-muted-foreground">(recomendado quando todos ligam para todos)</span></p>
              <p className="text-xs text-muted-foreground">Qualquer operador ativo pode puxar contatos desta fila. O sistema impede que dois operadores peguem o mesmo contato ao mesmo tempo.</p>
            </button>

            <button
              type="button"
              onClick={() => setModoDesignacao("um")}
              className={`w-full text-left p-3 border rounded-lg ${modoDesignacao === "um" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
            >
              <p className="font-medium text-sm">Um operador específico</p>
              <p className="text-xs text-muted-foreground mb-2">Toda a fila fica com um único operador. Bom para listas pequenas ou VIP.</p>
              {modoDesignacao === "um" && (
                <Select value={operadorUnico} onValueChange={setOperadorUnico}>
                  <SelectTrigger><SelectValue placeholder="Escolher operador…" /></SelectTrigger>
                  <SelectContent>
                    {opsAtivos.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </button>

            <button
              type="button"
              onClick={() => setModoDesignacao("dividir")}
              className={`w-full text-left p-3 border rounded-lg ${modoDesignacao === "dividir" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
            >
              <p className="font-medium text-sm">Dividir igualmente entre operadores</p>
              <p className="text-xs text-muted-foreground mb-2">Distribuição round-robin: cada operador recebe uma fatia igual e ninguém liga em duplicidade.</p>
              {modoDesignacao === "dividir" && (
                <div className="flex flex-wrap gap-2">
                  {opsAtivos.map(o => {
                    const checked = operadoresDividir.has(o.id);
                    return (
                      <label key={o.id} className={`flex items-center gap-1.5 border rounded-md px-2 py-1 text-xs cursor-pointer ${checked ? "bg-primary/10 border-primary" : ""}`}>
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            const next = new Set(operadoresDividir);
                            if (v) next.add(o.id); else next.delete(o.id);
                            setOperadoresDividir(next);
                          }}
                        />
                        {o.nome}
                      </label>
                    );
                  })}
                  {opsAtivos.length === 0 && <p className="text-xs text-amber-600">Nenhum operador ativo cadastrado.</p>}
                </div>
              )}
            </button>
          </div>
        )}

        {step === 6 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Revise antes de criar a fila.</p>
            <div className="rounded-lg border p-3 space-y-2 text-sm">
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">Nome</span><span className="font-medium text-right">{nome}</span></div>
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">Origem</span><Badge variant="outline">{ORIGEM_INFO[origem].label}</Badge></div>
              {origem === "csv" ? (
                <div className="flex justify-between gap-2"><span className="text-muted-foreground">Contatos na lista</span><span className="font-medium">{csvRows.length}</span></div>
              ) : (
                <>
                  {cidade && <div className="flex justify-between gap-2"><span className="text-muted-foreground">Cidade</span><span>{cidade}</span></div>}
                  {bairro && <div className="flex justify-between gap-2"><span className="text-muted-foreground">Bairro</span><span>{bairro}</span></div>}
                  {tipo !== "__all__" && <div className="flex justify-between gap-2"><span className="text-muted-foreground">Tipo</span><span>{tipo}</span></div>}
                  <div className="flex justify-between gap-2"><span className="text-muted-foreground">Apenas não ligados</span><span>{apenasPendentes ? "Sim" : "Não"}</span></div>
                </>
              )}
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Designação</span>
                <span className="text-right">
                  {modoDesignacao === "pool" && "Pool livre"}
                  {modoDesignacao === "um" && `Um operador: ${opsAtivos.find(o => o.id === operadorUnico)?.nome || "—"}`}
                  {modoDesignacao === "dividir" && `Dividir entre ${operadoresDividir.size} operadores`}
                </span>
              </div>
            </div>
            <div className="rounded-lg border p-3 text-sm">
              {previewing ? (
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> Calculando quantos contatos vão entrar…
                </span>
              ) : preview ? (
                <div className="space-y-1">
                  <p className="font-medium flex items-center gap-2">
                    {previewEntrarao > 0
                      ? <><CheckCircle2 className="w-4 h-4 text-emerald-600" /> {previewEntrarao} contato(s) vão entrar nesta fila</>
                      : <><AlertCircle className="w-4 h-4 text-amber-600" /> Nenhum contato atende a esses filtros</>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {preview.total} encontrado(s) no total · {preview.pendentes} ainda não ligados
                    {preview.ja_em_outra_fila > 0 && ` · ${preview.ja_em_outra_fila} já em outra fila (${substituir ? "serão movidos para cá" : "serão ignorados"})`}
                  </p>
                  {previewEntrarao === 0 && (
                    <p className="text-xs text-amber-600">Volte ao passo 3 e ajuste os filtros — a fila seria criada vazia.</p>
                  )}
                </div>
              ) : (
                <span className="text-muted-foreground text-xs">Prévia indisponível.</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Ao confirmar, a fila será criada e os contatos vinculados. Depois você pode usar "Adicionar contatos" para complementar a fila e "Gerenciar designações" para ajustar os operadores.
            </p>

          </div>
        )}

        <DialogFooter className="gap-2">
          {step > 1 && (
            <Button variant="ghost" onClick={() => setStep(s => s - 1)} disabled={busy}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
            </Button>
          )}
          {step < totalSteps ? (
            <Button onClick={() => setStep(s => s + 1)} disabled={!canNext()}>
              Avançar <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={finish} disabled={busy}>
              {busy ? "Criando…" : "Criar fila"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
