import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FileText, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";

const TIPOS = [
  { key: "eleicao_coordenador", label: "Coordenador" },
  { key: "eleicao_lider", label: "Líder" },
  { key: "eleicao_cabo", label: "Cabo Eleitoral" },
] as const;

type TipoKey = typeof TIPOS[number]["key"];

interface Template { id: string; tipo: string; titulo: string; conteudo: string }

const PLACEHOLDERS = "{nome} {tipo} {telefone} {endereco} {cidade} {regiao} {lider} {coordenador} {valor} {valor_extenso} {data} {contratante}";

export default function EleicaoContractTemplates({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<TipoKey>("eleicao_coordenador");
  const [templates, setTemplates] = useState<Record<TipoKey, Template | null>>({
    eleicao_coordenador: null, eleicao_lider: null, eleicao_cabo: null,
  });

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("contract_templates")
      .select("id,tipo,titulo,conteudo")
      .eq("client_id", clientId)
      .in("tipo", TIPOS.map(t => t.key));
    const next: any = { eleicao_coordenador: null, eleicao_lider: null, eleicao_cabo: null };
    for (const r of (data || []) as Template[]) next[r.tipo] = r;
    setTemplates(next);
    setLoading(false);
  }

  useEffect(() => { if (open) load(); /* eslint-disable-next-line */ }, [open, clientId]);

  async function save() {
    const t = templates[tab];
    if (!t) { toast.error("Modelo não encontrado"); return; }
    setSaving(true);
    const { error } = await supabase
      .from("contract_templates")
      .update({ titulo: t.titulo, conteudo: t.conteudo })
      .eq("id", t.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Modelo salvo!");
  }

  const current = templates[tab];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <FileText className="w-3.5 h-3.5" />Modelos de contrato
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileText className="w-5 h-5" />Modelos de contrato</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Placeholders disponíveis: <code className="text-[11px] bg-muted px-1 rounded">{PLACEHOLDERS}</code>
        </p>
        <Tabs value={tab} onValueChange={(v) => setTab(v as TipoKey)}>
          <TabsList className="grid grid-cols-3 w-full">
            {TIPOS.map(t => <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>)}
          </TabsList>
          {TIPOS.map(t => (
            <TabsContent key={t.key} value={t.key} className="space-y-3 mt-3">
              {loading ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Carregando…</p>
              ) : !current ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Modelo não criado.</p>
              ) : (
                <>
                  <div>
                    <Label>Título</Label>
                    <Input value={current.titulo} onChange={e => setTemplates(p => ({ ...p, [tab]: { ...current!, titulo: e.target.value } }))} />
                  </div>
                  <div>
                    <Label>Conteúdo</Label>
                    <Textarea
                      rows={20}
                      className="font-mono text-xs"
                      value={current.conteudo}
                      onChange={e => setTemplates(p => ({ ...p, [tab]: { ...current!, conteudo: e.target.value } }))}
                    />
                  </div>
                </>
              )}
            </TabsContent>
          ))}
        </Tabs>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Fechar</Button>
          <Button onClick={save} disabled={saving || !current}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
