import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Save, Loader2, RotateCcw, Copy } from "lucide-react";
import { toast } from "sonner";
import {
  CONTRATO_PADRAO, DISTRATO_PADRAO,
  CONTRATO_TITULO_PADRAO, DISTRATO_TITULO_PADRAO,
} from "@/lib/eleicao-contrato-defaults";

const CARGOS = [
  { key: "coordenador", label: "Coordenador" },
  { key: "lider", label: "Líder" },
  { key: "cabo", label: "Cabo Eleitoral" },
] as const;

type Cargo = typeof CARGOS[number]["key"];
type Kind = "contrato" | "distrato";

const keyFor = (kind: Kind, cargo: Cargo) =>
  kind === "distrato" ? `eleicao_distrato_${cargo}` : `eleicao_${cargo}`;

interface Template { id: string; tipo: string; titulo: string; conteudo: string }

const PLACEHOLDERS =
  "{nome} {telefone} {rua} {numero} {bairro} {cidade} {cidade_uf} {regiao} {lider} {coordenador} {valor} {valor_extenso} {vigencia_inicio} {vigencia_fim} {dia} {mes} {ano} {data} {contratante} {linha}";

export default function EleicaoContractTemplates({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [kind, setKind] = useState<Kind>("contrato");
  const [cargo, setCargo] = useState<Cargo>("coordenador");
  const [byTipo, setByTipo] = useState<Record<string, Template | null>>({});

  async function load() {
    setLoading(true);
    const tipos = (["contrato", "distrato"] as Kind[]).flatMap(k => CARGOS.map(c => keyFor(k, c.key)));
    const { data } = await supabase
      .from("contract_templates")
      .select("id,tipo,titulo,conteudo")
      .eq("client_id", clientId)
      .in("tipo", tipos);
    const next: Record<string, Template | null> = {};
    for (const t of tipos) next[t] = null;
    for (const r of (data || []) as Template[]) next[r.tipo] = r;
    setByTipo(next);
    setLoading(false);
  }

  useEffect(() => { if (open) load(); /* eslint-disable-next-line */ }, [open, clientId]);

  const tipo = keyFor(kind, cargo);
  const current = byTipo[tipo] || null;

  function patch(fields: Partial<Template>) {
    setByTipo(p => ({
      ...p,
      [tipo]: {
        id: p[tipo]?.id || "",
        tipo,
        titulo: p[tipo]?.titulo || "",
        conteudo: p[tipo]?.conteudo || "",
        ...fields,
      },
    }));
  }

  function restaurarPadrao() {
    patch(kind === "distrato"
      ? { titulo: DISTRATO_TITULO_PADRAO, conteudo: DISTRATO_PADRAO }
      : { titulo: CONTRATO_TITULO_PADRAO, conteudo: CONTRATO_PADRAO });
    toast.info("Texto padrão carregado. Clique em Salvar para confirmar.");
  }

  async function aplicarAosTresCargos() {
    const t = byTipo[tipo];
    if (!t?.conteudo) { toast.error("Nada para aplicar"); return; }
    setSaving(true);
    for (const c of CARGOS) {
      const k = keyFor(kind, c.key);
      const existing = byTipo[k];
      if (existing?.id) {
        await supabase.from("contract_templates")
          .update({ titulo: t.titulo, conteudo: t.conteudo }).eq("id", existing.id);
      } else {
        await supabase.from("contract_templates")
          .insert({ client_id: clientId, tipo: k, titulo: t.titulo, conteudo: t.conteudo } as any);
      }
    }
    setSaving(false);
    toast.success("Texto aplicado aos 3 cargos!");
    load();
  }

  async function save() {
    const t = byTipo[tipo];
    if (!t?.conteudo?.trim()) { toast.error("Conteúdo vazio"); return; }
    setSaving(true);
    const payload = { titulo: t.titulo || (kind === "distrato" ? DISTRATO_TITULO_PADRAO : CONTRATO_TITULO_PADRAO), conteudo: t.conteudo };
    const { error } = t.id
      ? await supabase.from("contract_templates").update(payload).eq("id", t.id)
      : await supabase.from("contract_templates").insert({ client_id: clientId, tipo, ...payload } as any);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Modelo salvo!");
    load();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <FileText className="w-3.5 h-3.5" />Modelos de contrato
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileText className="w-5 h-5" />Modelos de contrato e distrato</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          O texto é o mesmo para os 3 cargos — o que muda é o valor e a aparência do documento impresso.
          Placeholders: <code className="text-[11px] bg-muted px-1 rounded">{PLACEHOLDERS}</code>
        </p>

        <Tabs value={kind} onValueChange={(v) => setKind(v as Kind)}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="contrato">Contrato</TabsTrigger>
            <TabsTrigger value="distrato">Distrato</TabsTrigger>
          </TabsList>
        </Tabs>

        <Tabs value={cargo} onValueChange={(v) => setCargo(v as Cargo)}>
          <TabsList className="grid grid-cols-3 w-full">
            {CARGOS.map(c => <TabsTrigger key={c.key} value={c.key}>{c.label}</TabsTrigger>)}
          </TabsList>
        </Tabs>

        {loading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Carregando…</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={restaurarPadrao}>
                <RotateCcw className="w-3.5 h-3.5" />Restaurar texto padrão
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={aplicarAosTresCargos} disabled={saving}>
                <Copy className="w-3.5 h-3.5" />Aplicar este texto aos 3 cargos
              </Button>
            </div>
            <div>
              <Label>Título</Label>
              <Input value={current?.titulo || ""} onChange={e => patch({ titulo: e.target.value })} />
            </div>
            <div>
              <Label>Conteúdo</Label>
              <Textarea
                rows={20}
                className="font-mono text-xs"
                value={current?.conteudo || ""}
                onChange={e => patch({ conteudo: e.target.value })}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Fechar</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
