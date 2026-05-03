
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Loader2, CheckCircle2, AlertCircle, MapPin, Phone, FileText, MessageCircle, Facebook, Instagram, ClipboardPaste, X, Check, ChevronDown, ChevronUp, Cake } from "lucide-react";
import { formatCPF, formatPhone, isValidCPF, onlyDigits, translateRegistrationError } from "@/lib/cpf";

const TIPO_OPTIONS = [
  { value: "eleitor", label: "Eleitor" },
  { value: "apoiador", label: "Apoiador" },
  { value: "lideranca", label: "Liderança Comunitária" },
  { value: "voluntario", label: "Voluntário" },
  { value: "cidadao", label: "Cidadão" },
];

interface SocialEntry {
  plataforma: string;
  usuario: string;
  url_perfil: string;
}

const SOCIAL_PLATFORMS = [
  {
    id: "instagram",
    label: "Instagram",
    icon: Instagram,
    color: "text-pink-500",
    bgColor: "bg-pink-50 dark:bg-pink-950/20 border-pink-200 dark:border-pink-800",
    activeBg: "bg-pink-100 dark:bg-pink-950/40",
    emoji: "📸",
    helpImage: "/assets/help-instagram.png",
    steps: [
      { text: "Abra o aplicativo do Instagram no seu celular", emoji: "📱" },
      { text: "Toque no ícone da sua foto (canto inferior direito) para ir ao seu perfil", emoji: "👤" },
      { text: "No seu perfil, toque em \"Compartilhar Perfil\"", emoji: "⚙️" },
      { text: 'Toque em "Copiar Link"', emoji: "🔗" },
      { text: "Pronto! Agora volte aqui e toque no botão COLAR abaixo 👇", emoji: "✅" },
    ],
    parse: (input: string): { usuario: string; url: string } | null => {
      const urlMatch = input.match(/(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9._]+)/i);
      if (urlMatch) return { usuario: urlMatch[1], url: `https://instagram.com/${urlMatch[1]}` };
      const clean = input.trim().replace(/^@/, "").replace(/\/$/, "");
      if (clean && /^[a-zA-Z0-9._]+$/.test(clean)) return { usuario: clean, url: `https://instagram.com/${clean}` };
      return null;
    },
  },
  {
    id: "facebook",
    label: "Facebook",
    icon: Facebook,
    color: "text-blue-600",
    bgColor: "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800",
    activeBg: "bg-blue-100 dark:bg-blue-950/40",
    emoji: "👍",
    helpImage: "/assets/help-facebook.png",
    steps: [
      { text: "Abra o aplicativo do Facebook no seu celular", emoji: "📱" },
      { text: "Toque na sua foto de perfil (canto superior direito)", emoji: "👤" },
      { text: "Toque em \"Compartilhar perfil\" e depois em \"Copiar link\"", emoji: "🔗" },
      { text: "Pronto! Agora volte aqui e toque no botão COLAR abaixo 👇", emoji: "✅" },
    ],
    parse: (input: string): { usuario: string; url: string } | null => {
      const urlMatch = input.match(/(?:https?:\/\/)?(?:www\.|m\.)?facebook\.com\/(?:profile\.php\?id=)?([a-zA-Z0-9.]+)/i);
      if (urlMatch) return { usuario: urlMatch[1], url: input.trim() };
      const clean = input.trim().replace(/\/$/, "");
      if (clean && /^[a-zA-Z0-9.]+$/.test(clean)) return { usuario: clean, url: `https://facebook.com/${clean}` };
      return null;
    },
  },
];

