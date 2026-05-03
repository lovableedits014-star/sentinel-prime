import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Loader2, CheckCircle2, AlertCircle, MapPin, Phone,
  Mail, Lock, Eye, EyeOff, Users2, Cake, IdCard,
} from "lucide-react";
import { DateInputBr } from "@/components/ui/date-input-br";
import { formatCpf, cpfDigits, isValidCpf } from "@/lib/cpf-mask";
import { useCpfCheck } from "@/hooks/use-cpf-check";
import { CpfStatusIndicator } from "@/components/ui/cpf-status-indicator";
import SocialConnectGroup, { type SocialEntry } from "@/components/pessoas/SocialConnectGroup";

// ─── Main Registration Page ──────────────────────────────────────────────────
export default function RegistroFuncionario() {
  const { clientId } = useParams<{ clientId: string }>();
  const [clientName, setClientName] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingClient, setLoadingClient] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [cidade, setCidade] = useState("");
  const [rua, setRua] = useState("");
  const [bairro, setBairro] = useState("");
  const [dataNascimento, setDataNascimento] = useState("");
  const [socials, setSocials] = useState<SocialEntry[]>([]);
  const [portalUrl, setPortalUrl] = useState("");

  const cpfCheck = useCpfCheck(cpf, clientId);

  useEffect(() => {
    const loadClient = async () => {
      const { data } = await supabase.from("clients").select("name").eq("id", clientId).maybeSingle();
      if (data) setClientName(data.name);
      setLoadingClient(false);
    };
    loadClient();
  }, [clientId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) { setError("Informe seu nome."); return; }
    if (!isValidCpf(cpf)) { setError("CPF inválido. Confira os dígitos."); return; }
    if (cpfCheck.status === "duplicate") { setError("Este CPF já está cadastrado no sistema."); return; }
    if (!telefone.trim()) { setError("Informe seu telefone."); return; }
    if (!email.trim()) { setError("Informe seu e-mail."); return; }
    if (!senha || senha.length < 6) { setError("A senha deve ter no mínimo 6 caracteres."); return; }
    if (!cidade.trim()) { setError("Informe sua cidade."); return; }
    if (!rua.trim()) { setError("Informe sua rua."); return; }
    if (!bairro.trim()) { setError("Informe seu bairro."); return; }
    if (!dataNascimento) { setError("Informe sua data de nascimento."); return; }

    setLoading(true);
    setError("");

    const { data, error: fnError } = await supabase.functions.invoke("register-funcionario", {
      body: {
        client_id: clientId,
        nome: nome.trim(),
        cpf: cpfDigits(cpf),
        telefone: telefone.trim(),
        email: email.trim().toLowerCase(),
        senha,
        cidade: cidade.trim(),
        bairro: bairro.trim(),
        endereco: rua.trim(),
        data_nascimento: dataNascimento,
        redes_sociais: socials,
      },
    });

    if (fnError || (data && data.error)) {
      setError(data?.error || fnError?.message || "Erro ao realizar cadastro.");
      setLoading(false);
      return;
    }

    setPortalUrl(`${window.location.origin}/portal-funcionario/${clientId}`);
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-primary/5 to-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="py-10 space-y-5">
            <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/30 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold">Cadastro Realizado! 🎉</h2>
            <p className="text-muted-foreground">
              Seu cadastro como funcionário foi registrado com sucesso. Guarde seu e-mail e senha para acessar seu portal diariamente.
            </p>
            <div className="bg-muted/50 rounded-xl p-4 text-left space-y-1 text-sm">
              <p><strong>E-mail:</strong> {email}</p>
              <p><strong>Senha:</strong> a que você definiu</p>
              <p className="text-xs text-muted-foreground pt-1">Use estas credenciais para acessar o portal todos os dias e cumprir suas missões.</p>
            </div>
            <Button asChild className="w-full gap-2">
              <a href={portalUrl}>
                <Users2 className="w-4 h-4" />
                Acessar Meu Portal
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
            <Users2 className="w-7 h-7 text-primary" />
          </div>
          <CardTitle className="text-xl">Cadastro de Funcionário</CardTitle>
          <CardDescription>
            {clientName
              ? `Preencha seus dados para se cadastrar como funcionário em ${clientName}`
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
              <Label htmlFor="cpf" className="flex items-center gap-2"><IdCard className="w-4 h-4 text-muted-foreground" />CPF *</Label>
              <Input
                id="cpf"
                inputMode="numeric"
                value={cpf}
                onChange={e => { setCpf(formatCpf(e.target.value)); setError(""); }}
                placeholder="000.000.000-00"
                maxLength={14}
                required
              />
              <CpfStatusIndicator result={cpfCheck} />
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
              <Label className="flex items-center gap-2"><MapPin className="w-4 h-4 text-muted-foreground" />Endereço *</Label>
              <Input value={cidade} onChange={e => { setCidade(e.target.value); setError(""); }} placeholder="Cidade *" required />
              <Input value={rua} onChange={e => { setRua(e.target.value); setError(""); }} placeholder="Rua *" required />
              <Input value={bairro} onChange={e => { setBairro(e.target.value); setError(""); }} placeholder="Bairro *" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="data_nascimento" className="flex items-center gap-2"><Cake className="w-4 h-4 text-muted-foreground" />Data de nascimento *</Label>
              <DateInputBr id="data_nascimento" value={dataNascimento} onChange={(iso) => { setDataNascimento(iso); setError(""); }} required />
            </div>

            <SocialConnectGroup searchName={nome} onSocialsChange={setSocials} />

            {error && (
              <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><p>{error}</p>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Users2 className="w-4 h-4 mr-2" />}
              Cadastrar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
