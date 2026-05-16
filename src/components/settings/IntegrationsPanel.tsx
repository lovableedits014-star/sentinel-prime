import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Facebook, Brain, Save, AlertCircle, Zap, Check, Loader2, ShieldCheck, ShieldAlert, RefreshCw, Instagram, MessageSquareText, Rocket, Layers, Sparkles, Gauge } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type LLMProvider = Database["public"]["Enums"]["llm_provider"];

const LLM_PROVIDERS: { value: LLMProvider | 'lovable'; label: string; description: string }[] = [
  { value: 'lovable', label: 'Lovable AI (Padrão)', description: 'Sem necessidade de API key - Gemini 2.5 Flash' },
  { value: 'openai', label: 'OpenAI', description: 'GPT-4o, GPT-4o Mini' },
  { value: 'anthropic', label: 'Anthropic', description: 'Claude 3.5 Sonnet, Claude 3 Haiku' },
  { value: 'gemini', label: 'Google Gemini', description: 'Gemini 2.5 Flash-Lite / Flash / Pro — recomendado p/ uso intenso' },
  { value: 'groq', label: 'Groq', description: 'LLaMA 3.1, Mixtral (Ultra rápido)' },
  { value: 'mistral', label: 'Mistral AI', description: 'Mistral Large, Mistral Small' },
  { value: 'cohere', label: 'Cohere', description: 'Command R, Command R+' },
];

