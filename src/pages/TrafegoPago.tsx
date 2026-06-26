import { useState, useEffect, useMemo } from "react";
import { useActiveClientId } from "@/hooks/useActiveClientId";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import {
  Megaphone, RefreshCw, ShieldCheck, ShieldAlert, ShieldX, ExternalLink,
  AlertTriangle, CheckCircle2, XCircle, Info, Plus, Calendar, DollarSign,
  Eye, MousePointer, Users as UsersIcon, Lock, Settings as SettingsIcon
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type AdsAccount = {
  id: string;
  client_id: string;
  meta_ad_account_id: string;
  cnpj_eleitoral: string | null;
  disclaimer_pago_por: string | null;
  candidato_nome: string | null;
  candidato_numero: string | null;
  candidato_cargo: string | null;
  identidade_meta_confirmada: boolean;
  identidade_expira_em: string | null;
  ativa: boolean;
};

type Issue = {
  code: string;
  severity: "block" | "warn" | "info";
  title: string;
  why: string;
  howToFix: string;
  link?: string;
};

type IdentityStatus = {
  id: string;
  checked_at: string;
  overall_status: "ok" | "warning" | "blocked" | "unknown";
  has_ads_management: boolean;
  has_ads_read: boolean;
  has_business_management: boolean;
  has_leads_retrieval: boolean;
  has_pages_manage_ads: boolean;
  business_manager_linked: boolean;
  ad_account_active: boolean;
  pixel_configured: boolean;
  disclaimer_configured: boolean;
  cnpj_eleitoral_set: boolean;
  political_identity_confirmed: boolean;
  political_identity_expires_at: string | null;
  issues: Issue[];
};

const CARGOS = [
  { value: "governador", label: "Governador" },
  { value: "senador", label: "Senador" },
  { value: "dep_federal", label: "Deputado Federal" },
  { value: "dep_estadual", label: "Deputado Estadual" },
];

const PERIODO_PERMITIDO_INICIO = new Date("2026-08-16T00:00:00-03:00");

export default function TrafegoPago() {
  const { data: clientId } = useActiveClientId();
  const [account, setAccount] = useState<AdsAccount | null>(null);
  const [status, setStatus] = useState<IdentityStatus | null>(null);
  const [loadingDiag, setLoadingDiag] = useState(false);
  const [loadingSync, setLoadingSync] = useState(false);
  const [showAccountDialog, setShowAccountDialog] = useState(false);
  const [insights, setInsights] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);

  const periodoLiberado = useMemo(() => new Date() >= PERIODO_PERMITIDO_INICIO, []);
  const diasParaLiberacao = useMemo(() => {
    const diff = PERIODO_PERMITIDO_INICIO.getTime() - Date.now();
    return Math.ceil(diff / 86400000);
  }, []);

  useEffect(() => {
    if (!clientId) return;
    loadAll();
  }, [clientId]);

  async function loadAll() {
    if (!clientId) return;
    const [{ data: acct }, { data: stat }, { data: ins }, { data: camps }] = await Promise.all([
      supabase.from("ads_accounts").select("*").eq("client_id", clientId).eq("ativa", true).maybeSingle(),
      supabase.from("ads_identity_status").select("*").eq("client_id", clientId).order("checked_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("ads_insights_daily").select("*").eq("client_id", clientId).eq("level", "account").order("date", { ascending: false }).limit(30),
      supabase.from("ads_campaigns").select("*").eq("client_id", clientId).order("updated_at", { ascending: false }),
    ]);
    setAccount(acct as AdsAccount | null);
    setStatus(stat as IdentityStatus | null);
    setInsights(ins || []);
    setCampaigns(camps || []);
  }

  async function runDiagnostic() {
    if (!clientId) return;
    setLoadingDiag(true);
    try {
      const { data, error } = await supabase.functions.invoke("ads-meta-diagnostic", {
        body: { clientId },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Falha no diagnóstico");
      toast.success("Diagnóstico concluído");
      await loadAll();
    } catch (e: any) {
      toast.error(e.message || "Erro no diagnóstico");
    } finally {
      setLoadingDiag(false);
    }
  }

  async function syncCampaigns() {
    if (!clientId) return;
    setLoadingSync(true);
    try {
      const { data, error } = await supabase.functions.invoke("ads-sync-campaigns", {
        body: { clientId, daysBack: 30 },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Falha na sincronização");
      toast.success(`Sincronizado: ${data.counts.campaigns} campanhas, ${data.counts.insights} dias de métricas`);
      await loadAll();
    } catch (e: any) {
      toast.error(e.message || "Erro na sincronização");
    } finally {
      setLoadingSync(false);
    }
  }

  if (!clientId) {
    return <div className="p-6">Selecione um cliente.</div>;
  }

  // Métricas agregadas
  const totalSpend = insights.reduce((s, i) => s + (i.spend_cents || 0), 0);
  const totalLeads = insights.reduce((s, i) => s + (i.leads || 0), 0);
  const totalImpr = insights.reduce((s, i) => s + (i.impressions || 0), 0);
  const totalClicks = insights.reduce((s, i) => s + (i.clicks || 0), 0);
  const avgCpr = totalLeads > 0 ? Math.round(totalSpend / totalLeads) : 0;

  const blockingIssues = status?.issues.filter(i => i.severity === "block").length || 0;
  const warnIssues = status?.issues.filter(i => i.severity === "warn").length || 0;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Megaphone className="h-7 w-7" />
            Tráfego Pago — Meta Ads
          </h1>
          <p className="text-muted-foreground">Gerencie anúncios eleitorais com Guard TSE integrado</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={runDiagnostic} disabled={loadingDiag}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loadingDiag ? "animate-spin" : ""}`} />
            Rodar diagnóstico
          </Button>
          <Button onClick={syncCampaigns} disabled={loadingSync || !account}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loadingSync ? "animate-spin" : ""}`} />
            Sincronizar campanhas
          </Button>
        </div>
      </div>

      {/* Banner período eleitoral */}
      {!periodoLiberado && (
        <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950/30">
          <Calendar className="h-4 w-4" />
          <AlertTitle>Período pré-eleitoral — faltam {diasParaLiberacao} dias para liberação</AlertTitle>
          <AlertDescription>
            Anúncios eleitorais (com nº/cargo do candidato) só podem ir ao ar a partir de <strong>16/ago/2026</strong>. O Guard Eleitoral bloqueará publicações antes dessa data. Você pode usar este tempo para configurar tudo (CNPJ, identidade Meta, criativos).
          </AlertDescription>
        </Alert>
      )}

      {/* Semáforo de status */}
      <StatusOverview status={status} account={account} onOpenAccountDialog={() => setShowAccountDialog(true)} />

      <Tabs defaultValue="diagnostico" className="space-y-4">
        <TabsList>
          <TabsTrigger value="diagnostico">
            <ShieldCheck className="h-4 w-4 mr-2" />
            Diagnóstico
            {blockingIssues > 0 && <Badge variant="destructive" className="ml-2">{blockingIssues}</Badge>}
            {blockingIssues === 0 && warnIssues > 0 && <Badge variant="secondary" className="ml-2">{warnIssues}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="campanhas">Campanhas ({campaigns.length})</TabsTrigger>
          <TabsTrigger value="conta">Conta & Configurações</TabsTrigger>
        </TabsList>

        <TabsContent value="diagnostico" className="space-y-4">
          <DiagnosticChecklist status={status} onRun={runDiagnostic} loading={loadingDiag} />
        </TabsContent>

        <TabsContent value="dashboard" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard icon={DollarSign} label="Gasto (30d)" value={`R$ ${(totalSpend / 100).toFixed(2)}`} />
            <MetricCard icon={UsersIcon} label="Leads" value={totalLeads.toString()} />
            <MetricCard icon={DollarSign} label="CPR médio" value={avgCpr > 0 ? `R$ ${(avgCpr / 100).toFixed(2)}` : "—"} />
            <MetricCard icon={Eye} label="Impressões" value={totalImpr.toLocaleString("pt-BR")} />
          </div>
          {insights.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <p>Nenhum dado ainda. Clique em <strong>Sincronizar campanhas</strong> para puxar do Meta.</p>
              </CardContent>
            </Card>
          )}
          {insights.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Últimos 30 dias</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-96 overflow-auto">
                  {insights.map(i => (
                    <div key={i.id} className="flex justify-between text-sm border-b py-2">
                      <span>{format(new Date(i.date + "T00:00:00"), "dd/MM", { locale: ptBR })}</span>
                      <span>R$ {(i.spend_cents / 100).toFixed(2)}</span>
                      <span>{i.leads} leads</span>
                      <span>{i.impressions.toLocaleString("pt-BR")} impr.</span>
                      <span>{i.clicks} cliques</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="campanhas" className="space-y-4">
          {campaigns.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">Sincronize para ver suas campanhas existentes na Meta.</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {campaigns.map(c => (
                <Card key={c.id}>
                  <CardContent className="p-4 flex justify-between items-center">
                    <div>
                      <div className="font-medium">{c.nome}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.objetivo} · {c.status}
                        {c.is_political && <Badge variant="outline" className="ml-2">Político</Badge>}
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      {c.daily_budget_cents && <div>R$ {(c.daily_budget_cents / 100).toFixed(2)}/dia</div>}
                    </div>
                  </CardContent>
                </Card>
              ))}
              <Alert>
                <Lock className="h-4 w-4" />
                <AlertTitle>Criação e edição vêm na Fase 2</AlertTitle>
                <AlertDescription>
                  Fase 1 é read-only: sincroniza o que já existe. Na próxima fase você poderá criar campanhas direto daqui, com o Guard Eleitoral validando antes de publicar.
                </AlertDescription>
              </Alert>
            </div>
          )}
        </TabsContent>

        <TabsContent value="conta" className="space-y-4">
          <AccountForm account={account} clientId={clientId} onSaved={loadAll} />
        </TabsContent>
      </Tabs>

      <Dialog open={showAccountDialog} onOpenChange={setShowAccountDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cadastrar conta de anúncio Meta</DialogTitle>
            <DialogDescription>Preencha os dados eleitorais. Você pode editar depois.</DialogDescription>
          </DialogHeader>
          <AccountForm account={null} clientId={clientId} onSaved={() => { setShowAccountDialog(false); loadAll(); }} compact />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusOverview({ status, account, onOpenAccountDialog }: { status: IdentityStatus | null; account: AdsAccount | null; onOpenAccountDialog: () => void }) {
  if (!account) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Comece cadastrando sua conta de anúncio</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>Vincule o ID da conta de anúncios Meta (formato <code>act_XXXXXXXX</code>) e os dados eleitorais do candidato.</p>
          <Button size="sm" onClick={onOpenAccountDialog}><Plus className="h-4 w-4 mr-2" />Cadastrar conta</Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!status) {
    return (
      <Alert>
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Diagnóstico ainda não rodado</AlertTitle>
        <AlertDescription>Clique em "Rodar diagnóstico" para verificar permissões, identidade Meta e configuração eleitoral.</AlertDescription>
      </Alert>
    );
  }

  const color = status.overall_status === "ok" ? "border-green-500 bg-green-50 dark:bg-green-950/30"
    : status.overall_status === "warning" ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30"
    : "border-red-500 bg-red-50 dark:bg-red-950/30";
  const Icon = status.overall_status === "ok" ? ShieldCheck : status.overall_status === "warning" ? ShieldAlert : ShieldX;
  const title = status.overall_status === "ok" ? "Tudo certo para anunciar"
    : status.overall_status === "warning" ? "Pronto com ressalvas"
    : "Bloqueios — corrija antes de anunciar";

  return (
    <Alert className={color}>
      <Icon className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        Última verificação: {format(new Date(status.checked_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
      </AlertDescription>
    </Alert>
  );
}

function DiagnosticChecklist({ status, onRun, loading }: { status: IdentityStatus | null; onRun: () => void; loading: boolean }) {
  if (!status) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-4">
          <p className="text-muted-foreground">Rode o diagnóstico para conferir tudo que a Meta exige para anúncios eleitorais.</p>
          <Button onClick={onRun} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Rodar diagnóstico agora
          </Button>
        </CardContent>
      </Card>
    );
  }

  const items = [
    { label: "Permissão ads_management", ok: status.has_ads_management },
    { label: "Permissão ads_read", ok: status.has_ads_read },
    { label: "Permissão business_management", ok: status.has_business_management },
    { label: "Permissão leads_retrieval", ok: status.has_leads_retrieval },
    { label: "Permissão pages_manage_ads", ok: status.has_pages_manage_ads },
    { label: "Business Manager vinculado", ok: status.business_manager_linked },
    { label: "Conta de anúncio ativa", ok: status.ad_account_active },
    { label: "Pixel Meta configurado", ok: status.pixel_configured },
    { label: "Disclaimer 'Pago por...' configurado", ok: status.disclaimer_configured },
    { label: "CNPJ eleitoral cadastrado", ok: status.cnpj_eleitoral_set },
    { label: "Confirmação de identidade política (verificação manual)", ok: status.political_identity_confirmed },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Checklist Meta Ads</CardTitle>
          <CardDescription>11 verificações automáticas + 1 manual</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {items.map((it, i) => (
            <div key={i} className="flex items-center gap-2 py-2 border-b last:border-b-0">
              {it.ok ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <XCircle className="h-5 w-5 text-red-600" />}
              <span className={it.ok ? "" : "text-muted-foreground"}>{it.label}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {status.issues.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>O que precisa ser feito</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {status.issues.map((issue, i) => (
              <Alert key={i} className={
                issue.severity === "block" ? "border-red-500"
                : issue.severity === "warn" ? "border-amber-500"
                : "border-blue-500"
              }>
                {issue.severity === "block" ? <ShieldX className="h-4 w-4" />
                  : issue.severity === "warn" ? <AlertTriangle className="h-4 w-4" />
                  : <Info className="h-4 w-4" />}
                <AlertTitle>{issue.title}</AlertTitle>
                <AlertDescription className="space-y-2">
                  <p className="text-xs"><strong>Por quê:</strong> {issue.why}</p>
                  <p className="text-xs"><strong>Como resolver:</strong> {issue.howToFix}</p>
                  {issue.link && (
                    <a href={issue.link} target="_blank" rel="noreferrer" className="text-xs underline inline-flex items-center gap-1">
                      Abrir no Meta <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </AlertDescription>
              </Alert>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
          <Icon className="h-4 w-4" />
          {label}
        </div>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function AccountForm({ account, clientId, onSaved, compact }: { account: AdsAccount | null; clientId: string; onSaved: () => void; compact?: boolean }) {
  const [form, setForm] = useState({
    meta_ad_account_id: account?.meta_ad_account_id || "",
    cnpj_eleitoral: account?.cnpj_eleitoral || "",
    candidato_nome: account?.candidato_nome || "",
    candidato_numero: account?.candidato_numero || "",
    candidato_cargo: account?.candidato_cargo || "",
    disclaimer_pago_por: account?.disclaimer_pago_por || "",
    identidade_meta_confirmada: account?.identidade_meta_confirmada || false,
    identidade_expira_em: account?.identidade_expira_em || "",
  });
  const [saving, setSaving] = useState(false);

  // Auto-gerar disclaimer
  useEffect(() => {
    if (form.candidato_nome && form.cnpj_eleitoral && !form.disclaimer_pago_por) {
      setForm(f => ({ ...f, disclaimer_pago_por: `Pago por ${form.candidato_nome} — CNPJ ${form.cnpj_eleitoral}` }));
    }
  }, [form.candidato_nome, form.cnpj_eleitoral]);

  async function save() {
    if (!form.meta_ad_account_id.trim()) {
      toast.error("Informe o ID da conta de anúncio (act_XXXX)");
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, client_id: clientId, ativa: true, identidade_expira_em: form.identidade_expira_em || null };
      if (account) {
        await supabase.from("ads_accounts").update(payload).eq("id", account.id);
      } else {
        await supabase.from("ads_accounts").insert(payload);
      }
      toast.success("Conta salva");
      onSaved();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className={compact ? "border-0 shadow-none" : ""}>
      {!compact && (
        <CardHeader>
          <CardTitle>Dados da conta de anúncio</CardTitle>
          <CardDescription>Configurações eleitorais usadas pelo Guard antes de publicar</CardDescription>
        </CardHeader>
      )}
      <CardContent className="space-y-4">
        <div>
          <Label>ID da conta de anúncio Meta *</Label>
          <Input value={form.meta_ad_account_id} onChange={e => setForm(f => ({ ...f, meta_ad_account_id: e.target.value }))} placeholder="act_123456789" />
          <p className="text-xs text-muted-foreground mt-1">Encontre no Gerenciador de Anúncios → Configurações da conta</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Nome do candidato</Label>
            <Input value={form.candidato_nome} onChange={e => setForm(f => ({ ...f, candidato_nome: e.target.value }))} placeholder="João da Silva" />
          </div>
          <div>
            <Label>Número (urna)</Label>
            <Input value={form.candidato_numero} onChange={e => setForm(f => ({ ...f, candidato_numero: e.target.value }))} placeholder="12345" />
          </div>
          <div>
            <Label>Cargo</Label>
            <Select value={form.candidato_cargo} onValueChange={v => setForm(f => ({ ...f, candidato_cargo: v }))}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {CARGOS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>CNPJ eleitoral</Label>
            <Input value={form.cnpj_eleitoral} onChange={e => setForm(f => ({ ...f, cnpj_eleitoral: e.target.value }))} placeholder="XX.XXX.XXX/XXXX-XX" />
          </div>
        </div>

        <div>
          <Label>Disclaimer "Pago por..."</Label>
          <Input value={form.disclaimer_pago_por} onChange={e => setForm(f => ({ ...f, disclaimer_pago_por: e.target.value }))} />
          <p className="text-xs text-muted-foreground mt-1">Será injetado automaticamente em todos os anúncios eleitorais</p>
        </div>

        <Card className="bg-muted/30">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="identidade"
                checked={form.identidade_meta_confirmada}
                onChange={e => setForm(f => ({ ...f, identidade_meta_confirmada: e.target.checked }))}
                className="mt-1"
              />
              <div className="flex-1">
                <Label htmlFor="identidade" className="cursor-pointer">Confirmação de identidade política Meta está ATIVA</Label>
                <p className="text-xs text-muted-foreground">
                  Confira em <a href="https://www.facebook.com/ID" target="_blank" rel="noreferrer" className="underline">facebook.com/ID</a>. Marque só se estiver ativa.
                </p>
              </div>
            </div>
            {form.identidade_meta_confirmada && (
              <div>
                <Label>Expira em</Label>
                <Input type="date" value={form.identidade_expira_em || ""} onChange={e => setForm(f => ({ ...f, identidade_expira_em: e.target.value }))} />
                <p className="text-xs text-muted-foreground mt-1">Avisaremos 30 dias antes</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
      </CardContent>
    </Card>
  );
}
