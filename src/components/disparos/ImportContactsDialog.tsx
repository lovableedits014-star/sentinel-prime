import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, FileSpreadsheet, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { normalizeBRPhone, isValidBRPhone, fmtPhoneBR } from "@/lib/phone-utils";

export type AdHocContact = { nome: string; telefone: string };

type Row = { nome: string; telefone_raw: string; telefone: string; valid: boolean; duplicate: boolean };

type Props = {
  clientId: string | null;
  onUseAsList?: (contacts: AdHocContact[]) => void;
  trigger?: React.ReactNode;
};

// Detecta as colunas de nome e telefone a partir dos headers (best-effort).
function guessColumns(headers: string[]): { nomeIdx: number; telIdx: number } {
  const norm = (s: string) => (s || "").toString().trim().toLowerCase();
  const nameKeys = ["nome", "name", "contato", "contact", "pessoa"];
  const phoneKeys = ["telefone", "phone", "celular", "whatsapp", "numero", "número", "fone", "tel"];
  let nomeIdx = -1, telIdx = -1;
  headers.forEach((h, i) => {
    const n = norm(h);
    if (nomeIdx < 0 && nameKeys.some((k) => n.includes(k))) nomeIdx = i;
    if (telIdx < 0 && phoneKeys.some((k) => n.includes(k))) telIdx = i;
  });
  // Se não achou telefone, chuta primeira coluna que tem muitos dígitos.
  return { nomeIdx, telIdx };
}

