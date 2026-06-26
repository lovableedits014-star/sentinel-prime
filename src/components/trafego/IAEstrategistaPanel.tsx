import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ThumbsUp, ThumbsDown, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface Props { clientId: string; }

export function IAEstrategistaPanel({ clientId }: Props) {
  const [sugs, setSugs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("ads_ai_suggestions")
      .select("*")
      .eq("client_id", clientId)
      .eq("status", "pendente")
      .order("created_at", { ascending: false });
    setSugs(data || []);
    setLoading(false);
  }

  useEffect(() => { if (clientId) load(); }, [clientId]);

  async function generate() {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("ads-ai-suggestions", { body: { clientId } });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Falha");
      toast.success(`${data.generated} sugestões geradas`);
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGenerating(false);
    }
  }

  async function decide(id: string, status: "aprovada" | "recusada") {
    await supabase.from("ads_ai_suggestions").update({
      status, approved_at: new Date().toISOString(),
    }).eq("id", id);
    toast.success(status === "aprovada" ? "Sugestão aprovada — aplique manualmente no painel" : "Recusada");
    load();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" />IA Estrategista</CardTitle>
          <CardDescription>Sugestões pendentes — nada é executado sem sua aprovação</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={generate} disabled={generating}>
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-1">Gerar novas</span>
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}
        {!loading && sugs.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">Sem sugestões pendentes. Clique em "Gerar novas".</p>
        )}
        {sugs.map(s => (
          <Card key={s.id} className="border-l-4" style={{ borderLeftColor: s.prioridade === "alta" ? "#dc2626" : s.prioridade === "media" ? "#f59e0b" : "#10b981" }}>
            <CardContent className="p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="font-medium text-sm">{s.titulo}</div>
                  <p className="text-xs text-muted-foreground">{s.descricao}</p>
                </div>
                <Badge variant="outline">{s.prioridade}</Badge>
              </div>
              {s.motivo && <p className="text-xs"><strong>Motivo:</strong> {s.motivo}</p>}
              {s.impacto_estimado && <p className="text-xs text-green-700 dark:text-green-400"><strong>Impacto:</strong> {s.impacto_estimado}</p>}
              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={() => decide(s.id, "aprovada")}><ThumbsUp className="h-3 w-3 mr-1" />Aprovar</Button>
                <Button size="sm" variant="outline" onClick={() => decide(s.id, "recusada")}><ThumbsDown className="h-3 w-3 mr-1" />Recusar</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </CardContent>
    </Card>
  );
}
