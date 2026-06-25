import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Loader2, Send, Download, MessageCircle, RefreshCw, Save, Sparkles, FileText, AlertCircle, MapPin, Phone, CheckCircle2, Clock, Tag as TagIcon, Pencil, Check, X, Users, FileSpreadsheet, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { aplicarTag, aplicarTemplateMensagem, gerarCsvGoogleContacts, gerarVcardLote, gerarZipVcardsIphone, gerarTextoContatosBloco, type ContatoExport } from "@/lib/eleicao-distribuicao-contatos";
import { saveBlob } from "@/lib/mobile-download";
import { useRegioesEleicao, normalizeTag, slugify, type RegiaoEleicao } from "@/hooks/useRegioesEleicao";
import ConfigurarPrincipaisInteriorDialog from "./ConfigurarPrincipaisInteriorDialog";
import ConverterListaExternaDialog from "./ConverterListaExternaDialog";

interface RegiaoRow {
  escopo: string;
  regiao_key: string;
  regiao_label: string;
  coordenador_id: string;
  coordenador_nome: string;
  coordenador_telefone: string | null;
  total_elegivel: number;
  total_ja_enviado: number;
  total_novos: number;
  ultima_distribuicao_em: string | null;
  ultimo_canal: string | null;
}

interface LoteHist {
  id: string;
  coordenador_id: string;
  regiao_label: string;
  canal: string;
  total_contatos: number;
  apenas_novos: boolean;
  created_at: string;
  vcf_url: string | null;
}

const fmtDateTime = (s?: string | null) => s ? new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
const onlyDigits = (s: string) => (s || "").replace(/\D/g, "");
const waLinkText = (phone: string, text: string) => {
  const d = onlyDigits(phone);
  const full = d.startsWith("55") ? d : `55${d}`;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
};

const CANAL_LABEL: Record<string, string> = {
  instancia: "Via instância",
  manual_wa: "WhatsApp manual",
  download: "Download",
};

