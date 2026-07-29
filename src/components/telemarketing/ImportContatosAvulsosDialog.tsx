import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileSpreadsheet, Loader2, AlertCircle, CheckCircle2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Campanha { id: string; nome: string }
interface Operador { id: string; nome: string; ativo?: boolean }

interface Props {
  open: boolean;
  onClose: () => void;
  clientId: string;
  campanhas: Campanha[];
  operadores: Operador[];
  defaultCampanhaId?: string | null;
  onImported: () => void;
}

const NONE = "__none__";
type Row = Record<string, any>;

const guessCol = (headers: string[], patterns: string[]): string => {
  for (const h of headers) {
    const low = h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (patterns.some(p => low.includes(p))) return h;
  }
  return "";
};
const onlyDigits = (s: string) => (s || "").toString().replace(/\D/g, "");

export default function ImportContatosAvulsosDialog({
  open, onClose, clientId, campanhas, operadores, defaultCampanhaId, onImported,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [colNome, setColNome] = useState("");
  const [colTel, setColTel] = useState("");
  const [colCidade, setColCidade] = useState(NONE);
  const [colBairro, setColBairro] = useState(NONE);
  const [campanhaId, setCampanhaId] = useState<string>(defaultCampanhaId || "");
  const [operadorId, setOperadorId] = useState<string>(NONE);
  const [skipGlobalDupes, setSkipGlobalDupes] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);


  useEffect(() => {
    if (open) {
      setCampanhaId(defaultCampanhaId || "");
      setOperadorId(NONE);
    } else {
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultCampanhaId]);

  const reset = () => {
    setFileName(""); setHeaders([]); setRows([]);
    setColNome(""); setColTel(""); setColCidade(NONE); setColBairro(NONE);
    if (fileRef.current) fileRef.current.value = "";
  };

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

  const contatosValidos = useMemo(() => {
    if (!colNome || !colTel) return [] as { nome: string; telefone: string; cidade?: string; bairro?: string }[];
    const out: { nome: string; telefone: string; cidade?: string; bairro?: string }[] = [];
    for (const r of rows) {
      const nome = String(r[colNome] || "").trim();
      const tel = onlyDigits(String(r[colTel] || ""));
      if (!nome || !tel || tel.length < 8) continue;
      out.push({
        nome, telefone: tel,
        cidade: colCidade !== NONE ? String(r[colCidade] || "").trim() || undefined : undefined,
        bairro: colBairro !== NONE ? String(r[colBairro] || "").trim() || undefined : undefined,
      });
    }
    return out;
  }, [rows, colNome, colTel, colCidade, colBairro]);

  const invalidos = rows.length - contatosValidos.length;
  const podeImportar = contatosValidos.length > 0 && !!campanhaId;

  const doImport = async () => {
    if (!podeImportar) return;
    setImporting(true);
    const { data, error } = await supabase.rpc("tele_import_contato_avulso_batch" as any, {
      _client_id: clientId,
      _campanha_id: campanhaId,
      _rows: contatosValidos as any,
      _assigned_operador_id: operadorId !== NONE ? operadorId : null,
      _skip_global_dupes: skipGlobalDupes,
    });
    setImporting(false);
    if (error) { toast.error(error.message); return; }
    const r = (data as any) || {};
    const parts: string[] = [];
    if (r.skipped_same_campaign) parts.push(`${r.skipped_same_campaign} já estavam nesta fila`);
    if (r.skipped_other_campaign) parts.push(`${r.skipped_other_campaign} já em outra fila`);
    toast.success(`${r.inserted ?? 0} contatos importados`, {
      description: parts.length ? parts.join(" · ") : undefined,
    });
    onImported();
    onClose();
  };


  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar lista externa</DialogTitle>
          <DialogDescription>
            Envie um arquivo (Excel ou CSV), aponte as colunas e escolha a campanha. Opcionalmente, já designe os contatos a um operador.
          </DialogDescription>
        </DialogHeader>

        {!fileName ? (
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
          </Card>
        ) : (
          <div className="space-y-3">
            <Card className="p-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600 shrink-0" />
                <div className="min-w-0">
                  <div className="font-medium truncate">{fileName}</div>
                  <div className="text-xs text-muted-foreground">{rows.length} linhas · {headers.length} colunas</div>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={reset}>Trocar arquivo</Button>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

            <Card className={`p-3 flex items-center gap-3 ${invalidos > 0 ? "border-amber-400" : "border-emerald-400"}`}>
              {invalidos > 0
                ? <AlertCircle className="w-5 h-5 text-amber-600" />
                : <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
              <div className="text-sm">
                <strong>{contatosValidos.length}</strong> contato(s) válido(s)
                {invalidos > 0 && <span className="text-muted-foreground"> · {invalidos} ignorado(s) (sem nome ou telefone)</span>}
              </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 border-t">
              <div>
                <Label>Campanha *</Label>
                <Select value={campanhaId} onValueChange={setCampanhaId}>
                  <SelectTrigger><SelectValue placeholder="Escolher campanha…" /></SelectTrigger>
                  <SelectContent>
                    {campanhas.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="flex items-center gap-1"><UserPlus className="w-3 h-3" />Designar a operador (opcional)</Label>
                <Select value={operadorId} onValueChange={setOperadorId}>
                  <SelectTrigger><SelectValue placeholder="Sem designação (pool livre)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— Pool livre —</SelectItem>
                    {operadores.filter(o => o.ativo !== false).map(o => (
                      <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={doImport} disabled={!podeImportar || importing}>
            {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            Importar {contatosValidos.length > 0 && `(${contatosValidos.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
