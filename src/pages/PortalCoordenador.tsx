import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Crown, Users, UserCheck, LogOut, Plus, Trash2, Phone, MapPin, Loader2, KeyRound, ChevronDown, ChevronRight, Camera, Copy, Send } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import CampaignFrameGenerator from "@/components/campaign-frame/CampaignFrameGenerator";
import VotosVoluntariosPanel from "@/components/eleicao/VotosVoluntariosPanel";

function buildFotoLink(clientId: string) {
  const base = (typeof window !== "undefined" ? window.location.origin : "").replace(/\/$/, "");
  return `${base}/foto/${clientId}`;
}
function waPhone(p: string) {
  const d = (p || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("55")) return d;
  return d.length <= 11 ? "55" + d : d;
}

/**
 * Mensagem combinada de boas-vindas: (1) convite para o grupo da região +
 * (2) link da foto/moldura de perfil oficial. Se o grupo não estiver
 * configurado, envia só a parte da foto.
 */
function sendBoasVindasWhats(
  pessoa: { nome: string; telefone: string },
  clientId: string,
  ctx: { linkGrupo: string | null; regiao: string | null; candidatoNome: string },
) {
  const phone = waPhone(pessoa.telefone);
  const linkFoto = buildFotoLink(clientId);
  const primeiro = pessoa.nome.split(" ")[0] || pessoa.nome;
  const candidato = ctx.candidatoNome ? ` da campanha do ${ctx.candidatoNome}` : "";
  const regiaoLbl = ctx.regiao ? ` da região ${ctx.regiao}` : "";

  let msg: string;
  if (ctx.linkGrupo) {
    msg =
      `Oi ${primeiro}! Que bom ter você com a gente${candidato}. 🙌\n\n` +
      `1) Entre no nosso grupo de WhatsApp${regiaoLbl} — é por lá que a gente alinha as missões, manda os conteúdos pra você compartilhar nas redes e tira dúvidas em tempo real:\n` +
      `${ctx.linkGrupo}\n\n` +
      `2) Aproveite e já troque sua foto de perfil pela moldura oficial — ajuda muito a fortalecer nossa presença nas redes:\n` +
      `${linkFoto}`;
  } else {
    msg =
      `Oi ${primeiro}! Que bom ter você com a gente${candidato}. 🙌\n\n` +
      `Já troque sua foto de perfil pela moldura oficial — ajuda muito a fortalecer nossa presença nas redes:\n` +
      `${linkFoto}`;
  }
  const url = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
    : `https://wa.me/?text=${encodeURIComponent(msg)}`;
  window.open(url, "_blank");
}

type Tipo = "coordenador" | "lider" | "cabo";
interface Pessoa {
  id: string; client_id: string; tipo: Tipo;
  escopo: "campo_grande" | "interior";
  regiao: string | null; cidade: string | null;
  nome: string; telefone: string; endereco: string;
  parent_id: string | null; user_id: string | null;
  pode_cadastrar_lider?: boolean | null;
  pode_cadastrar_cabo?: boolean | null;
}

const TIPO_META: Record<Tipo, { label: string; color: string; icon: any }> = {
  coordenador: { label: "Coordenador", color: "text-red-600 border-red-500/30 bg-red-500/10", icon: Crown },
  lider: { label: "Líder", color: "text-blue-600 border-blue-500/30 bg-blue-500/10", icon: Users },
  cabo: { label: "Cabo", color: "text-green-600 border-green-500/30 bg-green-500/10", icon: UserCheck },
};

const onlyDigits = (s: string) => s.replace(/\D/g, "");

