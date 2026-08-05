import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Copy, Link as LinkIcon, MessageCircle, RefreshCw, Search, Send, Target, TrendingUp, Users, History, FlaskConical, Clock, Palette, Upload, Trash2, Eye, UserPlus, Plus, ChevronDown, ChevronUp, FileSpreadsheet, AlertTriangle } from "lucide-react";
import CobrancaAutoConfig from "./CobrancaAutoConfig";
import IndicarPaginaConfig from "./IndicarPaginaConfig";
import ImportarIndicadosDialog from "./ImportarIndicadosDialog";


type DispatchHist = {
  id: string;
  titulo: string;
  status: string;
  total_destinatarios: number;
  enviados: number;
  falhas: number;
  created_at: string;
  completed_at: string | null;
};

function fmtAgo(iso: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}min atrás`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h atrás`;
  const d = Math.floor(h / 24);
  return `${d}d atrás`;
}

type Tipo = "coordenador" | "lider" | "cabo";

type Row = {
  indicador_id: string;
  client_id: string;
  nome: string;
  tipo: Tipo;
  telefone: string | null;
  regiao: string | null;
  cidade: string | null;
  token: string | null;
  total_indicacoes: number;
  meta: number;
  ultimo_acesso_em: string | null;
  ultima_cobranca_em: string | null;
  cobrancas_enviadas: number;
};

type Config = {
  meta_coordenador: number;
  meta_lider: number;
  meta_cabo: number;
  limite_diario_token: number;
};

const tipoLabel: Record<Tipo, string> = { coordenador: "Coordenador", lider: "Líder", cabo: "Cabo" };

function buildLink(token: string) {
  return `${window.location.origin}/indicar/${token}`;
}

function waLink(telefone: string, msg: string) {
  const d = telefone.replace(/\D/g, "");
  const full = d.startsWith("55") ? d : `55${d}`;
  return `https://wa.me/${full}?text=${encodeURIComponent(msg)}`;
}

