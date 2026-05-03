import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { Lightbulb, Loader2, MapPin, Users, X, Check, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useCurrentClientId } from "@/hooks/ic/useCurrentClientId";

export function SugestoesPanel() {
  const { data: clientId } = useCurrentClientId();
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["disparo-sugestoes", clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from("disparo_sugestoes" as any)
        .select("*")
        .eq("client_id", clientId)
        .eq("status", "pendente")
        .order("score", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!clientId,
    staleTime: 60_000,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, mensagem }: { id: string; status: string; mensagem?: string }) => {
      const patch: any = { status };
      if (mensagem) patch.mensagem_sugerida = mensagem;
      const { error } = await supabase.from("disparo_sugestoes" as any).update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["disparo-sugestoes", clientId] });
      setEditingId(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!clientId) return null;

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-primary" />
          Sugestões inteligentes de disparo
          {data && data.length > 0 && <Badge variant="secondary">{data.length}</Badge>}
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Quando o candidato fala sobre um bairro ou tema em uma transcrição/post, a IA cruza com a base de apoiadores
          e sugere automaticamente um disparo segmentado. Você revisa, edita e aprova.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
          </div>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground p-4 text-center">
            Nenhuma sugestão pendente. Suba uma transcrição em Inteligência de Conteúdo que mencione bairros para ver sugestões aparecerem aqui.
          </p>
        ) : (
          <div className="space-y-3">
            {data.map((s) => (
              <div key={s.id} className="border rounded-lg p-3 bg-background space-y-2">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    {s.bairro && (
                      <Badge variant="secondary" className="gap-1">
                        <MapPin className="w-3 h-3" /> {s.bairro}
                      </Badge>
                    )}
                    {s.tema && <Badge variant="outline">{s.tema}</Badge>}
                    <Badge variant="secondary" className="gap-1">
                      <Users className="w-3 h-3" /> {s.total_estimado} apoiador{s.total_estimado === 1 ? "" : "es"}
                    </Badge>
                    <Badge className="bg-primary/15 text-primary">Score {s.score}</Badge>
                  </div>
                  {s.fonte_url && (
                    <a href={s.fonte_url} target="_blank" rel="noreferrer" className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1">
                      Fonte <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>

                <p className="text-sm font-medium">{s.titulo}</p>

                {editingId === s.id ? (
                  <Textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={4}
                    className="text-sm"
                  />
                ) : (
                  <div className="text-sm bg-muted/40 rounded p-2 whitespace-pre-wrap leading-snug">
                    {s.mensagem_sugerida}
                  </div>
                )}

                <p className="text-[11px] text-muted-foreground">
                  Variáveis: <code>[primeiro_nome]</code>, <code>[bairro]</code> são substituídas no envio.
                </p>

                <div className="flex flex-wrap gap-2 pt-1">
                  {editingId === s.id ? (
                    <>
                      <Button size="sm" onClick={() => updateStatus.mutate({ id: s.id, status: "pendente", mensagem: editText })}>
                        Salvar texto
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancelar</Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        onClick={() => {
                          updateStatus.mutate({ id: s.id, status: "aprovado" });
                          toast.success("Sugestão aprovada — finalize a configuração na aba Disparos");
                        }}
                      >
                        <Check className="w-3.5 h-3.5 mr-1" /> Aprovar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setEditingId(s.id); setEditText(s.mensagem_sugerida); }}>
                        Editar texto
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => updateStatus.mutate({ id: s.id, status: "descartado" })}>
                        <X className="w-3.5 h-3.5 mr-1" /> Descartar
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
