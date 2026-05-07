import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, MapPin, AlertTriangle, Search, ChevronRight } from "lucide-react";
import { BairroDetalheDialog } from "./BairroDetalheDialog";

const ALERT_META: Record<string, { label: string; color: string }> = {
  silenciado: { label: "Silenciado", color: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/40" },
  atencao:    { label: "Atenção",    color: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40" },
  ok:         { label: "Em dia",     color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40" },
};

export function CoberturaPanel({ clientId }: { clientId: string }) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"silencio" | "falas" | "promessas">("silencio");
  const [selectedBairro, setSelectedBairro] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["ic-cobertura", clientId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_cobertura_territorial" as any, { p_client_id: clientId });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const filtered = useMemo(() => {
    let l = data ?? [];
    if (search.trim()) {
      const s = search.toLowerCase();
      l = l.filter((r) => r.bairro?.toLowerCase().includes(s));
    }
    return [...l].sort((a, b) => {
      if (sortBy === "silencio") return (b.dias_silencio ?? 0) - (a.dias_silencio ?? 0);
      if (sortBy === "falas") return (b.n_falas ?? 0) - (a.n_falas ?? 0);
      return (b.n_promessas_abertas ?? 0) - (a.n_promessas_abertas ?? 0);
    });
  }, [data, search, sortBy]);

  const stats = useMemo(() => {
    const all = data ?? [];
    return {
      total: all.length,
      silenciados: all.filter((r: any) => r.nivel_alerta === "silenciado").length,
      atencao: all.filter((r: any) => r.nivel_alerta === "atencao").length,
      promessasAbertas: all.reduce((s: number, r: any) => s + (Number(r.n_promessas_abertas) || 0), 0),
    };
  }, [data]);

  if (isLoading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground p-6"><Loader2 className="w-4 h-4 animate-spin" />Carregando cobertura...</div>;
  }

  if ((data ?? []).length === 0) {
    return (
      <Card><CardContent className="p-8 text-center text-sm text-muted-foreground space-y-2">
        <MapPin className="w-8 h-8 mx-auto text-muted-foreground/50" />
        <p>Nenhum bairro mapeado ainda.</p>
        <p className="text-xs">Conforme você sobe transcrições, os bairros mencionados pelo candidato aparecem aqui com o tempo desde a última visita ou menção.</p>
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Bairros mapeados</div><div className="text-2xl font-bold">{stats.total}</div></CardContent></Card>
        <Card className={stats.silenciados > 0 ? "border-red-500/40 bg-red-500/5" : ""}><CardContent className="p-3"><div className="text-xs text-muted-foreground">Silenciados (60+ dias)</div><div className="text-2xl font-bold text-red-600">{stats.silenciados}</div></CardContent></Card>
        <Card className={stats.atencao > 0 ? "border-amber-500/40 bg-amber-500/5" : ""}><CardContent className="p-3"><div className="text-xs text-muted-foreground">Em atenção (30+ dias)</div><div className="text-2xl font-bold text-amber-600">{stats.atencao}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Promessas abertas</div><div className="text-2xl font-bold">{stats.promessasAbertas}</div></CardContent></Card>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar bairro..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} className="text-sm border rounded-md px-2 h-9 bg-background">
          <option value="silencio">Mais silenciados primeiro</option>
          <option value="falas">Mais falas primeiro</option>
          <option value="promessas">Mais promessas primeiro</option>
        </select>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b">
              <tr>
                <th className="text-left p-3">Bairro</th>
                <th className="text-left p-3">Última menção</th>
                <th className="text-center p-3">Falas</th>
                <th className="text-center p-3">Promessas abertas</th>
                <th className="text-left p-3">Tom</th>
                <th className="text-center p-3">Status</th>
                <th className="w-8 p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r: any) => {
                const meta = ALERT_META[r.nivel_alerta] || ALERT_META.ok;
                return (
                  <tr
                    key={r.bairro}
                    className="border-b last:border-0 hover:bg-muted/40 cursor-pointer transition-colors"
                    onClick={() => setSelectedBairro(r.bairro)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedBairro(r.bairro); } }}
                    title="Ver detalhes do bairro"
                  >
                    <td className="p-3 font-medium"><span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-muted-foreground" />{r.bairro}</span></td>
                    <td className="p-3 text-muted-foreground">
                      {r.ultima_mencao ? new Date(r.ultima_mencao).toLocaleDateString("pt-BR") : "—"}
                      {r.dias_silencio !== null && <span className="text-xs ml-1">({r.dias_silencio}d)</span>}
                    </td>
                    <td className="p-3 text-center">{r.n_falas}</td>
                    <td className="p-3 text-center">{r.n_promessas_abertas > 0 ? <Badge variant="secondary">{r.n_promessas_abertas}</Badge> : <span className="text-muted-foreground">—</span>}</td>
                    <td className="p-3 text-muted-foreground capitalize">{r.tom_predominante || "—"}</td>
                    <td className="p-3 text-center">
                      <Badge variant="outline" className={meta.color}>
                        {r.nivel_alerta === "silenciado" && <AlertTriangle className="w-3 h-3 mr-1" />}
                        {meta.label}
                      </Badge>
                    </td>
                    <td className="p-3 text-muted-foreground"><ChevronRight className="w-4 h-4" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <BairroDetalheDialog
        clientId={clientId}
        bairro={selectedBairro}
        open={!!selectedBairro}
        onOpenChange={(o) => { if (!o) setSelectedBairro(null); }}
      />
    </div>
  );
}
