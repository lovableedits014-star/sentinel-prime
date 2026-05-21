import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save, MessageSquare, Phone, Link as LinkIcon, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useRegioesEleicao } from "@/hooks/useRegioesEleicao";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const DEFAULT_TPL_COORD =
  "Foi adicionado novo líder na região: *{regiao}*\n\nNome: {nome}\nTelefone: {telefone}\nRua: {rua}, {numero}\nBairro: {bairro}";
const DEFAULT_TPL_LIDER =
  "Olá {nome}! Você foi cadastrado como líder na região *{regiao}*.\n\nEntre no grupo da região para receber as orientações:\n{link_grupo}";
const DEFAULT_TPL_COORD_BV =
  "Olá {nome}! Você foi cadastrado como coordenador da região *{regiao}*.\n\nEntre no grupo da sua região e aguarde as próximas instruções:\n{link_grupo}";
const DEFAULT_TPL_CABO_BV =
  "Olá {nome}! Você foi cadastrado como cabo eleitoral na região *{regiao}*.\n\nEntre no grupo da sua região para receber as próximas instruções:\n{link_grupo}";

interface Cfg {
  id?: string;
  client_id: string;
  secretaria_telefone: string;
  auto_enviar: boolean;
  template_coordenador: string;
  template_lider: string;
  template_coordenador_boas_vindas: string;
  template_cabo_boas_vindas: string;
  grupos_links: Record<string, string>;
  grupos_jids: Record<string, string>;
}

type GroupOption = { group_jid: string; name: string | null };