export default function ImportContactsDialog({ clientId, onUseAsList, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [destino, setDestino] = useState<"lista" | "pessoas">(onUseAsList ? "lista" : "pessoas");
  const [tagNome, setTagNome] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => {
    const valid = rows.filter((r) => r.valid && !r.duplicate).length;
    const invalid = rows.filter((r) => !r.valid).length;
    const dup = rows.filter((r) => r.duplicate).length;
    return { valid, invalid, dup, total: rows.length };
  }, [rows]);

  const reset = () => {
    setRows([]);
    setFileName("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      // { type: "array", raw: true } — deixa o xlsx detectar CSV/XLSX automaticamente.
      const wb = XLSX.read(buf, { type: "array", raw: false });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) throw new Error("Planilha vazia");
      const sheet = wb.Sheets[sheetName];
      const aoa: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: "" });
      if (aoa.length === 0) throw new Error("Nenhuma linha encontrada");

      // Assume primeira linha como header se contém letras (não é só dígitos).
      const first = aoa[0].map((c) => (c ?? "").toString());
      const hasHeader = first.some((c) => /[A-Za-zÀ-ú]/.test(c));
      const headers = hasHeader ? first : first.map((_, i) => `col_${i + 1}`);
      const dataRows = hasHeader ? aoa.slice(1) : aoa;

      const { nomeIdx, telIdx } = guessColumns(headers);
      const seen = new Set<string>();
      const parsed: Row[] = [];
      for (const r of dataRows) {
        const rawTel = telIdx >= 0 ? String(r[telIdx] ?? "") : String(r[0] ?? "");
        const rawNome = nomeIdx >= 0 ? String(r[nomeIdx] ?? "") : "";
        const nome = rawNome.trim().slice(0, 120);
        const telefone = normalizeBRPhone(rawTel);
        const valid = isValidBRPhone(rawTel);
        const dupKey = telefone;
        const duplicate = valid && seen.has(dupKey);
        if (valid && !duplicate) seen.add(dupKey);
        parsed.push({ nome: nome || "Contato", telefone_raw: rawTel, telefone, valid, duplicate });
      }
      setRows(parsed);
      toast.success(`${parsed.filter((p) => p.valid && !p.duplicate).length} contatos válidos detectados.`);
    } catch (err: any) {
      toast.error("Falha ao ler arquivo: " + (err?.message || ""));
      reset();
    }
  };

  const validContacts = (): AdHocContact[] =>
    rows.filter((r) => r.valid && !r.duplicate).map((r) => ({ nome: r.nome, telefone: r.telefone }));

  const handleConfirm = async () => {
    const contacts = validContacts();
    if (contacts.length === 0) {
      toast.error("Nenhum contato válido para importar.");
      return;
    }

    if (destino === "lista") {
      if (!onUseAsList) {
        toast.error("Este contexto não permite lista ad-hoc.");
        return;
      }
      onUseAsList(contacts);
      toast.success(`${contacts.length} contatos carregados para este disparo.`);
      setOpen(false);
      reset();
      return;
    }

    // destino === "pessoas": grava em `pessoas` (idempotente por telefone) e aplica tag opcional.
    if (!clientId) {
      toast.error("Cliente não selecionado.");
      return;
    }
    const tag = tagNome.trim();
    setBusy(true);
    try {
      // Descobre quais telefones já existem para este client
      const phones = contacts.map((c) => c.telefone);
      const { data: existing } = await supabase
        .from("pessoas")
        .select("id, telefone")
        .eq("client_id", clientId)
        .in("telefone", phones);
      const byPhone = new Map<string, string>();
      (existing || []).forEach((p: any) => byPhone.set(p.telefone, p.id));

      const toInsert = contacts.filter((c) => !byPhone.has(c.telefone));
      let insertedIds: string[] = [];
      if (toInsert.length > 0) {
        const { data: inserted, error: insErr } = await supabase
          .from("pessoas")
          .insert(toInsert.map((c) => ({
            client_id: clientId,
            nome: c.nome || "Contato importado",
            telefone: c.telefone,
            tipo_pessoa: "apoiador",
          })) as any)
          .select("id, telefone");
        if (insErr) throw insErr;
        (inserted || []).forEach((p: any) => {
          byPhone.set(p.telefone, p.id);
          insertedIds.push(p.id);
        });
      }

      // Aplica tag (opcional)
      if (tag) {
        // Garante que a tag existe
        const { data: tagRow } = await supabase
          .from("tags" as any)
          .select("id")
          .eq("client_id", clientId)
          .eq("nome", tag)
          .maybeSingle();
        let tagId = (tagRow as any)?.id as string | undefined;
        if (!tagId) {
          const { data: newTag, error: tagErr } = await supabase
            .from("tags" as any)
            .insert({ client_id: clientId, nome: tag })
            .select("id")
            .single();
          if (tagErr) throw tagErr;
          tagId = (newTag as any).id;
        }
        const pessoaIds = contacts.map((c) => byPhone.get(c.telefone)).filter(Boolean) as string[];
        if (pessoaIds.length > 0 && tagId) {
          // Descobre quais já têm a tag
          const { data: existingLinks } = await supabase
            .from("pessoas_tags" as any)
            .select("pessoa_id")
            .eq("tag_id", tagId)
            .in("pessoa_id", pessoaIds);
          const already = new Set((existingLinks || []).map((l: any) => l.pessoa_id));
          const toLink = pessoaIds.filter((id) => !already.has(id));
          if (toLink.length > 0) {
            await supabase.from("pessoas_tags" as any).insert(
              toLink.map((pessoa_id) => ({ pessoa_id, tag_id: tagId! }))
            );
          }
        }
      }

      toast.success(
        `Importação concluída: ${toInsert.length} novos, ${contacts.length - toInsert.length} já existiam${tag ? `, tag "${tag}" aplicada` : ""}.`
      );
      setOpen(false);
      reset();
    } catch (err: any) {
      toast.error("Falha ao importar: " + (err?.message || ""));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-1">
            <Upload className="h-4 w-4" /> Importar contatos
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Importar contatos (CSV / XLSX)
          </DialogTitle>
          <DialogDescription>
            Aceita colunas <strong>nome</strong> e <strong>telefone</strong> (com ou sem cabeçalho).
            Telefones brasileiros com DDD são normalizados automaticamente para o formato WhatsApp.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="block w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground hover:file:bg-primary/90"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            {fileName && <p className="text-xs text-muted-foreground mt-1">Arquivo: {fileName}</p>}
          </div>

          {rows.length > 0 && (
            <>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline" className="gap-1">
                  <CheckCircle className="h-3 w-3 text-emerald-600" /> {stats.valid} válidos
                </Badge>
                {stats.dup > 0 && (
                  <Badge variant="outline" className="gap-1 text-amber-600">
                    ⚠ {stats.dup} duplicados
                  </Badge>
                )}
                {stats.invalid > 0 && (
                  <Badge variant="outline" className="gap-1 text-destructive">
                    <XCircle className="h-3 w-3" /> {stats.invalid} inválidos
                  </Badge>
                )}
                <Badge variant="secondary">{stats.total} linhas</Badge>
              </div>

              <ScrollArea className="max-h-[220px] rounded border">
                <div className="text-xs">
                  <div className="grid grid-cols-[1fr,140px,90px] gap-2 px-3 py-1.5 border-b bg-muted/50 font-medium">
                    <span>Nome</span>
                    <span>Telefone</span>
                    <span>Status</span>
                  </div>
                  {rows.slice(0, 100).map((r, i) => (
                    <div key={i} className="grid grid-cols-[1fr,140px,90px] gap-2 px-3 py-1 border-b last:border-0">
                      <span className="truncate">{r.nome}</span>
                      <span className="font-mono text-muted-foreground">
                        {r.valid ? fmtPhoneBR(r.telefone) : r.telefone_raw || "—"}
                      </span>
                      <span className={r.duplicate ? "text-amber-600" : r.valid ? "text-emerald-600" : "text-destructive"}>
                        {r.duplicate ? "duplicado" : r.valid ? "ok" : "inválido"}
                      </span>
                    </div>
                  ))}
                  {rows.length > 100 && (
                    <p className="px-3 py-2 text-muted-foreground">
                      +{rows.length - 100} linhas não mostradas na prévia.
                    </p>
                  )}
                </div>
              </ScrollArea>

              <div className="space-y-2">
                <Label>Destino</Label>
                <RadioGroup value={destino} onValueChange={(v) => setDestino(v as any)}>
                  {onUseAsList && (
                    <div className="flex items-start gap-2">
                      <RadioGroupItem value="lista" id="dest-lista" className="mt-1" />
                      <Label htmlFor="dest-lista" className="font-normal cursor-pointer">
                        <span className="font-medium">Usar só neste disparo</span>
                        <span className="block text-xs text-muted-foreground">
                          Contatos ficam em memória para este envio; não são gravados no CRM.
                        </span>
                      </Label>
                    </div>
                  )}
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="pessoas" id="dest-pessoas" className="mt-1" />
                    <Label htmlFor="dest-pessoas" className="font-normal cursor-pointer">
                      <span className="font-medium">Gravar no CRM (Pessoas)</span>
                      <span className="block text-xs text-muted-foreground">
                        Cria como apoiadores; telefones já cadastrados não são duplicados.
                      </span>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {destino === "pessoas" && (
                <div className="space-y-1">
                  <Label htmlFor="tag-nome">Aplicar tag (opcional)</Label>
                  <Input
                    id="tag-nome"
                    placeholder="Ex.: Importados-Julho"
                    value={tagNome}
                    onChange={(e) => setTagNome(e.target.value)}
                    maxLength={60}
                  />
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={busy || stats.valid === 0}>
            {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {destino === "lista" ? `Usar ${stats.valid} contatos` : `Importar ${stats.valid} contatos`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
