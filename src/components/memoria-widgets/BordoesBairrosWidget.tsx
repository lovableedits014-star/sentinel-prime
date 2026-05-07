import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, Quote, MapPin, AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

/**
 * Widget compacto que mostra:
 * - Top 3 bordões da campanha (tom/voz oficial)
 * - 3 promessas em aberto que podem ser mencionadas
 * Usado em Comments / Disparos para manter voz consistente.
 */
export function BordoesBairrosWidget({
  clientId,
  contexto = "Use os bordões da campanha para manter a voz consistente.",
}: {
  clientId: string;
  contexto?: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["memoria-bordoes-widget", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const [docsRes, promRes] = await Promise.all([
        supabase
          .from("ic_knowledge_documents" as any)
          .select("bordoes")
          .eq("client_id", clientId)
          .eq("status", "concluido")
          .order("data_evento", { ascending: false })
          .limit(20),
        supabase
          .from("ic_promessas" as any)
          .select("id, texto, bairro, prazo_data, status")
          .eq("client_id", clientId)
          .in("status", ["aberta", "em_andamento"])
          .order("prazo_data", { ascending: true, nullsFirst: false })
          .limit(3),
      ]);

      const counter = new Map<string, number>();
      ((docsRes.data ?? []) as any[]).forEach((d) => {
        ((d.bordoes ?? []) as any[]).forEach((b) => {
          if (!b?.frase) return;
          counter.set(b.frase, (counter.get(b.frase) ?? 0) + (b.ocorrencias ?? 1));
        });
      });
      const topBordoes = Array.from(counter.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([frase, n]) => ({ frase, n }));

      return { topBordoes, promessas: (promRes.data ?? []) as any[] };
    },
  });

  if (!clientId) return null;
  if (isLoading) return null;
  if (!data?.topBordoes.length && !data?.promessas.length) return null;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" />
          Memória da campanha
        </CardTitle>
        <p className="text-xs text-muted-foreground">{contexto}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.topBordoes.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
              <Quote className="w-3 h-3" /> Bordões mais usados
            </div>
            <div className="flex flex-wrap gap-1.5">
              {data.topBordoes.map((b) => (
                <Badge key={b.frase} variant="secondary" className="text-[11px]">
                  "{b.frase.length > 60 ? b.frase.slice(0, 57) + "…" : b.frase}"
                  <span className="ml-1 opacity-60">×{b.n}</span>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {data.promessas.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-medium flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
              <AlertCircle className="w-3 h-3" /> Promessas em aberto
            </div>
            <ul className="space-y-1">
              {data.promessas.map((p) => (
                <li key={p.id} className="text-xs flex items-start gap-1.5">
                  <span className="text-muted-foreground">•</span>
                  <span className="flex-1">
                    {p.texto.length > 80 ? p.texto.slice(0, 77) + "…" : p.texto}
                    {p.bairro && (
                      <span className="ml-1 text-muted-foreground inline-flex items-center gap-0.5">
                        <MapPin className="w-2.5 h-2.5" />
                        {p.bairro}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Link to="/inteligencia-conteudo" className="block">
          <Button variant="ghost" size="sm" className="w-full h-7 text-xs">
            Ver Memória completa →
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
