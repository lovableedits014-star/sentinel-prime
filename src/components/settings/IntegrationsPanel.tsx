import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Facebook, Brain, Save, AlertCircle, Zap, Check, Loader2, ShieldCheck, ShieldAlert, RefreshCw, Instagram, MessageSquareText } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type LLMProvider = Database["public"]["Enums"]["llm_provider"];

const LLM_PROVIDERS: { value: LLMProvider | 'lovable'; label: string; description: string }[] = [
  { value: 'lovable', label: 'Lovable AI (Padrão)', description: 'Sem necessidade de API key - Gemini 2.5 Flash' },
  { value: 'openai', label: 'OpenAI', description: 'GPT-4o, GPT-4o Mini' },
  { value: 'anthropic', label: 'Anthropic', description: 'Claude 3.5 Sonnet, Claude 3 Haiku' },
  { value: 'gemini', label: 'Google Gemini', description: 'Gemini 1.5 Pro, Gemini 1.5 Flash' },
  { value: 'groq', label: 'Groq', description: 'LLaMA 3.1, Mixtral (Ultra rápido)' },
  { value: 'mistral', label: 'Mistral AI', description: 'Mistral Large, Mistral Small' },
  { value: 'cohere', label: 'Cohere', description: 'Command R, Command R+' },
];

