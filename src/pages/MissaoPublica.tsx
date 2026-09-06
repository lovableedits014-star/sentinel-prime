import { FacebookIcon, InstagramIcon } from "@/components/icons/SocialIcons";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useLocation } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ExternalLink, CheckCircle2, Loader2, UserCog, BadgeCheck, ShieldCheck, AlertTriangle, Lock, RefreshCw, Copy, CircleHelp } from "lucide-react";
import { toWhatsAppBR, fmtPhoneBR } from "@/lib/phone-utils";
import CampaignFrameGenerator from "@/components/campaign-frame/CampaignFrameGenerator";
import { normalizeExternalUrl } from "@/lib/external-social-link";

type Participant = {
  id: string;
  nome: string;
  cargo?: string | null;
  regiao?: string | null;
  reconhecido?: boolean;
  obrigado?: boolean;
  telefone_mascarado?: string | null;
  concluido_em?: string | null;
};

type MissionConfig = {
  mission: {
    id: string;
    title: string | null;
    tracking_enabled: boolean;
    link_facebook: string | null;
    link_instagram: string | null;
    link_avulso: string | null;
    instructions: string | null;
    legacy_post_url: string | null;
    legacy_platform: string | null;
  };
  links?: MissionLink[] | null;
  client_name: string | null;
  distribution_valid: boolean;
  group_name: string | null;
  participant: Participant | null;
};

type MissionLink = {
  id: string;
  label: string;
  url: string;
  kind: string | null;
};

const TOKEN_KEY_PREFIX = "sm_client_token_";
const LEGACY_MISSION_TOKEN_PREFIX = "sm_missao_token_";

const CARGO_LABEL: Record<string, string> = {
  coordenador: "Coordenador",
  lider: "Líder",
  cabo: "Cabo",
  voluntario: "Voluntário",
  funcionario: "Funcionário",
  contratado: "Contratado",
  contato: "Cadastro",
};

function clientTokenKey(clientId: string) {
  return `${TOKEN_KEY_PREFIX}${clientId}`;
}

// Usa a origem atual (localhost em dev, domínio publicado em produção).
function api(path: string) {
  return path;
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(value); return; } catch { /* fallback para WebViews antigos */ }
  }
  const input = document.createElement("textarea");
  input.value = value; input.style.position = "fixed"; input.style.opacity = "0";
  document.body.appendChild(input); input.focus(); input.select();
  const copied = document.execCommand("copy"); input.remove();
  if (!copied) throw new Error("copy unavailable");
}

class MissionConfigError extends Error {
  constructor(message: string, readonly unavailable = false) {
    super(message);
  }
}

async function loadMissionConfig(url: string): Promise<MissionConfig & { client_id?: string }> {
  let lastError: unknown;

  // Ao sair do WhatsApp para o navegador, redes móveis às vezes falham na
  // primeira conexão. Repetimos apenas falhas temporárias; 404 é definitivo.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload?.mission?.id) return payload;
      if (response.status === 404) throw new MissionConfigError("Missão não encontrada", true);
      lastError = new Error(payload?.error || `HTTP ${response.status}`);
      if (response.status < 500 && response.status !== 408 && response.status !== 429) break;
    } catch (requestError) {
      if (requestError instanceof MissionConfigError) throw requestError;
      lastError = requestError;
    }

    if (attempt < 2) {
      await new Promise((resolve) => window.setTimeout(resolve, 400 * (attempt + 1)));
    }
  }

  throw new MissionConfigError(
    lastError instanceof Error ? lastError.message : "Falha temporária ao carregar a missão",
  );
}

