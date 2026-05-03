import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Phone, MapPin, Users } from "lucide-react";
import { toast } from "@/hooks/use-toast";

/**
 * Mostra todas as pessoas cadastradas (pessoas, contratados, indicados, funcionários)
 * cuja localidade (cidade + bairro opcional) bate — comparação canônica (sem acento, lowercase).
 */
export interface LocalityDetailDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientId: string | null;
  /** "city" → mostra todos da cidade. "neighborhood" → cidade+bairro. */
  level: "city" | "neighborhood";
  city: string;
  neighborhood?: string | null;
}

type Origin = "pessoas" | "contratados" | "contratado_indicados" | "funcionarios" | "supporter_accounts";

interface Row {
  id: string;
  origin: Origin;
  nome: string;
  telefone: string | null;
  cidade: string | null;
  bairro: string | null;
}

interface MergedRow {
  key: string;
  nome: string;
  telefone: string | null;
  bairro: string | null;
  origins: Origin[];
}

const canon = (v: string | null | undefined) =>
  (v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const ORIGIN_LABEL: Record<Origin, string> = {
  pessoas: "CRM",
  contratados: "Contratado",
  contratado_indicados: "Indicado",
  funcionarios: "Funcionário",
  supporter_accounts: "Apoiador",
};

const ORIGIN_VARIANT: Record<Origin, "default" | "secondary" | "outline" | "destructive"> = {
  pessoas: "default",
  contratados: "secondary",
  contratado_indicados: "outline",
  funcionarios: "destructive",
  supporter_accounts: "default",
};

export function LocalityDetailDialog({ open, onOpenChange, clientId, level, city, neighborhood }: LocalityDetailDialogProps) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);

  const cityKey = useMemo(() => canon(city), [city]);
  const neighKey = useMemo(() => canon(neighborhood), [neighborhood]);

  useEffect(() => {
    if (!open || !clientId) return;
    let cancel = false;
    (async () => {
      setLoading(true);
      const fetchAll = async (
        table: Origin,
        select: string,
      ): Promise<any[]> => {
        const PAGE = 1000;
        const out: any[] = [];
        let from = 0;
        while (true) {
          const { data } = await supabase
            .from(table as any)
            .select(select)
            .eq("client_id", clientId)
            .range(from, from + PAGE - 1);
          if (!data || data.length === 0) break;
          out.push(...data);
          if (data.length < PAGE) break;
          from += PAGE;
        }
        return out;
      };

      const [pessoas, contratados, indicados, funcionarios, apoiadores] = await Promise.all([
        fetchAll("pessoas", "id, nome, telefone, cidade, bairro"),
        fetchAll("contratados", "id, nome, telefone, cidade, bairro"),
        fetchAll("contratado_indicados", "id, nome, telefone, cidade, bairro"),
        fetchAll("funcionarios", "id, nome, telefone, cidade, bairro"),
        fetchAll("supporter_accounts", "id, name, phone, city, neighborhood"),
      ]);

      const collected: Row[] = [];
      const push = (origin: Origin, list: any[]) => {
        for (const r of list) {
          // Limpa sufixo " - UF" da cidade (mesma lógica do agregador)
          const cityRaw = ((r.cidade ?? r.city)?.trim() || "");
          const cityClean = cityRaw.replace(/[\s,/-]+[A-Za-z]{2}\s*$/, "").trim() || cityRaw;
          if (canon(cityClean) !== cityKey) continue;
          const bairro = r.bairro ?? r.neighborhood;
          if (level === "neighborhood" && canon(bairro) !== neighKey) continue;
          collected.push({
            id: r.id,
            origin,
            nome: r.nome ?? r.name,
            telefone: r.telefone ?? r.phone,
            cidade: r.cidade ?? r.city,
            bairro,
          });
        }
      };
      push("pessoas", pessoas);
      push("contratados", contratados);
      push("contratado_indicados", indicados);
      push("funcionarios", funcionarios);
      push("supporter_accounts", apoiadores);

      collected.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      if (!cancel) {
        setRows(collected);
        setLoading(false);
      }
    })().catch((err) => {
      console.error(err);
      if (!cancel) {
        toast({ title: "Erro", description: err.message || "Falha ao carregar pessoas", variant: "destructive" });
        setLoading(false);
      }
    });
    return () => { cancel = true; };
  }, [open, clientId, cityKey, neighKey, level]);

  const title = level === "neighborhood" ? `${neighborhood} — ${city}` : city;

  // Deduplica: mesma pessoa em tabelas diferentes (CRM + Apoiador, etc.)
  // No recorte de uma localidade, o nome canônico é a identidade principal:
  // muitas contas de Apoiador vêm sem telefone, enquanto o CRM tem telefone.
  const mergedRows = useMemo<MergedRow[]>(() => {
    const map = new Map<string, MergedRow>();
    for (const r of rows) {
      const nameKey = canon(r.nome);
      const key = nameKey || `${r.origin}-${r.id}`;
      const existing = map.get(key);
      if (existing) {
        if (!existing.origins.includes(r.origin)) existing.origins.push(r.origin);
        if (!existing.telefone && r.telefone) existing.telefone = r.telefone;
        if (!existing.bairro && r.bairro) existing.bairro = r.bairro;
      } else {
        map.set(key, {
          key,
          nome: r.nome,
          telefone: r.telefone,
          bairro: r.bairro,
          origins: [r.origin],
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [rows]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {loading ? "Carregando…" : `${mergedRows.length} pessoa${mergedRows.length === 1 ? "" : "s"} cadastrada${mergedRows.length === 1 ? "" : "s"} nesta localidade.`}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : mergedRows.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            <Users className="w-8 h-8 mx-auto opacity-30 mb-2" />
            Nenhuma pessoa encontrada.
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh] pr-2">
            <div className="space-y-1.5">
              {mergedRows.map((r) => (
                <div key={r.key} className="flex items-center gap-2 p-2.5 rounded-md border bg-card">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.nome}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {r.telefone && (
                        <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{r.telefone}</span>
                      )}
                      {r.bairro && level === "city" && (
                        <span className="truncate">· {r.bairro}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 shrink-0 justify-end">
                    {r.origins.map((o) => (
                      <Badge key={o} variant={ORIGIN_VARIANT[o]} className="text-[10px]">
                        {ORIGIN_LABEL[o]}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}