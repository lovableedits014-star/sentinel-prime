import { useEffect, useState } from "react";
import { Loader2, Plus, Phone, ExternalLink, Copy, Power, Trash2, FlaskConical, ShieldAlert, ListChecks } from "lucide-react";
import TelemarketingSubNav from "@/components/telemarketing/TelemarketingSubNav";
import { useActiveClientId } from "@/hooks/useActiveClientId";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import NovaFilaWizard from "@/components/telemarketing/NovaFilaWizard";
import OperadoresAoVivoCard from "@/components/telemarketing/OperadoresAoVivoCard";

interface FilaResumo {
  campanha_id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  created_at: string;
  total: number;
  ligados: number;
  pendentes: number;
  confirmados: number;
}

export default function TelemarketingAdminFilas() {
  const { clientId, isLoading: ctxLoading, needsClientSelection } = useActiveClientId();
  const [filas, setFilas] = useState<FilaResumo[]>([]);
  const [loading, setLoading] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  const load = async () => {
    if (!clientId) return;
    setLoading(true);
    const { data, error } = await supabase.rpc("tele_fila_summary" as any, { _client_id: clientId });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setFilas(((data as any[]) || []).map(r => ({
      campanha_id: r.campanha_id, nome: r.nome, descricao: r.descricao, ativo: r.ativo,
      created_at: r.created_at, total: Number(r.total || 0), ligados: Number(r.ligados || 0),
      pendentes: Number(r.pendentes || 0), confirmados: Number(r.confirmados || 0),
    })));
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [clientId]);

  const linkOperador = (campanhaId: string) =>
    `${window.location.origin}/telemarketing/${clientId}?campanha=${campanhaId}`;

  const abrirComoTeste = async (campanhaId: string) => {
    if (!clientId) return;
    const { data, error } = await supabase.rpc("tele_ensure_test_operador" as any, { _client_id: clientId });
    if (error) { toast.error(error.message); return; }
    const creds = data as { nome: string; senha: string };
    const url = `${linkOperador(campanhaId)}&nome=${encodeURIComponent(creds.nome)}&senha=${encodeURIComponent(creds.senha)}&auto=1`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const copiarLink = async (campanhaId: string) => {
    await navigator.clipboard.writeText(linkOperador(campanhaId));
    toast.success("Link copiado");
  };

  const toggleAtivo = async (f: FilaResumo) => {
    await supabase.from("telemarketing_campanhas" as any).update({ ativo: !f.ativo }).eq("id", f.campanha_id);
    load();
  };

  const remover = async (f: FilaResumo) => {
    if (!confirm(`Remover a fila "${f.nome}"? Os contatos ficam, mas perdem o vínculo com esta fila.`)) return;
    const { error } = await supabase.from("telemarketing_campanhas" as any).delete().eq("id", f.campanha_id);
    if (error) { toast.error(error.message); return; }
    toast.success("Fila removida");
    load();
  };

  return (
    <div className="p-4 md:p-6">
      <TelemarketingSubNav />

      <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ListChecks className="w-6 h-6" /> Filas de ligação</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Cada fila é uma lista de contatos que o operador vai chamar. Crie uma fila, escolha de onde vêm os nomes (CSV, estrutura, indicados…) e compartilhe o link com o operador. O botão <strong>Testar fila</strong> abre o portal já logado para você validar em segundos.
          </p>
        </div>
        <Button onClick={() => setWizardOpen(true)} size="lg" disabled={!clientId}>
          <Plus className="w-4 h-4 mr-1" /> Nova fila
        </Button>
      </div>

      {ctxLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Carregando contexto…</div>
      )}
      {!ctxLoading && needsClientSelection && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-4 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-900 dark:text-amber-200">Selecione um cliente para gerenciar filas.</p>
        </div>
      )}

      {clientId && (
        <>
          {loading && <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}
          {!loading && filas.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center space-y-2">
                <Phone className="w-10 h-10 mx-auto opacity-30" />
                <p className="text-sm text-muted-foreground">Nenhuma fila criada ainda.</p>
                <Button onClick={() => setWizardOpen(true)}><Plus className="w-4 h-4 mr-1" /> Criar primeira fila</Button>
              </CardContent>
            </Card>
          )}
          <div className="grid md:grid-cols-2 gap-3">
            {filas.map(f => {
              const pct = f.total > 0 ? Math.round((f.ligados / f.total) * 100) : 0;
              return (
                <Card key={f.campanha_id} className={f.ativo ? "" : "opacity-60"}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold truncate">{f.nome}</h3>
                          <Badge variant={f.ativo ? "default" : "secondary"} className="text-[10px]">
                            {f.ativo ? "Ativa" : "Pausada"}
                          </Badge>
                        </div>
                        {f.descricao && <p className="text-xs text-muted-foreground truncate">{f.descricao}</p>}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button size="sm" variant="ghost" onClick={() => toggleAtivo(f)} title={f.ativo ? "Pausar" : "Ativar"}>
                          <Power className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => remover(f)} title="Remover">
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                        <span>{f.ligados} de {f.total} ligados · {f.confirmados} confirmados</span>
                        <span>{pct}%</span>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                    </div>

                    <div className="flex gap-2 flex-wrap pt-1">
                      <Button size="sm" variant="default" onClick={() => abrirComoTeste(f.campanha_id)}>
                        <FlaskConical className="w-3.5 h-3.5 mr-1" /> Testar fila
                      </Button>
                      <Button size="sm" variant="outline" asChild>
                        <a href={linkOperador(f.campanha_id)} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-3.5 h-3.5 mr-1" /> Abrir
                        </a>
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => copiarLink(f.campanha_id)}>
                        <Copy className="w-3.5 h-3.5 mr-1" /> Copiar link
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {clientId && (
        <NovaFilaWizard
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          clientId={clientId}
          onCreated={() => load()}
        />
      )}
    </div>
  );
}
