import { useEffect, useState } from "react";
import { useParams, MemoryRouter, Routes, Route } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, AlertCircle, Star, CheckCircle2 } from "lucide-react";
import RegistroContratado from "./RegistroContratado";

type TokenState =
  | { status: "loading" }
  | { status: "valid"; clientId: string; note: string | null }
  | { status: "invalid"; reason: string };

export default function CadastroLiderConvite() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<TokenState>({ status: "loading" });
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setState({ status: "invalid", reason: "Convite não informado." });
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("lider_invite_tokens" as any)
        .select("client_id, expires_at, used_at, note")
        .eq("token", token)
        .maybeSingle();

      if (error || !data) {
        setState({ status: "invalid", reason: "Convite inválido ou inexistente." });
        return;
      }
      const row = data as any;
      if (row.used_at) {
        setState({ status: "invalid", reason: "Este convite já foi utilizado." });
        return;
      }
      if (row.expires_at && new Date(row.expires_at) < new Date()) {
        setState({ status: "invalid", reason: "Este convite expirou. Solicite um novo ao administrador." });
        return;
      }
      setState({ status: "valid", clientId: row.client_id, note: row.note });
    })();
  }, [token]);

  if (state.status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-primary/5 to-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (state.status === "invalid") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-primary/5 to-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-10 pb-10 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
              <AlertCircle className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-bold">Convite indisponível</h2>
            <p className="text-muted-foreground text-sm">{state.reason}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Token válido — renderiza o cadastro de contratado existente, com banner explicativo no topo
  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background">
      <div className="max-w-2xl mx-auto pt-6 px-4">
        <Card className="mb-4 border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
                <Star className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-base">Convite de Líder Contratado</CardTitle>
                <CardDescription className="text-xs">
                  Você foi convidado a se cadastrar como líder. Como líder você terá quota de
                  indicados, link próprio para cadastrar liderados e acesso ao portal de gestão.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          {state.note && (
            <CardContent className="pt-0 pb-3">
              <div className="text-xs flex items-start gap-2 bg-background/60 rounded-md p-2 border border-border/60">
                <CheckCircle2 className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                <span className="text-muted-foreground">Observação do administrador: {state.note}</span>
              </div>
            </CardContent>
          )}
        </Card>
      </div>
      {/* Reaproveita o cadastro de contratado existente passando clientId via URL */}
      <RegistroContratadoWrapper clientId={state.clientId} token={token!} onDone={() => setDone(true)} done={done} />
    </div>
  );
}

/**
 * Renderiza o RegistroContratado padrão. Após o cadastro ser concluído com sucesso, marca
 * o token como usado. Como o RegistroContratado lê o clientId via useParams, montamos
 * o componente dentro de um contexto com a URL correta.
 */
function RegistroContratadoWrapper({
  clientId,
  token,
  onDone,
  done,
}: {
  clientId: string;
  token: string;
  onDone: () => void;
  done: boolean;
}) {
  // Marca o token como usado ao detectar que o cadastro foi concluído.
  // Estratégia simples: observa o DOM em busca da tela de sucesso renderizada por RegistroContratado.
  useEffect(() => {
    if (done) return;
    const interval = setInterval(async () => {
      // Heurística: presença do texto "Cadastro Realizado" na página indica sucesso.
      const successEl = Array.from(document.querySelectorAll("h2, h1")).find((el) =>
        /cadastro realizado/i.test(el.textContent || "")
      );
      if (successEl) {
        clearInterval(interval);
        onDone();
        try {
          await supabase
            .from("lider_invite_tokens" as any)
            .update({ used_at: new Date().toISOString() })
            .eq("token", token);
        } catch (err) {
          console.warn("Falha ao marcar token como usado", err);
        }
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [done, token, onDone]);

  // Truque: injeta o clientId como params via window history para o useParams do RegistroContratado funcionar.
  // Como o wrapper já está dentro de uma rota, basta navegar virtualmente.
  return <RegistroContratadoEmbed clientId={clientId} />;
}

/**
 * Variante embutida de RegistroContratado que aceita clientId como prop em vez de useParams.
 * Como não temos prop drilling no original, fazemos um re-mount por baixo dos panos usando
 * MemoryRouter para isolar o contexto de roteamento.
 */
function RegistroContratadoEmbed({ clientId }: { clientId: string }) {
  return (
    <MemoryRouter initialEntries={[`/contratado/${clientId}`]}>
      <Routes>
        <Route path="/contratado/:clientId" element={<RegistroContratado />} />
      </Routes>
    </MemoryRouter>
  );
}