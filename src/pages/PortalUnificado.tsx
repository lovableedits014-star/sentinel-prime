import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import InstallAppFab from "@/components/portal/InstallAppFab";
import { rememberPortalClientId } from "@/lib/pwa-client";

interface Roles {
  isFuncionario: boolean;
  isContratado: boolean;
  isApoiador: boolean;
}

export default function PortalUnificado() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");

  const [clientName, setClientName] = useState("");
  const [clientLogo, setClientLogo] = useState<string | null>(null);
  const [roles, setRoles] = useState<Roles | null>(null);
  const [detecting, setDetecting] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    rememberPortalClientId(clientId);
    supabase.from("clients").select("name, logo_url").eq("id", clientId).maybeSingle()
      .then(({ data }) => { if (data) { setClientName(data.name); setClientLogo(data.logo_url); } });
  }, [clientId]);

  useEffect(() => {
    supabase.auth.onAuthStateChange((_e, s) => { setSession(s); setLoading(false); });
    supabase.auth.getSession().then(({ data: { session: s } }) => { setSession(s); setLoading(false); });
  }, []);

  useEffect(() => {
    if (session && clientId) detectRoles();
  }, [session, clientId]);

  const detectRoles = async () => {
    if (!session || !clientId) return;
    setDetecting(true);
    try {
      const [funcRes, contRes, accRes] = await Promise.all([
        supabase.from("funcionarios").select("id").eq("client_id", clientId).eq("user_id", session.user.id).maybeSingle(),
        supabase.from("contratados").select("id").eq("client_id", clientId).eq("user_id", session.user.id).maybeSingle(),
        supabase.from("supporter_accounts").select("id").eq("client_id", clientId).eq("user_id", session.user.id).maybeSingle(),
      ]);
      const r: Roles = {
        isFuncionario: !!funcRes.data,
        isContratado: !!contRes.data,
        isApoiador: !!accRes.data,
      };
      setRoles(r);

      // Hierarquia: Funcionário > Líder > Apoiador. Cargo maior predomina.
      if (r.isFuncionario) navigate(`/portal-funcionario/${clientId}`, { replace: true });
      else if (r.isContratado) navigate(`/portal-contratado/${clientId}`, { replace: true });
      else navigate(`/portal-apoiador/${clientId}`, { replace: true });
    } finally {
      setDetecting(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (err: any) { toast.error(err.message || "Erro ao entrar"); }
    finally { setAuthLoading(false); }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error("Informe seu nome"); return; }
    setAuthLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: name } },
      });
      if (error) throw error;
      toast.success("Conta criada!");
    } catch (err: any) { toast.error(err.message || "Erro ao criar conta"); }
    finally { setAuthLoading(false); }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  // ─── AUTH SCREEN ─────────────────────────────────────────────────────
  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary/10 via-background to-background flex flex-col items-center justify-center p-4">
        <InstallAppFab />
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto shadow-lg overflow-hidden bg-primary">
              {clientLogo ? <img src={clientLogo} alt="Logo" className="w-full h-full object-cover" /> : <Shield className="w-8 h-8 text-primary-foreground" />}
            </div>
            {clientName && <h1 className="text-2xl font-bold">{clientName}</h1>}
            <p className="text-sm text-muted-foreground font-medium">Portal de Acesso</p>
          </div>
          <Card className="shadow-xl">
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 gap-2 mb-4">
                <Button variant={mode === "login" ? "default" : "ghost"} size="sm" onClick={() => setMode("login")}>Entrar</Button>
                <Button variant={mode === "register" ? "default" : "ghost"} size="sm" onClick={() => setMode("register")}>Cadastrar</Button>
              </div>
              <form onSubmit={mode === "login" ? handleLogin : handleRegister} className="space-y-4">
                {mode === "register" && (
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome completo</Label>
                    <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="João da Silva" required />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <div className="relative">
                    <Input id="password" type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" minLength={6} required />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={authLoading}>
                  {authLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  {mode === "login" ? "Entrar" : "Criar conta"}
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  {mode === "login"
                    ? "Use o e-mail e senha que você definiu no cadastro."
                    : "Ao se cadastrar você entra como apoiador ativo."}
                </p>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ─── DETECTING ROLES ──────────────────────────────────────────────────
  // Always redirecting after detection — show loader
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Abrindo seu portal...</p>
    </div>
  );
}
