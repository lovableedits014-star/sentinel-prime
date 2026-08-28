import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  ListChecks,
  Loader2,
  Phone,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import TelemarketingSubNav from "@/components/telemarketing/TelemarketingSubNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useActiveClientId } from "@/hooks/useActiveClientId";
import { supabase } from "@/integrations/supabase/client";

type ConfigSummary = {
  activeOperators: number;
  inactiveOperators: number;
  activeQueues: number;
  lockedOperators: number;
};
const emptySummary: ConfigSummary = {
  activeOperators: 0,
  inactiveOperators: 0,
  activeQueues: 0,
  lockedOperators: 0,
};

export default function TelemarketingAdminConfig() {
  const { clientId, isLoading: loadingClient, needsClientSelection } = useActiveClientId();
  const [summary, setSummary] = useState(emptySummary);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const teleUrl = useMemo(
    () => (clientId ? `${window.location.origin}/telemarketing/${clientId}` : ""),
    [clientId],
  );

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    const now = new Date().toISOString();
    const [active, inactive, queues, locked] = await Promise.all([
      supabase
        .from("telemarketing_operadores")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .eq("ativo", true),
      supabase
        .from("telemarketing_operadores")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .eq("ativo", false),
      supabase
        .from("telemarketing_campanhas")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .eq("ativa", true),
      supabase
        .from("telemarketing_operadores")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .gt("locked_until", now),
    ]);
    const failure = [active, inactive, queues, locked].find((response) => response.error)?.error;
    if (failure) toast.error(`Não foi possível consultar a configuração: ${failure.message}`);
    else
      setSummary({
        activeOperators: active.count || 0,
        inactiveOperators: inactive.count || 0,
        activeQueues: queues.count || 0,
        lockedOperators: locked.count || 0,
      });
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(teleUrl);
      setCopied(true);
      toast.success("Link copiado!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("O navegador não permitiu copiar. Selecione o endereço manualmente.");
    }
  };

  if (loadingClient)
    return (
      <div className="p-6">
        <Loader2 className="mx-auto mt-20 size-8 animate-spin text-primary" />
      </div>
    );

  return (
    <div className="p-4 md:p-6">
      <TelemarketingSubNav />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Configurações do telemarketing</h1>
          <p className="text-sm text-muted-foreground">
            Acesso da operação, segurança e diagnóstico rápido da estrutura ativa.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={!clientId || loading}>
          <RefreshCw className={`mr-2 size-4 ${loading ? "animate-spin" : ""}`} /> Atualizar status
        </Button>
      </div>
      {needsClientSelection && (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            Selecione um cliente para acessar as configurações.
          </CardContent>
        </Card>
      )}
      {clientId && (
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Link de atendimento dos operadores</CardTitle>
              <CardDescription>
                Somente operadores ativos e com credenciais válidas conseguem entrar.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-2">
                <code className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {teleUrl}
                </code>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    onClick={copyLink}
                    title="Copiar link"
                  >
                    {copied ? (
                      <CheckCircle2 className="size-4 text-emerald-500" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    onClick={() => window.open(teleUrl, "_blank", "noopener,noreferrer")}
                    title="Testar link"
                  >
                    <ExternalLink className="size-4" />
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                O identificador do cliente já está incorporado ao endereço. Não altere o final do
                link ao compartilhá-lo.
              </p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["Operadores ativos", summary.activeOperators, Users],
              ["Operadores inativos", summary.inactiveOperators, Users],
              ["Filas ativas", summary.activeQueues, ListChecks],
              ["Acessos bloqueados", summary.lockedOperators, ShieldCheck],
            ].map(([label, value, Icon]) => (
              <Card key={String(label)}>
                <CardContent className="p-4">
                  <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Icon className="size-3.5" />
                    {String(label)}
                  </div>
                  <p className="text-2xl font-bold">{String(value)}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Gestão de acesso</CardTitle>
                <CardDescription>
                  Cadastro, ativação, senhas, bloqueios e auditoria ficam centralizados na aba
                  Operadores.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <Link to="/telemarketing-admin/operadores">
                    <KeyRound className="mr-2 size-4" /> Gerenciar operadores
                  </Link>
                </Button>
                {summary.lockedOperators > 0 && (
                  <Badge variant="destructive" className="ml-2">
                    {summary.lockedOperators} bloqueado(s)
                  </Badge>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Configuração operacional</CardTitle>
                <CardDescription>
                  Crie filas, defina público, prioridades, distribuição e script de atendimento em
                  Filas.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline">
                  <Link to="/telemarketing-admin/filas">
                    <Phone className="mr-2 size-4" /> Configurar filas
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Checklist antes de iniciar a operação</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm md:grid-cols-2">
              {[
                { ok: summary.activeOperators > 0, text: "Existe ao menos um operador ativo" },
                { ok: summary.activeQueues > 0, text: "Existe ao menos uma fila ativa" },
                { ok: summary.lockedOperators === 0, text: "Nenhum operador está bloqueado" },
                { ok: Boolean(teleUrl), text: "Link de atendimento disponível" },
              ].map((item) => (
                <div key={item.text} className="flex items-center gap-2 rounded-lg border p-3">
                  <CheckCircle2
                    className={`size-4 shrink-0 ${item.ok ? "text-emerald-500" : "text-muted-foreground/40"}`}
                  />
                  <span className={item.ok ? "" : "text-muted-foreground"}>{item.text}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