export default function MissaoPublica() {
  const { missionId } = useParams<{ missionId: string }>();
  const location = useLocation();
  const code = new URLSearchParams(location.search).get("d") || "";

  const [config, setConfig] = useState<MissionConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [reloadAttempt, setReloadAttempt] = useState(0);

  const [clientId, setClientId] = useState<string>("");
  const [token, setToken] = useState<string>("");

  const [nome, setNome] = useState("");
  const [phone, setPhone] = useState("");
  const [identifying, setIdentifying] = useState(false);
  const [declaring, setDeclaring] = useState(false);
  const [declared, setDeclared] = useState(false);
  const [justRecognized, setJustRecognized] = useState(false);
  const [clickedLinks, setClickedLinks] = useState<Set<string>>(new Set());
  const [backReminder, setBackReminder] = useState(false);
  const [autoConfirmRetry, setAutoConfirmRetry] = useState(0);
  const autoConfirmAttemptRef = useRef("");
  const codeInvalid = code === "invalid";

  const clickedKey = missionId ? `sm_missao_clicks_${missionId}` : "";
  const doneKey = missionId ? `sm_missao_done_${missionId}` : "";
  const [showLinkHelp, setShowLinkHelp] = useState(false);

  // Restaura, no aparelho, o que a pessoa já clicou/confirmou nesta missão.
  useEffect(() => {
    if (!missionId) return;
    try {
      const raw = localStorage.getItem(`sm_missao_clicks_${missionId}`);
      if (raw) setClickedLinks(new Set(JSON.parse(raw) as string[]));
      // A conclusao exibida vem sempre do servidor. O armazenamento local
      // guarda apenas progresso de cliques e nunca e fonte de verdade.
    } catch {
      // ignora storage indisponível
    }
  }, [missionId]);

  // Quando a pessoa volta do Facebook/Instagram, lembramos de confirmar.
  useEffect(() => {
    if (declared || clickedLinks.size === 0) return;
    const onBack = () => {
      if (document.visibilityState === "visible") {
        setBackReminder(true);
        setAutoConfirmRetry((value) => value + 1);
      }
    };
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("focus", onBack);
    return () => {
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("focus", onBack);
    };
  }, [declared, clickedLinks.size]);


  useEffect(() => {
    document.title = "Missão da Campanha";
  }, []);

  // Bootstrap: primeiro carrega a config para descobrir o clientId,
  // depois lê o token unificado do candidato e revalida.
  useEffect(() => {
    if (!missionId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setUnavailable(false);

    (async () => {
      try {
        // 1) descobre o cliente da missão (sem token)
        const bootData = await loadMissionConfig(
          api(`/api/public/missao/config/${encodeURIComponent(missionId)}?code=${encodeURIComponent(code)}`)
        );
        if (cancelled) return;

        const cid = bootData.client_id || "";
        setClientId(cid);

        // 2) procura o token do candidato (por cliente) — com fallback para chave antiga por missão
        let existing = cid ? localStorage.getItem(clientTokenKey(cid)) || "" : "";
        if (!existing) {
          const legacy = localStorage.getItem(`${LEGACY_MISSION_TOKEN_PREFIX}${missionId}`);
          if (legacy) {
            existing = legacy;
            if (cid) localStorage.setItem(clientTokenKey(cid), legacy);
            localStorage.removeItem(`${LEGACY_MISSION_TOKEN_PREFIX}${missionId}`);
          }
        }
        setToken(existing);

        // 3) se tem token, revalida chamando config novamente com token
        if (existing) {
          const finalData = await loadMissionConfig(
            api(`/api/public/missao/config/${encodeURIComponent(missionId)}?code=${encodeURIComponent(code)}&token=${encodeURIComponent(existing)}`)
          );
          if (cancelled) return;
          setConfig(finalData);
          setDeclared(Boolean(finalData.participant?.concluido_em));
          // token não reconhecido pelo servidor → limpa
          if (existing && !finalData.participant && cid) {
            localStorage.removeItem(clientTokenKey(cid));
            setToken("");
          }
        } else {
          setConfig(bootData);
        }
      } catch (e: any) {
        if (!cancelled) {
          setUnavailable(Boolean(e?.unavailable));
          setError(e.message || "Erro ao carregar missão");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [missionId, code, reloadAttempt]);

  const registerEvent = useCallback(
    async (
      type:
        | "open"
        | "click_facebook"
        | "click_instagram"
        | "click_avulso"
        | "click_link"
        | "declared_done",
      linkId?: string,
    ) => {
      if (!missionId) return;
      try {
        const response = await fetch(api("/api/public/missao/event"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Mantém o envio ativo quando o Safari entrega a navegação ao app social.
          keepalive: true,
          body: JSON.stringify({ missionId, code, token, type, linkId: linkId || null }),
        });
        return response.ok;
      } catch {
        // silencioso — não bloqueia o clique
        return false;
      }
    },
    [missionId, code, token],
  );

  // Registra 'open' quando participante identificado e config carregada.
  useEffect(() => {
    if (config?.participant && token) {
      registerEvent("open");
    }
  }, [config?.participant, token, registerEvent]);

  const handleIdentify = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNome = nome.trim();
    const cleanPhone = toWhatsAppBR(phone);
    if (!cleanNome) return toast.error("Informe seu nome");
    if (!cleanPhone) return toast.error("Telefone inválido — use DDD + número");
    setIdentifying(true);
    try {
      const res = await fetch(api("/api/public/missao/identify"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ missionId, code, nome: cleanNome, phone: cleanPhone }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Falha no cadastro");
      }
      const data = await res.json();
      if (clientId) localStorage.setItem(clientTokenKey(clientId), data.token);
      setToken(data.token);
      setConfig((prev) => (prev ? { ...prev, participant: data.participant } : prev));
      setJustRecognized(true);
      toast.success(
        data.participant?.reconhecido
          ? `Reconhecemos você, ${String(data.participant.nome).split(" ")[0]}!`
          : "Prontinho, obrigado por participar!",
      );
    } catch (err: any) {
      toast.error(err.message || "Erro ao cadastrar");
    } finally {
      setIdentifying(false);
    }
  };

  const handleSwitch = async () => {
    try {
      await fetch(api("/api/public/missao/switch"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
    } catch {
      // silencioso
    }
    if (clientId) localStorage.removeItem(clientTokenKey(clientId));
    try {
      if (clickedKey) localStorage.removeItem(clickedKey);
      if (doneKey) localStorage.removeItem(doneKey);
    } catch {
      // ignora
    }
    setToken("");
    setConfig((prev) => (prev ? { ...prev, participant: null } : prev));
    setNome("");
    setPhone("");
    setDeclared(false);
    setJustRecognized(false);
    setClickedLinks(new Set());
    setBackReminder(false);
  };

  const markLinkClicked = (key: string) => {
    setClickedLinks((prev) => {
      const next = new Set(prev);
      next.add(key);
      try { if (clickedKey) localStorage.setItem(clickedKey, JSON.stringify([...next])); } catch { /* ignora */ }
      return next;
    });
  };

  const handleExternal = (
    url: string,
    type: "click_facebook" | "click_instagram" | "click_avulso" | "click_link",
    linkId?: string,
  ) => {
    try {
      normalizeExternalUrl(url);
    } catch {
      toast.error("Este link está inválido. Avise o responsável pela missão.");
      return;
    }

    const key = linkId || type;
    markLinkClicked(key);
    // O servidor grava o clique (e, no ultimo link, a conclusao) antes de
    // redirecionar. O registro nao depende de a pessoa voltar do app social.
    const linkKey = linkId || (
      type === "click_facebook" ? "facebook" :
      type === "click_instagram" ? "instagram" : "avulso"
    );
    const trackedUrl = `/api/public/missao/go/${encodeURIComponent(missionId || "")}/${encodeURIComponent(linkKey)}` +
      `?token=${encodeURIComponent(token)}&code=${encodeURIComponent(code)}`;
    window.location.assign(trackedUrl);
  };

  const copyExternal = async (
    url: string,
    type: "click_facebook" | "click_instagram" | "click_avulso" | "click_link",
    linkId?: string,
  ) => {
    try {
      const destination = normalizeExternalUrl(url).toString();
      await copyText(destination);
      markLinkClicked(linkId || type);
      await registerEvent(type, linkId);
      toast.success("Link copiado! Cole no Chrome ou no aplicativo da rede social.");
    } catch {
      toast.error("Não foi possível copiar. Toque e segure o botão principal para abrir em outra opção.");
    }
  };

  const handleDeclare = async () => {
    const clicksToSync: Array<{
      type: "click_facebook" | "click_instagram" | "click_avulso" | "click_link";
      linkId?: string;
    }> = [];
    if (config) {
      const mission = config.mission;
      const required = [
        ...(mission.link_facebook || (mission.legacy_platform === "facebook" && mission.legacy_post_url) ? ["click_facebook"] : []),
        ...(mission.link_instagram || (mission.legacy_platform === "instagram" && mission.legacy_post_url) ? ["click_instagram"] : []),
        ...(mission.link_avulso ? ["click_avulso"] : []),
        ...(config.links || []).map((link) => link.id),
      ];
      const pending = required.filter((key) => !clickedLinks.has(key)).length;
      if (pending > 0) {
        toast.error(`Abra ${pending === 1 ? "o link pendente" : `os ${pending} links pendentes`} antes de confirmar.`);
        return;
      }

      // O navegador pode suspender/cancelar a requisição quando abre o app do
      // Facebook/Instagram. A interface já guardou o clique localmente, então
      // sincronizamos novamente antes da validação definitiva no servidor.
      if (clickedLinks.has("click_facebook")) clicksToSync.push({ type: "click_facebook" });
      if (clickedLinks.has("click_instagram")) clicksToSync.push({ type: "click_instagram" });
      if (clickedLinks.has("click_avulso")) clicksToSync.push({ type: "click_avulso" });
      for (const link of config.links || []) {
        if (clickedLinks.has(link.id)) clicksToSync.push({ type: "click_link", linkId: link.id });
      }
    }
    setDeclaring(true);
    const synced = await Promise.all(clicksToSync.map(({ type, linkId }) => registerEvent(type, linkId)));
    if (synced.some((ok) => !ok)) {
      setDeclaring(false);
      toast.error("Não foi possível registrar os acessos. Verifique sua conexão e tente novamente.");
      return;
    }
    const registered = await registerEvent("declared_done");
    if (!registered) {
      setDeclaring(false);
      toast.error("Não foi possível confirmar. Verifique se todos os links foram acessados e tente novamente.");
      return;
    }
    setDeclared(true);
    setBackReminder(false);
    try {
      if (doneKey) localStorage.setItem(doneKey, "1");
    } catch {
      // ignora
    }
    setDeclaring(false);
    toast.success("Participação confirmada — obrigado!");
  };

  // Assim que o último link for acessado, registra a conclusão sem exigir
  // uma segunda ação da pessoa. Ao voltar de um app externo, tentamos de novo
  // caso o navegador tenha suspendido as requisições em segundo plano.
  useEffect(() => {
    if (!config?.participant || declared || declaring) return;
    const mission = config.mission;
    const required = [
      ...(mission.link_facebook || (mission.legacy_platform === "facebook" && mission.legacy_post_url) ? ["click_facebook"] : []),
      ...(mission.link_instagram || (mission.legacy_platform === "instagram" && mission.legacy_post_url) ? ["click_instagram"] : []),
      ...(mission.link_avulso ? ["click_avulso"] : []),
      ...(config.links || []).map((link) => link.id),
    ];
    if (required.length === 0 || required.some((key) => !clickedLinks.has(key))) return;

    const attemptKey = `${token}:${[...required].sort().join(",")}:${autoConfirmRetry}`;
    if (autoConfirmAttemptRef.current === attemptKey) return;
    autoConfirmAttemptRef.current = attemptKey;
    void handleDeclare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, clickedLinks, declared, declaring, token, autoConfirmRetry]);


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>{codeInvalid ? "Link expirado ou digitado errado" : unavailable ? "Missão indisponível" : "Não foi possível carregar"}</CardTitle>
            <CardDescription>
              {codeInvalid
                ? "Peça um link novo para quem enviou a mensagem — o código anexado à URL não confere mais."
                : unavailable
                  ? "Este link não corresponde a uma missão disponível."
                  : "Sua conexão pode ter oscilado. Tente carregar novamente."}
            </CardDescription>
          </CardHeader>
          {!codeInvalid && !unavailable && (
            <CardContent>
              <Button className="w-full" onClick={() => setReloadAttempt((value) => value + 1)}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Tentar novamente
              </Button>
            </CardContent>
          )}
        </Card>

      </div>
    );
  }

  const m = config.mission;
  const p = config.participant;
  // Fallback para missões legadas (sem os campos novos preenchidos):
  const linkFb = m.link_facebook || (m.legacy_platform === "facebook" ? m.legacy_post_url : null);
  const linkIg = m.link_instagram || (m.legacy_platform === "instagram" ? m.legacy_post_url : null);
  const linkAv = m.link_avulso || null;
  const extraLinks = config.links || [];
  const cargoLabel = p?.cargo ? CARGO_LABEL[p.cargo] || p.cargo : null;
  const requiredLinkKeys = [
    ...(linkFb ? ["click_facebook"] : []),
    ...(linkIg ? ["click_instagram"] : []),
    ...(linkAv ? ["click_avulso"] : []),
    ...extraLinks.map((l) => l.id),
  ];
  const clickedRequiredCount = requiredLinkKeys.filter((key) => clickedLinks.has(key)).length;
  const remainingLinks = requiredLinkKeys.length - clickedRequiredCount;
  const allLinksClicked = remainingLinks === 0;
  const showStickyBar = false;
  const isClicked = (key: string) => clickedLinks.has(key);

  const linkBtnClass = (key: string) =>
    `w-full min-h-16 h-auto justify-start gap-3 border-2 px-4 py-3 text-left shadow-sm transition-all ${
      isClicked(key)
        ? "border-emerald-500 bg-emerald-500/10"
        : "border-primary/50 bg-primary/5 hover:border-primary hover:bg-primary/10"
    }`;

  const ClickedMark = ({ k }: { k: string }) =>
    isClicked(k) ? (
      <CheckCircle2 className="w-4 h-4 ml-auto shrink-0 text-emerald-600" />
    ) : (
      <ExternalLink className="w-3 h-3 ml-auto opacity-60 shrink-0" />
    );

  return (
    <div
      className={`min-h-screen bg-gradient-to-b from-background to-muted/30 py-8 px-4 ${showStickyBar ? "pb-36" : ""}`}
    >
      <div className="max-w-md mx-auto space-y-4">
        {config.client_name && (
          <p className="text-center text-xs text-muted-foreground uppercase tracking-wide">
            {config.client_name}
          </p>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{m.title || "Missão"}</CardTitle>
            {config.group_name && (
              <CardDescription>Vindo do grupo: <strong>{config.group_name}</strong></CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {!p ? (
              <form onSubmit={handleIdentify} className="space-y-3" autoComplete="off">
                <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground flex gap-2">
                  <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Só desta primeira vez: informe seu nome e <strong>seu</strong> WhatsApp. Nas próximas
                    missões você entra direto, sem preencher nada.
                  </span>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="missao-nome">Nome completo</Label>
                  <Input
                    id="missao-nome"
                    name="missao-nome-participante"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    maxLength={100}
                    autoComplete="off"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="missao-whats">Seu WhatsApp</Label>
                  <Input
                    id="missao-whats"
                    name="missao-whats-participante"
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(67) 99123-4567"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    required
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {phone.trim() === ""
                      ? "Confira se o número é o seu — o campo começa sempre vazio."
                      : toWhatsAppBR(phone)
                        ? `Vamos usar ${fmtPhoneBR(toWhatsAppBR(phone))}`
                        : "Digite DDD + número"}
                  </p>
                </div>
                <Button type="submit" className="w-full" disabled={identifying}>
                  {identifying && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Continuar
                </Button>
              </form>
            ) : (
              <>
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    {p.reconhecido ? (
                      <BadgeCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <UserCog className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm">
                        Olá, <strong>{p.nome}</strong>.
                      </p>
                      {p.telefone_mascarado && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          WhatsApp deste cadastro: <strong>{p.telefone_mascarado}</strong>
                        </p>
                      )}
                      {p.reconhecido ? (
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          {cargoLabel && <Badge variant="secondary" className="text-[10px]">{cargoLabel}</Badge>}
                          {p.regiao && <Badge variant="outline" className="text-[10px]">{p.regiao}</Badge>}
                          <span className="text-[11px] text-muted-foreground">
                            {justRecognized ? "Reconhecemos seu cadastro." : "Cadastro reconhecido."}
                          </span>
                        </div>
                      ) : (
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Não achamos seu telefone na nossa base, mas sua participação será registrada.
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSwitch}
                    className="w-full gap-1.5 text-xs"
                  >
                    <UserCog className="w-3.5 h-3.5" />
                    Não sou eu — quero me identificar
                  </Button>
                </div>

                {m.instructions && (
                  <div className="text-sm whitespace-pre-wrap">{m.instructions}</div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                      1
                    </span>
                    <p className="text-sm font-medium">Abra todos os links e realize as ações</p>
                  </div>
                  {requiredLinkKeys.length > 0 && (
                    <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-3">
                      <div className="flex items-center justify-between gap-2 text-sm font-semibold">
                        <span>Progresso da missão</span>
                        <span>{clickedRequiredCount} de {requiredLinkKeys.length} links</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all"
                          style={{ width: `${(clickedRequiredCount / requiredLinkKeys.length) * 100}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {allLinksClicked
                          ? "Todos os links foram acessados. Agora confirme a missão."
                          : `Acesse ${remainingLinks === 1 ? "o link restante" : `os ${remainingLinks} links restantes`} para liberar a confirmação.`}
                      </p>
                    </div>
                  )}
                  {linkFb && (
                    <Button
                      variant="outline"
                      className={linkBtnClass("click_facebook")}
                      onClick={() => handleExternal(linkFb, "click_facebook")}
                    >
                      <FacebookIcon className="w-7 h-7 shrink-0 text-blue-600" />
                      <span className="flex-1">
                        <span className="block font-bold">FACEBOOK</span>
                        <span className="block text-xs font-normal text-muted-foreground">Abrir publicação e interagir</span>
                      </span>
                      <ClickedMark k="click_facebook" />
                    </Button>
                  )}
                  {linkIg && (
                    <Button
                      variant="outline"
                      className={linkBtnClass("click_instagram")}
                      onClick={() => handleExternal(linkIg, "click_instagram")}
                    >
                      <InstagramIcon className="w-7 h-7 shrink-0 text-pink-500" />
                      <span className="flex-1">
                        <span className="block font-bold">INSTAGRAM</span>
                        <span className="block text-xs font-normal text-muted-foreground">Abrir publicação e interagir</span>
                      </span>
                      <ClickedMark k="click_instagram" />
                    </Button>
                  )}
                  {linkAv && (
                    <Button
                      variant="outline"
                      className={linkBtnClass("click_avulso")}
                      onClick={() => handleExternal(linkAv, "click_avulso")}
                    >
                      <ExternalLink className="w-6 h-6 shrink-0 text-primary" />
                      <span className="flex-1">
                        <span className="block font-bold">ABRIR LINK</span>
                        <span className="block text-xs font-normal text-muted-foreground">Acessar esta etapa da missão</span>
                      </span>
                      <ClickedMark k="click_avulso" />
                    </Button>
                  )}
                  {extraLinks.map((l) => (
                    <Button
                      key={l.id}
                      variant="outline"
                      className={linkBtnClass(l.id)}
                      onClick={() => handleExternal(l.url, "click_link", l.id)}
                    >
                      {l.kind === "facebook" ? (
                        <FacebookIcon className="w-7 h-7 shrink-0 text-blue-600" />
                      ) : l.kind === "instagram" ? (
                        <InstagramIcon className="w-7 h-7 shrink-0 text-pink-500" />
                      ) : (
                        <ExternalLink className="w-6 h-6 shrink-0 text-primary" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold">{l.label}</span>
                        <span className="block text-xs font-normal text-muted-foreground">Acessar esta etapa da missão</span>
                      </span>
                      <ClickedMark k={l.id} />
                    </Button>
                  ))}
                  {requiredLinkKeys.length > 0 && (
                    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                      <button type="button" className="flex w-full items-center gap-2 text-left text-xs font-semibold text-amber-800 dark:text-amber-300" onClick={() => setShowLinkHelp(v => !v)}>
                        <CircleHelp className="h-4 w-4 shrink-0" />
                        A publicação apareceu como “Indisponível”?
                      </button>
                      {showLinkHelp && (
                        <div className="mt-3 space-y-2 border-t border-amber-500/20 pt-3">
                          <p className="text-xs text-muted-foreground">
                            Isso pode acontecer no navegador interno do WhatsApp. Copie o link e cole no Chrome ou abra diretamente no aplicativo do Facebook/Instagram, já conectado à sua conta.
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {linkFb && <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => copyExternal(linkFb, "click_facebook")}><Copy className="h-3.5 w-3.5" />Copiar Facebook</Button>}
                            {linkIg && <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => copyExternal(linkIg, "click_instagram")}><Copy className="h-3.5 w-3.5" />Copiar Instagram</Button>}
                            {linkAv && <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => copyExternal(linkAv, "click_avulso")}><Copy className="h-3.5 w-3.5" />Copiar link</Button>}
                            {extraLinks.map(l => <Button key={`copy-${l.id}`} type="button" size="sm" variant="outline" className="h-8 max-w-full gap-1.5 text-xs" onClick={() => copyExternal(l.url, "click_link", l.id)}><Copy className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Copiar {l.label}</span></Button>)}
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            Se continuar indisponível também no aplicativo, a publicação pode exigir login, ter restrição de público ou ter sido removida. Avise o responsável pela missão.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {!declared && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                        2
                      </span>
                      <p className="text-sm font-medium">Conclusão automática</p>
                    </div>

                    {backReminder && allLinksClicked && (
                      <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-xs flex gap-2 animate-pulse">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>
                          <strong>Registrando sua participação.</strong> Aguarde um instante nesta tela.
                        </span>
                      </div>
                    )}
                    {backReminder && !allLinksClicked && (
                      <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-xs flex gap-2">
                        <AlertTriangle className="w-4 h-4 text-primary shrink-0" />
                        <span>
                          Link registrado! Agora acesse {remainingLinks === 1 ? "o último link" : `os ${remainingLinks} links restantes`}.
                        </span>
                      </div>
                    )}

                    <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3 text-xs text-muted-foreground">
                      Depois que todos os links forem acessados, sua participação será
                      <strong> confirmada automaticamente</strong>.
                    </div>

                    <div className={`flex min-h-14 w-full items-center justify-center gap-2 rounded-md px-4 text-sm font-medium ${
                      allLinksClicked ? "bg-emerald-600 text-white" : "border bg-muted/30 text-muted-foreground"
                    }`}>
                      {allLinksClicked ? <Loader2 className="w-5 h-5 animate-spin" /> : <Lock className="w-5 h-5" />}
                      {allLinksClicked
                        ? "Confirmando automaticamente..."
                        : `Acesse ${remainingLinks} ${remainingLinks === 1 ? "link" : "links"}`}
                    </div>
                  </div>
                )}

                {declared && (
                  <div className="rounded-xl border-2 border-emerald-500/50 bg-emerald-500/10 p-4 text-center space-y-1">
                    <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                    <p className="text-base font-semibold text-emerald-700 dark:text-emerald-300">
                      Participação confirmada!
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Registrada no nome de <strong>{p.nome}</strong>. Pode fechar esta página — na
                      próxima missão você entra direto.
                    </p>
                  </div>
                )}

                <p className="text-[11px] text-muted-foreground text-center">
                  Este é um registro declarado por você. Não verificamos automaticamente curtidas, comentários ou compartilhamentos.
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {p && clientId && (
          <section aria-label="Criador de foto de perfil" className="space-y-2">
            <div className="px-1 text-center">
              <h2 className="text-lg font-semibold">Crie sua foto de perfil da campanha</h2>
              <p className="text-xs text-muted-foreground">
                Use o template oficial e deixe sua foto pronta para o WhatsApp e as redes sociais.
              </p>
            </div>
            <CampaignFrameGenerator
              clientId={clientId}
              variant="showcase"
              individualOnly
              hideWithoutActiveFrame
            />
          </section>
        )}
      </div>

      {showStickyBar && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur p-3 shadow-lg">
          <div className="max-w-md mx-auto space-y-1.5">
            <p className="text-center text-[11px] text-muted-foreground">
              Falta o último passo para sua participação contar
            </p>
            <Button
              className="w-full gap-2 h-14 text-base bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleDeclare}
              disabled={declaring}
            >
              {declaring ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-5 h-5" />
              )}
              Confirmar que cumpri a missão
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

