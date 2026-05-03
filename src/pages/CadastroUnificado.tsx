import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Heart, Briefcase, ArrowLeft } from "lucide-react";
import SupporterRegister from "./SupporterRegister";
import RegistroFuncionario from "./RegistroFuncionario";
import RegistroPessoa from "./RegistroPessoa";

type Papel = "apoiador" | "funcionario" | "campo" | null;

export default function CadastroUnificado() {
  const { clientId } = useParams<{ clientId: string }>();
  const [searchParams] = useSearchParams();

  // Permite pré-seleção via querystring (?papel=funcionario) — usado pelos redirects das rotas antigas
  const initialPapel = (searchParams.get("papel") as Papel) || null;
  const initialModo = searchParams.get("modo");

  const [papel, setPapel] = useState<Papel>(
    initialPapel === "funcionario" ? "funcionario"
    : initialModo === "detalhado" ? "campo"
    : initialPapel === "apoiador" ? "apoiador"
    : null
  );

  // Após escolher, renderiza a página correta (que já é completa e auto-contida)
  if (papel === "apoiador") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background">
        <div className="max-w-md mx-auto pt-4 px-4">
          <Button variant="ghost" size="sm" onClick={() => setPapel(null)} className="mb-2">
            <ArrowLeft className="w-4 h-4 mr-1" /> Trocar tipo de cadastro
          </Button>
        </div>
        <SupporterRegister />
      </div>
    );
  }

  if (papel === "funcionario") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background">
        <div className="max-w-md mx-auto pt-4 px-4">
          <Button variant="ghost" size="sm" onClick={() => setPapel(null)} className="mb-2">
            <ArrowLeft className="w-4 h-4 mr-1" /> Trocar tipo de cadastro
          </Button>
        </div>
        <RegistroFuncionario />
      </div>
    );
  }

  if (papel === "campo") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background">
        <div className="max-w-2xl mx-auto pt-4 px-4">
          <Button variant="ghost" size="sm" onClick={() => setPapel(null)} className="mb-2">
            <ArrowLeft className="w-4 h-4 mr-1" /> Trocar tipo de cadastro
          </Button>
        </div>
        <RegistroPessoa />
      </div>
    );
  }

  // Tela inicial: seletor de papel
  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-2xl">Junte-se à campanha</CardTitle>
          <CardDescription className="text-base">
            Escolha como você quer participar
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setPapel("apoiador")}
              className="group text-left p-6 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all"
            >
              <div className="w-12 h-12 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Heart className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-lg mb-1">Apoiador</h3>
              <p className="text-sm text-muted-foreground">
                Engaje-se nas redes sociais, participe de missões e indique amigos.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setPapel("funcionario")}
              className="group text-left p-6 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all"
            >
              <div className="w-12 h-12 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Briefcase className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-lg mb-1">Funcionário</h3>
              <p className="text-sm text-muted-foreground">
                Equipe oficial — check-in diário, missões e link para indicar apoiadores.
              </p>
            </button>
          </div>

          <p className="text-xs text-center text-muted-foreground pt-2">
            É <strong>líder contratado</strong>? Esse cadastro é feito apenas por convite do administrador.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}