const DEFAULT_MODELS: Record<string, { models: string[]; default: string }> = {
  lovable: { models: ['google/gemini-2.5-flash'], default: 'google/gemini-2.5-flash' },
  openai: { models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'], default: 'gpt-4o-mini' },
  anthropic: { models: ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'], default: 'claude-3-haiku-20240307' },
  gemini: { models: ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-flash', 'gemini-1.5-pro'], default: 'gemini-2.5-flash' },
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

type TierKey = 'fast' | 'classify' | 'reasoning' | 'deep';

const TIERS: { key: TierKey; label: string; description: string; icon: any }[] = [
  { key: 'fast',      label: 'FAST',      description: 'Tarefas rápidas e de alto volume (classificação leve, respostas curtas)', icon: Rocket },
  { key: 'classify',  label: 'CLASSIFY',  description: 'Classificação estruturada (sentimento, tags, intenções)',                  icon: Gauge },
  { key: 'reasoning', label: 'REASONING', description: 'Raciocínio multi-passo, análises e síntese',                                icon: Layers },
  { key: 'deep',      label: 'DEEP',      description: 'Conteúdos longos, geração editorial e contextos densos',                    icon: Sparkles },
];

type TierConfig = { provider: LLMProvider | 'lovable'; apiKey: string; model: string; isConfigured: boolean };

const emptyTier = (): TierConfig => ({ provider: 'lovable', apiKey: '', model: '', isConfigured: false });

type ProviderCardStatus = 'untested' | 'testing' | 'ok' | 'error';

type ProviderCard = {
  id: string;
  provider: LLMProvider; // never 'lovable' here — lovable is the implicit fallback
  model: string;
  apiKey: string;
  isConfigured: boolean;
  tiers: Record<TierKey, boolean>;
  status: ProviderCardStatus;
  statusMessage: string;
  testedAt: number | null;
};

const emptyTierFlags = (): Record<TierKey, boolean> => ({
  fast: false, classify: false, reasoning: false, deep: false,
});

const SELECTABLE_PROVIDERS = LLM_PROVIDERS.filter(p => p.value !== 'lovable') as { value: LLMProvider; label: string; description: string }[];

const mergeTierFlags = (a: Record<TierKey, boolean>, b: Record<TierKey, boolean>): Record<TierKey, boolean> => ({
  fast: a.fast || b.fast,
  classify: a.classify || b.classify,
  reasoning: a.reasoning || b.reasoning,
  deep: a.deep || b.deep,
});

// Map raw provider errors → friendly Portuguese messages
const humanizeLLMError = (raw: string): string => {
  const msg = (raw || '').toLowerCase();
  if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('invalid api key') || msg.includes('api key')) {
    return 'API key inválida ou sem permissão.';
  }
  if (msg.includes('429') || msg.includes('rate limit') || msg.includes('quota')) {
    return 'Limite de requisições excedido — tente novamente em alguns segundos.';
  }
  if (msg.includes('402') || msg.includes('credit') || msg.includes('billing')) {
    return 'Créditos esgotados ou problema de billing no provider.';
  }
  if (msg.includes('model') && (msg.includes('not found') || msg.includes('does not exist') || msg.includes('invalid'))) {
    return 'Modelo inexistente ou indisponível para esta conta.';
  }
  if (msg.includes('timeout') || msg.includes('etimedout')) {
    return 'Timeout — o provider demorou a responder.';
  }
  if (msg.includes('network') || msg.includes('fetch failed') || msg.includes('econnrefused')) {
    return 'Provider indisponível no momento.';
  }
  return raw || 'Falha desconhecida na conexão.';
};

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

  const [mode, setMode] = useState<'simple' | 'hybrid'>('simple');
  const [tiers, setTiers] = useState<Record<TierKey, TierConfig>>({
    fast: emptyTier(), classify: emptyTier(), reasoning: emptyTier(), deep: emptyTier(),
  });
  const [providerCards, setProviderCards] = useState<ProviderCard[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [customPrompt, setCustomPrompt] = useState("");

  useEffect(() => {
    fetchIntegrations();
  }, [clientId]);

  const fetchIntegrations = async () => {
    try {
      const { data: integration } = await supabase
        .from("integrations")
        .select("meta_page_id, meta_instagram_id, meta_webhook_url, llm_provider, llm_model, meta_token_expires_at, meta_token_type, ai_custom_prompt, llm_mode, llm_provider_fast, llm_model_fast, llm_provider_classify, llm_model_classify, llm_provider_reasoning, llm_model_reasoning, llm_provider_deep, llm_model_deep, llm_api_key_fast, llm_api_key_classify, llm_api_key_reasoning, llm_api_key_deep")
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

        const integAny = integration as any;
        setMode(integAny.llm_mode === 'hybrid' ? 'hybrid' : 'simple');
        setTiers({
          fast: {
            provider: (integAny.llm_provider_fast as LLMProvider) || 'lovable',
            apiKey: '',
            model: integAny.llm_model_fast || '',
            isConfigured: !!integAny.llm_api_key_fast || !!integAny.llm_provider_fast,
          },
          classify: {
            provider: (integAny.llm_provider_classify as LLMProvider) || 'lovable',
            apiKey: '',
            model: integAny.llm_model_classify || '',
            isConfigured: !!integAny.llm_api_key_classify || !!integAny.llm_provider_classify,
          },
          reasoning: {
            provider: (integAny.llm_provider_reasoning as LLMProvider) || 'lovable',
            apiKey: '',
            model: integAny.llm_model_reasoning || '',
            isConfigured: !!integAny.llm_api_key_reasoning || !!integAny.llm_provider_reasoning,
          },
          deep: {
            provider: (integAny.llm_provider_deep as LLMProvider) || 'lovable',
            apiKey: '',
            model: integAny.llm_model_deep || '',
            isConfigured: !!integAny.llm_api_key_deep || !!integAny.llm_provider_deep,
          },
        });

        // Derive provider-first cards from tier columns
        const byProvider = new Map<LLMProvider, ProviderCard>();
        const tierData: { tier: TierKey; provider: any; model: any; hasKey: boolean }[] = [
          { tier: 'fast',      provider: integAny.llm_provider_fast,      model: integAny.llm_model_fast,      hasKey: !!integAny.llm_api_key_fast },
          { tier: 'classify',  provider: integAny.llm_provider_classify,  model: integAny.llm_model_classify,  hasKey: !!integAny.llm_api_key_classify },
          { tier: 'reasoning', provider: integAny.llm_provider_reasoning, model: integAny.llm_model_reasoning, hasKey: !!integAny.llm_api_key_reasoning },
          { tier: 'deep',      provider: integAny.llm_provider_deep,      model: integAny.llm_model_deep,      hasKey: !!integAny.llm_api_key_deep },
        ];
        for (const t of tierData) {
          if (!t.provider) continue;
          const key = t.provider as LLMProvider;
          if (!byProvider.has(key)) {
            byProvider.set(key, {
              id: crypto.randomUUID(),
              provider: key,
              model: t.model || DEFAULT_MODELS[key]?.default || '',
              apiKey: '',
              isConfigured: t.hasKey,
              tiers: emptyTierFlags(),
              status: 'untested',
              statusMessage: '',
              testedAt: null,
            });
          }
          const card = byProvider.get(key)!;
          card.tiers[t.tier] = true;
          if (!card.model && t.model) card.model = t.model;
          if (t.hasKey) card.isConfigured = true;
        }
        setProviderCards(Array.from(byProvider.values()));

        setCustomPrompt(integAny.ai_custom_prompt || "");

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

  const handleTierProviderChange = (tier: TierKey, value: string) => {
    const provider = value as LLMProvider | 'lovable';
    const defaultModel = DEFAULT_MODELS[provider]?.default || '';
    setTiers(prev => ({
      ...prev,
      [tier]: {
        ...prev[tier],
        provider,
        model: defaultModel,
        apiKey: provider === 'lovable' ? '' : prev[tier].apiKey,
      },
    }));
  };

  // -------- Provider-first card helpers (hybrid UX) --------
  const updateCard = (id: string, patch: Partial<ProviderCard>) => {
    setProviderCards(prev => prev.map(c => (c.id === id ? { ...c, ...patch } : c)));
  };

  const changeCardProvider = (id: string, provider: LLMProvider) => {
    setProviderCards(prev => {
      // If another card already uses this provider, merge tiers & remove the duplicate
      const existing = prev.find(c => c.id !== id && c.provider === provider);
      const next = prev.map(c => {
        if (c.id !== id) return c;
        return {
          ...c,
          provider,
          model: DEFAULT_MODELS[provider]?.default || '',
          apiKey: '',
          isConfigured: existing?.isConfigured ?? false,
          tiers: existing ? { ...c.tiers, ...mergeTierFlags(c.tiers, existing.tiers) } : c.tiers,
        };
      });
      return existing ? next.filter(c => c.id !== existing.id) : next;
    });
  };

  const toggleCardTier = (id: string, tier: TierKey, on: boolean) => {
    setProviderCards(prev => prev.map(c => {
      if (c.id === id) return { ...c, tiers: { ...c.tiers, [tier]: on } };
      // Tier is exclusive across providers — turn it off on every other card
      if (on && c.tiers[tier]) return { ...c, tiers: { ...c.tiers, [tier]: false } };
      return c;
    }));
  };

  const addCard = () => {
    const used = new Set(providerCards.map(c => c.provider));
    const next = SELECTABLE_PROVIDERS.find(p => !used.has(p.value));
    if (!next) {
      toast.info('Todos os providers já foram adicionados.');
      return;
    }
    setProviderCards(prev => [...prev, {
      id: crypto.randomUUID(),
      provider: next.value,
      model: DEFAULT_MODELS[next.value]?.default || '',
      apiKey: '',
      isConfigured: false,
      tiers: emptyTierFlags(),
      status: 'untested',
      statusMessage: '',
      testedAt: null,
    }]);
  };

  const removeCard = (id: string) => {
    setProviderCards(prev => prev.filter(c => c.id !== id));
  };


  const updateTier = (tier: TierKey, patch: Partial<TierConfig>) => {
    setTiers(prev => ({ ...prev, [tier]: { ...prev[tier], ...patch } }));
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
    if (!clientId) {
      toast.error("Cliente não identificado — não é possível testar a conexão");
      return;
    }
    setTestingLLM(true);
    try {
      const { data, error } = await supabase.functions.invoke('test-llm-connection', {
        body: { clientId, provider: llmData.provider, apiKey: llmData.apiKey, model: llmData.model }
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

      // Hybrid mode: derive tier columns from provider-first cards
      updateData.llm_mode = mode;
      if (mode === 'hybrid') {
        // Build tier -> card mapping. Tiers not assigned to any card → cleared (Lovable fallback).
        const tierAssignment: Record<TierKey, ProviderCard | null> = {
          fast: null, classify: null, reasoning: null, deep: null,
        };
        for (const card of providerCards) {
          for (const t of TIERS) {
            if (card.tiers[t.key]) {
              // Last-writer-wins; UI prevents duplicates via toggleCardTier
              tierAssignment[t.key] = card;
            }
          }
        }
        for (const t of TIERS) {
          const card = tierAssignment[t.key];
          if (!card) {
            updateData[`llm_provider_${t.key}`] = null;
            updateData[`llm_api_key_${t.key}`] = null;
            updateData[`llm_model_${t.key}`] = null;
          } else {
            updateData[`llm_provider_${t.key}`] = card.provider;
            updateData[`llm_model_${t.key}`] = card.model || null;
            if (card.apiKey && card.apiKey.trim() !== "") {
              updateData[`llm_api_key_${t.key}`] = card.apiKey;
            }
          }
        }
      }

      updateData.ai_custom_prompt = customPrompt || null;

      const { error } = await supabase.from("integrations").upsert(updateData, { onConflict: 'client_id' });
      if (error) throw error;

      toast.success("Integrações salvas com sucesso!");
      setMetaData(prev => ({ ...prev, accessToken: "" }));
      setLlmData(prev => ({ ...prev, apiKey: "", isConfigured: prev.provider !== 'lovable' }));
      setTiers(prev => {
        const next = { ...prev };
        for (const t of TIERS) {
          next[t.key] = {
            ...prev[t.key],
            apiKey: "",
            isConfigured: prev[t.key].provider !== 'lovable',
          };
        }
        return next;
      });
      setProviderCards(prev => prev.map(c => ({
        ...c,
        apiKey: "",
        isConfigured: c.isConfigured || !!c.apiKey,
      })));

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
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2">
                Provedor de IA
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  {mode === 'hybrid' ? 'Híbrido' : 'Multi-LLM'}
                </span>
              </CardTitle>
              <CardDescription>
                {mode === 'hybrid'
                  ? 'Configure um provedor por tier (FAST / CLASSIFY / REASONING / DEEP)'
                  : 'Escolha o provedor de IA para análise e respostas'}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Mode toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Modo Híbrido</Label>
              <p className="text-xs text-muted-foreground">
                Quando ativo, cada tier (FAST / CLASSIFY / REASONING / DEEP) pode usar um provedor diferente.
                A arquitetura já está implementada no backend — este toggle apenas expõe a configuração.
              </p>
            </div>
            <Switch
              checked={mode === 'hybrid'}
              onCheckedChange={(checked) => setMode(checked ? 'hybrid' : 'simple')}
            />
          </div>

          {mode === 'simple' ? (
            <>
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
            </>
          ) : (
            <div className="space-y-4">
              <div className="text-xs text-muted-foreground p-3 rounded-md bg-primary/5 border border-primary/10">
                Configure cada provider <strong>uma única vez</strong> e marque quais tiers ele atende.
                Tiers sem provider explícito caem automaticamente no <strong>Lovable AI</strong> (fallback).
              </div>

              {providerCards.length === 0 && (
                <div className="text-center py-8 text-sm text-muted-foreground border border-dashed rounded-lg">
                  Nenhum provider configurado — todos os tiers usarão Lovable AI por padrão.
                </div>
              )}

              {providerCards.map((card) => {
                const models = DEFAULT_MODELS[card.provider]?.models || [];
                const otherUsed = new Set(
                  providerCards.filter(c => c.id !== card.id).map(c => c.provider)
                );
                return (
                  <div key={card.id} className="rounded-lg border p-4 space-y-4 bg-card">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 space-y-3">
                        <div className="grid md:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Provider</Label>
                            <Select value={card.provider} onValueChange={(v) => changeCardProvider(card.id, v as LLMProvider)}>
                              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {SELECTABLE_PROVIDERS.map((p) => (
                                  <SelectItem key={p.value} value={p.value} disabled={otherUsed.has(p.value)}>
                                    {p.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Modelo</Label>
                            <Select value={card.model} onValueChange={(v) => updateCard(card.id, { model: v })}>
                              <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                              <SelectContent>
                                {models.map((m) => (
                                  <SelectItem key={m} value={m}>{m}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">API Key</Label>
                          <Input
                            type="password"
                            className="h-9"
                            placeholder={card.isConfigured ? "••••••••• (configurada — deixe em branco para manter)" : "API key"}
                            value={card.apiKey}
                            onChange={(e) => updateCard(card.id, { apiKey: e.target.value })}
                          />
                        </div>
                      </div>
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => removeCard(card.id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        Remover
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Tiers atendidos por este provider</Label>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {TIERS.map((tierDef) => {
                          const Icon = tierDef.icon;
                          const checked = card.tiers[tierDef.key];
                          return (
                            <label
                              key={tierDef.key}
                              className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-colors ${
                                checked ? 'bg-primary/10 border-primary/30' : 'bg-muted/30 border-border hover:bg-muted/60'
                              }`}
                            >
                              <Switch
                                checked={checked}
                                onCheckedChange={(v) => toggleCardTier(card.id, tierDef.key, v)}
                              />
                              <Icon className="w-3.5 h-3.5 text-primary" />
                              <span className="text-xs font-medium">{tierDef.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}

              <Button
                variant="outline"
                onClick={addCard}
                disabled={providerCards.length >= SELECTABLE_PROVIDERS.length}
                className="w-full"
              >
                + Adicionar Provider
              </Button>

              {/* Advanced (per-tier) debug view */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(v => !v)}
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                >
                  {showAdvanced ? '▾ Ocultar' : '▸ Ver'} mapeamento por tier (debug)
                </button>
                {showAdvanced && (
                  <div className="mt-2 rounded-md border bg-muted/20 p-3 text-xs space-y-1 font-mono">
                    {TIERS.map(t => {
                      const card = providerCards.find(c => c.tiers[t.key]);
                      return (
                        <div key={t.key} className="flex items-center justify-between">
                          <span className="text-muted-foreground">{t.label}</span>
                          <span>
                            {card ? `${card.provider} · ${card.model || '—'}` : 'Lovable AI (fallback)'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
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
