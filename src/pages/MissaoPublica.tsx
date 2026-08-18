import { useEffect, useState, useCallback } from "react";
import { useParams, useLocation } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Facebook as FacebookIcon as Facebook as Facebook as FacebookIcon, Instagram as InstagramIcon as Instagram as Instagram as InstagramIcon, ExternalLink, CheckCircle2, Loader2, UserCog } from "lucide-react";
import { normalizeBRPhone, isValidBRPhone } from "@/lib/phone-utils";

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
  client_name: string | null;
  distribution_valid: boolean;
  group_name: string | null;
  participant: { id: string; nome: string } | null;
};

const TOKEN_KEY_PREFIX = "sm_client_token_";
const LEGACY_MISSION_TOKEN_PREFIX = "sm_missao_token_";

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
  const codeInvalid = code === "invalid";

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
    async (type: "open" | "click_facebook" | "click_instagram" | "click_avulso" | "declared_done") => {
      if (!missionId) return;
      try {
        await fetch(api("/api/public/missao/event"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ missionId, code, token, type }),
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
    const cleanPhone = normalizeBRPhone(phone);
    if (!cleanNome) return toast.error("Informe seu nome");
    if (!isValidBRPhone(cleanPhone)) return toast.error("Telefone inválido — use DDD + número");
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
      toast.success("Prontinho, obrigado por participar!");
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
  };

  const handleExternal = async (
    url: string,
    type: "click_facebook" | "click_instagram" | "click_avulso",
  ) => {
    await registerEvent(type);
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
  // Fallback para missões legadas (sem os campos novos preenchidos):
  const linkFb = m.link_facebook || (m.legacy_platform === "facebook" ? m.legacy_post_url : null);
  const linkIg = m.link_instagram || (m.legacy_platform === "instagram" ? m.legacy_post_url : null);
  const linkAv = m.link_avulso || null;

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
            {!config.participant ? (
              <form onSubmit={handleIdentify} className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Antes de continuar, precisamos te conhecer. É rápido.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="nome">Nome</Label>
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
                </div>
                <Button type="submit" className="w-full" disabled={identifying}>
                  {identifying && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Continuar
                </Button>
              </form>
            ) : (
              <>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-sm">
                    Olá, <strong>{config.participant.nome}</strong>. Sua participação nesta missão será registrada.
                  </p>
                  <button
                    type="button"
                    onClick={handleSwitch}
                    className="mt-2 text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
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
                      Abrir no FacebookIcon
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
                      Abrir no InstagramIcon
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
