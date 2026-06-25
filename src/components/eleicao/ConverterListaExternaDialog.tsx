import { useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileSpreadsheet, Download, FileText, Loader2, AlertCircle, CheckCircle2, Tag as TagIcon } from "lucide-react";
import { toast } from "sonner";
import { gerarVcardLote, gerarCsvGoogleContacts, type ContatoExport } from "@/lib/eleicao-distribuicao-contatos";
import { saveBlob } from "@/lib/mobile-download";
import { normalizeTag } from "@/hooks/useRegioesEleicao";

interface Props {
  open: boolean;
  onClose: () => void;
}

type Row = Record<string, any>;

const NONE = "__none__";

const guessCol = (headers: string[], patterns: string[]): string => {
  for (const h of headers) {
    const low = h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (patterns.some(p => low.includes(p))) return h;
  }
  return "";
};

const onlyDigits = (s: string) => (s || "").toString().replace(/\D/g, "");

export default function ConverterListaExternaDialog({ open, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [colNome, setColNome] = useState<string>("");
  const [colTel, setColTel] = useState<string>("");
  const [colBairro, setColBairro] = useState<string>(NONE);
  const [tag, setTag] = useState<string>("");
  const [parsing, setParsing] = useState(false);
  const [generating, setGenerating] = useState<null | "vcf" | "csv">(null);

  const reset = () => {
    setFileName(""); setHeaders([]); setRows([]);
    setColNome(""); setColTel(""); setColBairro(NONE); setTag("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const onFile = async (file: File) => {
    setParsing(true);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const firstSheet = wb.SheetNames[0];
      const ws = wb.Sheets[firstSheet];
      const data = XLSX.utils.sheet_to_json<Row>(ws, { defval: "", raw: false });
      if (data.length === 0) {
        toast.warning("Planilha vazia ou sem cabeçalho");
        return;
      }
      const hs = Object.keys(data[0]);
      setHeaders(hs);
      setRows(data);
      setFileName(file.name);
      setColNome(guessCol(hs, ["nome", "name"]) || hs[0] || "");
      setColTel(guessCol(hs, ["telefone", "celular", "phone", "whats", "fone"]) || hs[1] || "");
      const bairro = guessCol(hs, ["bairro", "cidade", "regiao", "região"]);
      setColBairro(bairro || NONE);
      toast.success(`${data.length} linhas lidas de ${firstSheet}`);
    } catch (e: any) {
      toast.error("Falha ao ler planilha", { description: e?.message });
    } finally {
      setParsing(false);
    }
  };

  const contatos = useMemo<ContatoExport[]>(() => {
    if (!colNome || !colTel) return [];
    const out: ContatoExport[] = [];
    let i = 0;
    for (const r of rows) {
      const nome = String(r[colNome] || "").trim();
      const tel = onlyDigits(String(r[colTel] || ""));
      if (!nome || !tel || tel.length < 8) continue;
      out.push({
        pessoa_id: `ext-${i++}`,
        nome,
        telefone: tel,
        tipo: null,
        bairro: colBairro !== NONE ? String(r[colBairro] || "").trim() || null : null,
      });
    }
    return out;
  }, [rows, colNome, colTel, colBairro]);

  const invalidos = rows.length - contatos.length;
  const podeGerar = contatos.length > 0;

  const baixarVcf = async () => {
    setGenerating("vcf");
    try {
      const vcf = gerarVcardLote({ contatos, tagPrefixo: tag, regiaoLabel: tag || "Lista externa" });
      const blob = new Blob([vcf], { type: "text/vcard" });
      const base = fileName.replace(/\.[^.]+$/, "") || "lista_externa";
      await saveBlob(blob, `${base}_${Date.now()}.vcf`, { title: "Lista de contatos" });
    } finally { setGenerating(null); }
  };

  const baixarCsv = async () => {
    setGenerating("csv");
    try {
      const csv = gerarCsvGoogleContacts({ contatos, tagPrefixo: tag, regiaoLabel: tag || "Lista externa" });
      const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
      const base = fileName.replace(/\.[^.]+$/, "") || "lista_externa";
      await saveBlob(blob, `${base}_google_contacts.csv`, { title: "Google Contacts CSV" });
    } finally { setGenerating(null); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Converter lista externa em VCF</DialogTitle>
          <DialogDescription>
            Sobe uma planilha (Excel ou CSV), aponta as colunas e baixa um <code>.vcf</code> ou CSV pronto pra importar
            na agenda do celular ou no Google Contacts. Nada é salvo no sistema — é só conversão.
          </DialogDescription>
        </DialogHeader>

        {/* Upload */}
        {!fileName ? (
          <Card className="p-8 text-center border-dashed border-2 cursor-pointer hover:bg-muted/40"
            onClick={() => fileRef.current?.click()}>
            <Upload className="w-10 h-10 mx-auto mb-2 text-muted-foreground" />
            <div className="font-medium">Clique para escolher um arquivo</div>
            <div className="text-xs text-muted-foreground mt-1">Aceita .xlsx, .xls e .csv</div>
            <input
              ref={fileRef} type="file" className="hidden"
              accept=".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
            />
            {parsing && <div className="mt-3 text-sm flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Lendo planilha…</div>}
          </Card>
        ) : (
          <div className="space-y-3">
            <Card className="p-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600 shrink-0" />
                <div className="min-w-0">
                  <div className="font-medium truncate">{fileName}</div>
                  <div className="text-xs text-muted-foreground">{rows.length} linhas • {headers.length} colunas</div>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={reset}>Trocar arquivo</Button>
            </Card>

            {/* Mapeamento */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label>Coluna do Nome *</Label>
                <Select value={colNome} onValueChange={setColNome}>
                  <SelectTrigger><SelectValue placeholder="Escolher..." /></SelectTrigger>
                  <SelectContent>
                    {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Coluna do Telefone *</Label>
                <Select value={colTel} onValueChange={setColTel}>
                  <SelectTrigger><SelectValue placeholder="Escolher..." /></SelectTrigger>
                  <SelectContent>
                    {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Coluna do Bairro/Cidade</Label>
                <Select value={colBairro} onValueChange={setColBairro}>
                  <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— Nenhuma —</SelectItem>
                    {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="flex items-center gap-1"><TagIcon className="w-3 h-3" />TAG opcional (prefixo do nome)</Label>
              <Input value={tag} onChange={(e) => setTag(normalizeTag(e.target.value))}
                placeholder="Ex: VIP, EVENTO, LISTA1" maxLength={8} className="font-mono uppercase" />
              <p className="text-xs text-muted-foreground mt-1">
                Os contatos serão salvos como <strong>{tag ? `${tag} Nome` : "Nome"}</strong> na agenda.
              </p>
            </div>

            {/* Validação */}
            <Card className={`p-3 flex items-center gap-3 ${invalidos > 0 ? "border-amber-400 bg-amber-50/40 dark:bg-amber-900/10" : "border-emerald-400 bg-emerald-50/40 dark:bg-emerald-900/10"}`}>
              {invalidos > 0 ? <AlertCircle className="w-5 h-5 text-amber-600" /> : <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
              <div className="text-sm">
                <strong>{contatos.length}</strong> contato(s) válido(s)
                {invalidos > 0 && <span className="text-muted-foreground"> • {invalidos} ignorado(s) (sem nome ou telefone válido)</span>}
              </div>
            </Card>

            {/* Preview */}
            {contatos.length > 0 && (
              <Card className="p-3 max-h-48 overflow-y-auto bg-muted/30 text-xs">
                <div className="font-semibold mb-1">Preview (10 primeiros):</div>
                <ul className="space-y-0.5">
                  {contatos.slice(0, 10).map((c, i) => (
                    <li key={i} className="truncate">
                      • <strong>{tag ? `${tag} ` : ""}{c.nome}</strong> — {c.telefone}{c.bairro ? ` • ${c.bairro}` : ""}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="ghost" onClick={() => { reset(); onClose(); }}>Cancelar</Button>
          <Button variant="outline" disabled={!podeGerar || !!generating} onClick={baixarCsv}>
            {generating === "csv" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
            Baixar CSV Google
          </Button>
          <Button disabled={!podeGerar || !!generating} onClick={baixarVcf}>
            {generating === "vcf" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Baixar .vcf
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
