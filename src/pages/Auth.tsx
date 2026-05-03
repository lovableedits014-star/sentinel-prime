import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Eye, EyeOff, Shield, Loader2, MessageCircle } from "lucide-react";

const Auth = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loginData, setLoginData] = useState({ email: "", password: "" });
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [activeTab, setActiveTab] = useState<"login" | "forgot">("login");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginData.email,
        password: loginData.password,
      });
      if (error) throw error;
      toast.success("Login realizado com sucesso!");
      navigate("/dashboard");
    } catch (error: any) {
      toast.error(error.message || "Erro ao fazer login");
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setForgotSent(true);
    } catch (error: any) {
      toast.error(error.message || "Erro ao enviar e-mail");
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full px-4 py-1.5 text-xs font-semibold tracking-wide uppercase">
            <Shield className="w-3.5 h-3.5" />
            Área Restrita — Administradores
          </span>
        </div>

        <Card className="w-full shadow-2xl border-slate-700 bg-slate-800/80 backdrop-blur-sm text-slate-100">
          <CardHeader className="space-y-2 text-center">
            <img src="/sentinelle-logo.png" alt="Sentinelle" className="mx-auto h-60 w-auto object-contain mb-2 drop-shadow-[0_0_32px_rgba(59,130,246,0.45)]" />
            <CardDescription className="text-slate-400">
              Painel de gerenciamento — acesso exclusivo para administradores
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-slate-700">
                <TabsTrigger value="login" className="data-[state=active]:bg-slate-600 data-[state=active]:text-white text-slate-400">
                  Login
                </TabsTrigger>
                <TabsTrigger value="forgot" className="data-[state=active]:bg-slate-600 data-[state=active]:text-white text-slate-400">
                  Esqueci a senha
                </TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email" className="text-slate-300">E-mail</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={loginData.email}
                      onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                      required
                      className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password" className="text-slate-300">Senha</Label>
                    <div className="relative">
                      <Input
                        id="login-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={loginData.password}
                        onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                        required
                        className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <Button type="submit" className="w-full bg-amber-500 hover:bg-amber-600 text-white" disabled={isLoading}>
                    {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    {isLoading ? "Entrando..." : "Entrar no Painel"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="forgot">
                <div className="mt-4">
                  {forgotSent ? (
                    <div className="text-center py-6 space-y-3">
                      <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
                        <Shield className="w-6 h-6 text-emerald-400" />
                      </div>
                      <p className="text-white font-medium">E-mail enviado!</p>
                      <p className="text-slate-400 text-sm">
                        Verifique sua caixa de entrada e clique no link para redefinir sua senha.
                      </p>
                      <Button
                        variant="outline"
                        className="mt-2 border-slate-600 text-slate-300"
                        onClick={() => { setForgotSent(false); setActiveTab("login"); }}
                      >
                        Voltar ao login
                      </Button>
                    </div>
                  ) : (
                    <form onSubmit={handleForgotPassword} className="space-y-4">
                      <p className="text-slate-400 text-sm">
                        Informe seu e-mail e enviaremos um link para redefinir sua senha.
                      </p>
                      <div className="space-y-2">
                        <Label htmlFor="forgot-email" className="text-slate-300">E-mail</Label>
                        <Input
                          id="forgot-email"
                          type="email"
                          placeholder="seu@email.com"
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          required
                          className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
                        />
                      </div>
                      <Button type="submit" className="w-full bg-amber-500 hover:bg-amber-600 text-white" disabled={forgotLoading}>
                        {forgotLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        {forgotLoading ? "Enviando..." : "Enviar link de recuperação"}
                      </Button>
                    </form>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-500">
          Não tem conta?{" "}
          <span className="text-slate-400">Use o link de convite enviado pelo administrador da plataforma.</span>
        </p>
        <p className="text-center text-xs text-slate-500">
          Apoiador? Use o link específico do portal que recebeu do seu coordenador
        </p>

        {/* WhatsApp CTA */}
        <div className="mt-2 rounded-xl border border-green-500/30 bg-green-500/10 p-4 text-center space-y-3">
          <p className="text-green-300 text-sm font-semibold">
            🚀 Ainda não usa o Sentinelle?
          </p>
          <p className="text-slate-400 text-xs leading-relaxed">
            Agende uma demonstração gratuita e veja como transformar sua gestão digital em vantagem política.
          </p>
          <a
            href="https://wa.me/5567992773931?text=Ol%C3%A1!%20Vi%20o%20Sentinelle%20e%20quero%20saber%20mais%20sobre%20a%20plataforma.%20Pode%20me%20explicar%20como%20funciona%3F"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-4 rounded-lg transition-all duration-200 hover:scale-[1.02] shadow-lg shadow-green-600/30 text-sm"
          >
            <MessageCircle className="w-4 h-4" />
            Agendar demonstração pelo WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
};

export default Auth;
