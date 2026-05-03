import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Facebook, Instagram, CheckCircle2, Loader2, UserPlus, Phone, FileText, AlertCircle, Mail, Lock, Eye, EyeOff, LogIn, MapPin, Users, IdCard, Cake } from "lucide-react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { DateInputBr } from "@/components/ui/date-input-br";
import { formatCpf, cpfDigits, isValidCpf } from "@/lib/cpf-mask";
import { useCpfCheck } from "@/hooks/use-cpf-check";
import { CpfStatusIndicator } from "@/components/ui/cpf-status-indicator";
import SocialConnectFlow, { type ConnectedSocial } from "@/components/pessoas/SocialConnectFlow";

type ParsedProfile = {
  platform: "facebook" | "instagram";
  username: string | null;
  /** URL original quando é um link de share que precisa ser resolvido no backend */
  pendingShareUrl?: string;
};

function parseProfileUrl(url: string): ParsedProfile | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Normaliza: remove query string e fragmento para evitar tokens longos
  // do tipo ?mibextid=...&rdid=... que o app do Facebook adiciona ao "Copiar link"
  let clean = trimmed;
  try {
    const parsed = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    // preserva apenas profile.php?id=
    if (parsed.pathname.toLowerCase().includes("profile.php")) {
      const id = parsed.searchParams.get("id");
      if (id && /^\d+$/.test(id)) {
        return { platform: "facebook", username: id };
      }
    }
    clean = `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "");
  } catch {
    // segue com o trimmed original
  }

  // Facebook share link: /share/<id>/, /share/p/<id>/, /share/r/<id>/ etc.
  // NÃO geramos placeholder share_xxx (que polui o ranking de engajamento).
  // Retornamos a URL original e deixamos o backend resolver via redirect.
  const fbShare = clean.match(/(?:https?:\/\/)?(?:www\.|m\.)?facebook\.com\/share\/(?:[a-z]+\/)?([a-zA-Z0-9._-]+)/i);
  if (fbShare?.[1]) {
    return { platform: "facebook", username: null, pendingShareUrl: trimmed };
  }

  const fbPatterns = [
    /(?:https?:\/\/)?(?:www\.|m\.)?facebook\.com\/([a-zA-Z0-9._-]+)/i,
    /(?:https?:\/\/)?(?:www\.|m\.)?fb\.com\/([a-zA-Z0-9._-]+)/i,
  ];
  const fbBlacklist = ["groups","pages","events","watch","marketplace","gaming","reel","stories","photo","permalink","sharer","share","login","home","notifications","messages","profile.php"];
  for (const pattern of fbPatterns) {
    const match = clean.match(pattern);
    if (match?.[1]) {
      const u = match[1];
      if (fbBlacklist.includes(u.toLowerCase())) continue;
      return { platform: "facebook", username: u };
    }
  }

  // Instagram share link: /share/<id>/ — também deixa o backend resolver
  const igShare = clean.match(/(?:https?:\/\/)?(?:www\.)?instagram\.com\/share\/([a-zA-Z0-9._-]+)/i);
  if (igShare?.[1]) {
    return { platform: "instagram", username: null, pendingShareUrl: trimmed };
  }

  const igPatterns = [
    /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9._]+)/i,
    /(?:https?:\/\/)?(?:www\.)?instagr\.am\/([a-zA-Z0-9._]+)/i,
  ];
  const igBlacklist = ["p","reel","stories","explore","direct","accounts","about","share"];
  for (const pattern of igPatterns) {
    const match = clean.match(pattern);
    if (match?.[1]) {
      const u = match[1];
      if (igBlacklist.includes(u.toLowerCase())) continue;
      return { platform: "instagram", username: u };
    }
  }

  return null;
}

const UF_OPTIONS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

export default function SupporterRegister() {
  const { clientId } = useParams<{ clientId: string }>();
  const [searchParams] = useSearchParams();
  const refCode = searchParams.get("ref") || "";
  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [facebookConn, setFacebookConn] = useState<ConnectedSocial | null>(null);
  const [instagramConn, setInstagramConn] = useState<ConnectedSocial | null>(null);
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [city, setCity] = useState("");
  const [rua, setRua] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [state, setState] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [linkedProfiles, setLinkedProfiles] = useState<ParsedProfile[]>([]);
  const [error, setError] = useState("");
  const [referrerName, setReferrerName] = useState<string | null>(null);

  const cpfCheck = useCpfCheck(cpf, clientId);

  // Validate referral code on mount
  useEffect(() => {
    if (!refCode || !clientId) return;
    supabase
      .from("referral_codes")
      .select("code, supporter_accounts!inner(name)")
      .eq("code", refCode.toUpperCase())
      .eq("client_id", clientId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setReferrerName((data as any).supporter_accounts?.name || null);
        }
      });
  }, [refCode, clientId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Por favor, informe seu nome.");
      return;
    }
    if (!isValidCpf(cpf)) {
      setError("CPF inválido. Confira os dígitos.");
      return;
    }
    if (cpfCheck.status === "duplicate") {
      setError("Este CPF já está cadastrado no sistema.");
      return;
    }
    if (!phone.trim()) {
      setError("Por favor, informe seu telefone.");
      return;
    }
    if (!email.trim()) {
      setError("Por favor, informe seu e-mail para criar sua conta.");
      return;
    }
    if (password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (!city.trim()) {
      setError("Por favor, informe sua cidade.");
      return;
    }
    if (!rua.trim()) {
      setError("Por favor, informe sua rua.");
      return;
    }
    if (!neighborhood.trim()) {
      setError("Por favor, informe seu bairro.");
      return;
    }
    if (!birthDate) {
      setError("Por favor, informe sua data de nascimento.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { data, error: fnError } = await supabase.functions.invoke("register-supporter", {
        body: {
          client_id: clientId,
          name: name.trim(),
          cpf: cpfDigits(cpf),
          facebook_url: facebookConn?.url || null,
          instagram_url: instagramConn?.url || null,
          phone: phone.trim(),
          birth_date: birthDate,
          endereco: rua.trim(),
          notes: notes.trim() || null,
          referral_code: refCode || null,
          city: city.trim() || null,
          neighborhood: neighborhood.trim() || null,
          state: state || null,
        },
      });

      if (fnError) throw fnError;

      if (data?.success) {
        // Usa os perfis efetivamente resolvidos pelo backend (share links já tratados)
        const resolved: { platform: "facebook" | "instagram"; username: string }[] =
          (data as any)?.resolved_profiles || [];
        const pending: { platform: "facebook" | "instagram"; url: string }[] =
          (data as any)?.pending_shares || [];
        const profiles: ParsedProfile[] = [
          ...resolved.map((p) => ({ platform: p.platform, username: p.username })),
          ...pending.map((p) => ({ platform: p.platform, username: null, pendingShareUrl: p.url })),
        ];
        setLinkedProfiles(profiles);

        const fbResolved = resolved.find((p) => p.platform === "facebook")?.username || null;
        const igResolved = resolved.find((p) => p.platform === "instagram")?.username || null;

        // Create auth account
        try {
          const { data: authData, error: signUpError } = await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: { data: { full_name: name.trim() } },
          });
          if (signUpError) {
            console.error("Auth signup error:", signUpError);
          } else if (authData?.user && data.supporter_id) {
            // Create supporter_account and link referral using service-side data
            const { data: newAccount } = await supabase
              .from("supporter_accounts")
              .insert({
                user_id: authData.user.id,
                client_id: clientId!,
                name: name.trim(),
                email: email.trim(),
                cpf: cpfDigits(cpf),
                phone: phone.trim(),
                birth_date: birthDate,
                endereco: rua.trim(),
                facebook_username: fbResolved,
                instagram_username: igResolved,
                referred_by: data.referrer_account_id || null,
                city: city.trim() || null,
                neighborhood: neighborhood.trim() || null,
                state: state || null,
              } as any)
              .select()
              .single();

            // Create referral record if there was a referrer
            if (newAccount && data.referrer_account_id) {
              await supabase.from("referrals").insert({
                client_id: clientId!,
                referrer_account_id: data.referrer_account_id,
                referred_account_id: newAccount.id,
              } as any);

              // Increment referral_count on the referrer's supporter
              // Find supporter linked to referrer account
              const { data: refAccount } = await supabase
                .from("supporter_accounts")
                .select("supporter_id")
                .eq("id", data.referrer_account_id)
                .maybeSingle();
              
              if (refAccount?.supporter_id) {
                await supabase.rpc("calculate_engagement_score" as any, {
                  p_supporter_id: refAccount.supporter_id,
                  p_days: 30,
                });
              }
            }
          }
        } catch (authErr) {
          console.error("Auth error:", authErr);
        }

        setSuccess(true);
        setSuccessMessage(data.message);
      } else {
        setError(data?.error || "Erro ao cadastrar. Tente novamente.");
      }
    } catch (err: any) {
      console.error("Registration error:", err);
      setError("Erro ao conectar. Verifique sua conexão e tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-10 pb-10 space-y-5">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-foreground">Cadastro Realizado! 🎉</h2>
            <p className="text-muted-foreground">{successMessage}</p>

            {linkedProfiles.length > 0 && (
              <div className="bg-muted/50 rounded-lg p-4 text-left space-y-2">
                <p className="text-sm font-medium text-foreground">Perfis vinculados com sucesso:</p>
                {linkedProfiles.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    {p.platform === "facebook" ? (
                      <Facebook className="w-4 h-4 text-blue-600 shrink-0" />
                    ) : (
                      <Instagram className="w-4 h-4 text-pink-500 shrink-0" />
                    )}
                    <span className="font-medium capitalize">{p.platform}:</span>
                    <span className="text-muted-foreground">
                      {p.username || "vinculação pendente (link de compartilhamento)"}
                    </span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 ml-auto shrink-0" />
                  </div>
                ))}
              </div>
            )}

            <p className="text-sm text-muted-foreground">
              Sua conta foi criada com o e-mail <strong>{email}</strong>. Use-a para acessar o portal e interagir nas publicações! 🚀
            </p>

            <Button asChild className="w-full mt-2" size="lg">
              <a href={`/portal/${clientId}`}>
                <LogIn className="w-4 h-4 mr-2" />
                Entrar no Portal do Apoiador
              </a>
            </Button>
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
            Cole os links dos seus perfis — vamos vincular automaticamente para rastrear seu engajamento.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Referral badge */}
            {referrerName && (
              <div className="flex items-center gap-2 bg-primary/10 rounded-lg p-3 text-sm">
                <Users className="w-4 h-4 text-primary shrink-0" />
                <span>Indicado por <strong className="text-primary">{referrerName}</strong></span>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="name">Seu nome completo *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: João da Silva"
                required
              />
            </div>

            {/* CPF */}
            <div className="space-y-2">
              <Label htmlFor="cpf" className="flex items-center gap-2">
                <IdCard className="w-4 h-4 text-muted-foreground" />
                CPF *
              </Label>
              <Input
                id="cpf"
                inputMode="numeric"
                value={cpf}
                onChange={(e) => { setCpf(formatCpf(e.target.value)); setError(""); }}
                placeholder="000.000.000-00"
                maxLength={14}
                required
              />
              <CpfStatusIndicator result={cpfCheck} />
            </div>

            {/* Telefone (obrigatório) */}
            <div className="space-y-2">
              <Label htmlFor="phone" className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-muted-foreground" />
                Telefone / WhatsApp *
              </Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => { setPhone(e.target.value); setError(""); }}
                placeholder="(67) 99999-9999"
                required
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-muted-foreground" />
                E-mail *
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(""); }}
                placeholder="seu@email.com"
                required
              />
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password" className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-muted-foreground" />
                Criar senha *
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  placeholder="Mínimo 6 caracteres"
                  minLength={6}
                  required
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">Essa senha será usada para acessar o Portal do Apoiador</p>
            </div>

            {/* Endereço (Cidade, Rua, Bairro) */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                Endereço *
              </Label>
              <Input
                value={city}
                onChange={(e) => { setCity(e.target.value); setError(""); }}
                placeholder="Cidade *"
                required
              />
              <Input
                value={rua}
                onChange={(e) => { setRua(e.target.value); setError(""); }}
                placeholder="Rua *"
                required
              />
              <Input
                value={neighborhood}
                onChange={(e) => { setNeighborhood(e.target.value); setError(""); }}
                placeholder="Bairro *"
                required
              />
              <Select value={state} onValueChange={setState}>
                <SelectTrigger>
                  <SelectValue placeholder="Estado (UF)" />
                </SelectTrigger>
                <SelectContent>
                  {UF_OPTIONS.map(uf => (
                    <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Data de nascimento */}
            <div className="space-y-2">
              <Label htmlFor="birth_date" className="flex items-center gap-2">
                <Cake className="w-4 h-4 text-muted-foreground" />
                Data de nascimento *
              </Label>
              <DateInputBr
                id="birth_date"
                value={birthDate}
                onChange={(iso) => { setBirthDate(iso); setError(""); }}
                required
              />
            </div>

            {/* Redes Sociais — Instagram primeiro */}
            <div className="pt-2">
              <p className="text-sm font-medium text-foreground">Redes Sociais</p>
              <p className="text-xs text-muted-foreground">Conecte seus perfis pra receber missões e ter seu engajamento contabilizado. Vamos te guiar passo a passo.</p>
            </div>

            <div className="space-y-2">
              <SocialConnectFlow
                platform="instagram"
                searchName={name}
                value={instagramConn}
                onChange={setInstagramConn}
              />
              <SocialConnectFlow
                platform="facebook"
                searchName={name}
                value={facebookConn}
                onChange={setFacebookConn}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes" className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                Observação (opcional)
              </Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Como soube de nós..."
                maxLength={300}
              />
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
                <><UserPlus className="w-4 h-4 mr-2" />Cadastrar como Apoiador Ativo</>
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Ao se cadastrar, você confirma sua participação como apoiador ativo.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