export default function DistribuicaoContatosTab({ clientId }: { clientId: string }) {
  const [regioes, setRegioes] = useState<RegiaoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [historico, setHistorico] = useState<LoteHist[]>([]);
  const [busca, setBusca] = useState("");
  const [open, setOpen] = useState<RegiaoRow | null>(null);

  // dialogs auxiliares
  const [openConfigInterior, setOpenConfigInterior] = useState(false);
  const [openConverterLista, setOpenConverterLista] = useState(false);
  const [cidadesSemPrincipal, setCidadesSemPrincipal] = useState<number>(0);

  // template (apenas mensagem; a TAG agora vive em cada região)
  const [template, setTemplate] = useState<string>("");
  const [savingTpl, setSavingTpl] = useState(false);

  // tags das regiões cadastradas
  const { regioes: regioesCadastradas, updateTag, isUpdatingTag } = useRegioesEleicao(clientId);
  const tagByKey = useMemo(() => {
    const m = new Map<string, RegiaoEleicao>();
    for (const r of regioesCadastradas) {
      m.set(r.value, r);
      m.set(slugify(r.label), r);
      m.set(r.label.trim().toLowerCase(), r);
    }
    return m;
  }, [regioesCadastradas]);

  const lookupTag = (regiao_key: string, regiao_label: string): RegiaoEleicao | null => {
    return tagByKey.get(regiao_key)
      || tagByKey.get(slugify(regiao_key))
      || tagByKey.get(slugify(regiao_label))
      || tagByKey.get((regiao_label || "").trim().toLowerCase())
      || null;
  };

  const tagDaRegiao = (regiao_key: string, fallbackLabel: string): string => {
    const r = lookupTag(regiao_key, fallbackLabel);
    if (r?.tag) return r.tag;
    return normalizeTag(fallbackLabel).slice(0, 6);
  };

  const carregar = async () => {
    setLoading(true);
    const [{ data: regs }, { data: hist }, { data: tpl }, { data: cidadesSem }] = await Promise.all([
      supabase.rpc("eleicao_listar_regioes_distribuicao", { _client_id: clientId }),
      supabase.from("eleicao_contato_lotes")
        .select("id, coordenador_id, regiao_label, canal, total_contatos, apenas_novos, created_at, vcf_url")
        .eq("client_id", clientId).order("created_at", { ascending: false }).limit(30),
      supabase.from("eleicao_distribuicao_template").select("mensagem_template").eq("client_id", clientId).maybeSingle(),
      supabase.rpc("eleicao_listar_cidades_interior_sem_principal", { _client_id: clientId }),
    ]);
    setRegioes((regs as any) || []);
    setHistorico((hist as any) || []);
    setCidadesSemPrincipal(((cidadesSem as any) || []).length);
    if (tpl) {
      setTemplate(tpl.mensagem_template || "");
    } else {
      setTemplate("Olá [coordenador_nome]! Segue a lista atualizada dos [qtd_contatos] contatos da região [regiao]. Importe o arquivo .vcf na sua agenda e crie uma lista de transmissão para enviar sua mensagem individual aos contatos. Qualquer dúvida me chama!");
    }
    setLoading(false);
  };

  useEffect(() => { if (clientId) carregar(); }, [clientId]);

  const salvarTemplate = async () => {
    setSavingTpl(true);
    const { error } = await supabase.from("eleicao_distribuicao_template")
      .upsert({ client_id: clientId, mensagem_template: template }, { onConflict: "client_id" });
    setSavingTpl(false);
    if (error) toast.error("Falha ao salvar template", { description: error.message });
    else toast.success("Template salvo");
  };

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return regioes;
    return regioes.filter(r =>
      r.regiao_label.toLowerCase().includes(q) ||
      r.coordenador_nome.toLowerCase().includes(q)
    );
  }, [regioes, busca]);

  const totalNovosGeral = regioes.reduce((acc, r) => acc + Number(r.total_novos || 0), 0);
  const regioesPendentes = regioes.filter(r => Number(r.total_novos || 0) > 0).length;

  return (
    <div className="space-y-4">
      {/* Header / KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <KpiMini label="Regiões com coord. principal" value={regioes.length} icon={MapPin} />
        <KpiMini label="Regiões com novos contatos" value={regioesPendentes} icon={AlertCircle} highlight={regioesPendentes > 0} />
        <KpiMini label="Total novos para distribuir" value={totalNovosGeral} icon={Sparkles} highlight={totalNovosGeral > 0} />
        <KpiMini label="Pacotes enviados (hist.)" value={historico.length} icon={CheckCircle2} />
      </div>

      <Tabs defaultValue="regioes">
        <TabsList>
          <TabsTrigger value="regioes">Regiões</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
          <TabsTrigger value="template">Mensagem padrão</TabsTrigger>
        </TabsList>

        {/* ===================== REGIÕES ===================== */}
        <TabsContent value="regioes" className="space-y-3 mt-3">
          <div className="flex gap-2 flex-wrap">
            <Input placeholder="Buscar região ou coordenador..." value={busca} onChange={e => setBusca(e.target.value)} className="max-w-md" />
            <Button variant="outline" size="sm" onClick={carregar} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />Atualizar
            </Button>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setOpenConverterLista(true)}>
                <FileSpreadsheet className="w-4 h-4 mr-2" />Converter lista externa
              </Button>
              <Button
                variant={cidadesSemPrincipal > 0 ? "default" : "outline"}
                size="sm"
                onClick={() => setOpenConfigInterior(true)}
              >
                <Users className="w-4 h-4 mr-2" />
                Principais do interior
                {cidadesSemPrincipal > 0 && (
                  <Badge variant="secondary" className="ml-2 bg-white/20 text-current">{cidadesSemPrincipal}</Badge>
                )}
              </Button>
            </div>
          </div>

          {cidadesSemPrincipal > 0 && (
            <Card className="p-3 border-amber-400 bg-amber-50/40 dark:bg-amber-900/10 flex items-center gap-3 flex-wrap">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
              <div className="flex-1 min-w-0 text-sm">
                <strong>{cidadesSemPrincipal} cidade(s) do interior</strong> com coordenadores cadastrados ainda <strong>sem principal definido</strong>.
                Defina um principal por cidade para liberar a distribuição automática dos contatos.
              </div>
              <Button size="sm" onClick={() => setOpenConfigInterior(true)}>
                Definir agora
              </Button>
            </Card>
          )}

          <Card className="p-3 bg-muted/30 text-xs text-muted-foreground flex items-start gap-2">
            <TagIcon className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              Cada região tem uma <strong>TAG curta</strong> (ex: <code>MOR</code> para Moreninhas) que vai na frente do nome de cada contato exportado.
              Isso ajuda o coordenador a identificar de onde veio cada pessoa. Edite a TAG no card da região abaixo.
            </div>
          </Card>

          {loading ? (
            <div className="text-center py-12 text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Carregando regiões…</div>
          ) : filtradas.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              Nenhuma região com <strong>coordenador principal</strong> definido. Marque um coordenador como principal na aba "Cadastros" para que ele apareça aqui.
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {filtradas.map(r => (
                <RegiaoCard
                  key={`${r.escopo}-${r.regiao_key}-${r.coordenador_id}`}
                  r={r}
                  tag={tagDaRegiao(r.regiao_key, r.regiao_label)}
                  tagRow={lookupTag(r.regiao_key, r.regiao_label)}
                  onSaveTag={async (newTag) => {
                    const row = lookupTag(r.regiao_key, r.regiao_label);
                    if (!row) {
                      toast.error("Região não está cadastrada", { description: "Cadastre em Configurações > Regiões primeiro." });
                      return;
                    }
                    await updateTag({ id: row.id, tag: newTag });
                  }}
                  saving={isUpdatingTag}
                  onAbrir={() => setOpen(r)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ===================== HISTÓRICO ===================== */}
        <TabsContent value="historico" className="mt-3">
          {historico.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">Nenhum pacote enviado ainda.</Card>
          ) : (
            <Card className="divide-y">
              {historico.map(h => (
                <div key={h.id} className="p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{h.regiao_label}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                      <Clock className="w-3 h-3" />{fmtDateTime(h.created_at)}
                      <Badge variant="outline" className="text-[10px]">{CANAL_LABEL[h.canal] || h.canal}</Badge>
                      <span>{h.total_contatos} contatos</span>
                      {h.apenas_novos && <Badge variant="secondary" className="text-[10px]">só novos</Badge>}
                    </div>
                  </div>
                  {h.vcf_url && (
                    <Button asChild variant="outline" size="sm">
                      <a href={h.vcf_url} target="_blank" rel="noreferrer"><Download className="w-3 h-3 mr-1" />.vcf</a>
                    </Button>
                  )}
                </div>
              ))}
            </Card>
          )}
        </TabsContent>

        {/* ===================== TEMPLATE ===================== */}
        <TabsContent value="template" className="mt-3 space-y-3">
          <Card className="p-4 space-y-3">
            <div>
              <Label>Mensagem padrão enviada junto com o pacote de contatos</Label>
              <Textarea rows={6} value={template} onChange={e => setTemplate(e.target.value)} />
              <p className="text-xs text-muted-foreground mt-1">
                Use os marcadores: <code>[coordenador_nome]</code> <code>[regiao]</code> <code>[qtd_contatos]</code> <code>[qtd_novos]</code>
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                <strong>A TAG é por região</strong> — configure no card de cada região na aba "Regiões".
              </p>
            </div>
            <div className="flex justify-end">
              <Button onClick={salvarTemplate} disabled={savingTpl}>
                {savingTpl ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}Salvar template
              </Button>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {open && (
        <EnviarPacoteDialog
          clientId={clientId}
          regiao={open}
          template={template}
          tagRegiao={tagDaRegiao(open.regiao_key, open.regiao_label)}
          onClose={() => setOpen(null)}
          onSent={() => { setOpen(null); carregar(); }}
        />
      )}

      <ConfigurarPrincipaisInteriorDialog
        clientId={clientId}
        open={openConfigInterior}
        onClose={() => setOpenConfigInterior(false)}
        onSaved={carregar}
      />

      <ConverterListaExternaDialog
        open={openConverterLista}
        onClose={() => setOpenConverterLista(false)}
      />
    </div>
  );
}

function KpiMini({ label, value, icon: Icon, highlight }: { label: string; value: number; icon: any; highlight?: boolean }) {
  return (
    <Card className={`p-3 flex items-center gap-3 ${highlight ? "border-amber-400 bg-amber-50/40 dark:bg-amber-900/10" : ""}`}>
      <div className={`w-10 h-10 rounded-lg grid place-items-center ${highlight ? "bg-amber-500/20 text-amber-600" : "bg-muted text-muted-foreground"}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground truncate">{label}</div>
        <div className="text-xl font-bold">{value}</div>
      </div>
    </Card>
  );
}

function RegiaoCard({ r, tag, tagRow, onSaveTag, saving, onAbrir }: {
  r: RegiaoRow;
  tag: string;
  tagRow: RegiaoEleicao | null;
  onSaveTag: (tag: string) => Promise<void>;
  saving: boolean;
  onAbrir: () => void;
}) {
  const novos = Number(r.total_novos || 0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tag);

  useEffect(() => { setDraft(tag); }, [tag]);

  const salvar = async () => {
    const norm = normalizeTag(draft);
    if (!norm) { toast.error("Informe uma TAG válida"); return; }
    await onSaveTag(norm);
    setEditing(false);
  };

  return (
    <Card className={`p-4 ${novos > 0 ? "border-emerald-400" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <MapPin className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold truncate">{r.regiao_label}</span>
            <Badge variant="outline" className="text-[10px]">{r.escopo === "campo_grande" ? "Campo Grande" : "Interior"}</Badge>

            {/* TAG da região */}
            {editing ? (
              <span className="inline-flex items-center gap-1">
                <Input
                  value={draft}
                  onChange={e => setDraft(normalizeTag(e.target.value))}
                  className="h-6 w-20 text-xs font-mono uppercase px-2"
                  maxLength={8}
                  autoFocus
                />
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={salvar} disabled={saving}>
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                </Button>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setDraft(tag); setEditing(false); }}>
                  <X className="w-3 h-3" />
                </Button>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Badge className="bg-primary/15 text-primary border border-primary/30 font-mono">
                  <TagIcon className="w-3 h-3 mr-1" />{tag || "—"}
                </Badge>
                <Button
                  size="icon" variant="ghost" className="h-6 w-6"
                  onClick={() => setEditing(true)}
                  title={tagRow ? "Editar TAG da região" : "Cadastre a região em Configurações para editar a TAG"}
                  disabled={!tagRow}
                >
                  <Pencil className="w-3 h-3" />
                </Button>
              </span>
            )}
          </div>
          <div className="text-sm text-muted-foreground mt-1 truncate">
            Coord. principal: <strong>{r.coordenador_nome}</strong>
          </div>
          {r.coordenador_telefone && (
            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <Phone className="w-3 h-3" />{r.coordenador_telefone}
            </div>
          )}
        </div>
        {novos > 0 ? (
          <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white shrink-0">+{novos} novos</Badge>
        ) : (
          <Badge variant="secondary" className="shrink-0">Em dia</Badge>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3 text-center text-xs">
        <Stat label="Total" value={r.total_elegivel} />
        <Stat label="Já enviados" value={r.total_ja_enviado} />
        <Stat label="Novos" value={novos} highlight={novos > 0} />
      </div>

      <div className="text-xs text-muted-foreground mt-2">
        Último pacote: {fmtDateTime(r.ultima_distribuicao_em)} {r.ultimo_canal ? `(${CANAL_LABEL[r.ultimo_canal] || r.ultimo_canal})` : ""}
      </div>

      <div className="flex justify-end mt-3">
        <Button size="sm" onClick={onAbrir}>
          <Send className="w-3 h-3 mr-2" />Preparar pacote
        </Button>
      </div>
    </Card>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number | string; highlight?: boolean }) {
  return (
    <div className={`rounded-md p-2 ${highlight ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-muted/50"}`}>
      <div className="text-[10px] uppercase">{label}</div>
      <div className="font-bold">{value}</div>
    </div>
  );
}

// ============================================================
// DIALOG DE ENVIO
// ============================================================
function EnviarPacoteDialog(props: {
  clientId: string;
  regiao: RegiaoRow;
  template: string;
  tagRegiao: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const { clientId, regiao, template, tagRegiao, onClose, onSent } = props;
  const [apenasNovos, setApenasNovos] = useState(true);
  const [contatos, setContatos] = useState<ContatoExport[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<null | "instancia" | "manual_wa" | "download" | "zip">(null);
  const [tagOverride, setTagOverride] = useState(tagRegiao);
  const [tplLocal, setTplLocal] = useState(template);

  useEffect(() => { setTagOverride(tagRegiao); }, [tagRegiao]);

  const carregar = async () => {
    setLoading(true);
    const { data } = await supabase.rpc("eleicao_listar_contatos_pacote", {
      _client_id: clientId, _coordenador_id: regiao.coordenador_id, _apenas_novos: apenasNovos,
    });
    setContatos((data || []).map((d: any) => ({
      pessoa_id: d.pessoa_id, nome: d.nome, telefone: d.telefone, tipo: d.tipo, bairro: d.bairro,
    })));
    setLoading(false);
  };
  useEffect(() => { carregar(); }, [apenasNovos]);

  const mensagemFinal = useMemo(() => aplicarTemplateMensagem(tplLocal, {
    coordenador_nome: regiao.coordenador_nome,
    regiao: regiao.regiao_label,
    qtd_contatos: String(contatos.length),
    qtd_novos: String(regiao.total_novos || 0),
  }), [tplLocal, contatos.length, regiao]);

  const total = contatos.length;

  const uploadVcfPublic = async (): Promise<string | null> => {
    const vcfContent = gerarVcardLote({ contatos, tagPrefixo: tagOverride, regiaoLabel: regiao.regiao_label });
    const blob = new Blob([vcfContent], { type: "text/vcard" });
    const path = `eleicao-distribuicao/${clientId}/${regiao.coordenador_id}/${Date.now()}.vcf`;
    const { error } = await supabase.storage.from("whatsapp-media").upload(path, blob, {
      cacheControl: "3600", upsert: false, contentType: "text/vcard",
    });
    if (error) { toast.error("Falha ao subir .vcf", { description: error.message }); return null; }
    const { data: pub } = supabase.storage.from("whatsapp-media").getPublicUrl(path);
    return pub.publicUrl;
  };

  const registrarLoteDireto = async (canal: "manual_wa" | "download", vcfUrl: string | null) => {
    const { data: lote, error } = await supabase.from("eleicao_contato_lotes").insert({
      client_id: clientId,
      coordenador_id: regiao.coordenador_id,
      escopo: regiao.escopo,
      regiao_key: regiao.regiao_key,
      regiao_label: regiao.regiao_label,
      canal,
      total_contatos: total,
      apenas_novos: apenasNovos,
      mensagem_enviada: mensagemFinal,
      vcf_url: vcfUrl,
      tag_regiao: tagOverride || null,
    } as any).select("id").single();
    if (error || !lote) { toast.error("Falha ao registrar lote", { description: error?.message }); return false; }
    const rows = contatos.map(c => ({
      client_id: clientId, lote_id: lote.id, coordenador_id: regiao.coordenador_id, pessoa_id: c.pessoa_id,
      escopo: regiao.escopo, regiao_key: regiao.regiao_key,
    }));
    const { error: e2 } = await supabase.from("eleicao_contato_distribuicoes")
      .upsert(rows, { onConflict: "coordenador_id,pessoa_id", ignoreDuplicates: true });
    if (e2) console.warn(e2);
    return true;
  };

  const enviarViaInstancia = async () => {
    if (total === 0) return toast.warning("Nenhum contato a enviar");
    setSending("instancia");
    try {
      const vcfUrl = await uploadVcfPublic();
      if (!vcfUrl) return;
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) { toast.error("Sessão expirada"); return; }
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/eleicao-enviar-pacote-contatos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || (import.meta.env as any).VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          client_id: clientId,
          coordenador_id: regiao.coordenador_id,
          pessoa_ids: contatos.map(c => c.pessoa_id),
          mensagem: mensagemFinal,
          vcf_url: vcfUrl,
          canal: "instancia",
          apenas_novos: apenasNovos,
          regiao_label: regiao.regiao_label,
          regiao_key: regiao.regiao_key,
          escopo: regiao.escopo,
          tag_regiao: tagOverride || null,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.error) {
        toast.error("Falha no envio via instância", { description: data?.error || `HTTP ${resp.status}` });
        return;
      }
      toast.success(`Pacote enviado para ${regiao.coordenador_nome}`, { description: `${total} contatos marcados como entregues.` });
      onSent();
    } finally {
      setSending(null);
    }
  };

  const enviarManualWa = async () => {
    if (!regiao.coordenador_telefone) return toast.warning("Coordenador sem telefone");
    setSending("manual_wa");
    try {
      const vcfUrl = await uploadVcfPublic();
      const ok = await registrarLoteDireto("manual_wa", vcfUrl);
      if (!ok) return;
      const corpoBloco = gerarTextoContatosBloco({ contatos, tagPrefixo: tagOverride });
      const texto = `${mensagemFinal}\n\n${corpoBloco}\n\n📎 Arquivo .vcf: ${vcfUrl}`;
      window.open(waLinkText(regiao.coordenador_telefone, texto), "_blank");
      toast.success("WhatsApp aberto — confirme o envio manualmente");
      onSent();
    } finally {
      setSending(null);
    }
  };

  const baixarVcf = async () => {
    setSending("download");
    try {
      const vcfContent = gerarVcardLote({ contatos, tagPrefixo: tagOverride, regiaoLabel: regiao.regiao_label });
      const blob = new Blob([vcfContent], { type: "text/vcard" });
      await saveBlob(blob, `contatos_${regiao.regiao_key || "regiao"}_${Date.now()}.vcf`, { title: "Lista de contatos" });
      await registrarLoteDireto("download", null);
      onSent();
    } finally {
      setSending(null);
    }
  };

  const baixarCsv = async () => {
    const csv = gerarCsvGoogleContacts({ contatos, tagPrefixo: tagOverride, regiaoLabel: regiao.regiao_label });
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    await saveBlob(blob, `google_contacts_${regiao.regiao_key || "regiao"}.csv`, { title: "Google Contacts CSV" });
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Distribuir contatos — {regiao.regiao_label}</DialogTitle>
          <DialogDescription>
            Coordenador principal: <strong>{regiao.coordenador_nome}</strong> {regiao.coordenador_telefone ? `• ${regiao.coordenador_telefone}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-4">
          <Card className="p-3 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="m-0">Enviar somente contatos novos</Label>
              <Switch checked={apenasNovos} onCheckedChange={setApenasNovos} />
            </div>
            <div className="text-sm text-muted-foreground">
              {apenasNovos
                ? `Serão entregues apenas os ${regiao.total_novos} contatos que ainda não foram para esse coordenador.`
                : `Reenviar todos os ${regiao.total_elegivel} contatos elegíveis da região (incluindo os já entregues).`}
            </div>
            <div className="border rounded-md p-2 max-h-48 overflow-y-auto bg-muted/30 text-xs">
              {loading ? "Carregando…" : (
                contatos.length === 0 ? <div className="text-muted-foreground">Nenhum contato disponível.</div> :
                <ul className="space-y-0.5">
                  {contatos.slice(0, 50).map(c => (
                    <li key={c.pessoa_id} className="truncate">
                      • <strong>{aplicarTag(c.nome, tagOverride)}</strong> — {c.telefone}
                    </li>
                  ))}
                  {contatos.length > 50 && <li className="text-muted-foreground">…e mais {contatos.length - 50}</li>}
                </ul>
              )}
            </div>
          </Card>

          <Card className="p-3 space-y-3">
            <div>
              <Label className="flex items-center gap-1">
                <TagIcon className="w-3 h-3" />TAG da região (prefixo do nome de cada contato)
              </Label>
              <Input
                value={tagOverride}
                onChange={e => setTagOverride(normalizeTag(e.target.value))}
                placeholder="Ex: MOR"
                maxLength={8}
                className="font-mono uppercase"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Vem da região <strong>{regiao.regiao_label}</strong>. Mudar aqui afeta só este envio — para mudar de forma permanente, edite no card da região.
              </p>
            </div>
            <div>
              <Label>Mensagem que será enviada</Label>
              <Textarea rows={5} value={tplLocal} onChange={e => setTplLocal(e.target.value)} />
            </div>
            <div className="border rounded-md p-2 bg-muted/30 text-xs whitespace-pre-wrap">
              <div className="font-semibold mb-1">Pré-visualização:</div>
              {mensagemFinal}
            </div>
          </Card>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={baixarCsv} disabled={total === 0}>
            <FileText className="w-4 h-4 mr-2" />CSV Google
          </Button>
          <Button variant="outline" onClick={baixarVcf} disabled={total === 0 || !!sending}>
            {sending === "download" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}.vcf (celular)
          </Button>
          <Button variant="outline" onClick={enviarManualWa} disabled={total === 0 || !!sending || !regiao.coordenador_telefone}>
            {sending === "manual_wa" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MessageCircle className="w-4 h-4 mr-2" />}WhatsApp manual
          </Button>
          <Button onClick={enviarViaInstancia} disabled={total === 0 || !!sending}>
            {sending === "instancia" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}Enviar pela instância
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
