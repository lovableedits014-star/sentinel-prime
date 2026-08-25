import { FacebookIcon, InstagramIcon } from "@/components/icons/SocialIcons";
import { useEffect, useState, useCallback } from "react";
import { useParams, useLocation } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ExternalLink, CheckCircle2, Loader2, UserCog, BadgeCheck, ShieldCheck } from "lucide-react";
import { toWhatsAppBR, fmtPhoneBR } from "@/lib/phone-utils";

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

export default function MissaoPublica() {
  const { missionId } = useParams<{ missionId: string }>();
  const location = useLocation();
  const code = new URLSearchParams(location.search).get("d") || "";

  const [config, setConfig] = useState<MissionConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  const codeInvalid = code === "invalid";

  const clickedKey = missionId ? `sm_missao_clicks_${missionId}` : "";
  const doneKey = missionId ? `sm_missao_done_${missionId}` : "";

  // Restaura, no aparelho, o que a pessoa já clicou/confirmou nesta missão.
  useEffect(() => {
    if (!missionId) return;
    try {
      const raw = localStorage.getItem(`sm_missao_clicks_${missionId}`);
      if (raw) setClickedLinks(new Set(JSON.parse(raw) as string[]));
      if (localStorage.getItem(`sm_missao_done_${missionId}`) === "1") setDeclared(true);
    } catch {
      // ignora storage indisponível
    }
  }, [missionId]);

  // Quando a pessoa volta do Facebook/Instagram, lembramos de confirmar.
  useEffect(() => {
    if (declared || clickedLinks.size === 0) return;
    const onBack = () => {
      if (document.visibilityState === "visible") setBackReminder(true);
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

    (async () => {
      try {
        // 1) descobre o cliente da missão (sem token)
        const boot = await fetch(
          api(`/api/public/missao/config/${encodeURIComponent(missionId)}?code=${encodeURIComponent(code)}`)
        );
        if (!boot.ok) {
          const err = await boot.json().catch(() => ({ error: "erro" }));
          throw new Error(err.error || `HTTP ${boot.status}`);
        }
        const bootData = (await boot.json()) as MissionConfig & { client_id?: string };
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
          const withTok = await fetch(
            api(`/api/public/missao/config/${encodeURIComponent(missionId)}?code=${encodeURIComponent(code)}&token=${encodeURIComponent(existing)}`)
          );
          const finalData = (await withTok.json()) as MissionConfig & { client_id?: string };
          if (cancelled) return;
          setConfig(finalData);
          if (finalData.participant?.concluido_em) setDeclared(true);
          // token não reconhecido pelo servidor → limpa
          if (existing && !finalData.participant && cid) {
            localStorage.removeItem(clientTokenKey(cid));
            setToken("");
          }
        } else {
          setConfig(bootData);
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Erro ao carregar missão");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [missionId, code]);

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
        await fetch(api("/api/public/missao/event"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ missionId, code, token, type, linkId: linkId || null }),
        });
      } catch {
        // silencioso — não bloqueia o clique
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
    setToken("");
    setConfig((prev) => (prev ? { ...prev, participant: null } : prev));
    setNome("");
    setPhone("");
    setDeclared(false);
    setJustRecognized(false);
  };

  const handleExternal = async (
    url: string,
    type: "click_facebook" | "click_instagram" | "click_avulso" | "click_link",
    linkId?: string,
  ) => {
    await registerEvent(type, linkId);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleDeclare = async () => {
    setDeclaring(true);
    await registerEvent("declared_done");
    setDeclared(true);
    setDeclaring(false);
    toast.success("Missão marcada como concluída — valeu!");
  };

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
            <CardTitle>{codeInvalid ? "Link expirado ou digitado errado" : "Missão indisponível"}</CardTitle>
            <CardDescription>
              {codeInvalid
                ? "Peça um link novo para quem enviou a mensagem — o código anexado à URL não confere mais."
                : "Este link pode ter expirado ou não é válido."}
            </CardDescription>
          </CardHeader>
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 py-8 px-4">
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
              <form onSubmit={handleIdentify} className="space-y-3">
                <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground flex gap-2">
                  <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Só desta primeira vez: informe seu nome e WhatsApp. Nas próximas missões você entra
                    direto, sem preencher nada.
                  </span>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="nome">Nome completo</Label>
                  <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={100} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">WhatsApp</Label>
                  <Input
                    id="phone"
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(67) 99123-4567"
                    required
                  />
                  {phone.trim() !== "" && (
                    <p className="text-[11px] text-muted-foreground">
                      {toWhatsAppBR(phone)
                        ? `Vamos usar ${fmtPhoneBR(toWhatsAppBR(phone))}`
                        : "Digite DDD + número"}
                    </p>
                  )}
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
                  <button
                    type="button"
                    onClick={handleSwitch}
                    className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                  >
                    <UserCog className="w-3 h-3" />
                    Não é você? Trocar participante
                  </button>
                </div>

                {m.instructions && (
                  <div className="text-sm whitespace-pre-wrap">{m.instructions}</div>
                )}

                <div className="space-y-2">
                  {linkFb && (
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-2"
                      onClick={() => handleExternal(linkFb, "click_facebook")}
                    >
                      <FacebookIcon className="w-4 h-4 text-blue-600" />
                      Abrir no Facebook
                      <ExternalLink className="w-3 h-3 ml-auto opacity-60" />
                    </Button>
                  )}
                  {linkIg && (
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-2"
                      onClick={() => handleExternal(linkIg, "click_instagram")}
                    >
                      <InstagramIcon className="w-4 h-4 text-pink-500" />
                      Abrir no Instagram
                      <ExternalLink className="w-3 h-3 ml-auto opacity-60" />
                    </Button>
                  )}
                  {linkAv && (
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-2"
                      onClick={() => handleExternal(linkAv, "click_avulso")}
                    >
                      <ExternalLink className="w-4 h-4" />
                      Abrir link
                      <ExternalLink className="w-3 h-3 ml-auto opacity-60" />
                    </Button>
                  )}
                  {extraLinks.map((l) => (
                    <Button
                      key={l.id}
                      variant="outline"
                      className="w-full justify-start gap-2"
                      onClick={() => handleExternal(l.url, "click_link", l.id)}
                    >
                      {l.kind === "facebook" ? (
                        <FacebookIcon className="w-4 h-4 text-blue-600" />
                      ) : l.kind === "instagram" ? (
                        <InstagramIcon className="w-4 h-4 text-pink-500" />
                      ) : (
                        <ExternalLink className="w-4 h-4" />
                      )}
                      <span className="truncate">{l.label}</span>
                      <ExternalLink className="w-3 h-3 ml-auto opacity-60 shrink-0" />
                    </Button>
                  ))}
                </div>

                <Button
                  className="w-full gap-2"
                  onClick={handleDeclare}
                  disabled={declaring || declared}
                >
                  {declaring ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  {declared ? "Missão concluída — obrigado!" : "Já realizei esta missão"}
                </Button>

                {declared && (
                  <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs flex gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      Sua participação foi registrada no nome de <strong>{p.nome}</strong>. Pode fechar
                      esta página — na próxima missão você entra direto.
                    </span>
                  </div>
                )}

                <p className="text-[11px] text-muted-foreground text-center">
                  Este é um registro declarado por você. Não verificamos automaticamente curtidas, comentários ou compartilhamentos.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