function SocialLinkCapture({ onSocialsChange }: { onSocialsChange: (socials: SocialEntry[]) => void }) {
  const [activePlatform, setActivePlatform] = useState<string | null>(null);
  const [pasteValue, setPasteValue] = useState("");
  const [captured, setCaptured] = useState<Record<string, SocialEntry>>({});
  const [parseError, setParseError] = useState(false);
  const [pasteSuccess, setPasteSuccess] = useState(false);
  const [resolving, setResolving] = useState(false);

  async function handleConfirm(platformId: string, value: string) {
    const platform = SOCIAL_PLATFORMS.find(p => p.id === platformId);
    if (!platform) return;
    const trimmed = value.trim();
    if (!trimmed) return;

    // 1) Tenta parser local (rápido, sem rede)
    const result = platform.parse(value);
    const isLikelyShareLink =
      platformId === "facebook" && /facebook\.com\/share\//i.test(trimmed);

    if (result && !isLikelyShareLink) {
      const newCaptured = {
        ...captured,
        [platformId]: { plataforma: platformId, usuario: result.usuario, url_perfil: result.url },
      };
      setCaptured(newCaptured);
      onSocialsChange(Object.values(newCaptured));
      setPasteValue("");
      setActivePlatform(null);
      setParseError(false);
      setPasteSuccess(false);
      return;
    }

    // 2) Fallback: pede ao servidor pra seguir o redirect (links de share, fb.me, etc)
    if (/^https?:\/\//i.test(trimmed) || /\.(com|me)\//i.test(trimmed)) {
      setResolving(true);
      setParseError(false);
      try {
        const { data, error } = await supabase.functions.invoke("resolve-social-link", {
          body: { url: trimmed, platform: platformId },
        });
        if (!error && data?.resolved && data?.usuario) {
          const newCaptured = {
            ...captured,
            [platformId]: {
              plataforma: platformId,
              usuario: data.usuario as string,
              url_perfil: (data.url as string) || trimmed,
            },
          };
          setCaptured(newCaptured);
          onSocialsChange(Object.values(newCaptured));
          setPasteValue("");
          setActivePlatform(null);
          setPasteSuccess(false);
          setResolving(false);
          return;
        }
      } catch (err) {
        console.warn("resolve-social-link falhou", err);
      }
      setResolving(false);
    }

    setParseError(true);
    setPasteSuccess(false);
  }

  function handleRemove(platformId: string) {
    const newCaptured = { ...captured };
    delete newCaptured[platformId];
    setCaptured(newCaptured);
    onSocialsChange(Object.values(newCaptured));
  }

  async function handleClipboardPaste(platformId: string) {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setPasteValue(text);
        setPasteSuccess(true);
        setParseError(false);
        // Sempre tenta confirmar — handleConfirm já lida com parse local + fallback de servidor
        setTimeout(() => {
          handleConfirm(platformId, text);
        }, 400);
        return;
      }
    } catch {
      // Clipboard API not available
    }
  }

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Redes Sociais (opcional)</Label>
      <p className="text-xs text-muted-foreground">
        Quer conectar suas redes? Toque em uma rede abaixo e siga o passo a passo! 😊
      </p>
      
      <div className="flex flex-wrap gap-2">
        {SOCIAL_PLATFORMS.map((p) => {
          const Icon = p.icon;
          const isCaptured = !!captured[p.id];
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                if (isCaptured) return;
                setActivePlatform(activePlatform === p.id ? null : p.id);
                setPasteValue("");
                setParseError(false);
                setPasteSuccess(false);
              }}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                isCaptured
                  ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400"
                  : activePlatform === p.id
                  ? `${p.activeBg} border-2 ${p.color} shadow-sm`
                  : `${p.bgColor} ${p.color} hover:opacity-80`
              }`}
            >
              <span className="text-base">{p.emoji}</span>
              <Icon className="w-4 h-4" />
              {p.label}
              {isCaptured && <Check className="w-3.5 h-3.5" />}
              {!isCaptured && (
                activePlatform === p.id 
                  ? <ChevronUp className="w-3.5 h-3.5" /> 
                  : <ChevronDown className="w-3.5 h-3.5 opacity-40" />
              )}
            </button>
          );
        })}
      </div>

      {/* Captured badges */}
      {Object.entries(captured).map(([platformId, entry]) => {
        const platform = SOCIAL_PLATFORMS.find(p => p.id === platformId);
        if (!platform) return null;
        const Icon = platform.icon;
        return (
          <div key={platformId} className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
            <span className="text-base">✅</span>
            <Icon className="w-4 h-4 text-emerald-600" />
            <span className="text-sm text-emerald-700 dark:text-emerald-400 flex-1 truncate font-medium">@{entry.usuario}</span>
            <button type="button" onClick={() => handleRemove(platformId)} className="text-muted-foreground hover:text-destructive p-1 rounded-md hover:bg-destructive/10">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}

      {/* Active platform instructions */}
      {activePlatform && !captured[activePlatform] && (() => {
        const platform = SOCIAL_PLATFORMS.find(p => p.id === activePlatform);
        if (!platform) return null;
        const Icon = platform.icon;
        return (
          <div className={`rounded-xl border-2 p-4 space-y-4 ${platform.bgColor} animate-in slide-in-from-top-2 duration-200`}>
            <div className="flex items-center gap-2">
              <span className="text-lg">{platform.emoji}</span>
              <Icon className={`w-5 h-5 ${platform.color}`} />
              <span className="font-semibold text-sm">Passo a passo — {platform.label}</span>
            </div>
            
            <div className="space-y-2.5">
              {platform.steps.map((step, i) => (
                <div 
                  key={i} 
                  className={`flex items-start gap-2.5 p-2 rounded-lg text-sm ${
                    i === platform.steps.length - 1 
                      ? "bg-primary/10 border border-primary/20 font-semibold text-foreground" 
                      : "text-muted-foreground"
                  }`}
                >
                  <span className="text-base shrink-0 mt-0.5">{step.emoji}</span>
                  <span>
                    <span className="font-bold text-foreground mr-1.5">{i + 1}.</span>
                    {step.text}
                  </span>
                </div>
              ))}
            </div>

            {platform.helpImage && (
              <div className="rounded-lg overflow-hidden border border-border/50 bg-background">
                <img src={platform.helpImage} alt={`Como copiar link do ${platform.label}`} className="w-full h-auto" />
              </div>
            )}

            {/* Paste area */}
            <div className="space-y-2 pt-1">
              <Button
                type="button"
                size="lg"
                variant="outline"
                className="w-full gap-2 text-base font-semibold border-2 border-dashed border-primary/40 hover:border-primary hover:bg-primary/5 py-5"
                onClick={() => handleClipboardPaste(activePlatform)}
              >
                <ClipboardPaste className="w-5 h-5" />
                📋 Tocar aqui para COLAR o link
              </Button>

              {pasteSuccess && pasteValue && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 text-sm">
                  <span>✅</span>
                  <span className="text-emerald-700 dark:text-emerald-400 truncate flex-1">{pasteValue}</span>
                </div>
              )}
              
              <div className="relative">
                <Input
                  value={pasteValue}
                  onChange={(e) => { setPasteValue(e.target.value); setParseError(false); setPasteSuccess(false); }}
                  placeholder="Ou digite/cole o link aqui manualmente..."
                  className="bg-background text-sm pr-20"
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleConfirm(activePlatform, pasteValue))}
                />
              </div>

              {pasteValue && !pasteSuccess && (
                <Button
                  type="button"
                  size="default"
                  className="w-full gap-2"
                  onClick={() => handleConfirm(activePlatform, pasteValue)}
                  disabled={resolving}
                >
                  {resolving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Identificando perfil...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Confirmar
                    </>
                  )}
                </Button>
              )}

              {resolving && pasteSuccess && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/10 border border-primary/20 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Identificando o perfil pelo link… só um instante 🙌</span>
                </div>
              )}

              {parseError && (
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                  <span>❌</span>
                  <div>
                    <p className="font-medium">Não conseguimos identificar o perfil</p>
                    <p className="text-xs mt-0.5 opacity-80">Tente copiar o link novamente seguindo os passos acima. O link deve ser parecido com: instagram.com/seunome</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default function RegistroPessoa() {
  const { clientId } = useParams<{ clientId: string }>();
  const [clientName, setClientName] = useState("");
  const [whatsappOficial, setWhatsappOficial] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingClient, setLoadingClient] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [cidade, setCidade] = useState("");
  const [bairro, setBairro] = useState("");
  const [endereco, setEndereco] = useState("");
  const [tipoPessoa, setTipoPessoa] = useState("cidadao");
  const [dataNascimento, setDataNascimento] = useState("");
  const [notas, setNotas] = useState("");
  const [socials, setSocials] = useState<SocialEntry[]>([]);

  useEffect(() => {
    if (!clientId) return;
    supabase
      .from("clients")
      .select("name, whatsapp_oficial")
      .eq("id", clientId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setClientName(data.name);
          setWhatsappOficial((data as any).whatsapp_oficial || "");
        }
        setLoadingClient(false);
      });
  }, [clientId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) { setError("Informe seu nome."); return; }
    if (!telefone.trim()) { setError("Informe seu telefone."); return; }
    if (!cidade.trim()) { setError("Informe sua cidade."); return; }
    if (!bairro.trim()) { setError("Informe seu bairro."); return; }
    if (!dataNascimento) { setError("Informe sua data de nascimento."); return; }

    const cpfDigits = onlyDigits(cpf);
    if (cpfDigits && !isValidCPF(cpfDigits)) {
      setError("CPF inválido. Verifique os dígitos informados.");
      return;
    }

    setLoading(true);
    setError("");

    const { data, error: rpcError } = await supabase.rpc("register_pessoa_public", {
      p_client_id: clientId!,
      p_nome: nome.trim(),
      p_telefone: onlyDigits(telefone),
      p_email: email.trim() || null,
      p_cidade: cidade.trim(),
      p_bairro: bairro.trim(),
      p_endereco: endereco.trim() || null,
      p_tipo_pessoa: tipoPessoa as "eleitor" | "apoiador" | "lideranca" | "voluntario" | "cidadao" | "jornalista" | "influenciador" | "adversario",
      p_notas: notas.trim() || null,
      p_socials: socials as unknown as any,
      p_data_nascimento: dataNascimento || null,
      p_cpf: cpfDigits || null,
    } as any);

    if (rpcError) {
      console.error("Registration error:", rpcError);
      const friendly = translateRegistrationError(rpcError);
      setError(friendly || "Erro ao realizar cadastro. Tente novamente.");
    } else {
      setSuccess(true);
    }
    setLoading(false);
  };

  if (loadingClient) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-primary/5 to-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!clientName) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-primary/5 to-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="py-10">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <p className="text-lg font-medium">Link inválido</p>
            <p className="text-sm text-muted-foreground mt-2">Este link de cadastro não é válido ou expirou.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    const whatsappLink = whatsappOficial
      ? `https://wa.me/${whatsappOficial}?text=${encodeURIComponent(`Olá! Acabei de me cadastrar como apoiador(a). Meu nome é ${nome.trim()}.`)}`
      : "";

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-primary/5 to-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="py-10 space-y-5">
            <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/30 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold">Cadastro Realizado! 🎉</h2>
            <p className="text-muted-foreground">
              Seu cadastro foi registrado com sucesso na base de {clientName}.
            </p>
            {whatsappLink ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Para confirmar seu cadastro, envie uma mensagem pelo WhatsApp:
                </p>
                <Button asChild size="lg" className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white">
                  <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="w-5 h-5" />
                    Confirmar no WhatsApp
                  </a>
                </Button>
                <p className="text-xs text-muted-foreground">
                  Ao iniciar a conversa, você autoriza o recebimento de comunicações da campanha.
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Obrigado por se cadastrar! Em breve entraremos em contato.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <UserPlus className="w-7 h-7 text-primary" />
          </div>
          <CardTitle className="text-xl">Cadastro de Apoiador</CardTitle>
          <CardDescription>
            Preencha seus dados para fazer parte da base de apoio de {clientName}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome completo *</Label>
              <Input id="nome" value={nome} onChange={(e) => { setNome(e.target.value); setError(""); }} placeholder="Ex: Maria da Silva" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="telefone" className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-muted-foreground" />
                Telefone / WhatsApp *
              </Label>
              <Input id="telefone" value={formatPhone(telefone)} onChange={(e) => { setTelefone(onlyDigits(e.target.value)); setError(""); }} placeholder="(67) 99999-9999" inputMode="tel" maxLength={16} required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cpf">CPF (opcional)</Label>
              <Input id="cpf" value={formatCPF(cpf)} onChange={(e) => { setCpf(onlyDigits(e.target.value)); setError(""); }} placeholder="000.000.000-00" inputMode="numeric" maxLength={14} />
              <p className="text-xs text-muted-foreground">Informar o CPF ajuda a evitar cadastros duplicados.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">E-mail (opcional)</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                Localização *
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <Input value={cidade} onChange={(e) => { setCidade(e.target.value); setError(""); }} placeholder="Cidade *" required />
                <Input value={bairro} onChange={(e) => { setBairro(e.target.value); setError(""); }} placeholder="Bairro *" required />
              </div>
              <Input value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="Endereço (opcional)" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="data_nascimento" className="flex items-center gap-2">
                <Cake className="w-4 h-4 text-muted-foreground" />
                Data de nascimento *
              </Label>
              <Input id="data_nascimento" type="date" value={dataNascimento} onChange={(e) => { setDataNascimento(e.target.value); setError(""); }} required />
            </div>

            <div className="space-y-2">
              <Label>Como você se identifica?</Label>
              <Select value={tipoPessoa} onValueChange={setTipoPessoa}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPO_OPTIONS.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <SocialLinkCapture onSocialsChange={setSocials} />

            <div className="space-y-2">
              <Label htmlFor="notas" className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                Observação (opcional)
              </Label>
              <Textarea id="notas" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ex: Líder do bairro Jardim, disponível para eventos..." maxLength={500} />
            </div>

            {error && (
              <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>{error}</p>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Cadastrando...</>
              ) : (
                <><UserPlus className="w-4 h-4 mr-2" />Cadastrar</>
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Ao se cadastrar, você autoriza o armazenamento dos seus dados para fins de comunicação política.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
