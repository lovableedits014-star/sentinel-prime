import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save, MessageSquare, Phone, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";

const REGIOES = [
  { value: "centro", label: "Centro" },
  { value: "segredo", label: "Segredo" },
  { value: "prosa", label: "Prosa" },
  { value: "bandeira", label: "Bandeira" },
  { value: "anhanduizinho", label: "Anhanduizinho" },
  { value: "lagoa", label: "Lagoa" },
  { value: "imbirussu", label: "Imbirussu" },
  { value: "moreninha", label: "Moreninha" },
];

const DEFAULT_TPL_COORD =
  "Foi adicionado novo líder na região: *{regiao}*\n\nNome: {nome}\nTelefone: {telefone}\nRua: {rua}, {numero}\nBairro: {bairro}";
const DEFAULT_TPL_LIDER =
  "Olá {nome}! Você foi cadastrado como líder na região *{regiao}*.\n\nEntre no grupo da região para receber as orientações:\n{link_grupo}";

interface Cfg {
  id?: string;
  client_id: string;
  secretaria_telefone: string;
  auto_enviar: boolean;
  template_coordenador: string;
  template_lider: string;
  grupos_links: Record<string, string>;
}

export default function EleicaoConfigPanel({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cfg, setCfg] = useState<Cfg>({
    client_id: clientId,
    secretaria_telefone: "",
    auto_enviar: true,
    template_coordenador: DEFAULT_TPL_COORD,
    template_lider: DEFAULT_TPL_LIDER,
    grupos_links: {},
  });

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("eleicao_notif_config" as any)
      .select("*")
      .eq("client_id", clientId)
      .maybeSingle();
    if (data) {
      const d = data as any;
      setCfg({
        id: d.id,
        client_id: d.client_id,
        secretaria_telefone: d.secretaria_telefone || "",
        auto_enviar: !!d.auto_enviar,
        template_coordenador: d.template_coordenador || DEFAULT_TPL_COORD,
        template_lider: d.template_lider || DEFAULT_TPL_LIDER,
        grupos_links: d.grupos_links || {},
      });
    }
    setLoading(false);
  }

  useEffect(() => { if (clientId) load(); /* eslint-disable-next-line */ }, [clientId]);

  async function save() {
    setSaving(true);
    const payload = {
      client_id: clientId,
      secretaria_telefone: cfg.secretaria_telefone.trim() || null,
      auto_enviar: cfg.auto_enviar,
      template_coordenador: cfg.template_coordenador,
      template_lider: cfg.template_lider,
      grupos_links: cfg.grupos_links,
    };
    const q = cfg.id
      ? supabase.from("eleicao_notif_config" as any).update(payload).eq("id", cfg.id)
      : supabase.from("eleicao_notif_config" as any).insert(payload);
    const { error } = await q;
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Configurações salvas!");
    load();
  }

  if (loading) {
    return <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-semibold flex items-center gap-2"><MessageSquare className="w-4 h-4" />Notificações automáticas ao cadastrar líder</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Envia WhatsApp para o coordenador da região, secretaria e o próprio líder cadastrado.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={cfg.auto_enviar} onCheckedChange={(v) => setCfg(c => ({ ...c, auto_enviar: v }))} />
            <span>{cfg.auto_enviar ? "Ativado" : "Desativado"}</span>
          </label>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2 font-medium text-sm"><Phone className="w-4 h-4" />Telefone da secretaria</div>
        <p className="text-xs text-muted-foreground">Recebe uma cópia da notificação a cada novo líder cadastrado.</p>
        <Input
          placeholder="(67) 99999-0000"
          value={cfg.secretaria_telefone}
          onChange={e => setCfg(c => ({ ...c, secretaria_telefone: e.target.value }))}
        />
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2 font-medium text-sm"><LinkIcon className="w-4 h-4" />Links dos grupos por região (Campo Grande)</div>
        <p className="text-xs text-muted-foreground">Será enviado ao líder cadastrado na respectiva região.</p>
        <div className="grid gap-2">
          {REGIOES.map(r => (
            <div key={r.value} className="grid grid-cols-[140px_1fr] gap-2 items-center">
              <Label className="text-xs">{r.label}</Label>
              <Input
                placeholder="https://chat.whatsapp.com/..."
                value={cfg.grupos_links[r.value] || ""}
                onChange={e => setCfg(c => ({ ...c, grupos_links: { ...c.grupos_links, [r.value]: e.target.value } }))}
              />
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="font-medium text-sm">Mensagem para coordenador / secretaria</div>
        <p className="text-xs text-muted-foreground">
          Placeholders: <code className="bg-muted px-1 rounded">{"{nome} {regiao} {telefone} {rua} {numero} {bairro}"}</code>
        </p>
        <Textarea rows={7} className="font-mono text-xs"
          value={cfg.template_coordenador}
          onChange={e => setCfg(c => ({ ...c, template_coordenador: e.target.value }))} />
      </Card>

      <Card className="p-4 space-y-3">
        <div className="font-medium text-sm">Mensagem para o líder cadastrado</div>
        <p className="text-xs text-muted-foreground">
          Placeholders: <code className="bg-muted px-1 rounded">{"{nome} {regiao} {link_grupo}"}</code>
        </p>
        <Textarea rows={6} className="font-mono text-xs"
          value={cfg.template_lider}
          onChange={e => setCfg(c => ({ ...c, template_lider: e.target.value }))} />
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          Salvar configurações
        </Button>
      </div>
    </div>
  );
}
