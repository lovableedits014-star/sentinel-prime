import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Lightbulb } from "lucide-react";

type EtapaHeaderProps = {
  numero: number;
  titulo: string;
  icone: ReactNode;
  oqueE: string;
  paraQueServe: string;
  proximoPasso?: { label: string; onClick: () => void };
  cor?: "primary" | "blue" | "amber" | "emerald" | "rose";
};

const COR_MAP: Record<NonNullable<EtapaHeaderProps["cor"]>, { bar: string; bg: string; text: string }> = {
  primary: { bar: "border-l-primary", bg: "bg-primary/5", text: "text-primary" },
  blue:    { bar: "border-l-blue-500", bg: "bg-blue-500/5", text: "text-blue-600 dark:text-blue-400" },
  amber:   { bar: "border-l-amber-500", bg: "bg-amber-500/5", text: "text-amber-600 dark:text-amber-400" },
  emerald: { bar: "border-l-emerald-500", bg: "bg-emerald-500/5", text: "text-emerald-600 dark:text-emerald-400" },
  rose:    { bar: "border-l-rose-500", bg: "bg-rose-500/5", text: "text-rose-600 dark:text-rose-400" },
};

/**
 * Cabeçalho padronizado de cada etapa do funil de Inteligência Eleitoral.
 * Sempre explica em linguagem leiga: o que é, pra que serve, próximo passo.
 * Foi pensado para usuários que NÃO são analistas políticos.
 */
export default function EtapaHeader({
  numero,
  titulo,
  icone,
  oqueE,
  paraQueServe,
  proximoPasso,
  cor = "primary",
}: EtapaHeaderProps) {
  const c = COR_MAP[cor];
  return (
    <Card className={`border-l-4 ${c.bar} ${c.bg}`}>
      <CardContent className="pt-5 pb-4 space-y-3">
        <div className="flex items-start gap-3 flex-wrap">
          <Badge variant="outline" className={`text-xs font-bold ${c.text}`}>
            ETAPA {numero}
          </Badge>
          <div className={`flex items-center gap-2 ${c.text}`}>
            {icone}
            <h2 className="text-xl font-bold">{titulo}</h2>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-3 text-sm">
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              O que é, em uma frase
            </div>
            <p className="leading-relaxed">{oqueE}</p>
          </div>
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Pra que serve na sua campanha
            </div>
            <p className="leading-relaxed">{paraQueServe}</p>
          </div>
        </div>

        {proximoPasso && (
          <div className="flex items-center justify-between gap-3 pt-2 border-t border-border/50 flex-wrap">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Lightbulb className="w-3.5 h-3.5" />
              <span>Quando terminar de explorar essa etapa, siga para a próxima:</span>
            </div>
            <Button size="sm" variant="default" onClick={proximoPasso.onClick} className="gap-1.5">
              {proximoPasso.label} <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
