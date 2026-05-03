import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Brain, Trash2, ExternalLink, Loader2, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";

const TIPO_LABEL: Record<string, { label: string; color: string }> = {
  promessa: { label: "Promessa", color: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  proposta: { label: "Proposta", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  bandeira: { label: "Bandeira", color: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  bairro: { label: "Bairro", color: "bg-purple-500/15 text-purple-700 dark:text-purple-300" },
  pessoa: { label: "Pessoa", color: "bg-pink-500/15 text-pink-700 dark:text-pink-300" },
  adversario: { label: "Adversário", color: "bg-red-500/15 text-red-700 dark:text-red-300" },
  historia: { label: "História", color: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300" },
  bordao: { label: "Bordão", color: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300" },
  numero: { label: "Número", color: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300" },
  evento: { label: "Evento", color: "bg-orange-500/15 text-orange-700 dark:text-orange-300" },
  dado: { label: "Dado", color: "bg-slate-500/15 text-slate-700 dark:text-slate-300" },
  outro: { label: "Outro", color: "bg-muted text-muted-foreground" },
};

const SOURCE_LABEL: Record<string, string> = {
  transcription: "Transcrição",
  post: "Post",
  comment: "Comentário",
  manual: "Manual",
};

export function MemoriaPanel({ clientId }: { clientId: string | null | undefined }) {
  const qc = useQueryClient();
  const [tipoFilter, setTipoFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["candidate-knowledge", clientId, tipoFilter],
    queryFn: async () => {
      if (!clientId) return [];
      let q = supabase
        .from("candidate_knowledge" as any)
        .select("id, tipo, tema, texto, contexto, entidades, source_type, source_url, source_date, confidence, created_at, aprovado")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (tipoFilter !== "all") q = q.eq("tipo", tipoFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!clientId,
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    const list = data ?? [];
    if (!search.trim()) return list;
    const s = search.toLowerCase();
    return list.filter(
      (r) =>
        r.texto?.toLowerCase().includes(s) ||
        r.tema?.toLowerCase().includes(s) ||
        JSON.stringify(r.entidades || {}).toLowerCase().includes(s),
    );
  }, [data, search]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    (data ?? []).forEach((r) => (m[r.tipo] = (m[r.tipo] || 0) + 1));
    return m;
  }, [data]);

  const totalCount = data?.length ?? 0;

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("candidate_knowledge" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["candidate-knowledge", clientId] });
      toast.success("Fato removido");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!clientId) {
    return <Card><CardContent className="p-6 text-sm text-muted-foreground">Selecione um cliente.</CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <Card className="bg-gradient-to-br from-primary/5 to-transparent border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary" />
            Memória viva do candidato
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Tudo que o candidato já disse em transcrições, posts e comentários — extraído e organizado pela IA.
            Esses fatos alimentam o DNA, as respostas a comentários, sugestões de disparo e o redator de matérias.
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="secondary">{totalCount} fatos no total</Badge>
            {Object.entries(counts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 6)
              .map(([tipo, n]) => (
                <Badge key={tipo} className={TIPO_LABEL[tipo]?.color || ""}>
                  {TIPO_LABEL[tipo]?.label || tipo}: {n}
                </Badge>
              ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por texto, tema ou bairro..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={tipoFilter} onValueChange={setTipoFilter}>
          <SelectTrigger className="sm:w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {Object.entries(TIPO_LABEL).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
          <Loader2 className="w-4 h-4 animate-spin" />
          Carregando fatos...
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground space-y-2">
            <Sparkles className="w-8 h-8 mx-auto text-muted-foreground/50" />
            <p>Ainda não há fatos extraídos.</p>
            <p className="text-xs">
              Suba uma transcrição na aba <strong>Transcrição</strong> ou sincronize seus posts —
              a IA extrai automaticamente promessas, propostas, bairros citados e bordões.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((f) => {
            const meta = TIPO_LABEL[f.tipo] || TIPO_LABEL.outro;
            const bairros: string[] = Array.isArray(f.entidades?.bairros) ? f.entidades.bairros : [];
            const pessoas: string[] = Array.isArray(f.entidades?.pessoas) ? f.entidades.pessoas : [];
            return (
              <Card key={f.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={meta.color}>{meta.label}</Badge>
                      {f.tema && <Badge variant="outline" className="text-xs">{f.tema}</Badge>}
                      <Badge variant="outline" className="text-xs">
                        {SOURCE_LABEL[f.source_type] || f.source_type}
                      </Badge>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => del.mutate(f.id)}
                      title="Remover"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  <p className="text-sm leading-snug">{f.texto}</p>

                  {(bairros.length > 0 || pessoas.length > 0) && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {bairros.map((b) => (
                        <Badge key={`b-${b}`} variant="secondary" className="text-[10px]">📍 {b}</Badge>
                      ))}
                      {pessoas.slice(0, 3).map((p) => (
                        <Badge key={`p-${p}`} variant="secondary" className="text-[10px]">👤 {p}</Badge>
                      ))}
                    </div>
                  )}

                  {f.contexto && (
                    <details className="text-[11px] text-muted-foreground">
                      <summary className="cursor-pointer hover:text-foreground">Ver contexto original</summary>
                      <p className="mt-1 italic border-l-2 border-muted pl-2">{f.contexto}</p>
                    </details>
                  )}

                  <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1">
                    <span>{new Date(f.created_at).toLocaleDateString("pt-BR")}</span>
                    {f.source_url && (
                      <a href={f.source_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-primary">
                        Fonte <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
