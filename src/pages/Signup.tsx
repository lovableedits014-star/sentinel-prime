import { useState, useEffect } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Shield, Loader2, CheckCircle2, XCircle } from "lucide-react";

export default function Signup() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenData, setTokenData] = useState<{ note: string | null } | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    validateToken();
  }, [token]);

  const validateToken = async () => {
    if (!token) { setValidating(false); return; }
    const { data, error } = await supabase
      .from("invite_tokens" as any)
      .select("note, expires_at, used_by")
      .eq("token", token)
      .maybeSingle();

    if (error || !data) {
      setTokenValid(false);
    } else if ((data as any).used_by) {
      setTokenValid(false);
    } else if (new Date((data as any).expires_at) < new Date()) {
      setTokenValid(false);
    } else {
      setTokenValid(true);
      setTokenData({ note: (data as any).note });
    }
    setValidating(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) { toast.error("Informe seu nome completo"); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      });
      if (error) throw error;

      // Mark invite as used
      if (data.user) {
        await supabase
          .from("invite_tokens" as any)
          .update({ used_by: data.user.id, used_at: new Date().toISOString() } as any)
          .eq("token", token!);
      }

      toast.success("Conta criada! Verifique seu e-mail para confirmar.");
      navigate("/auth");
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar conta");
    } finally {
      setLoading(false);
    }
  };

  if (validating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!tokenValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <Card className="w-full max-w-md bg-slate-800/80 border-slate-700 text-slate-100">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <XCircle className="w-14 h-14 text-destructive mx-auto" />
            <h2 className="text-xl font-bold text-white">Convite inválido</h2>
            <p className="text-slate-400 text-sm">
              Este link de convite não é válido, já foi utilizado ou expirou.
            </p>
            <p className="text-slate-500 text-xs">
              Entre em contato com o administrador da plataforma para receber um novo convite.
            </p>
            <Link to="/auth">
              <Button variant="outline" className="mt-2 border-slate-600 text-slate-300">
                Ir para o Login
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full px-4 py-1.5 text-xs font-semibold tracking-wide uppercase">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Convite válido
          </span>
        </div>

        <Card className="shadow-2xl border-slate-700 bg-slate-800/80 backdrop-blur-sm text-slate-100">
          <CardHeader className="space-y-2 text-center">
            <img src="/sentinelle-logo.png" alt="Sentinelle" className="mx-auto w-20 h-20 object-contain mb-2 drop-shadow-[0_0_24px_rgba(59,130,246,0.4)]" />
            <CardTitle className="text-2xl text-white">Criar sua conta</CardTitle>
            <CardDescription className="text-slate-400">
              {tokenData?.note
                ? `Convite: ${tokenData.note}`
                : "Você foi convidado para acessar o Sentinelle Admin"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignup} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-slate-300">Nome Completo</Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="Seu nome completo"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-300">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-300">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Mínimo 8 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                  className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                disabled={loading}
              >
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {loading ? "Criando conta..." : "Criar minha conta"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-500">
          Já tem uma conta?{" "}
          <Link to="/auth" className="text-slate-400 hover:text-slate-200 underline">
            Fazer login
          </Link>
        </p>
      </div>
    </div>
  );
}
