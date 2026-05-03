import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Loader2, CheckCircle2, AlertCircle, MapPin, Phone, FileText,
  MessageCircle, Briefcase, Eye, EyeOff, Mail, Lock, Cake,
} from "lucide-react";
import SocialConnectGroup, { type SocialEntry } from "@/components/pessoas/SocialConnectGroup";

// ─── Main Registration Page ──────────────────────────────────────────────────
export default function RegistroContratado() {
  const { clientId, liderId } = useParams<{ clientId: string; liderId: string }>();
  const [clientName, setClientName] = useState("");
  const [liderName, setLiderName] = useState("");
  const [whatsappOficial, setWhatsappOficial] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingClient, setLoadingClient] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [cidade, setCidade] = useState("");
  const [bairro, setBairro] = useState("");
  const [endereco, setEndereco] = useState("");
  const [zonaEleitoral, setZonaEleitoral] = useState("");
  const [secaoEleitoral, setSecaoEleitoral] = useState("");
  const [dataNascimento, setDataNascimento] = useState("");
  const [notas, setNotas] = useState("");
  const [socials, setSocials] = useState<SocialEntry[]>([]);
  const [portalUrl, setPortalUrl] = useState("");

  useEffect(() => {
    if (!clientId) { setLoadingClient(false); return; }
    
    const loadClient = async () => {
      try {
        const { data: clientData, error: clientError } = await supabase
          .from("clients")
          .select("name, whatsapp_oficial")
          .eq("id", clientId)
          .maybeSingle();

        console.log("RegistroContratado: client fetch", { clientId, clientData, clientError });

        if (clientData) {
          setClientName(clientData.name);
          setWhatsappOficial((clientData as any).whatsapp_oficial || "");
        }

        if (liderId) {
          const { data: liderData } = await supabase
            .from("pessoas")
            .select("nome")
            .eq("id", liderId)
            .maybeSingle();
          if (liderData) setLiderName((liderData as any).nome || "");
        }
      } catch (err) {
        console.error("RegistroContratado: error loading client", err);
      } finally {
        setLoadingClient(false);
      }
    };

    loadClient();
  }, [clientId, liderId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) { setError("Informe seu nome."); return; }
    if (!telefone.trim()) { setError("Informe seu telefone."); return; }
    if (!email.trim()) { setError("Informe seu e-mail."); return; }
    if (!senha || senha.length < 6) { setError("A senha deve ter no mínimo 6 caracteres."); return; }
    if (!cidade.trim()) { setError("Informe sua cidade."); return; }
    if (!zonaEleitoral.trim()) { setError("Informe sua zona eleitoral."); return; }
    if (!secaoEleitoral.trim()) { setError("Informe sua seção eleitoral."); return; }
    if (!dataNascimento) { setError("Informe sua data de nascimento."); return; }

    setLoading(true);
    setError("");

    const { data, error: fnError } = await supabase.functions.invoke("register-contratado", {
      body: {
        client_id: clientId,
        lider_id: liderId || null,
        nome: nome.trim(),
        telefone: telefone.trim(),
        email: email.trim().toLowerCase(),
        senha,
        cidade: cidade.trim(),
        bairro: bairro.trim() || null,
        endereco: endereco.trim() || null,
        zona_eleitoral: zonaEleitoral.trim(),
        secao_eleitoral: secaoEleitoral.trim(),
        data_nascimento: dataNascimento,
        notas: notas.trim() || null,
        redes_sociais: socials,
        is_lider: !liderId,
      },
    });

    if (fnError || (data && data.error)) {
      setError(data?.error || fnError?.message || "Erro ao realizar cadastro.");
      setLoading(false);
      return;
    }

    setPortalUrl(`${window.location.origin}/portal-contratado/${clientId}`);
    setSuccess(true);
    setLoading(false);
  };

  if (loadingClient) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-primary/5 to-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }


  if (success) {
    const whatsappLink = whatsappOficial
      ? `https://wa.me/${whatsappOficial}?text=${encodeURIComponent(`Olá! Acabei de me cadastrar como contratado(a). Meu nome é ${nome.trim()}.${liderName ? ` Fui indicado(a) por ${liderName}.` : ""}`)}`
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
              Seu cadastro foi registrado com sucesso. Guarde seu e-mail e senha para acessar seu portal diariamente.
            </p>
            <div className="bg-muted/50 rounded-xl p-4 text-left space-y-1 text-sm">
              <p><strong>E-mail:</strong> {email}</p>
              <p><strong>Senha:</strong> a que você definiu</p>
              <p className="text-xs text-muted-foreground pt-1">Use estas credenciais para acessar o portal todos os dias.</p>
            </div>
            <Button asChild className="w-full gap-2">
              <a href={portalUrl}>
                <Briefcase className="w-4 h-4" />
                Acessar Meu Portal
              </a>
            </Button>
            {whatsappLink ? (
              <Button asChild variant="outline" size="lg" className="w-full gap-2 border-green-300 text-green-700 hover:bg-green-50">
                <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="w-5 h-5" />
                  Confirmar no WhatsApp (obrigatório)
                </a>
              </Button>
            ) : (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 rounded-lg text-sm text-amber-800 dark:text-amber-300 text-center">
                ⚠️ Entre em contato com a equipe pelo WhatsApp para confirmar seu cadastro.
              </div>
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
            <Briefcase className="w-7 h-7 text-primary" />
          </div>
          <CardTitle className="text-xl">{liderId ? "Cadastro de Contratado" : "Cadastro de Líder"}</CardTitle>
          <CardDescription>
            {liderId && liderName
              ? `Indicado por ${liderName}${clientName ? ` — Base de ${clientName}` : ""}`
              : clientName
              ? `Preencha seus dados para se cadastrar como líder em ${clientName}`
              : "Preencha seus dados para concluir seu cadastro"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome completo *</Label>
              <Input id="nome" value={nome} onChange={e => { setNome(e.target.value); setError(""); }} placeholder="Ex: João da Silva" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="telefone" className="flex items-center gap-2"><Phone className="w-4 h-4 text-muted-foreground" />Telefone / WhatsApp *</Label>
              <Input id="telefone" value={telefone} onChange={e => { setTelefone(e.target.value); setError(""); }} placeholder="(67) 99999-9999" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-2"><Mail className="w-4 h-4 text-muted-foreground" />E-mail *</Label>
              <Input id="email" type="email" value={email} onChange={e => { setEmail(e.target.value); setError(""); }} placeholder="seu@email.com" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="senha" className="flex items-center gap-2"><Lock className="w-4 h-4 text-muted-foreground" />Senha de acesso *</Label>
              <div className="relative">
                <Input id="senha" type={showPassword ? "text" : "password"} value={senha} onChange={e => { setSenha(e.target.value); setError(""); }} placeholder="Mínimo 6 caracteres" minLength={6} required />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">Você usará este e-mail e senha para acessar seu portal todo dia.</p>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2"><MapPin className="w-4 h-4 text-muted-foreground" />Localização *</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input value={cidade} onChange={e => { setCidade(e.target.value); setError(""); }} placeholder="Cidade *" required />
                <Input value={bairro} onChange={e => setBairro(e.target.value)} placeholder="Bairro" />
              </div>
              <Input value={endereco} onChange={e => setEndereco(e.target.value)} placeholder="Endereço completo" />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2"><FileText className="w-4 h-4 text-muted-foreground" />Título Eleitoral *</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input value={zonaEleitoral} onChange={e => { setZonaEleitoral(e.target.value); setError(""); }} placeholder="Zona *" required />
                <Input value={secaoEleitoral} onChange={e => { setSecaoEleitoral(e.target.value); setError(""); }} placeholder="Seção *" required />
              </div>
              <p className="text-xs text-muted-foreground">Encontre no seu título de eleitor ou no app e-Título</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="data_nascimento" className="flex items-center gap-2"><Cake className="w-4 h-4 text-muted-foreground" />Data de nascimento *</Label>
              <Input id="data_nascimento" type="date" value={dataNascimento} onChange={e => { setDataNascimento(e.target.value); setError(""); }} required />
            </div>

            <SocialConnectGroup searchName={nome} onSocialsChange={setSocials} />

            <div className="space-y-2">
              <Label htmlFor="notas" className="flex items-center gap-2"><FileText className="w-4 h-4 text-muted-foreground" />Observação (opcional)</Label>
              <Textarea id="notas" value={notas} onChange={e => setNotas(e.target.value)} placeholder="Ex: Disponível para trabalho noturno..." maxLength={500} />
            </div>

            {error && (
              <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><p>{error}</p>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Briefcase className="w-4 h-4 mr-2" />}
              Cadastrar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
