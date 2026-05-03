import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Sparkles, Loader2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getSugestaoFeriado } from "@/lib/sugestoes-tema";
import { useEstilosTema } from "@/hooks/useEstilosTema";
import { EstilosTemaSelector } from "@/components/calendario/EstilosTemaSelector";
import { diasAteCampanha, diasLabelCampanha } from "@/lib/calendario-datas";
import { PromptArteButton } from "@/components/calendario/PromptArteButton";

type Holiday = {
  date: string; // YYYY-MM-DD
  localName: string;
  name: string;
  types?: string[];
  global?: boolean;
  year?: number;
};

const diasAte = diasAteCampanha;

function formatarData(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

const diasLabel = diasLabelCampanha;

export function FeriadosWidget() {
  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(
    () => [currentYear, currentYear + 1, currentYear + 2],
    [currentYear],
  );
  // "proximos" = a partir de hoje, atravessando anos. Caso contrário, ano específico.
  const [yearFilter, setYearFilter] = useState<"proximos" | string>("proximos");
  const [expandido, setExpandido] = useState(false);
  const { ativos: estilosAtivos } = useEstilosTema();

  const { data, isLoading, error } = useQuery({
    queryKey: ["holidays", "BR", yearOptions.join(",")],
    queryFn: async () => {
      const qs = `years=${yearOptions.join(",")}`;
      const { data, error } = await supabase.functions.invoke(
        `holidays-fetch?${qs}`,
        { body: null, method: "GET" },
      );
      if (error) throw error;
      return data as { holidays: Holiday[] };
    },
    staleTime: 1000 * 60 * 60 * 12, // 12h no client (no servidor já tem cache de 1 ano)
    refetchOnWindowFocus: false,
  });

  const proximos = useMemo(() => {
    const list = data?.holidays ?? [];
    // 1) só nacionais (global=true; tolera ausência do flag)
    let filtered = list.filter((h) => h.global !== false);

    if (yearFilter === "proximos") {
      // Modo padrão: a partir de hoje, qualquer ano (atravessa virada de ano)
      filtered = filtered.filter((h) => diasAte(h.date) >= 0);
    } else {
      // Ano específico: pega o ano todo (inclui passados do ano selecionado)
      const y = parseInt(yearFilter, 10);
      filtered = filtered.filter((h) => h.date.startsWith(`${y}-`));
      // Se for o ano corrente, prioriza os a partir de hoje quando houver
      if (y === currentYear) {
        const futuros = filtered.filter((h) => diasAte(h.date) >= 0);
        if (futuros.length > 0) filtered = futuros;
      }
    }

    return filtered.sort((a, b) => a.date.localeCompare(b.date));
  }, [data, yearFilter, currentYear]);

  // Quantos exibir: padrão mostra próximos 5; expandido mostra todos do filtro
  const LIMITE_PADRAO = 5;
  const visiveis = expandido ? proximos : proximos.slice(0, LIMITE_PADRAO);
  const restantes = proximos.length - visiveis.length;

  return (
    <TooltipProvider>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Próximos feriados nacionais</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-xs hidden sm:inline-flex">
                    Apoio à agenda
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Lista visual dos feriados nacionais para ajudar a planejar agenda de campanha,
                  eventos presenciais e tom dos comunicados. Não dispara mensagens automaticamente.
                </TooltipContent>
              </Tooltip>
              <EstilosTemaSelector compact />
              <Select value={yearFilter} onValueChange={(v) => setYearFilter(v as typeof yearFilter)}>
                <SelectTrigger className="h-8 w-[140px] text-xs">
                  <SelectValue placeholder="Período" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="proximos">Próximos (todos)</SelectItem>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      Ano de {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <CardDescription>
            Use para evitar agendar atos em feriados, planejar atos cívicos e definir o tom da comunicação.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando feriados...
            </div>
          )}
          {error && (
            <p className="text-sm text-muted-foreground py-2">
              Não foi possível carregar os feriados agora. Tentaremos novamente.
            </p>
          )}
          {!isLoading && !error && proximos.length === 0 && (
            <p className="text-sm text-muted-foreground py-2">
              Nenhum feriado nacional à frente nesta janela.
            </p>
          )}
          {proximos.length > 0 && (
            <ul className="space-y-2">
              {visiveis.map((h) => {
                const dias = diasAte(h.date);
                const tag = diasLabel(dias);
                const sug = getSugestaoFeriado(h, estilosAtivos);
                return (
                  <li
                    key={`${h.date}-${h.name}`}
                    className="flex items-start justify-between gap-3 rounded-lg border bg-card/50 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {sug?.emoji ?? "📅"} {h.localName}
                        </span>
                        <Badge
                          variant={tag.tone === "soon" ? "default" : tag.tone === "near" ? "secondary" : "outline"}
                          className="text-[10px] px-1.5 py-0"
                        >
                          {tag.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                        {formatarData(h.date)}
                      </p>
                      {sug && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1">
                          <Sparkles className="h-3 w-3 mt-0.5 shrink-0 text-primary/70" />
                          <span><span className="font-medium">Sugestão:</span> {sug.tema}</span>
                        </p>
                      )}
                      <div className="mt-2">
                        <PromptArteButton
                          tipo="feriado"
                          feriado={{ localName: h.localName, name: h.name, date: h.date }}
                          size="sm"
                          variant="outline"
                          label="Prompt de arte"
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {proximos.length > LIMITE_PADRAO && (
            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">
                Mostrando {visiveis.length} de {proximos.length} feriado(s) {yearFilter === "proximos" ? "à frente" : `em ${yearFilter}`}.
              </p>
              <button
                type="button"
                onClick={() => setExpandido((v) => !v)}
                className="text-xs font-medium text-primary hover:underline"
              >
                {expandido ? "Ver menos" : `Ver todos (+${restantes})`}
              </button>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground mt-3 leading-snug">
            Fonte: feriados <span className="font-medium">nacionais brasileiros</span>. Feriados municipais e estaduais
            não estão incluídos — confira o calendário oficial da sua cidade/estado para datas locais.
          </p>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}