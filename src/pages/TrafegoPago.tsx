import { useState, useEffect, useCallback, useRef } from "react";
import { useActiveClientId } from "@/hooks/useActiveClientId";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Megaphone, RefreshCw, ShieldCheck, ShieldAlert, ShieldX, ExternalLink,
  AlertTriangle, CheckCircle2, XCircle, Info, Plus,
  DollarSign, Eye, Users as UsersIcon, Sparkles, Link2, Settings,
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
  nome?: string | null;
  moeda?: string | null;
  business_name?: string | null;
  account_status?: number | null;
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
  business_manager_linked: boolean;
  ad_account_active: boolean;
  pixel_configured: boolean;
  issues: Issue[];
  raw_response?: any;
};

export default function TrafegoPago() {
  const { data: activeClient } = useActiveClientId();
  const clientId = activeClient?.clientId ?? null;
  const [accounts, setAccounts] = useState<AdsAccount[]>([]);
  const [status, setStatus] = useState<IdentityStatus | null>(null);
  const [loadingDiag, setLoadingDiag] = useState(false);
  const [loadingSync, setLoadingSync] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const [insights, setInsights] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [hasMetaToken, setHasMetaToken] = useState<boolean | null>(null);
  const autoConnectedRef = useRef(false);

  const activeAccount = accounts.find(a => a.ativa) || null;

  const loadAll = useCallback(async () => {
    if (!clientId) return;
    const [{ data: accts }, { data: stat }, { data: ins }, { data: camps }, { data: integ }] = await Promise.all([
      supabase.from("ads_accounts").select("*").eq("client_id", clientId).order("ativa", { ascending: false }),
      supabase.from("ads_identity_status").select("*").eq("client_id", clientId).order("checked_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("ads_insights_daily").select("*").eq("client_id", clientId).eq("level", "account").order("date", { ascending: false }).limit(30),
      supabase.from("ads_campaigns").select("*").eq("client_id", clientId).order("updated_at", { ascending: false }),
      supabase.from("integrations").select("meta_access_token").eq("client_id", clientId).maybeSingle(),
    ]);
    setAccounts((accts as AdsAccount[]) || []);
    setStatus(stat as IdentityStatus | null);
    setInsights(ins || []);
    setCampaigns(camps || []);
    setHasMetaToken(!!integ?.meta_access_token);
  }, [clientId]);

  const runDiagnostic = useCallback(async (silent = false) => {
    if (!clientId) return null;
    setLoadingDiag(true);
    try {
      const { data, error } = await supabase.functions.invoke("ads-meta-diagnostic", { body: { clientId } });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Falha no diagnóstico");
      if (!silent) toast.success("Conexão verificada");
      await loadAll();
      return data;
    } catch (e: any) {
      if (!silent) toast.error(e.message || "Erro no diagnóstico");
      return null;
    } finally {
      setLoadingDiag(false);
    }
  }, [clientId, loadAll]);

  const syncCampaigns = useCallback(async (silent = false) => {
    if (!clientId) return;
    setLoadingSync(true);
    try {
      const { data, error } = await supabase.functions.invoke("ads-sync-campaigns", {
        body: { clientId, daysBack: 30 },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Falha na sincronização");
      if (!silent) toast.success(`Sincronizado: ${data.counts.campaigns} campanhas, ${data.counts.insights} dias de métricas`);
      await loadAll();
    } catch (e: any) {
      if (!silent) toast.error(e.message || "Erro na sincronização");
    } finally {
      setLoadingSync(false);
    }
  }, [clientId, loadAll]);

  // Carrega tudo ao mudar de cliente
  useEffect(() => {
    if (!clientId) return;
    autoConnectedRef.current = false;
    loadAll();
  }, [clientId, loadAll]);

  // AUTOCONNECT: roda 1x assim que sabemos que existe token e ainda não há conta ativa
  // (ou se o último diagnóstico tem mais de 10 minutos).
  useEffect(() => {
    if (!clientId || autoConnectedRef.current || hasMetaToken === null) return;
    if (!hasMetaToken) return;
    const stale = !status || (Date.now() - new Date(status.checked_at).getTime()) > 10 * 60 * 1000;
    const noActive = !activeAccount;
    if (noActive || stale) {
      autoConnectedRef.current = true;
      (async () => {
        const result = await runDiagnostic(true);
        if (result?.status?.overall_status === "ok") {
          await syncCampaigns(true);
        }
      })();
    } else {
      autoConnectedRef.current = true;
    }
  }, [clientId, hasMetaToken, status, activeAccount, runDiagnostic, syncCampaigns]);

  async function switchAccount(metaAdAccountId: string) {
    if (!clientId) return;
    setSwitchingTo(metaAdAccountId);
    try {
      const { data, error } = await supabase.functions.invoke("ads-switch-account", {
        body: { clientId, metaAdAccountId },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Falha ao trocar conta");
      toast.success("Conta atualizada");
      await loadAll();
      await syncCampaigns(true);
    } catch (e: any) {
      toast.error(e.message || "Erro ao trocar conta");
    } finally {
      setSwitchingTo(null);
    }
  }

  if (!clientId) {
    return <div className="p-6">Selecione um cliente.</div>;
  }

  const totalSpend = insights.reduce((s, i) => s + (i.spend_cents || 0), 0);
  const totalLeads = insights.reduce((s, i) => s + (i.leads || 0), 0);
  const totalImpr = insights.reduce((s, i) => s + (i.impressions || 0), 0);
  const avgCpr = totalLeads > 0 ? Math.round(totalSpend / totalLeads) : 0;

  const blockingIssues = status?.issues?.filter(i => i.severity === "block").length || 0;
  const warnIssues = status?.issues?.filter(i => i.severity === "warn").length || 0;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Megaphone className="h-7 w-7" />
            Tráfego Pago — Meta Ads
          </h1>
          <p className="text-muted-foreground">
            Conectado automaticamente ao seu token Meta. Nenhuma configuração manual necessária.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => runDiagnostic(false)} disabled={loadingDiag}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loadingDiag ? "animate-spin" : ""}`} />
            Verificar conexão
          </Button>
          <Button onClick={() => syncCampaigns(false)} disabled={loadingSync || !activeAccount}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loadingSync ? "animate-spin" : ""}`} />
            Sincronizar campanhas
          </Button>
        </div>
      </div>

      <StatusOverview
        status={status}
        hasMetaToken={hasMetaToken}
        activeAccount={activeAccount}
        loading={loadingDiag}
      />

      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="campanhas">Campanhas ({campaigns.length})</TabsTrigger>
          <TabsTrigger value="ia"><Sparkles className="h-4 w-4 mr-1" />IA Estrategista</TabsTrigger>
          <TabsTrigger value="diagnostico">
            <ShieldCheck className="h-4 w-4 mr-2" />
            Conexão
            {blockingIssues > 0 && <Badge variant="destructive" className="ml-2">{blockingIssues}</Badge>}
            {blockingIssues === 0 && warnIssues > 0 && <Badge variant="secondary" className="ml-2">{warnIssues}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="contas">Contas Meta ({accounts.length})</TabsTrigger>
        </TabsList>

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
                {activeAccount
                  ? <p>Nenhum dado ainda. Clique em <strong>Sincronizar campanhas</strong> para puxar do Meta.</p>
                  : <p>Aguardando autoconexão à Meta…</p>}
              </CardContent>
            </Card>
          )}
          {insights.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Últimos 30 dias</CardTitle></CardHeader>
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
          {activeAccount && (
            <div className="flex justify-end">
              <Button onClick={() => setWizardOpen(true)}><Plus className="h-4 w-4 mr-2" />Nova campanha</Button>
            </div>
          )}
          {campaigns.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              Nenhuma campanha ainda. Crie a primeira ou sincronize as existentes da Meta.
            </CardContent></Card>
          ) : (
            <div className="space-y-2">
              {campaigns.map(c => <CampanhaCard key={c.id} campaign={c} clientId={clientId} onChanged={loadAll} />)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="ia" className="space-y-4">
          <IAEstrategistaPanel clientId={clientId} />
        </TabsContent>

        <TabsContent value="diagnostico" className="space-y-4">
          <DiagnosticChecklist status={status} onRun={() => runDiagnostic(false)} loading={loadingDiag} />
        </TabsContent>

        <TabsContent value="contas" className="space-y-4">
          <AccountsManager
            accounts={accounts}
            activeAccount={activeAccount}
            hasMetaToken={hasMetaToken}
            onSwitch={switchAccount}
            switchingTo={switchingTo}
            onRediscover={() => runDiagnostic(false)}
            loadingDiag={loadingDiag}
          />
        </TabsContent>
      </Tabs>

      <CriarCampanhaWizard open={wizardOpen} onOpenChange={setWizardOpen} clientId={clientId} onCreated={loadAll} />
    </div>
  );
}

function StatusOverview({
  status, hasMetaToken, activeAccount, loading,
}: {
  status: IdentityStatus | null;
  hasMetaToken: boolean | null;
  activeAccount: AdsAccount | null;
  loading: boolean;
}) {
  if (hasMetaToken === false) {
    return (
      <Alert className="border-red-500 bg-red-50 dark:bg-red-950/30">
        <ShieldX className="h-4 w-4" />
        <AlertTitle>Meta ainda não conectado neste cliente</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>Tráfego Pago reaproveita o token Meta do módulo de Comentários/Instagram. Conecte a Meta em Configurações para ativar.</p>
          <Button size="sm" variant="outline" asChild>
            <a href="/configuracoes"><Settings className="h-4 w-4 mr-2" />Ir para Configurações</a>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (loading && !status) {
    return (
      <Alert>
        <RefreshCw className="h-4 w-4 animate-spin" />
        <AlertTitle>Conectando à Meta…</AlertTitle>
        <AlertDescription>Descobrindo suas contas de anúncio automaticamente.</AlertDescription>
      </Alert>
    );
  }

  if (!status) {
    return (
      <Alert>
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Aguardando primeira verificação</AlertTitle>
        <AlertDescription>Clique em "Verificar conexão" para iniciar.</AlertDescription>
      </Alert>
    );
  }

  const color = status.overall_status === "ok" ? "border-green-500 bg-green-50 dark:bg-green-950/30"
    : status.overall_status === "warning" ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30"
    : "border-red-500 bg-red-50 dark:bg-red-950/30";
  const Icon = status.overall_status === "ok" ? ShieldCheck : status.overall_status === "warning" ? ShieldAlert : ShieldX;
  const title = status.overall_status === "ok"
    ? activeAccount ? `Conectado — ${activeAccount.nome || activeAccount.meta_ad_account_id}` : "Conexão funcionando"
    : status.overall_status === "warning" ? "Conectado com avisos"
    : "Bloqueios — corrija para o sistema funcionar";

  return (
    <Alert className={color}>
      <Icon className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        Última verificação: {format(new Date(status.checked_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
        {activeAccount && (
          <> · Conta ativa: <code>{activeAccount.meta_ad_account_id}</code>
          {activeAccount.moeda && <> · {activeAccount.moeda}</>}</>
        )}
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

  const items = [
    { label: "Permissão ads_read (leitura)", ok: status.has_ads_read, required: true },
    { label: "Permissão business_management", ok: status.has_business_management, required: false },
    { label: "Business Manager vinculado", ok: status.business_manager_linked, required: false },
    { label: "Conta de anúncio acessível e ativa", ok: status.ad_account_active, required: true },
    { label: "Pixel Meta (opcional)", ok: status.pixel_configured, required: false },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>O que o sistema precisa</CardTitle>
          <CardDescription>
            Checagens feitas chamando a API real da Meta. CNPJ eleitoral, disclaimer, identidade política e demais exigências do TSE são tratados <strong>direto no Gerenciador da Meta</strong>.
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

      {status.issues?.length > 0 && (
        <Card>
          <CardHeader><CardTitle>O que precisa ser feito</CardTitle></CardHeader>
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
                    <a href={issue.link} target={issue.link.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="text-xs underline inline-flex items-center gap-1">
                      Abrir <ExternalLink className="h-3 w-3" />
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

function AccountsManager({
  accounts, activeAccount, hasMetaToken, onSwitch, switchingTo, onRediscover, loadingDiag,
}: {
  accounts: AdsAccount[];
  activeAccount: AdsAccount | null;
  hasMetaToken: boolean | null;
  onSwitch: (metaAdAccountId: string) => void;
  switchingTo: string | null;
  onRediscover: () => void;
  loadingDiag: boolean;
}) {
  if (hasMetaToken === false) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Conecte a Meta primeiro</AlertTitle>
        <AlertDescription>
          <a href="/configuracoes" className="underline">Ir para Configurações → Integrações Meta</a>
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Estas são as contas de anúncio que o seu token Meta enxerga. Selecione qual usar para este cliente.
        </div>
        <Button variant="outline" size="sm" onClick={onRediscover} disabled={loadingDiag}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loadingDiag ? "animate-spin" : ""}`} />
          Redescobrir
        </Button>
      </div>
      {accounts.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          Nenhuma conta encontrada ainda. Clique em <strong>Redescobrir</strong>.
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {accounts.map(a => {
            const isActive = a.id === activeAccount?.id;
            const statusOk = a.account_status === 1;
            return (
              <Card key={a.id} className={isActive ? "border-green-500" : ""}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold flex items-center gap-2">
                        {a.nome || a.meta_ad_account_id}
                        {isActive && <Badge className="bg-green-600">Ativa</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground"><code>{a.meta_ad_account_id}</code></div>
                      {a.business_name && <div className="text-xs text-muted-foreground">BM: {a.business_name}</div>}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {a.moeda && <Badge variant="outline" className="text-xs">{a.moeda}</Badge>}
                      <Badge variant={statusOk ? "secondary" : "destructive"} className="text-xs">
                        {statusOk ? "Ativa na Meta" : `status ${a.account_status ?? "?"}`}
                      </Badge>
                    </div>
                  </div>
                  {!isActive && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      disabled={switchingTo === a.meta_ad_account_id}
                      onClick={() => onSwitch(a.meta_ad_account_id)}
                    >
                      <Link2 className="h-4 w-4 mr-2" />
                      {switchingTo === a.meta_ad_account_id ? "Trocando…" : "Usar esta conta"}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
