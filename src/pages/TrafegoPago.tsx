import { useState, useEffect, useMemo } from "react";
import { useActiveClientId } from "@/hooks/useActiveClientId";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Megaphone, RefreshCw, ShieldCheck, ShieldAlert, ShieldX, ExternalLink,
  AlertTriangle, CheckCircle2, XCircle, Info, Plus,
  DollarSign, Eye, Users as UsersIcon, Sparkles
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CriarCampanhaWizard } from "@/components/trafego/CriarCampanhaWizard";
import { CampanhaCard } from "@/components/trafego/CampanhaCard";
import { IAEstrategistaPanel } from "@/components/trafego/IAEstrategistaPanel";

type AdsAccount = {
  id: string;
  client_id: string;
  meta_ad_account_id: string;
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
  issues: Issue[];
};

export default function TrafegoPago() {
  const { data: activeClient } = useActiveClientId();
  const clientId = activeClient?.clientId ?? null;
  const [account, setAccount] = useState<AdsAccount | null>(null);
  const [status, setStatus] = useState<IdentityStatus | null>(null);
  const [loadingDiag, setLoadingDiag] = useState(false);
  const [loadingSync, setLoadingSync] = useState(false);
  const [showAccountDialog, setShowAccountDialog] = useState(false);
  const [insights, setInsights] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);

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

  const totalSpend = insights.reduce((s, i) => s + (i.spend_cents || 0), 0);
  const totalLeads = insights.reduce((s, i) => s + (i.leads || 0), 0);
  const totalImpr = insights.reduce((s, i) => s + (i.impressions || 0), 0);
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
          <p className="text-muted-foreground">Conecte sua conta Meta e gerencie campanhas por aqui</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={runDiagnostic} disabled={loadingDiag}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loadingDiag ? "animate-spin" : ""}`} />
            Verificar conexão
          </Button>
          <Button onClick={syncCampaigns} disabled={loadingSync || !account}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loadingSync ? "animate-spin" : ""}`} />
            Sincronizar campanhas
          </Button>
        </div>
      </div>

      <StatusOverview status={status} account={account} onOpenAccountDialog={() => setShowAccountDialog(true)} />

      <Tabs defaultValue="diagnostico" className="space-y-4">
        <TabsList>
          <TabsTrigger value="diagnostico">
            <ShieldCheck className="h-4 w-4 mr-2" />
            Conexão
            {blockingIssues > 0 && <Badge variant="destructive" className="ml-2">{blockingIssues}</Badge>}
            {blockingIssues === 0 && warnIssues > 0 && <Badge variant="secondary" className="ml-2">{warnIssues}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="campanhas">Campanhas ({campaigns.length})</TabsTrigger>
          <TabsTrigger value="ia"><Sparkles className="h-4 w-4 mr-1" />IA Estrategista</TabsTrigger>
          <TabsTrigger value="conta">Conta</TabsTrigger>
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
          {account && (
            <div className="flex justify-end">
              <Button onClick={() => setWizardOpen(true)}><Plus className="h-4 w-4 mr-2" />Nova campanha</Button>
            </div>
          )}
          {campaigns.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhuma campanha ainda. Crie a primeira ou sincronize existentes da Meta.</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {campaigns.map(c => <CampanhaCard key={c.id} campaign={c} clientId={clientId} onChanged={loadAll} />)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="ia" className="space-y-4">
          <IAEstrategistaPanel clientId={clientId} />
        </TabsContent>

        <TabsContent value="conta" className="space-y-4">
          <AccountForm account={account} clientId={clientId} onSaved={loadAll} />
        </TabsContent>
      </Tabs>

      <CriarCampanhaWizard open={wizardOpen} onOpenChange={setWizardOpen} clientId={clientId} onCreated={loadAll} />

      <Dialog open={showAccountDialog} onOpenChange={setShowAccountDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cadastrar conta de anúncio Meta</DialogTitle>
            <DialogDescription>Informe o ID da conta. Você pode editar depois.</DialogDescription>
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
          <p>Vincule o ID da conta de anúncios Meta (formato <code>act_XXXXXXXX</code>). É só isso que o sistema precisa para funcionar.</p>
          <Button size="sm" onClick={onOpenAccountDialog}><Plus className="h-4 w-4 mr-2" />Cadastrar conta</Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!status) {
    return (
      <Alert>
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Conexão ainda não verificada</AlertTitle>
        <AlertDescription>Clique em "Verificar conexão" para conferir o token, as permissões e o acesso à conta de anúncio.</AlertDescription>
      </Alert>
    );
  }

  const color = status.overall_status === "ok" ? "border-green-500 bg-green-50 dark:bg-green-950/30"
    : status.overall_status === "warning" ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30"
    : "border-red-500 bg-red-50 dark:bg-red-950/30";
  const Icon = status.overall_status === "ok" ? ShieldCheck : status.overall_status === "warning" ? ShieldAlert : ShieldX;
  const title = status.overall_status === "ok" ? "Conexão funcionando"
    : status.overall_status === "warning" ? "Conectado com avisos"
    : "Bloqueios — corrija para o sistema funcionar";

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
          <p className="text-muted-foreground">Verifique se o sistema está conseguindo conversar com a sua conta Meta Ads.</p>
          <Button onClick={onRun} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Verificar agora
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Apenas o que o SISTEMA precisa para funcionar
  const items = [
    { label: "Permissão ads_read (leitura)", ok: status.has_ads_read, required: true },
    { label: "Permissão business_management", ok: status.has_business_management, required: false },
    { label: "Business Manager vinculado", ok: status.business_manager_linked, required: false },
    { label: "Conta de anúncio acessível e ativa", ok: status.ad_account_active, required: true },
    { label: "Pixel Meta (opcional, p/ conversões)", ok: status.pixel_configured, required: false },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>O que o sistema precisa</CardTitle>
          <CardDescription>
            Checagens feitas chamando a API real da Meta. CNPJ eleitoral, disclaimer "Pago por...", identidade política
            e demais exigências do TSE são tratadas <strong>direto no Gerenciador da Meta</strong> — não precisam ser configuradas aqui.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {items.map((it, i) => (
            <div key={i} className="flex items-center gap-2 py-2 border-b last:border-b-0">
              {it.ok ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <XCircle className={`h-5 w-5 ${it.required ? "text-red-600" : "text-amber-500"}`} />}
              <span className={it.ok ? "" : "text-muted-foreground"}>{it.label}</span>
              {!it.required && !it.ok && <Badge variant="outline" className="ml-auto text-xs">opcional</Badge>}
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
  const [adAccountId, setAdAccountId] = useState(account?.meta_ad_account_id || "");
  const [saving, setSaving] = useState(false);

  async function save() {
    const id = adAccountId.trim();
    if (!id) {
      toast.error("Informe o ID da conta de anúncio (act_XXXX)");
      return;
    }
    if (!/^act_\d+$/.test(id)) {
      toast.error("Formato inválido. Use act_ seguido de números (ex: act_123456789).");
      return;
    }
    setSaving(true);
    try {
      const payload = { meta_ad_account_id: id, client_id: clientId, ativa: true };
      if (account) {
        const { error } = await supabase.from("ads_accounts").update(payload).eq("id", account.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("ads_accounts").insert(payload);
        if (error) throw error;
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
          <CardTitle>Conta de anúncio Meta</CardTitle>
          <CardDescription>Único dado obrigatório para o sistema funcionar</CardDescription>
        </CardHeader>
      )}
      <CardContent className="space-y-4">
        <div>
          <Label>ID da conta de anúncio Meta *</Label>
          <Input value={adAccountId} onChange={e => setAdAccountId(e.target.value)} placeholder="act_123456789" />
          <p className="text-xs text-muted-foreground mt-1">
            Encontre em <a href="https://business.facebook.com/settings/ad-accounts" target="_blank" rel="noreferrer" className="underline">Business Manager → Contas de anúncio</a>. Sempre começa com <code>act_</code>.
          </p>
        </div>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Tudo que envolve regras eleitorais (CNPJ, disclaimer "Pago por...", confirmação de identidade política, dados do candidato)
            é configurado <strong>diretamente no Gerenciador da Meta</strong>. O sistema não precisa desses dados — quem aprova o
            anúncio é a própria Meta.
          </AlertDescription>
        </Alert>

        <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
      </CardContent>
    </Card>
  );
}