export default function PortalCoordenador() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<Pessoa | null>(null);
  const [team, setTeam] = useState<Pessoa[]>([]);
  const [clientName, setClientName] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [globalCfg, setGlobalCfg] = useState<{ cadastro_lider_ativo: boolean; cadastro_cabo_ativo: boolean }>({ cadastro_lider_ativo: true, cadastro_cabo_ativo: true });
  const [linkGrupo, setLinkGrupo] = useState<string | null>(null);
  const [candidatoNome, setCandidatoNome] = useState<string>("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    tipo: "lider" as Tipo,
    nome: "", telefone: "",
    cep: "", rua: "", numero: "", bairro: "", cidade: "", complemento: "",
    parent_id: "" as string,
  });

  // Redefinir senha
  const [pwdOpen, setPwdOpen] = useState(false);
  const [newPwd, setNewPwd] = useState("");
  const [newPwd2, setNewPwd2] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [clientId]);

  async function load() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { navigate(`/portal/${clientId}`); return; }
    const { data: cl } = await supabase.from("clients").select("name").eq("id", clientId!).maybeSingle();
    if (cl) {
      setClientName(cl.name);
      setCandidatoNome(cl.name || "");
    }

    // Link do grupo da região (eleicao_notif_config.grupos_links: { regiao: url })
    const { data: notifCfg } = await supabase
      .from("eleicao_notif_config" as any)
      .select("grupos_links")
      .eq("client_id", clientId!)
      .maybeSingle();

    const { data: meRow } = await supabase.from("eleicao_pessoas" as any)
      .select("*").eq("user_id", session.user.id).eq("client_id", clientId!).eq("tipo", "coordenador")
      .maybeSingle();
    if (!meRow) { navigate(`/portal/${clientId}`); return; }
    setMe(meRow as any);

    const grupos = ((notifCfg as any)?.grupos_links ?? {}) as Record<string, string>;
    const reg = (meRow as any).regiao as string | null;
    setLinkGrupo(reg && grupos[reg] ? grupos[reg] : null);

    const { data: tr } = await supabase.from("eleicao_pessoas" as any)
      .select("*").eq("client_id", clientId!).order("nome");
    setTeam((tr as any) || []);

    const { data: cfg } = await supabase
      .rpc("get_eleicao_cadastro_flags" as any, { _client_id: clientId! });
    const row = Array.isArray(cfg) ? cfg[0] : cfg;
    if (row) {
      setGlobalCfg({
        cadastro_lider_ativo: (row as any).cadastro_lider_ativo ?? true,
        cadastro_cabo_ativo: (row as any).cadastro_cabo_ativo ?? true,
      });
    }
    setLoading(false);
  }

  function openNew(tipo: Tipo, parent_id = "") {
    setForm({
      tipo, nome: "", telefone: "",
      cep: "", rua: "", numero: "", bairro: "",
      cidade: me?.cidade || (me?.escopo === "campo_grande" ? "Campo Grande" : ""),
      complemento: "", parent_id,
    });
    setDialogOpen(true);
  }

  async function lookupCep(cep: string) {
    const c = onlyDigits(cep);
    if (c.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${c}/json/`);
      const j = await r.json();
      if (j.erro) return;
      setForm(f => ({
        ...f,
        rua: j.logradouro || f.rua,
        bairro: j.bairro || f.bairro,
        cidade: j.localidade || f.cidade,
      }));
    } catch { /* silencioso */ }
  }

  async function save() {
    if (!me) return;
    if (!form.nome.trim() || !form.telefone.trim()) { toast.error("Nome e telefone são obrigatórios"); return; }
    if (!form.rua.trim() || !form.numero.trim() || !form.bairro.trim() || !form.cidade.trim()) {
      toast.error("Preencha rua, número, bairro e cidade"); return;
    }
    const enderecoFmt = [
      `${form.rua.trim()}, ${form.numero.trim()}`,
      form.complemento.trim() && form.complemento.trim(),
      form.bairro.trim(),
      `${form.cidade.trim()}${form.cep ? ` - CEP ${form.cep.trim()}` : ""}`,
    ].filter(Boolean).join(" - ");

    const parent = form.parent_id || me.id;

    // Verificar se telefone já é de um funcionário deste client → propor vínculo
    const { findFuncionarioByPhone } = await import("@/lib/funcionario-link");
    const func = await findFuncionarioByPhone(me.client_id, form.telefone.trim());
    let funcionarioId: string | null = null;
    if (func) {
      const ok = window.confirm(
        `Esse telefone já é do funcionário "${func.nome}". Deseja vincular esse novo papel ao mesmo funcionário (sem duplicar o cadastro)?`,
      );
      if (!ok) return;
      funcionarioId = func.id;
    }

    const payload: any = {
      client_id: me.client_id,
      tipo: form.tipo,
      escopo: me.escopo,
      regiao: me.regiao,
      cidade: form.cidade.trim() || me.cidade,
      nome: form.nome.trim(),
      telefone: form.telefone.trim(),
      endereco: enderecoFmt,
      parent_id: parent,
      funcionario_id: funcionarioId,
    };
    setSaving(true);
    const { error } = await supabase.from("eleicao_pessoas" as any).insert(payload);
    setSaving(false);
    if (error) {
      const msg = /duplicad|já existe|already exists|unique/i.test(error.message)
        ? "Esse telefone (ou nome + telefone) já está cadastrado neste cliente."
        : error.message;
      toast.error(msg);
      return;
    }
    toast.success("Cadastrado!");
    setDialogOpen(false);
    load();
  }

  async function remove(id: string) {
    if (!confirm("Excluir este cadastro?")) return;
    const { error } = await supabase.from("eleicao_pessoas" as any).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Excluído");
    load();
  }

  async function changePassword() {
    if (newPwd.length < 6) { toast.error("Senha precisa ter ao menos 6 caracteres"); return; }
    if (newPwd !== newPwd2) { toast.error("Senhas não coincidem"); return; }
    setPwdSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPwd });
    setPwdSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Senha redefinida com sucesso");
    setPwdOpen(false); setNewPwd(""); setNewPwd2("");
  }

  async function logout() {
    await supabase.auth.signOut();
    navigate(`/portal/${clientId}`);
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!me) return null;

  const myLideres = team.filter(p => p.tipo === "lider" && p.parent_id === me.id);
  const myCabosDir = team.filter(p => p.tipo === "cabo" && p.parent_id === me.id);
  const totals = { lideres: team.filter(p => p.tipo === "lider").length, cabos: team.filter(p => p.tipo === "cabo").length };

  const permiteLider = globalCfg.cadastro_lider_ativo && (me.pode_cadastrar_lider ?? true);
  const permiteCabo = globalCfg.cadastro_cabo_ativo && (me.pode_cadastrar_cabo ?? true);
  const motivoLider = !globalCfg.cadastro_lider_ativo
    ? "Cadastros de líderes temporariamente bloqueados pela administração da campanha."
    : !(me.pode_cadastrar_lider ?? true) ? "Você está temporariamente bloqueado para cadastrar líderes." : "";
  const motivoCabo = !globalCfg.cadastro_cabo_ativo
    ? "Cadastros de cabos temporariamente bloqueados pela administração da campanha."
    : !(me.pode_cadastrar_cabo ?? true) ? "Você está temporariamente bloqueado para cadastrar cabos." : "";

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background">
      <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto p-4 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{clientName}</p>
            <h1 className="font-bold flex items-center gap-2 truncate"><Crown className="w-4 h-4 text-red-600 shrink-0" />{me.nome}</h1>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="sm" onClick={() => setPwdOpen(true)} title="Redefinir senha">
              <KeyRound className="w-4 h-4 sm:mr-1" /><span className="hidden sm:inline">Senha</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={logout}><LogOut className="w-4 h-4 sm:mr-1" /><span className="hidden sm:inline">Sair</span></Button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Sua região</p>
            <p className="font-semibold flex items-center gap-1"><MapPin className="w-4 h-4" />
              {me.escopo === "campo_grande" ? `Campo Grande — ${me.regiao}` : me.cidade}
            </p>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div><p className="text-xs text-muted-foreground">Líderes</p><p className="text-2xl font-bold text-blue-600 tabular-nums">{totals.lideres}</p></div>
              <div><p className="text-xs text-muted-foreground">Cabos</p><p className="text-2xl font-bold text-green-600 tabular-nums">{totals.cabos}</p></div>
            </div>
          </CardContent>
        </Card>

        {(motivoLider || motivoCabo) && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200 p-3 text-xs space-y-1">
            {motivoLider && <p>🔒 {motivoLider}</p>}
            {motivoCabo && <p>🔒 {motivoCabo}</p>}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {me.escopo === "campo_grande" && (
            <Button size="sm" onClick={() => openNew("lider", me.id)} disabled={!permiteLider} title={motivoLider || undefined}>
              <Plus className="w-3.5 h-3.5 mr-1" />Novo Líder
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => openNew("cabo", me.id)} disabled={!permiteCabo} title={motivoCabo || undefined}>
            <Plus className="w-3.5 h-3.5 mr-1" />Novo Cabo eleitoral
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              const link = buildFotoLink(clientId!);
              try {
                await navigator.clipboard.writeText(link);
                toast.success("Link da foto copiado!", { description: link });
              } catch {
                toast.info(link);
              }
            }}
          >
            <Copy className="w-3.5 h-3.5 mr-1" />Copiar link da foto
          </Button>
        </div>


        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Camera className="w-4 h-4 text-primary" />Foto de perfil da campanha
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-2">
              Gere sua foto com a moldura oficial ou copie o link acima e envie para apoiadores.
            </p>
            {clientId && <CampaignFrameGenerator clientId={clientId} variant="showcase" />}
          </CardContent>
        </Card>

        {me.escopo === "campo_grande" && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Meus Líderes</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {myLideres.length === 0 && <p className="text-sm text-muted-foreground">Nenhum líder cadastrado ainda.</p>}
              {myLideres.map(l => {
                const cabosDoLider = team.filter(p => p.tipo === "cabo" && p.parent_id === l.id);
                const isCollapsed = collapsed[l.id] ?? true;
                return (
                  <div key={l.id} className="border rounded-lg overflow-hidden">
                    <div className="flex items-center gap-2 p-2 hover:bg-muted/40">
                      <button
                        type="button"
                        onClick={() => setCollapsed(c => ({ ...c, [l.id]: !isCollapsed }))}
                        className="flex items-center gap-2 flex-1 min-w-0 text-left"
                      >
                        {isCollapsed ? <ChevronRight className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                        <div className={cn("rounded-full flex items-center justify-center shrink-0 border w-8 h-8", TIPO_META.lider.color)}>
                          <Users className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{l.nome}</p>
                          <p className="text-xs text-muted-foreground truncate flex items-center gap-2">
                            <Phone className="w-3 h-3" />{l.telefone}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-[10px]">{cabosDoLider.length} cabos</Badge>
                      </button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-emerald-600"
                        title={linkGrupo ? "Enviar boas-vindas (grupo + foto) via WhatsApp" : "Enviar link da foto via WhatsApp"}
                        onClick={() => sendBoasVindasWhats(l, clientId!, { linkGrupo, regiao: me.regiao, candidatoNome })}
                      >
                        <Send className="w-4 h-4" />
                      </Button>
                    </div>
                    {!isCollapsed && (
                      <div className="px-3 pb-3 pt-1 border-t bg-muted/20">
                        <div className="ml-2 space-y-1">
                          {cabosDoLider.length === 0 && <p className="text-xs text-muted-foreground py-1">Sem cabos vinculados.</p>}
                          {cabosDoLider.map(cb => <PessoaRow key={cb.id} p={cb} onDelete={remove} clientId={clientId!} small linkGrupo={linkGrupo} regiao={me.regiao} candidatoNome={candidatoNome} />)}
                        </div>
                        <div className="flex gap-2 mt-2">
                          <Button size="sm" variant="ghost" onClick={() => openNew("cabo", l.id)} disabled={!permiteCabo} title={motivoCabo || undefined}>
                            <Plus className="w-3 h-3 mr-1" />Cabo deste líder
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive ml-auto" onClick={() => remove(l.id)}>
                            <Trash2 className="w-3 h-3 mr-1" />Excluir líder
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {(myCabosDir.length > 0 || me.escopo === "interior") && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Cabos diretos</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {myCabosDir.length === 0 && <p className="text-sm text-muted-foreground">Nenhum cabo direto.</p>}
              {myCabosDir.map(cb => <PessoaRow key={cb.id} p={cb} onDelete={remove} clientId={clientId!} linkGrupo={linkGrupo} regiao={me.regiao} candidatoNome={candidatoNome} />)}
            </CardContent>
          </Card>
        )}

        {/* Votos voluntários — eleitores que NÃO são contratados */}
        <VotosVoluntariosPanel coordenadorId={me.id} candidatoNome={candidatoNome} />
      </main>

      {/* Dialog de cadastro */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Novo {TIPO_META[form.tipo].label}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-[11px] bg-muted/50 border border-border/60 rounded-md px-2.5 py-1.5 text-muted-foreground">
              ℹ️ O valor do contrato será definido pela administração da campanha.
            </div>
            {form.tipo === "cabo" && me.escopo === "campo_grande" && myLideres.length > 0 && (
              <div>
                <Label>Vincular a líder (opcional)</Label>
                <Select value={form.parent_id || me.id} onValueChange={v => setForm(f => ({ ...f, parent_id: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={me.id}>— Direto comigo —</SelectItem>
                    {myLideres.map(l => <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div><Label>Nome completo *</Label><Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} /></div>
            <div><Label>Telefone (WhatsApp) *</Label><Input value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} placeholder="(67) 99999-0000" /></div>

            <div className="pt-2 border-t">
              <p className="text-sm font-medium mb-2">Endereço</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1">
                  <Label className="text-xs">CEP</Label>
                  <Input
                    value={form.cep}
                    onChange={e => setForm(f => ({ ...f, cep: e.target.value }))}
                    onBlur={e => lookupCep(e.target.value)}
                    placeholder="00000-000"
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Rua / Avenida *</Label>
                  <Input value={form.rua} onChange={e => setForm(f => ({ ...f, rua: e.target.value }))} />
                </div>
                <div className="col-span-1">
                  <Label className="text-xs">Número *</Label>
                  <Input value={form.numero} onChange={e => setForm(f => ({ ...f, numero: e.target.value }))} placeholder="123" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Bairro *</Label>
                  <Input value={form.bairro} onChange={e => setForm(f => ({ ...f, bairro: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Cidade *</Label>
                  <Input value={form.cidade} onChange={e => setForm(f => ({ ...f, cidade: e.target.value }))} />
                </div>
                <div className="col-span-1">
                  <Label className="text-xs">Compl.</Label>
                  <Input value={form.complemento} onChange={e => setForm(f => ({ ...f, complemento: e.target.value }))} placeholder="Apto, fundos..." />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Cadastrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog redefinir senha */}
      <Dialog open={pwdOpen} onOpenChange={setPwdOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Redefinir minha senha</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nova senha</Label><Input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="Mínimo 6 caracteres" /></div>
            <div><Label>Confirmar nova senha</Label><Input type="password" value={newPwd2} onChange={e => setNewPwd2(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPwdOpen(false)} disabled={pwdSaving}>Cancelar</Button>
            <Button onClick={changePassword} disabled={pwdSaving}>
              {pwdSaving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Salvar nova senha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PessoaRow({ p, onDelete, clientId, small }: { p: Pessoa; onDelete: (id: string) => void; clientId: string; small?: boolean }) {
  const meta = TIPO_META[p.tipo];
  const Icon = meta.icon;
  return (
    <div className={cn("group flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/40", small && "text-sm")}>
      <div className={cn("rounded-full flex items-center justify-center shrink-0 border", meta.color, small ? "w-6 h-6" : "w-8 h-8")}>
        <Icon className={small ? "w-3 h-3" : "w-4 h-4"} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{p.nome}</p>
        <p className="text-xs text-muted-foreground truncate flex items-center gap-2">
          <Phone className="w-3 h-3" />{p.telefone}
        </p>
      </div>
      <Badge variant="outline" className={cn("text-[10px]", meta.color)}>{meta.label}</Badge>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 text-emerald-600 opacity-70 hover:opacity-100"
        title="Enviar link da foto via WhatsApp"
        onClick={() => sendFotoWhats(p, clientId)}
      >
        <Send className="w-3.5 h-3.5" />
      </Button>
      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive opacity-60 hover:opacity-100" onClick={() => onDelete(p.id)}>
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
