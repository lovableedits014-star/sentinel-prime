import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, MapPin, FileText, Megaphone, Quote, Calendar } from "lucide-react";

type Props = {
  clientId: string;
  bairro: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const STATUS_META: Record<string, { label: string; className: string }> = {
  aberta: { label: "Aberta", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40" },
  em_andamento: { label: "Em andamento", className: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/40" },
  cumprida: { label: "Cumprida", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40" },
  descumprida: { label: "Descumprida", className: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/40" },
};

export function BairroDetalheDialog({ clientId, bairro, open, onOpenChange }: Props) {
  const enabled = open && !!bairro;

  const { data: documentos, isLoading: loadingDocs } = useQuery({
    queryKey: ["ic-bairro-docs", clientId, bairro],
    enabled,
    queryFn: async () => {
      // bairros_citados pode vir como array de strings OU array de objetos { nome, contexto, tipo_mencao }.
      // Tentamos os dois formatos via .or() com containment JSONB (cs).
      const objMatch = JSON.stringify([{ nome: bairro }]);
      const strMatch = JSON.stringify([bairro]);
      const { data, error } = await supabase
        .from("ic_knowledge_documents" as any)
        .select("id, titulo, tipo_documento, data_evento, created_at, resumo_executivo, pontos_principais, bairros_citados, tom_emocional, local")
        .eq("client_id", clientId)
        .or(`bairros_citados.cs.${objMatch},bairros_citados.cs.${strMatch}`)
        .order("data_evento", { ascending: false, nullsFirst: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: promessas, isLoading: loadingProm } = useQuery({
    queryKey: ["ic-bairro-promessas", clientId, bairro],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ic_promessas" as any)
        .select("id, texto, tipo, status, prazo_texto, prazo_data, beneficiario, created_at")
        .eq("client_id", clientId)
        .eq("bairro", bairro!)
        .in("status", ["aberta", "em_andamento"])
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const falas = (documentos ?? []).flatMap((d) => {
    const pts: any[] = Array.isArray(d.pontos_principais) ? d.pontos_principais : [];
    return pts.slice(0, 2).map((p, idx) => ({
      key: `${d.id}-${idx}`,
      texto: typeof p === "string" ? p : p?.texto || JSON.stringify(p),
      origem: d.titulo,
      data: d.data_evento || d.created_at,
    }));
  }).slice(0, 12);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" />
            {bairro || "Bairro"}
          </DialogTitle>
          <DialogDescription>
            Falas, últimas menções e promessas abertas relacionadas a este bairro.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-3 -mr-3">
          <div className="space-y-6">
            {/* Falas */}
            <section>
              <div className="flex items-center gap-2 mb-2">
                <Quote className="w-3.5 h-3.5 text-muted-foreground" />
                <h4 className="text-sm font-semibold">Falas e pontos principais</h4>
                <Badge variant="secondary" className="text-[10px]">{falas.length}</Badge>
              </div>
              {loadingDocs ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" />Carregando…</div>
              ) : falas.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma fala registrada para este bairro.</p>
              ) : (
                <ul className="space-y-2">
                  {falas.map((f) => (
                    <li key={f.key} className="rounded-md border bg-muted/30 p-2.5">
                      <p className="text-sm leading-snug">"{f.texto}"</p>
                      <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {f.data ? new Date(f.data).toLocaleDateString("pt-BR") : "—"} · {f.origem}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Últimas menções (documentos) */}
            <section>
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                <h4 className="text-sm font-semibold">Últimas menções</h4>
                <Badge variant="secondary" className="text-[10px]">{(documentos ?? []).length}</Badge>
              </div>
              {loadingDocs ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" />Carregando…</div>
              ) : (documentos ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem documentos mencionando este bairro.</p>
              ) : (
                <ul className="space-y-2">
                  {(documentos ?? []).map((d) => (
                    <li key={d.id} className="rounded-md border p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{d.titulo}</p>
                          <p className="text-[11px] text-muted-foreground capitalize">
                            {d.tipo_documento?.replace(/_/g, " ")} · {(d.data_evento || d.created_at) ? new Date(d.data_evento || d.created_at).toLocaleDateString("pt-BR") : "—"}
                            {d.local && <> · {d.local}</>}
                          </p>
                          {d.resumo_executivo && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{d.resumo_executivo}</p>
                          )}
                        </div>
                        {d.tom_emocional && (
                          <Badge variant="outline" className="text-[10px] capitalize shrink-0">{d.tom_emocional}</Badge>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Promessas abertas */}
            <section>
              <div className="flex items-center gap-2 mb-2">
                <Megaphone className="w-3.5 h-3.5 text-muted-foreground" />
                <h4 className="text-sm font-semibold">Promessas abertas</h4>
                <Badge variant="secondary" className="text-[10px]">{(promessas ?? []).length}</Badge>
              </div>
              {loadingProm ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" />Carregando…</div>
              ) : (promessas ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma promessa aberta para este bairro.</p>
              ) : (
                <ul className="space-y-2">
                  {(promessas ?? []).map((p) => {
                    const meta = STATUS_META[p.status] || STATUS_META.aberta;
                    return (
                      <li key={p.id} className="rounded-md border p-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm leading-snug flex-1">{p.texto}</p>
                          <Badge variant="outline" className={`${meta.className} text-[10px] shrink-0`}>{meta.label}</Badge>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1 flex flex-wrap gap-x-2">
                          {p.tipo && <span className="capitalize">{p.tipo}</span>}
                          {p.beneficiario && <span>· {p.beneficiario}</span>}
                          {(p.prazo_texto || p.prazo_data) && (
                            <span>· prazo: {p.prazo_data ? new Date(p.prazo_data).toLocaleDateString("pt-BR") : p.prazo_texto}</span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