export default function EleicaoConfigPanel({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { regioes, add, isAdding, remove, isRemoving } = useRegioesEleicao(clientId);
  const [novaRegiao, setNovaRegiao] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [cfg, setCfg] = useState<Cfg>({
    client_id: clientId,
    secretaria_telefone: "",
    auto_enviar: true,
    template_coordenador: DEFAULT_TPL_COORD,
    template_lider: DEFAULT_TPL_LIDER,
    template_coordenador_boas_vindas: DEFAULT_TPL_COORD_BV,
    template_cabo_boas_vindas: DEFAULT_TPL_CABO_BV,
    grupos_links: {},
    grupos_jids: {},
  });
  const [grupos, setGrupos] = useState<GroupOption[]>([]);

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
        template_coordenador_boas_vindas: d.template_coordenador_boas_vindas || DEFAULT_TPL_COORD_BV,
        template_cabo_boas_vindas: d.template_cabo_boas_vindas || DEFAULT_TPL_CABO_BV,
        grupos_links: d.grupos_links || {},
        grupos_jids: d.grupos_jids || {},
      });
    }
    // Carrega grupos do WhatsApp disponíveis
    const { data: gs } = await supabase
      .from("whatsapp_groups" as any)
      .select("group_jid, name")
      .eq("client_id", clientId)
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (gs) {
      // Dedupe por group_jid
      const seen = new Set<string>();
      const uniq: GroupOption[] = [];
      for (const g of gs as any[]) {
        if (!seen.has(g.group_jid)) { seen.add(g.group_jid); uniq.push(g); }
      }
      setGrupos(uniq);
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
      template_coordenador_boas_vindas: cfg.template_coordenador_boas_vindas,
      template_cabo_boas_vindas: cfg.template_cabo_boas_vindas,
      grupos_links: cfg.grupos_links,
      grupos_jids: cfg.grupos_jids,
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

  async function handleAddRegiao() {
    const label = novaRegiao.trim();
    if (!label) return;
    try {
      await add({ label });
      setNovaRegiao("");
      setShowAdd(false);
    } catch { /* toast já exibido */ }
  }

  function normalize(s: string) {
    return (s || "")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function autoVincular() {
    if (!grupos.length) { toast.error("Nenhum grupo sincronizado. Vá em Configurações → WhatsApp e sincronize."); return; }
    const next: Record<string, string> = { ...cfg.grupos_jids };
    let vinculados = 0;
    for (const r of regioes) {
      if (next[r.value]) continue;
      const nr = normalize(r.label);
      const tokens = nr.split(" ").filter(Boolean);
      const hit = grupos.find(g => {
        const ng = normalize(g.name || "");
        if (!ng) return false;
        if (ng.includes(nr) || nr.includes(ng)) return true;
        return tokens.some(t => t.length >= 4 && ng.includes(t));
      });
      if (hit) { next[r.value] = hit.group_jid; vinculados++; }
    }
    setCfg(c => ({ ...c, grupos_jids: next }));
    if (vinculados === 0) toast.info("Nenhuma região casou com algum grupo pelo nome. Vincule manualmente.");
    else toast.success(`${vinculados} região(ões) vinculada(s). Clique em Salvar para confirmar.`);
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2 font-medium text-sm">
            <LinkIcon className="w-4 h-4" />Regiões e links de grupos (Campo Grande)
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => setShowAdd(v => !v)}
          >
            <Plus className="w-4 h-4 mr-1" /> Nova região
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Adicione regiões personalizadas. O link configurado é enviado ao líder cadastrado naquela região.
        </p>

        {showAdd && (
          <div className="flex flex-col sm:flex-row gap-2 p-3 rounded-md bg-muted/40 border">
            <Input
              autoFocus
              placeholder="Nome da nova região (ex: Novo Horizonte)"
              value={novaRegiao}
              onChange={e => setNovaRegiao(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddRegiao(); } }}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAddRegiao} disabled={isAdding || !novaRegiao.trim()} className="flex-1 sm:flex-none">
                {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : "Adicionar"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowAdd(false); setNovaRegiao(""); }}>Cancelar</Button>
            </div>
          </div>
        )}

        <div className="grid gap-2">
          {regioes.length === 0 && (
            <p className="text-xs text-muted-foreground italic">Nenhuma região cadastrada. Clique em "Nova região" para começar.</p>
          )}
          {regioes.map(r => (
            <div key={r.id} className="flex flex-col gap-2 p-2 rounded-md border">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs sm:text-sm font-medium truncate">{r.label}</Label>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => remove({ id: r.id, value: r.value })}
                  disabled={isRemoving}
                  title="Remover região"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase text-muted-foreground">Link de convite</Label>
                  <Input
                    placeholder="https://chat.whatsapp.com/..."
                    value={cfg.grupos_links[r.value] || ""}
                    onChange={e => setCfg(c => ({ ...c, grupos_links: { ...c.grupos_links, [r.value]: e.target.value } }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase text-muted-foreground">Grupo no WhatsApp (rastreamento)</Label>
                  <Select
                    value={cfg.grupos_jids[r.value] || ""}
                    onValueChange={(v) => setCfg(c => ({ ...c, grupos_jids: { ...c.grupos_jids, [r.value]: v } }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={grupos.length ? "Selecione um grupo" : "Sincronize grupos em Configurações"} />
                    </SelectTrigger>
                    <SelectContent>
                      {grupos.map(g => (
                        <SelectItem key={g.group_jid} value={g.group_jid}>
                          {g.name || g.group_jid}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="font-medium text-sm">Mensagem para coordenador / secretaria</div>
        <p className="text-xs text-muted-foreground">
          Placeholders: <code className="bg-muted px-1 rounded text-[10px] sm:text-xs">{"{nome} {regiao} {telefone} {rua} {numero} {bairro}"}</code>
        </p>
        <Textarea rows={7} className="font-mono text-xs"
          value={cfg.template_coordenador}
          onChange={e => setCfg(c => ({ ...c, template_coordenador: e.target.value }))} />
      </Card>

      <Card className="p-4 space-y-3">
        <div className="font-medium text-sm">Mensagem para o líder cadastrado</div>
        <p className="text-xs text-muted-foreground">
          Placeholders: <code className="bg-muted px-1 rounded text-[10px] sm:text-xs">{"{nome} {regiao} {link_grupo}"}</code>
        </p>
        <Textarea rows={6} className="font-mono text-xs"
          value={cfg.template_lider}
          onChange={e => setCfg(c => ({ ...c, template_lider: e.target.value }))} />
      </Card>

      <Card className="p-4 space-y-3">
        <div className="font-medium text-sm">Mensagem de boas-vindas para o coordenador cadastrado</div>
        <p className="text-xs text-muted-foreground">
          Enviada automaticamente ao novo coordenador, com o link do grupo da região dele. Placeholders: <code className="bg-muted px-1 rounded text-[10px] sm:text-xs">{"{nome} {regiao} {link_grupo}"}</code>
        </p>
        <Textarea rows={6} className="font-mono text-xs"
          value={cfg.template_coordenador_boas_vindas}
          onChange={e => setCfg(c => ({ ...c, template_coordenador_boas_vindas: e.target.value }))} />
      </Card>

      <Card className="p-4 space-y-3">
        <div className="font-medium text-sm">Mensagem de boas-vindas para o cabo eleitoral cadastrado</div>
        <p className="text-xs text-muted-foreground">
          Enviada automaticamente ao novo cabo eleitoral, com o link do grupo da região dele. Placeholders: <code className="bg-muted px-1 rounded text-[10px] sm:text-xs">{"{nome} {regiao} {link_grupo}"}</code>
        </p>
        <Textarea rows={6} className="font-mono text-xs"
          value={cfg.template_cabo_boas_vindas}
          onChange={e => setCfg(c => ({ ...c, template_cabo_boas_vindas: e.target.value }))} />
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} className="w-full sm:w-auto">
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          Salvar configurações
        </Button>
      </div>
    </div>
  );
}