export default function IndicacoesPanel({ clientId }: { clientId: string }) {
  const [tab, setTab] = useState<"cobranca" | "config" | "pagina">("cobranca");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<"all" | Tipo>("all");
  const [filtroStatus, setFiltroStatus] = useState<"all" | "zerados" | "abaixo" | "ok">("all");
  const [config, setConfig] = useState<Config>({ meta_coordenador: 40, meta_lider: 25, meta_cabo: 2, limite_diario_token: 999999 });
  const [savingConfig, setSavingConfig] = useState(false);
  const [gerando, setGerando] = useState<string | null>(null);
  const [candidatoNome, setCandidatoNome] = useState<string>("");
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [importFor, setImportFor] = useState<Row | null>(null);
  const [lastRefresh, setLastRefresh] = useState<number>(Date.now());
  const [nowTick, setNowTick] = useState<number>(Date.now());


  // ===== Disparo em massa =====
  const TEMPLATE_PADRAO = {
    zerados: "Oi {primeiro_nome}! Ainda não recebemos nenhuma indicação de voto voluntário sua para {candidato}. Lembrando: aqui você cadastra ELEITORES (pessoas que vão votar de verdade, não contratadas). Sua meta é {meta}. Use seu link: {link}",
    abaixo: "Olá {primeiro_nome}! Faltam {faltam} indicações de votos voluntários (eleitores reais) para bater sua meta de {meta} em {candidato}. 👉 {link}",
    ok: "Obrigado pelas {total} indicações de votos voluntários, {primeiro_nome}! Continue cadastrando eleitores em {candidato}: {link}",
    all: "Olá {primeiro_nome}! Use seu link para cadastrar votos voluntários (eleitores) em {candidato}: {link}",
  } as const;
  const [massOpen, setMassOpen] = useState(false);
  const [massTemplate, setMassTemplate] = useState<string>(TEMPLATE_PADRAO.abaixo);
  const [massSending, setMassSending] = useState(false);
  const [janelaHoras, setJanelaHoras] = useState<number>(48);
  const [cascata, setCascata] = useState<boolean>(false);
  const [testePhone, setTestePhone] = useState<string>("");
  const [testando, setTestando] = useState(false);
  const [historico, setHistorico] = useState<DispatchHist[]>([]);

  async function load() {
    setLoading(true);
    const [cob, cfg, cli, hist] = await Promise.all([
      supabase.from("v_eleicao_indicadores_cobranca").select("*").eq("client_id", clientId).order("total_indicacoes", { ascending: true }),
      supabase.from("eleicao_indicacao_config").select("*").eq("client_id", clientId).maybeSingle(),
      supabase.from("clients").select("name").eq("id", clientId).maybeSingle(),
      supabase.from("whatsapp_dispatches").select("id,titulo,status,total_destinatarios,enviados,falhas,created_at,completed_at")
        .eq("client_id", clientId).eq("tipo", "indicadores_cobranca").order("created_at", { ascending: false }).limit(10),
    ]);
    setRows((cob.data as any) || []);
    if (cfg.data) setConfig(cfg.data as any);
    setCandidatoNome((cli.data as any)?.name || "");
    setHistorico((hist.data as any) || []);
    setLastRefresh(Date.now());
    setLoading(false);
  }

  useEffect(() => { if (clientId) load(); }, [clientId]);

  // Auto-refresh a cada 30s na aba de cobrança (quando a página está visível)
  useEffect(() => {
    if (tab !== "cobranca") return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible" && clientId) load();
    }, 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, clientId]);

  // Tick para o indicador "atualizado há Xs"
  useEffect(() => {
    if (tab !== "cobranca") return;
    const id = setInterval(() => setNowTick(Date.now()), 5000);
    return () => clearInterval(id);
  }, [tab]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filtroTipo !== "all" && r.tipo !== filtroTipo) return false;
      if (filtroStatus === "zerados" && r.total_indicacoes > 0) return false;
      if (filtroStatus === "abaixo" && r.total_indicacoes >= r.meta) return false;
      if (filtroStatus === "ok" && r.total_indicacoes < r.meta) return false;
      if (busca) {
        const q = busca.toLowerCase();
        if (!r.nome.toLowerCase().includes(q) && !(r.cidade || "").toLowerCase().includes(q) && !(r.regiao || "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [rows, filtroTipo, filtroStatus, busca]);

  const stats = useMemo(() => {
    const agg = { coord: { total: 0, meta: 0, pessoas: 0 }, lider: { total: 0, meta: 0, pessoas: 0 }, cabo: { total: 0, meta: 0, pessoas: 0 } };
    for (const r of rows) {
      const k = r.tipo === "coordenador" ? "coord" : r.tipo === "lider" ? "lider" : "cabo";
      agg[k].total += r.total_indicacoes || 0;
      agg[k].meta += r.meta || 0;
      agg[k].pessoas += 1;
    }
    const grandTotal = agg.coord.total + agg.lider.total + agg.cabo.total;
    const grandMeta = agg.coord.meta + agg.lider.meta + agg.cabo.meta;
    const foraDaMeta = rows.filter((r) => (r.total_indicacoes || 0) < (r.meta || 0)).length;
    return { agg, grandTotal, grandMeta, foraDaMeta };
  }, [rows]);


  async function gerarToken(indicadorId: string) {
    setGerando(indicadorId);
    const { data, error } = await supabase.rpc("eleicao_gerar_token_indicador", { _indicador_id: indicadorId });
    setGerando(null);
    if (error) { toast.error("Falha ao gerar link"); return; }
    toast.success("Link gerado!");
    await load();
    if (data) await navigator.clipboard.writeText(buildLink(data as string)).catch(() => {});
  }

  async function copiarLink(token: string) {
    await navigator.clipboard.writeText(buildLink(token));
    toast.success("Link copiado");
  }

  function whatsCobranca(r: Row) {
    const link = r.token ? buildLink(r.token) : "";
    const falta = Math.max(0, r.meta - r.total_indicacoes);
    const msg = falta > 0
      ? `Olá ${r.nome.split(" ")[0]}! Faltam ${falta} indicações de votos voluntários (eleitores reais, não contratados)${candidatoNome ? ` para ${candidatoNome}` : ""}. Use seu link: ${link}`
      : `Olá ${r.nome.split(" ")[0]}! Obrigado pelas indicações de votos voluntários${candidatoNome ? ` para ${candidatoNome}` : ""}. Continue cadastrando eleitores: ${link}`;
    return waLink(r.telefone || "", msg);
  }

  async function salvarConfig() {
    setSavingConfig(true);
    const { error } = await supabase.from("eleicao_indicacao_config").upsert({
      client_id: clientId,
      meta_coordenador: config.meta_coordenador,
      meta_lider: config.meta_lider,
      meta_cabo: config.meta_cabo,
      limite_diario_token: config.limite_diario_token,
      ativo: true,
    });
    setSavingConfig(false);
    if (error) { toast.error("Falha ao salvar"); return; }
    toast.success("Metas salvas");
    await load();
  }

  // Quem entra no disparo: filtrados + com telefone + fora da janela de não-reenvio
  const massElegiveis = useMemo(() => {
    const cutoff = janelaHoras > 0 ? Date.now() - janelaHoras * 3600 * 1000 : 0;
    return filtered.filter((r) => {
      if (!r.telefone || r.telefone.replace(/\D/g, "").length < 8) return false;
      if (cutoff && r.ultima_cobranca_em && new Date(r.ultima_cobranca_em).getTime() >= cutoff) return false;
      return true;
    });
  }, [filtered, janelaHoras]);
  const massSemToken = useMemo(() => massElegiveis.filter((r) => !r.token).length, [massElegiveis]);
  const massPuladosJanela = useMemo(() => {
    if (janelaHoras <= 0) return 0;
    const cutoff = Date.now() - janelaHoras * 3600 * 1000;
    return filtered.filter((r) => r.ultima_cobranca_em && new Date(r.ultima_cobranca_em).getTime() >= cutoff).length;
  }, [filtered, janelaHoras]);

  function abrirMass() {
    if (filtered.length === 0) {
      toast.error("Nenhum indicador no filtro atual.");
      return;
    }
    const tpl = (TEMPLATE_PADRAO as any)[filtroStatus] || TEMPLATE_PADRAO.all;
    setMassTemplate(tpl);
    setMassOpen(true);
  }

  function previewMass(): string {
    const r = massElegiveis[0] || filtered[0];
    if (!r) return massTemplate;
    const primeiro = r.nome.split(" ")[0] || r.nome;
    const faltam = Math.max(0, r.meta - r.total_indicacoes);
    const link = r.token ? buildLink(r.token) : `${window.location.origin}/indicar/<token>`;
    return massTemplate
      .replace(/\{primeiro_nome\}/g, primeiro)
      .replace(/\{nome\}/g, r.nome)
      .replace(/\{meta\}/g, String(r.meta))
      .replace(/\{total\}/g, String(r.total_indicacoes))
      .replace(/\{faltam\}/g, String(faltam))
      .replace(/\{link\}/g, link)
      .replace(/\{candidato\}/g, candidatoNome);
  }

  async function testarComigo() {
    const phone = testePhone.replace(/\D/g, "");
    if (phone.length < 10) { toast.error("Informe um telefone válido (com DDD)."); return; }
    if (!massTemplate.includes("{link}")) { toast.error("Inclua {link} na mensagem."); return; }
    const base = filtered[0];
    if (!base) { toast.error("Nenhum indicador no filtro para usar como base."); return; }
    setTestando(true);
    try {
      const { error } = await supabase.functions.invoke("send-whatsapp-dispatch", {
        body: {
          client_id: clientId,
          titulo: `🧪 Teste — cobrança de indicações`,
          mensagem: massTemplate,
          tipo: "indicadores_cobranca",
          cobranca_filtros: {
            tipo: filtroTipo === "all" ? undefined : filtroTipo,
            status: filtroStatus,
            indicador_ids: [base.indicador_id],
          },
          cobranca_candidato: candidatoNome,
          cobranca_origin: window.location.origin,
          cobranca_teste_telefone: phone,
          cobranca_cascata: cascata,
          batch_size: 1, delay_min: 0, delay_max: 1, batch_pause: 0,
        },
      });
      if (error) throw error;
      toast.success(`🧪 Mensagem de teste enviada para ${phone}`);
    } catch (err: any) {
      toast.error("Falha no teste: " + (err?.message || "erro desconhecido"));
    } finally {
      setTestando(false);
    }
  }

  async function enviarMass() {
    if (massElegiveis.length === 0) { toast.error("Nenhum destinatário elegível."); return; }
    if (!massTemplate.includes("{link}")) {
      toast.error("Inclua {link} na mensagem para o destinatário receber o link de indicação.");
      return;
    }
    setMassSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-whatsapp-dispatch", {
        body: {
          client_id: clientId,
          titulo: `Cobrança de indicações — ${massElegiveis.length} envios`,
          mensagem: massTemplate,
          tipo: "indicadores_cobranca",
          cobranca_filtros: {
            tipo: filtroTipo === "all" ? undefined : filtroTipo,
            status: filtroStatus,
            indicador_ids: cascata ? undefined : massElegiveis.map((r) => r.indicador_id),
          },
          cobranca_candidato: candidatoNome,
          cobranca_origin: window.location.origin,
          cobranca_janela_horas: janelaHoras,
          cobranca_cascata: cascata,
          batch_size: 10, delay_min: 5, delay_max: 15, batch_pause: 60,
        },
      });
      if (error) throw error;
      if ((data as any)?.queued) {
        toast.success("📥 Adicionado à fila — começa assim que o disparo atual terminar.");
      } else {
        toast.success(`📤 Cobrança disparada para ${massElegiveis.length} indicadores!`);
      }
      setMassOpen(false);
      setTimeout(load, 1500);
    } catch (err: any) {
      toast.error("Falha ao disparar: " + (err?.message || "erro desconhecido"));
    } finally {
      setMassSending(false);
    }
  }

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="cobranca"><Users className="w-4 h-4 mr-1.5" />Indicadores & Cobrança</TabsTrigger>
          <TabsTrigger value="config"><Target className="w-4 h-4 mr-1.5" />Metas e configurações</TabsTrigger>
          <TabsTrigger value="pagina"><Palette className="w-4 h-4 mr-1.5" />Página pública</TabsTrigger>
        </TabsList>

        {/* ──────────── COBRANÇA ──────────── */}
        <TabsContent value="cobranca" className="space-y-4 mt-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card className="p-3">
              <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Total geral</div>
              <div className="text-2xl font-bold">{stats.grandTotal.toLocaleString("pt-BR")}</div>
              <div className="text-[11px] text-muted-foreground">de {stats.grandMeta.toLocaleString("pt-BR")} esperadas</div>
            </Card>
            <Card className="p-3 border-amber-500/40">
              <div className="text-[11px] text-amber-600 uppercase tracking-wide flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />Fora da meta
              </div>
              <div className="text-2xl font-bold text-amber-600">{stats.foraDaMeta.toLocaleString("pt-BR")}</div>
              <div className="text-[11px] text-muted-foreground">de {rows.length} indicadores</div>
            </Card>
            {(["coord", "lider", "cabo"] as const).map((k) => {
              const a = stats.agg[k];
              const pct = a.meta ? Math.round((a.total / a.meta) * 100) : 0;
              const labels = { coord: "Coordenadores", lider: "Líderes", cabo: "Cabos" };
              return (
                <Card key={k} className="p-3">
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{labels[k]}</div>
                  <div className="text-2xl font-bold">{a.total.toLocaleString("pt-BR")}</div>
                  <div className="text-[11px] text-muted-foreground">{a.pessoas} pessoas · {pct}% da meta</div>
                </Card>
              );
            })}
          </div>


          {/* Filtros */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome, cidade, região…" className="pl-8" />
            </div>
            <Select value={filtroTipo} onValueChange={(v) => setFiltroTipo(v as any)}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value="coordenador">Coordenadores</SelectItem>
                <SelectItem value="lider">Líderes</SelectItem>
                <SelectItem value="cabo">Cabos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroStatus} onValueChange={(v) => setFiltroStatus(v as any)}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="zerados">Sem indicações</SelectItem>
                <SelectItem value="abaixo">Abaixo da meta</SelectItem>
                <SelectItem value="ok">Meta cumprida</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4 mr-1.5" />Atualizar</Button>
            <Button size="sm" onClick={abrirMass} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
              <Send className="w-4 h-4" />
              Enviar cobrança em massa
            </Button>
          </div>

          {/* Tabela */}
          <Card className="overflow-hidden">
            {loading ? (
              <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Nenhum indicador encontrado com esses filtros.</div>
            ) : (
              <div className="divide-y max-h-[600px] overflow-y-auto">
                {filtered.map((r) => {
                  const pct = r.meta ? Math.min(100, Math.round((r.total_indicacoes / r.meta) * 100)) : 0;
                  const cor = r.total_indicacoes === 0 ? "bg-red-500" : pct < 50 ? "bg-amber-500" : pct < 100 ? "bg-blue-500" : "bg-emerald-500";
                  const faltam = Math.max(0, (r.meta || 0) - (r.total_indicacoes || 0));
                  return (
                    <div key={r.indicador_id} className="p-3 hover:bg-muted/40 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium truncate">{r.nome}</span>
                            <Badge variant="outline" className="text-[10px]">{tipoLabel[r.tipo]}</Badge>
                            {faltam > 0 ? (
                              <Badge
                                variant="outline"
                                className={`text-[10px] gap-1 ${r.total_indicacoes === 0 ? "border-red-500/60 text-red-600" : "border-amber-500/60 text-amber-600"}`}
                                title={`Meta do cargo: ${r.meta}`}
                              >
                                <AlertTriangle className="w-3 h-3" />
                                Fora da meta — faltam {faltam}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] border-emerald-500/60 text-emerald-600">Meta ok</Badge>
                            )}
                            {r.regiao && <span className="text-xs text-muted-foreground">{r.regiao}{r.cidade ? ` · ${r.cidade}` : ""}</span>}
                          </div>
                          <div className="flex items-center gap-2 mt-1.5">
                            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[200px]">
                              <div className={`h-full ${cor} transition-all`} style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs tabular-nums">
                              <strong>{r.total_indicacoes}</strong>
                              <span className="text-muted-foreground"> / {r.meta}</span>
                            </span>
                            {(r.cobrancas_enviadas > 0 || r.ultima_cobranca_em) && (
                              <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1" title={r.ultima_cobranca_em ? `Última cobrança: ${new Date(r.ultima_cobranca_em).toLocaleString("pt-BR")}` : ""}>
                                <Clock className="w-3 h-3" />
                                {r.cobrancas_enviadas}× · {fmtAgo(r.ultima_cobranca_em)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {r.token && (
                            <Button
                              size="sm"
                              variant={addingFor === r.indicador_id ? "secondary" : "ghost"}
                              title="Cadastrar voto voluntário em nome desta pessoa"
                              onClick={() => setAddingFor(addingFor === r.indicador_id ? null : r.indicador_id)}
                            >
                              <UserPlus className="w-4 h-4" />
                              {addingFor === r.indicador_id ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Importar planilha de indicações (nome, telefone, bairro)"
                            onClick={() => setImportFor(r)}
                          >
                            <FileSpreadsheet className="w-4 h-4" />
                          </Button>
                          {r.token ? (

                            <>
                              <Button size="sm" variant="ghost" title="Copiar link" onClick={() => copiarLink(r.token!)}>
                                <Copy className="w-4 h-4" />
                              </Button>
                              {r.telefone && (
                                <a href={whatsCobranca(r)} target="_blank" rel="noreferrer">
                                  <Button size="sm" variant="ghost" title="Enviar link via WhatsApp">
                                    <MessageCircle className="w-4 h-4 text-emerald-600" />
                                  </Button>
                                </a>
                              )}
                              <Button size="sm" variant="ghost" title="Regenerar link (avançado — invalida o anterior)" onClick={() => gerarToken(r.indicador_id)} disabled={gerando === r.indicador_id}>
                                {gerando === r.indicador_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                              </Button>
                            </>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => gerarToken(r.indicador_id)} disabled={gerando === r.indicador_id} title="Link ainda não criado">
                              {gerando === r.indicador_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <><LinkIcon className="w-4 h-4 mr-1.5" />Criar link</>}
                            </Button>
                          )}
                        </div>
                      </div>
                      {addingFor === r.indicador_id && r.token && (
                        <QuickAddIndicadoInline
                          token={r.token}
                          nomePessoa={r.nome}
                          onSaved={async () => { await load(); }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="p-2 text-[11px] text-muted-foreground border-t bg-muted/30 flex items-center justify-between">
              <span>Mostrando {filtered.length} de {rows.length} indicadores</span>
              <span className="inline-flex items-center gap-1">
                <RefreshCw className="w-3 h-3" />
                atualizado há {Math.max(0, Math.floor((nowTick - lastRefresh) / 1000))}s · auto a cada 30s
              </span>
            </div>
          </Card>

          {/* Histórico de disparos de cobrança */}
          {historico.length > 0 && (
            <Card className="p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-sm flex items-center gap-2"><History className="w-4 h-4" />Histórico de cobranças</h3>
                <span className="text-[11px] text-muted-foreground">últimos 10 disparos</span>
              </div>
              <div className="divide-y">
                {historico.map((h) => {
                  const statusColor =
                    h.status === "completed" ? "text-emerald-600" :
                    h.status === "sending" ? "text-blue-600" :
                    h.status === "failed" ? "text-red-600" :
                    h.status === "queued" ? "text-amber-600" : "text-muted-foreground";
                  return (
                    <div key={h.id} className="py-2 flex items-center gap-3 text-sm">
                      <div className="flex-1 min-w-0">
                        <div className="truncate">{h.titulo}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {new Date(h.created_at).toLocaleString("pt-BR")} · {fmtAgo(h.completed_at || h.created_at)}
                        </div>
                      </div>
                      <div className="text-xs tabular-nums text-right">
                        <div><span className="text-emerald-600 font-medium">{h.enviados}</span> enviados</div>
                        {h.falhas > 0 && <div className="text-red-600">{h.falhas} falhas</div>}
                        <div className="text-muted-foreground">de {h.total_destinatarios}</div>
                      </div>
                      <Badge variant="outline" className={`text-[10px] ${statusColor}`}>{h.status}</Badge>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </TabsContent>


        {/* ──────────── CONFIG DE METAS ──────────── */}
        <TabsContent value="config" className="space-y-4 mt-4">
          <Card className="p-5 space-y-4 max-w-2xl">
            <div>
              <h3 className="font-semibold flex items-center gap-2"><TrendingUp className="w-4 h-4" />Metas de indicações por tipo</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Defina quantas indicações cada tipo deve trazer. Você pode ajustar a qualquer momento — a cobrança automática usa esses valores.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs">Meta por Coordenador</Label>
                <Input type="number" min={0} value={config.meta_coordenador}
                  onChange={(e) => setConfig({ ...config, meta_coordenador: parseInt(e.target.value) || 0 })} />
                <p className="text-[11px] text-muted-foreground mt-1">Indicações esperadas de cada coordenador</p>
              </div>
              <div>
                <Label className="text-xs">Meta por Líder</Label>
                <Input type="number" min={0} value={config.meta_lider}
                  onChange={(e) => setConfig({ ...config, meta_lider: parseInt(e.target.value) || 0 })} />
                <p className="text-[11px] text-muted-foreground mt-1">Indicações esperadas de cada líder</p>
              </div>
              <div>
                <Label className="text-xs">Meta por Cabo eleitoral</Label>
                <Input type="number" min={0} value={config.meta_cabo}
                  onChange={(e) => setConfig({ ...config, meta_cabo: parseInt(e.target.value) || 0 })} />
                <p className="text-[11px] text-muted-foreground mt-1">Indicações esperadas de cada cabo</p>
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="text-[11px] text-muted-foreground">
                Não existe limite de quantidade: coordenadores, líderes e cabos podem indicar à vontade.
                As metas acima servem apenas como sinalização — quem estiver abaixo aparece marcado como
                <strong> fora da meta</strong> na lista e entra nas cobranças.
              </p>
            </div>


            <div className="flex justify-end">
              <Button onClick={salvarConfig} disabled={savingConfig}>
                {savingConfig && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Salvar metas
              </Button>
            </div>
          </Card>

          <CobrancaAutoConfig clientId={clientId} />
        </TabsContent>

        {/* ──────────── PÁGINA PÚBLICA ──────────── */}
        <TabsContent value="pagina" className="mt-4">
          <IndicarPaginaConfig clientId={clientId} candidatoNome={candidatoNome} />
        </TabsContent>
      </Tabs>

      {/* ───── Modal Disparo em Massa ───── */}
      <Dialog open={massOpen} onOpenChange={setMassOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-5 h-5 text-emerald-600" />
              Enviar cobrança em massa
            </DialogTitle>
            <DialogDescription>
              Mensagem personalizada por indicador (com link, meta e contagem dele).
              Respeita janela horária e ritmo configurados no cliente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Resumo */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md bg-muted/40 p-2">
                <div className="text-[10px] text-muted-foreground uppercase">No filtro</div>
                <div className="text-xl font-bold">{filtered.length}</div>
              </div>
              <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 p-2">
                <div className="text-[10px] text-emerald-700 dark:text-emerald-400 uppercase">Serão enviados</div>
                <div className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{massElegiveis.length}</div>
              </div>
              <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 p-2">
                <div className="text-[10px] text-amber-700 dark:text-amber-400 uppercase">Token será gerado</div>
                <div className="text-xl font-bold text-amber-700 dark:text-amber-400">{massSemToken}</div>
              </div>
            </div>

            <div className="text-[11px] text-muted-foreground space-y-0.5">
              {filtered.length > massElegiveis.length && (
                <p>{filtered.length - massElegiveis.length} indicador(es) serão ignorados (sem telefone ou já cobrados na janela).</p>
              )}
              {massPuladosJanela > 0 && (
                <p>⏱ {massPuladosJanela} pulados por já terem recebido cobrança nas últimas {janelaHoras}h.</p>
              )}
            </div>

            {/* Janela de não-reenvio */}
            <div className="grid grid-cols-2 gap-3 items-end">
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1"><Clock className="w-3 h-3" />Não reenviar nas últimas (horas)</Label>
                <Input
                  type="number" min={0} max={720}
                  value={janelaHoras}
                  onChange={(e) => setJanelaHoras(Math.max(0, parseInt(e.target.value) || 0))}
                />
                <p className="text-[10px] text-muted-foreground">0 = sem restrição. Padrão: 48h.</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1"><FlaskConical className="w-3 h-3" />Testar comigo</Label>
                <div className="flex gap-1.5">
                  <Input
                    placeholder="WhatsApp p/ teste (ex: 67999999999)"
                    value={testePhone}
                    onChange={(e) => setTestePhone(e.target.value)}
                  />
                  <Button
                    type="button" variant="outline" size="sm"
                    onClick={testarComigo} disabled={testando || !testePhone}
                  >
                    {testando ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enviar teste"}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">Envia 1 mensagem pra esse número usando o 1º indicador como base.</p>
              </div>
            </div>

            {/* Cobrar em cascata */}
            <div className="flex items-start justify-between gap-3 rounded-md border p-3 bg-muted/30">
              <div>
                <Label htmlFor="mass-cascata" className="text-sm">Cobrar em cascata</Label>
                <p className="text-[11px] text-muted-foreground mt-1 max-w-md">
                  Inclui também líderes vinculados aos coordenadores e cabos vinculados aos líderes que estiverem no mesmo status. Útil para acionar a estrutura inteira de uma vez.
                </p>
              </div>
              <Switch id="mass-cascata" checked={cascata} onCheckedChange={setCascata} />
            </div>

            {/* Template */}
            <div className="space-y-1.5">
              <Label className="text-xs">Mensagem (placeholders: {"{primeiro_nome}, {meta}, {faltam}, {total}, {link}, {candidato}"})</Label>
              <Textarea
                value={massTemplate}
                onChange={(e) => setMassTemplate(e.target.value)}
                rows={5}
                className="font-mono text-xs"
              />
            </div>

            {/* Preview */}
            {(massElegiveis[0] || filtered[0]) && (
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                  Prévia para {(massElegiveis[0] || filtered[0]).nome}
                </div>
                <div className="text-sm whitespace-pre-wrap">{previewMass()}</div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMassOpen(false)} disabled={massSending}>
              Cancelar
            </Button>
            <Button
              onClick={enviarMass}
              disabled={massSending || massElegiveis.length === 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
            >
              {massSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Disparar {massElegiveis.length} mensagens
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QuickAddIndicadoInline({
  token,
  nomePessoa,
  onSaved,
}: {
  token: string;
  nomePessoa: string;
  onSaved: () => void | Promise<void>;
}) {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [bairro, setBairro] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const d = telefone.replace(/\D/g, "");
    if (nome.trim().length < 2) { toast.error("Informe o nome completo"); return; }
    if (d.length < 10 || d.length > 11) { toast.error("Telefone inválido — use DDD + número"); return; }
    setSaving(true);
    const payload: Record<string, any> = {
      _token: token,
      _nome: nome.trim(),
      _telefone: telefone,
    };
    if (bairro.trim()) payload._bairro = bairro.trim();
    const { data, error } = await supabase.rpc("eleicao_indicar_via_token", payload as any);
    setSaving(false);
    if (error) { console.error("[Indicacoes] indicar error", error); toast.error("Falha ao registrar"); return; }
    const r = data as any;
    if (!r?.ok) {
      const msg: Record<string, string> = {
        duplicado: "Esse telefone já foi indicado anteriormente",
        telefone_invalido: "Telefone inválido",
        nome_invalido: "Nome inválido",
        limite_diario: "Limite diário atingido para esse link",
        token_invalido: "Link inválido",
        token_revogado: "Link desativado",
      };
      toast.warning(msg[r?.motivo] || "Não foi possível registrar");
      return;
    }
    toast.success(`Indicação registrada em nome de ${nomePessoa.split(" ")[0]} ✓`);
    setNome(""); setTelefone(""); setBairro("");
    await onSaved();
  }

  return (
    <form onSubmit={submit} className="mt-2 rounded-md border bg-muted/30 p-2.5 space-y-2">
      <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
        <UserPlus className="w-3.5 h-3.5" />
        Cadastrar voto voluntário em nome de <strong className="text-foreground">{nomePessoa}</strong>
        <span className="text-[10px]">(contabiliza na meta dele/dela)</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Input placeholder="Nome completo do eleitor" value={nome} onChange={(e) => setNome(e.target.value)} className="h-9" />
        <Input placeholder="Telefone com DDD" value={telefone} onChange={(e) => setTelefone(e.target.value)} className="h-9" inputMode="tel" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
        <Input placeholder="Bairro (opcional)" value={bairro} onChange={(e) => setBairro(e.target.value)} className="h-9" />
        <Button type="submit" size="sm" className="h-9 gap-1.5" disabled={saving}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Cadastrar
        </Button>
      </div>
    </form>
  );
}
