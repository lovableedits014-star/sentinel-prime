import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Upload, Download, CheckCircle2, AlertTriangle } from "lucide-react";

type Linha = { nome: string; telefone: string; bairro?: string };
type Resultado = {
  inseridos: number;
  duplicados: { nome: string; telefone: string; motivo: string; existente?: string }[];
  invalidos: { nome: string; telefone: string; motivo: string }[];
};

const NONE = "__none__";

function norm(s: string) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function guessCol(headers: string[], candidates: string[]): string {
  for (const c of candidates) {
    const found = headers.find((h) => norm(h).includes(c));
    if (found) return found;
  }
  return NONE;
}

function digits(v: unknown) {
  return String(v ?? "").replace(/\D/g, "");
}

export default function ImportarIndicadosDialog({
  open,
  onOpenChange,
  indicadorId,
  indicadorNome,
  onImported,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  indicadorId: string;
  indicadorNome: string;
  onImported: () => void | Promise<void>;
}) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [colNome, setColNome] = useState<string>(NONE);
  const [colTel, setColTel] = useState<string>(NONE);
  const [colBairro, setColBairro] = useState<string>(NONE);
  const [parsing, setParsing] = useState(false);
  const [sending, setSending] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  function reset() {
    setRows([]); setHeaders([]);
    setColNome(NONE); setColTel(NONE); setColBairro(NONE);
    setResultado(null);
  }

  async function handleFile(file: File) {
    setParsing(true);
    setResultado(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      if (!json.length) { toast.error("Planilha vazia."); return; }
      const hs = Object.keys(json[0]);
      setRows(json);
      setHeaders(hs);
      setColNome(guessCol(hs, ["nome", "contato", "eleitor"]));
      setColTel(guessCol(hs, ["telefone", "celular", "whats", "fone", "numero"]));
      setColBairro(guessCol(hs, ["bairro", "regiao", "local"]));
    } catch (e: any) {
      toast.error("Não foi possível ler o arquivo: " + (e?.message || "formato inválido"));
    } finally {
      setParsing(false);
    }
  }

  const preparo = useMemo(() => {
    if (!rows.length || colNome === NONE || colTel === NONE) {
      return { validos: [] as Linha[], invalidos: 0, repetidos: 0 };
    }
    const seen = new Set<string>();
    const validos: Linha[] = [];
    let invalidos = 0;
    let repetidos = 0;
    for (const r of rows) {
      const nome = String(r[colNome] ?? "").trim();
      const telRaw = String(r[colTel] ?? "").trim();
      const d = digits(telRaw);
      if (nome.length < 2 || d.length < 10 || d.length > 13) { invalidos++; continue; }
      if (seen.has(d)) { repetidos++; continue; }
      seen.add(d);
      validos.push({
        nome,
        telefone: telRaw,
        bairro: colBairro !== NONE ? String(r[colBairro] ?? "").trim() || undefined : undefined,
      });
    }
    return { validos, invalidos, repetidos };
  }, [rows, colNome, colTel, colBairro]);

  async function importar() {
    if (!preparo.validos.length) { toast.error("Nenhuma linha válida para importar."); return; }
    setSending(true);
    try {
      const CHUNK = 300;
      const acc: Resultado = { inseridos: 0, duplicados: [], invalidos: [] };
      for (let i = 0; i < preparo.validos.length; i += CHUNK) {
        const parte = preparo.validos.slice(i, i + CHUNK);
        const { data, error } = await supabase.rpc("eleicao_indicar_lote" as any, {
          _indicador_id: indicadorId,
          _linhas: parte as any,
        });
        if (error) throw error;
        const r = data as any;
        if (!r?.ok) {
          throw new Error(
            r?.motivo === "sem_permissao"
              ? "Você não tem permissão para importar para este indicador."
              : "Falha ao importar (indicador inválido).",
          );
        }
        acc.inseridos += r.inseridos || 0;
        acc.duplicados.push(...((r.duplicados || []) as any[]));
        acc.invalidos.push(...((r.invalidos || []) as any[]));
      }
      setResultado(acc);
      toast.success(`${acc.inseridos} indicações importadas para ${indicadorNome.split(" ")[0]}`);
      await onImported();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao importar planilha");
    } finally {
      setSending(false);
    }
  }

  function baixarErros() {
    if (!resultado) return;
    const linhas = [
      ...resultado.duplicados.map((d) => ({ Nome: d.nome, Telefone: d.telefone, Problema: d.motivo === "ja_cadastrado" ? `Já cadastrado (${d.existente ?? ""})` : "Repetido na planilha" })),
      ...resultado.invalidos.map((d) => ({ Nome: d.nome, Telefone: d.telefone, Problema: d.motivo === "nome_invalido" ? "Nome inválido" : "Telefone inválido" })),
    ];
    if (!linhas.length) { toast.info("Nenhum erro para exportar."); return; }
    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Erros");
    XLSX.writeFile(wb, `erros-importacao-${indicadorNome.replace(/\s+/g, "-").toLowerCase()}.xlsx`);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Upload className="w-4 h-4" />Importar indicações de planilha</DialogTitle>
          <DialogDescription>
            As indicações serão registradas em nome de <strong>{indicadorNome}</strong> e contam na meta dele/dela.
          </DialogDescription>
        </DialogHeader>

        {resultado ? (
          <div className="space-y-3">
            <div className="rounded-md border p-3 bg-emerald-500/10 flex items-center gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span><strong>{resultado.inseridos}</strong> indicações cadastradas com sucesso.</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-md border p-3">
                <div className="text-[11px] uppercase text-muted-foreground">Duplicados ignorados</div>
                <div className="text-xl font-bold">{resultado.duplicados.length}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-[11px] uppercase text-muted-foreground">Linhas inválidas</div>
                <div className="text-xl font-bold">{resultado.invalidos.length}</div>
              </div>
            </div>
            {(resultado.duplicados.length > 0 || resultado.invalidos.length > 0) && (
              <div className="max-h-48 overflow-y-auto rounded-md border divide-y text-xs">
                {[...resultado.duplicados, ...resultado.invalidos].slice(0, 100).map((d, i) => (
                  <div key={i} className="p-2 flex items-center justify-between gap-2">
                    <span className="truncate">{d.nome} · {d.telefone}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {d.motivo === "ja_cadastrado" ? `já cadastrado${(d as any).existente ? `: ${(d as any).existente}` : ""}`
                        : d.motivo === "repetido_na_planilha" ? "repetido na planilha"
                        : d.motivo === "nome_invalido" ? "nome inválido" : "telefone inválido"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={baixarErros}><Download className="w-4 h-4 mr-1.5" />Baixar erros</Button>
              <Button variant="outline" onClick={reset}>Importar outra planilha</Button>
              <Button onClick={() => { onOpenChange(false); reset(); }}>Concluir</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Arquivo (.xlsx, .xls ou .csv)</Label>
              <Input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                disabled={parsing || sending}
              />
              <p className="text-[11px] text-muted-foreground">Colunas esperadas: nome, telefone e bairro (bairro é opcional).</p>
            </div>

            {headers.length > 0 && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {([
                    ["Nome", colNome, setColNome, false],
                    ["Telefone", colTel, setColTel, false],
                    ["Bairro", colBairro, setColBairro, true],
                  ] as const).map(([label, val, setter, opcional]) => (
                    <div key={label} className="space-y-1">
                      <Label className="text-xs">{label}{opcional ? " (opcional)" : ""}</Label>
                      <Select value={val} onValueChange={(v) => (setter as any)(v)}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Selecionar coluna" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>— não usar —</SelectItem>
                          {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>

                <div className="rounded-md border p-3 text-sm space-y-1 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <span>Linhas na planilha</span><strong>{rows.length}</strong>
                  </div>
                  <div className="flex items-center justify-between text-emerald-600">
                    <span>Prontas para importar</span><strong>{preparo.validos.length}</strong>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Repetidas na planilha</span><strong>{preparo.repetidos}</strong>
                  </div>
                  <div className="flex items-center justify-between text-amber-600">
                    <span>Inválidas (nome/telefone)</span><strong>{preparo.invalidos}</strong>
                  </div>
                  {(colNome === NONE || colTel === NONE) && (
                    <div className="flex items-center gap-1.5 text-[11px] text-amber-600 pt-1">
                      <AlertTriangle className="w-3.5 h-3.5" />Selecione as colunas de nome e telefone.
                    </div>
                  )}
                  <p className="text-[11px] text-muted-foreground pt-1">
                    Números já cadastrados no sistema serão detectados e ignorados na importação.
                  </p>
                </div>

                {preparo.validos.length > 0 && (
                  <div className="max-h-32 overflow-y-auto rounded-md border divide-y text-xs">
                    {preparo.validos.slice(0, 10).map((l, i) => (
                      <div key={i} className="p-2 flex justify-between gap-2">
                        <span className="truncate">{l.nome}</span>
                        <span className="text-muted-foreground shrink-0">{l.telefone}{l.bairro ? ` · ${l.bairro}` : ""}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Cancelar</Button>
              <Button onClick={importar} disabled={sending || parsing || preparo.validos.length === 0}>
                {sending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Upload className="w-4 h-4 mr-1.5" />}
                Importar {preparo.validos.length || ""}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
