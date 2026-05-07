import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, FileText, Calendar } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

/**
 * Mostra documentos da Memória onde a pessoa foi citada.
 * Busca por nome em pessoas_citadas (jsonb).
 */
export function MencoesNaMemoriaWidget({
  clientId,
  pessoaNome,
}: {
  clientId: string;
  pessoaNome: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["memoria-mencoes-pessoa", clientId, pessoaNome],
    enabled: !!clientId && !!pessoaNome,
    queryFn: async () => {
      // Buscamos documentos recentes e filtramos client-side em pessoas_citadas
      const { data: docs } = await supabase
        .from("ic_knowledge_documents" as any)
        .select("id, titulo, tipo_documento, data_evento, pessoas_citadas")
        .eq("client_id", clientId)
        .eq("status", "concluido")
        .order("data_evento", { ascending: false })
        .limit(80);

      const nomeLower = pessoaNome.trim().toLowerCase();
      const matches = ((docs ?? []) as any[])
        .map((d) => {
          const cit = ((d.pessoas_citadas ?? []) as any[]).find(
            (p) => p?.nome && p.nome.toLowerCase().includes(nomeLower),
          );
          return cit ? { ...d, citacao: cit } : null;
        })
        .filter(Boolean)
        .slice(0, 5);

      return matches as any[];
    },
  });

  if (!clientId || !pessoaNome) return null;
  if (isLoading) return null;
  if (!data || data.length === 0) return null;

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-primary" />
          Citações na memória da campanha
          <Badge variant="secondary" className="ml-auto text-xs">{data.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.map((d) => (
          <div key={d.id} className="text-xs space-y-1 pb-2 border-b last:border-0">
            <div className="flex items-center gap-2 flex-wrap">
              <FileText className="w-3 h-3 text-muted-foreground" />
              <span className="font-medium">{d.titulo}</span>
              {d.citacao?.papel && (
                <Badge variant="outline" className="text-[10px]">{d.citacao.papel}</Badge>
              )}
              {d.data_evento && (
                <span className="text-muted-foreground flex items-center gap-1 ml-auto">
                  <Calendar className="w-2.5 h-2.5" />
                  {format(parseISO(d.data_evento), "dd MMM yy", { locale: ptBR })}
                </span>
              )}
            </div>
            {d.citacao?.contexto && (
              <p className="text-muted-foreground italic pl-5">"{d.citacao.contexto}"</p>
            )}
          </div>
        ))}
        <Link to="/inteligencia-conteudo" className="block">
          <Button variant="ghost" size="sm" className="w-full h-7 text-xs">
            Ver memória completa →
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
