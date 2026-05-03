import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { SlidersHorizontal, RotateCcw } from "lucide-react";
import { ESTILO_LABEL, ESTILOS_DISPONIVEIS } from "@/lib/sugestoes-tema";
import { useEstilosTema } from "@/hooks/useEstilosTema";

type Props = {
  /** Tamanho compacto para usar dentro do widget do dashboard */
  compact?: boolean;
};

export function EstilosTemaSelector({ compact = false }: Props) {
  const { estilos, toggle, reset } = useEstilosTema();
  const total = ESTILOS_DISPONIVEIS.length;
  const selecionados = estilos.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size={compact ? "sm" : "sm"}
          className={compact ? "h-8 text-xs gap-1.5" : "gap-2"}
        >
          <SlidersHorizontal className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
          <span className={compact ? "hidden sm:inline" : ""}>Estilos</span>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-0.5">
            {selecionados}/{total}
          </Badge>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold">Estilos de sugestão</p>
            <p className="text-xs text-muted-foreground">
              Escolha quais estilos de tema político você quer ver. Apenas visual — não dispara nada.
            </p>
          </div>
          <div className="space-y-2">
            {ESTILOS_DISPONIVEIS.map((e) => {
              const meta = ESTILO_LABEL[e];
              const ativo = estilos.includes(e);
              const podeDesmarcar = !(ativo && estilos.length === 1);
              return (
                <label
                  key={e}
                  className="flex items-start gap-2 rounded-md border p-2 hover:bg-accent/50 cursor-pointer"
                >
                  <Checkbox
                    checked={ativo}
                    onCheckedChange={() => podeDesmarcar && toggle(e)}
                    disabled={!podeDesmarcar}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-tight">
                      <span className="mr-1">{meta.emoji}</span>
                      {meta.label}
                    </p>
                    <p className="text-xs text-muted-foreground leading-snug">
                      {meta.descricao}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
          <div className="flex items-center justify-between pt-1 border-t">
            <p className="text-[10px] text-muted-foreground">Ao menos 1 estilo ativo.</p>
            <Button variant="ghost" size="sm" onClick={reset} className="h-7 text-xs gap-1">
              <RotateCcw className="h-3 w-3" /> Restaurar
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}