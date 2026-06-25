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
import { Loader2, Send, Download, MessageCircle, RefreshCw, Save, Sparkles, FileText, AlertCircle, MapPin, Phone, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import { aplicarTag, aplicarTemplateMensagem, gerarCsvGoogleContacts, gerarVcardLote, gerarTextoContatosBloco, type ContatoExport } from "@/lib/eleicao-distribuicao-contatos";
import { saveBlob } from "@/lib/mobile-download";

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

  // template
  const [template, setTemplate] = useState<string>("");
  const [tagPrefixo, setTagPrefixo] = useState<string>("");
  const [savingTpl, setSavingTpl] = useState(false);

  const carregar = async () => {
    setLoading(true);
    const [{ data: regs }, { data: hist }, { data: tpl }] = await Promise.all([
      supabase.rpc("eleicao_listar_regioes_distribuicao", { _client_id: clientId }),
      supabase.from("eleicao_contato_lotes")
        .select("id, coordenador_id, regiao_label, canal, total_contatos, apenas_novos, created_at, vcf_url")
        .eq("client_id", clientId).order("created_at", { ascending: false }).limit(30),
      supabase.from("eleicao_distribuicao_template").select("mensagem_template, tag_prefixo").eq("client_id", clientId).maybeSingle(),
    ]);
    setRegioes((regs as any) || []);
    setHistorico((hist as any) || []);
    if (tpl) {
      setTemplate(tpl.mensagem_template || "");
      setTagPrefixo(tpl.tag_prefixo || "");
    } else {
      setTemplate("Olá [coordenador_nome]! Segue a lista atualizada dos [qtd_contatos] contatos da região [regiao]. Importe o arquivo .vcf na sua agenda e crie uma lista de transmissão para enviar sua mensagem individual aos contatos. Qualquer dúvida me chama!");
      setTagPrefixo("");
    }
    setLoading(false);
  };

  useEffect(() => { if (clientId) carregar(); }, [clientId]);

  const salvarTemplate = async () => {
    setSavingTpl(true);
    const { error } = await supabase.from("eleicao_distribuicao_template")
      .upsert({ client_id: clientId, mensagem_template: template, tag_prefixo: tagPrefixo }, { onConflict: "client_id" });
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
          <TabsTrigger value="template">Template & TAG</TabsTrigger>
        </TabsList>

        {/* ===================== REGIÕES ===================== */}
        <TabsContent value="regioes" className="space-y-3 mt-3">
          <div className="flex gap-2">
            <Input placeholder="Buscar região ou coordenador..." value={busca} onChange={e => setBusca(e.target.value)} className="max-w-md" />
            <Button variant="outline" size="sm" onClick={carregar} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />Atualizar
            </Button>
          </div>

          {loading ? (
            <div className="text-center py-12 text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Carregando regiões…</div>
          ) : filtradas.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              Nenhuma região com <strong>coordenador principal</strong> definido. Marque um coordenador como principal na aba "Cadastros" para que ele apareça aqui.
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {filtradas.map(r => <RegiaoCard key={`${r.escopo}-${r.regiao_key}-${r.coordenador_id}`} r={r} onAbrir={() => setOpen(r)} />)}
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
              <Label>Prefixo de TAG (vai na frente do nome de cada contato)</Label>
              <Input value={tagPrefixo} onChange={e => setTagPrefixo(e.target.value)} placeholder="Ex: CAMPANHA — ou MOR" />
              <p className="text-xs text-muted-foreground mt-1">Exemplo: "CAMPANHA João Silva". Útil pro coordenador identificar de onde veio o contato.</p>
            </div>
            <div>
              <Label>Mensagem padrão</Label>
              <Textarea rows={6} value={template} onChange={e => setTemplate(e.target.value)} />
              <p className="text-xs text-muted-foreground mt-1">
                Use os marcadores: <code>[coordenador_nome]</code> <code>[regiao]</code> <code>[qtd_contatos]</code> <code>[qtd_novos]</code>
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
          tagPrefixo={tagPrefixo}
          onClose={() => setOpen(null)}
          onSent={() => { setOpen(null); carregar(); }}
        />
      )}
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

function RegiaoCard({ r, onAbrir }: { r: RegiaoRow; onAbrir: () => void }) {
  const novos = Number(r.total_novos || 0);
  return (
    <Card className={`p-4 ${novos > 0 ? "border-emerald-400" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold truncate">{r.regiao_label}</span>
            <Badge variant="outline" className="text-[10px]">{r.escopo === "campo_grande" ? "Campo Grande" : "Interior"}</Badge>
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
  tagPrefixo: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const { clientId, regiao, template, tagPrefixo, onClose, onSent } = props;
  const [apenasNovos, setApenasNovos] = useState(true);
  const [contatos, setContatos] = useState<ContatoExport[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<null | "instancia" | "manual_wa" | "download">(null);
  const [tagOverride, setTagOverride] = useState(tagPrefixo);
  const [tplLocal, setTplLocal] = useState(template);

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
    // Para canais que não passam pela edge function: insere direto via RLS (authenticated)
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
    }).select("id").single();
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
              <Label>TAG (prefixo do nome)</Label>
              <Input value={tagOverride} onChange={e => setTagOverride(e.target.value)} placeholder="Opcional" />
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