const DEFAULT_MODELS: Record<string, { models: string[]; default: string }> = {
  lovable: { models: ['google/gemini-2.5-flash'], default: 'google/gemini-2.5-flash' },
  openai: { models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'], default: 'gpt-4o-mini' },
  anthropic: { models: ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'], default: 'claude-3-haiku-20240307' },
  gemini: { models: ['gemini-1.5-pro', 'gemini-1.5-flash'], default: 'gemini-1.5-flash' },
  groq: { models: ['llama-3.1-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'], default: 'llama-3.1-8b-instant' },
  mistral: { models: ['mistral-large-latest', 'mistral-small-latest'], default: 'mistral-small-latest' },
  cohere: { models: ['command-r-plus', 'command-r'], default: 'command-r' },
};

const REQUIRED_PERMISSIONS = [
  { name: 'pages_read_engagement', label: 'Ler engajamento', required: true, platform: 'facebook' },
  { name: 'pages_manage_metadata', label: 'Metadados da página', required: true, platform: 'facebook' },
  { name: 'pages_manage_engagement', label: 'Gerenciar engajamento', required: false, platform: 'facebook' },
  { name: 'pages_show_list', label: 'Listar páginas', required: false, platform: 'facebook' },
  { name: 'instagram_basic', label: 'Instagram básico', required: true, platform: 'instagram' },
  { name: 'instagram_manage_comments', label: 'Gerenciar comentários IG', required: true, platform: 'instagram' },
  { name: 'public_profile', label: 'Perfil público', required: false, platform: 'general' },
];

interface IntegrationsPanelProps {
  clientId: string;
}

export default function IntegrationsPanel({ clientId }: IntegrationsPanelProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingMeta, setTestingMeta] = useState(false);
  const [testingLLM, setTestingLLM] = useState(false);
  const [checkingPermissions, setCheckingPermissions] = useState(false);
  const [permissions, setPermissions] = useState<{ name: string; granted: boolean }[]>([]);
  const [pageName, setPageName] = useState<string>("");
  const [tokenType, setTokenType] = useState<string>("");
  const [identityTest, setIdentityTest] = useState<{ tested: boolean; working: boolean }>({ tested: false, working: false });
  const [renewingToken, setRenewingToken] = useState(false);
  const [tokenStatus, setTokenStatus] = useState<{
    expiresAt: string | null;
    tokenType: string | null;
    isExpired: boolean;
    isExpiringSoon: boolean;
    neverExpires: boolean;
  }>({ expiresAt: null, tokenType: null, isExpired: false, isExpiringSoon: false, neverExpires: false });

  const [metaData, setMetaData] = useState({
    accessToken: "",
    pageId: "",
    instagramId: "",
    webhookUrl: "",
  });

  const [llmData, setLlmData] = useState({
    provider: 'lovable' as LLMProvider | 'lovable',
    apiKey: "",
    model: "",
    isConfigured: false,
  });

  const [customPrompt, setCustomPrompt] = useState("");

  useEffect(() => {
    fetchIntegrations();
  }, [clientId]);

  const fetchIntegrations = async () => {
    try {
      const { data: integration } = await supabase
        .from("integrations")
        .select("meta_page_id, meta_instagram_id, meta_webhook_url, llm_provider, llm_model, meta_token_expires_at, meta_token_type, ai_custom_prompt")
        .eq("client_id", clientId)
        .maybeSingle();

      if (integration) {
        setMetaData({
          accessToken: "",
          pageId: integration.meta_page_id || "",
          instagramId: integration.meta_instagram_id || "",
          webhookUrl: integration.meta_webhook_url || "",
        });

        setLlmData({
          provider: (integration.llm_provider as LLMProvider) || 'lovable',
          apiKey: "",
          model: integration.llm_model || "",
          isConfigured: !!integration.llm_provider,
        });

        setCustomPrompt((integration as any).ai_custom_prompt || "");

        const expiresAt = (integration as any).meta_token_expires_at;
        const tType = (integration as any).meta_token_type;
        if (expiresAt) {
          const expiresDate = new Date(expiresAt);
          const now = new Date();
          const daysUntilExpiry = (expiresDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
          setTokenStatus({
            expiresAt,
            tokenType: tType,
            isExpired: daysUntilExpiry < 0,
            isExpiringSoon: daysUntilExpiry >= 0 && daysUntilExpiry <= 7,
            neverExpires: false,
          });
        } else if (tType === 'long_lived' || tType === 'page_token') {
          setTokenStatus({
            expiresAt: null,
            tokenType: tType,
            isExpired: false,
            isExpiringSoon: false,
            neverExpires: true,
          });
        }
      }
    } catch (error: any) {
      console.error("Error fetching integrations:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleProviderChange = (value: string) => {
    const provider = value as LLMProvider | 'lovable';
    const defaultModel = DEFAULT_MODELS[provider]?.default || '';
    setLlmData(prev => ({
      ...prev,
      provider,
      model: defaultModel,
      apiKey: provider === 'lovable' ? '' : prev.apiKey
    }));
  };

  const handleCheckPermissions = async () => {
    setCheckingPermissions(true);
    try {
      const { data, error } = await supabase.functions.invoke('test-meta-connection', {
        body: { clientId, checkPermissions: true }
      });
      if (error) throw error;
      if (data.success) {
        setPageName(data.page_name || '');
        if (data.permissions) setPermissions(data.permissions);
        if (data.token_type) setTokenType(data.token_type);
        if (data.comment_identity) setIdentityTest(data.comment_identity);
        toast.success(`Conexão OK! Página: ${data.page_name}`);
      } else {
        toast.error(data.error || 'Erro ao verificar permissões');
      }
    } catch (error: any) {
      toast.error("Erro ao verificar permissões");
    } finally {
      setCheckingPermissions(false);
    }
  };

  const handleTestMetaConnection = async () => {
    setTestingMeta(true);
    try {
      const { data, error } = await supabase.functions.invoke('test-meta-connection', {
        body: { clientId }
      });
      if (error) throw error;
      if (data.success) {
        toast.success(`${data.message}\nPágina: ${data.page_name}`);
        setPageName(data.page_name || '');
        if (data.permissions) setPermissions(data.permissions);
        if (data.token_type) setTokenType(data.token_type);
        if (data.comment_identity) setIdentityTest(data.comment_identity);
      } else {
        toast.error(data.error || 'Erro ao testar conexão');
      }
    } catch (error: any) {
      toast.error("Erro ao testar conexão com Meta");
    } finally {
      setTestingMeta(false);
    }
  };

  const handleTestLLMConnection = async () => {
    if (llmData.provider === 'lovable') {
      toast.success("Lovable AI está sempre disponível!");
      return;
    }
    if (!llmData.apiKey) {
      toast.error("Insira sua API key para testar");
      return;
    }
    setTestingLLM(true);
    try {
      const { data, error } = await supabase.functions.invoke('test-llm-connection', {
        body: { provider: llmData.provider, apiKey: llmData.apiKey, model: llmData.model }
      });
      if (error) throw error;
      if (data.success) toast.success(data.message);
      else toast.error(data.error || 'Erro ao testar conexão');
    } catch (error: any) {
      toast.error(error.message || "Erro ao testar conexão com LLM");
    } finally {
      setTestingLLM(false);
    }
  };

  const handleRenewToken = async () => {
    setRenewingToken(true);
    try {
      const { data, error } = await supabase.functions.invoke('renew-meta-token', {
        body: { clientId }
      });
      if (error) throw error;
      if (data.success) {
        toast.success(data.message);
        if (data.never_expires) {
          setTokenStatus({ expiresAt: null, tokenType: data.token_type, isExpired: false, isExpiringSoon: false, neverExpires: true });
        } else if (data.expires_at) {
          const daysUntilExpiry = (new Date(data.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
          setTokenStatus({
            expiresAt: data.expires_at, tokenType: data.token_type,
            isExpired: daysUntilExpiry < 0, isExpiringSoon: daysUntilExpiry >= 0 && daysUntilExpiry <= 7, neverExpires: false,
          });
        }
      } else {
        if (data.expired) setTokenStatus(prev => ({ ...prev, isExpired: true }));
        toast.error(data.error);
      }
    } catch (error: any) {
      toast.error("Erro ao renovar token");
    } finally {
      setRenewingToken(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updateData: any = {
        client_id: clientId,
        meta_page_id: metaData.pageId,
        meta_instagram_id: metaData.instagramId,
        meta_webhook_url: metaData.webhookUrl,
      };

      if (metaData.accessToken && metaData.accessToken.trim() !== "") {
        updateData.meta_access_token = metaData.accessToken;
        updateData.meta_token_type = 'short_lived';
        updateData.meta_token_expires_at = null;
      }

      if (llmData.provider === 'lovable') {
        updateData.llm_provider = null;
        updateData.llm_api_key = null;
        updateData.llm_model = null;
      } else {
        updateData.llm_provider = llmData.provider;
        if (llmData.apiKey && llmData.apiKey.trim() !== "") updateData.llm_api_key = llmData.apiKey;
        updateData.llm_model = llmData.model;
      }

      updateData.ai_custom_prompt = customPrompt || null;

      const { error } = await supabase.from("integrations").upsert(updateData, { onConflict: 'client_id' });
      if (error) throw error;

      toast.success("Integrações salvas com sucesso!");
      setMetaData(prev => ({ ...prev, accessToken: "" }));
      setLlmData(prev => ({ ...prev, apiKey: "", isConfigured: prev.provider !== 'lovable' }));

      if (metaData.accessToken && metaData.accessToken.trim() !== "") {
        setTokenStatus(prev => ({ ...prev, isExpired: false, isExpiringSoon: false }));
        handleRenewToken();
      }
    } catch (error: any) {
      toast.error("Erro ao salvar integrações");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Card><CardContent className="py-8"><div className="h-20 bg-muted animate-pulse rounded-lg" /></CardContent></Card>;
  }

  const selectedProviderModels = DEFAULT_MODELS[llmData.provider]?.models || [];

  return (
    <div className="space-y-6">
      {/* Security Alert */}
      <Card className="border-amber-300/50 dark:border-amber-700/50 bg-amber-50/50 dark:bg-amber-950/20">
        <CardContent className="flex items-start gap-3 pt-6">
          <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-amber-800 dark:text-amber-300 mb-1">Segurança</p>
            <p className="text-muted-foreground">
              Todas as chaves de API são armazenadas de forma criptografada e segura.
              Nunca compartilhe suas credenciais com terceiros.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Multi-LLM Configuration */}
      <Card className="border-primary/20">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Brain className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                Provedor de IA
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">Multi-LLM</span>
              </CardTitle>
              <CardDescription>Escolha o provedor de IA para análise e respostas</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Provedor de IA</Label>
            <Select value={llmData.provider} onValueChange={handleProviderChange}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um provedor" />
              </SelectTrigger>
              <SelectContent>
                {LLM_PROVIDERS.map((provider) => (
                  <SelectItem key={provider.value} value={provider.value}>
                    <div className="flex flex-col">
                      <span className="font-medium">{provider.label}</span>
                      <span className="text-xs text-muted-foreground">{provider.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {llmData.provider === 'lovable' ? (
            <div className="flex items-start gap-3 p-4 bg-primary/5 rounded-lg border border-primary/20">
              <Check className="w-5 h-5 text-primary mt-0.5" />
              <div className="text-sm">
                <p className="font-medium mb-1">Lovable AI Ativo ✓</p>
                <p className="text-muted-foreground">
                  Usando Google Gemini 2.5 Flash automaticamente. Não precisa de API key -
                  funciona imediatamente para análise de sentimento e geração de respostas.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Modelo</Label>
                <Select value={llmData.model} onValueChange={(v) => setLlmData(prev => ({ ...prev, model: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione um modelo" /></SelectTrigger>
                  <SelectContent>
                    {selectedProviderModels.map((model) => (
                      <SelectItem key={model} value={model}>{model}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="llm-api-key">API Key</Label>
                <Input
                  id="llm-api-key" type="password"
                  placeholder={llmData.isConfigured ? "••••••••••••• (configurada)" : "Insira sua API key"}
                  value={llmData.apiKey}
                  onChange={(e) => setLlmData(prev => ({ ...prev, apiKey: e.target.value }))}
                />
                {llmData.isConfigured && (
                  <p className="text-xs text-muted-foreground">✓ API key configurada. Deixe em branco para manter a atual.</p>
                )}
              </div>
              <Button onClick={handleTestLLMConnection} disabled={testingLLM || !llmData.apiKey} variant="outline" className="w-full">
                {testingLLM ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Testando...</> : <><Zap className="w-4 h-4 mr-2" />Testar Conexão</>}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Custom AI Prompt */}
      <Card className="border-primary/20">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <MessageSquareText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>Prompt de Resposta</CardTitle>
              <CardDescription>Defina as instruções que a IA deve seguir ao gerar respostas para comentários</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="custom-prompt">Instruções para a IA</Label>
            <Textarea
              id="custom-prompt"
              placeholder="Ex: Responda sempre em nome do Deputado João Silva. Use tom formal e empático..."
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              className="min-h-[120px]"
            />
            <p className="text-xs text-muted-foreground">
              Este prompt será usado como base para todas as respostas geradas pela IA. Deixe em branco para usar o comportamento padrão.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Meta Graph API */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Facebook className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <CardTitle>Meta Graph API</CardTitle>
              <CardDescription>Conecte suas páginas do Facebook e Instagram</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="meta-token">Access Token</Label>
            <Input id="meta-token" type="password" placeholder="Insira um novo token para atualizar"
              value={metaData.accessToken} onChange={(e) => setMetaData({ ...metaData, accessToken: e.target.value })} />
            <p className="text-xs text-muted-foreground mt-1">
              {metaData.pageId ? '✓ Token configurado (deixe em branco para manter o atual)' : 'Token não configurado'}
            </p>
          </div>

          {/* Token Status */}
          {(tokenStatus.isExpired || tokenStatus.isExpiringSoon || tokenStatus.neverExpires) && (
            <div className={`flex items-start gap-3 p-4 rounded-lg border ${
              tokenStatus.isExpired ? 'bg-destructive/10 border-destructive/30'
                : tokenStatus.isExpiringSoon ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
                : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
            }`}>
              {tokenStatus.isExpired ? <AlertCircle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
                : tokenStatus.isExpiringSoon ? <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                : <Check className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />}
              <div className="flex-1">
                <p className={`font-medium text-sm ${
                  tokenStatus.isExpired ? 'text-destructive' : tokenStatus.isExpiringSoon ? 'text-amber-800 dark:text-amber-200' : 'text-emerald-800 dark:text-emerald-200'
                }`}>
                  {tokenStatus.isExpired ? '⚠️ Token Meta EXPIRADO!'
                    : tokenStatus.isExpiringSoon ? '⏰ Token expira em breve'
                    : '✅ Token permanente ativo'}
                </p>
                <p className={`text-xs mt-1 ${
                  tokenStatus.isExpired ? 'text-destructive/80' : tokenStatus.isExpiringSoon ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'
                }`}>
                  {tokenStatus.isExpired ? 'A sincronização de comentários está parada. Gere um novo token no Meta for Developers ou tente renovar.'
                    : tokenStatus.isExpiringSoon && tokenStatus.expiresAt
                      ? `Expira em ${new Date(tokenStatus.expiresAt).toLocaleDateString('pt-BR')}. Renove para evitar interrupção.`
                      : tokenStatus.neverExpires ? 'Token de página sem expiração. Sincronização funcionando normalmente.' : ''}
                </p>
                {(tokenStatus.isExpired || tokenStatus.isExpiringSoon) && (
                  <Button size="sm" variant={tokenStatus.isExpired ? "destructive" : "outline"} onClick={handleRenewToken} disabled={renewingToken} className="mt-2">
                    {renewingToken ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Renovando...</> : <><RefreshCw className="w-3 h-3 mr-1" /> Tentar Renovar Token</>}
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="page-id">Page ID (Facebook)</Label>
              <Input id="page-id" placeholder="ID da sua página" value={metaData.pageId} onChange={(e) => setMetaData({ ...metaData, pageId: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="instagram-id">Instagram Business ID</Label>
              <Input id="instagram-id" placeholder="ID do perfil comercial" value={metaData.instagramId} onChange={(e) => setMetaData({ ...metaData, instagramId: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="webhook-url">Webhook URL (opcional)</Label>
            <Input id="webhook-url" placeholder="URL para receber notificações" value={metaData.webhookUrl} onChange={(e) => setMetaData({ ...metaData, webhookUrl: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleTestMetaConnection} disabled={testingMeta || !metaData.pageId} variant="outline" className="flex-1">
              {testingMeta ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Testando...</> : <><Zap className="w-4 h-4 mr-2" />Testar Conexão</>}
            </Button>
            <Button onClick={handleCheckPermissions} disabled={checkingPermissions || !metaData.pageId} variant="outline">
              {checkingPermissions ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            </Button>
          </div>

          {/* Permissions Panel */}
          {permissions.length > 0 && (
            <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-primary" />
                  <span className="font-medium text-sm">Diagnóstico de Permissões</span>
                </div>
                <div className="flex items-center gap-2">
                  {pageName && <Badge variant="outline" className="text-xs"><Facebook className="w-3 h-3 mr-1" />{pageName}</Badge>}
                  {tokenType && <Badge variant={tokenType === 'user_token' ? 'default' : 'secondary'} className="text-xs">
                    {tokenType === 'user_token' ? 'User Token ✓' : tokenType === 'page_token' ? 'Page Token' : 'Token'}
                  </Badge>}
                </div>
              </div>

              {identityTest.tested && (
                <div className={`flex items-start gap-2 p-3 rounded-lg text-xs border ${
                  identityTest.working
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                    : 'bg-destructive/10 border-destructive/30 text-destructive'
                }`}>
                  {identityTest.working ? <Check className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />}
                  <div>
                    <p className="font-medium">
                      {identityTest.working ? '✅ Identificação de autores funcionando!' : '❌ Autores dos comentários NÃO estão sendo identificados'}
                    </p>
                    <p className="mt-0.5">
                      {identityTest.working ? 'O token consegue ler nome e ID dos comentaristas.'
                        : 'Verifique se o App está em modo "Live" no Meta for Developers e se as permissões estão aprovadas.'}
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {permissions.map((perm) => {
                  const permConfig = REQUIRED_PERMISSIONS.find(p => p.name === perm.name);
                  const isRequired = permConfig?.required;
                  const isInstagram = permConfig?.platform === 'instagram';
                  return (
                    <div key={perm.name} className={`flex items-center gap-2 text-xs p-2 rounded border ${
                      perm.granted
                        ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                        : isRequired
                          ? 'bg-destructive/10 border-destructive/30 text-destructive font-medium'
                          : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'
                    }`}>
                      {perm.granted ? <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                        : isRequired ? <ShieldAlert className="w-3 h-3 text-destructive flex-shrink-0" />
                        : <AlertCircle className="w-3 h-3 text-amber-600 dark:text-amber-400 flex-shrink-0" />}
                      {isInstagram && <Instagram className="w-3 h-3 flex-shrink-0" />}
                      <span className="truncate">{perm.name.replace(/_/g, ' ')}</span>
                      {isRequired && !perm.granted && <Badge variant="destructive" className="text-[10px] px-1 py-0 ml-auto">!</Badge>}
                    </div>
                  );
                })}
              </div>

              {permissions.some(p => !p.granted && REQUIRED_PERMISSIONS.find(r => r.name === p.name)?.required) && (
                <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-medium">Permissões obrigatórias ausentes!</p>
                    <p>Acesse o <strong>Meta for Developers</strong>, edite seu App, vá em <strong>Permissões</strong> e solicite as permissões marcadas com "!".</p>
                  </div>
                </div>
              )}

              {permissions.find(p => p.name === 'instagram_manage_comments' && !p.granted) && metaData.instagramId && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-800 dark:text-amber-200">
                  <Instagram className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Instagram: @usernames não serão capturados</p>
                    <p className="text-amber-700 dark:text-amber-300">
                      Sem <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">instagram_manage_comments</code>, a API não retorna o @username de quem comentou.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} size="lg">
          <Save className="w-4 h-4 mr-2" />
          {saving ? "Salvando..." : "Salvar Integrações"}
        </Button>
      </div>
    </div>
  );
}
