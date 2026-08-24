import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface IndicadorOption {
  id: string;
  nome: string;
  tipo?: string | null;
  cidade?: string | null;
}

const TIPO_LABEL: Record<string, string> = {
  coordenador: "Coordenador",
  lider: "Líder",
  cabo: "Cabo",
};

interface Props {
  value: string;              // id do indicador ou allValue
  onChange: (v: string) => void;
  options: IndicadorOption[];
  allValue?: string;
  allLabel?: string;
  className?: string;
  placeholder?: string;
}

/** Seletor de indicador com busca por nome (autocomplete). */
export default function IndicadorCombobox({
  value, onChange, options,
  allValue = "__all__",
  allLabel = "Qualquer indicador",
  className,
  placeholder = "Buscar indicador por nome…",
}: Props) {
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => (value === allValue ? null : options.find(o => o.id === value) || null),
    [value, options, allValue],
  );

  const describe = (o: IndicadorOption) =>
    [o.tipo ? (TIPO_LABEL[o.tipo] ?? o.tipo) : null, o.cidade].filter(Boolean).join(" · ");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between h-9 font-normal", className)}
        >
          <span className="truncate">{selected ? selected.nome : allLabel}</span>
          <ChevronsUpDown className="w-4 h-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[260px]" align="start">
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList className="max-h-64">
            <CommandEmpty>Nenhum indicador encontrado.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={allLabel}
                onSelect={() => { onChange(allValue); setOpen(false); }}
              >
                <Check className={cn("w-4 h-4 mr-2", value === allValue ? "opacity-100" : "opacity-0")} />
                {allLabel}
              </CommandItem>
              {options.map(o => (
                <CommandItem
                  key={o.id}
                  value={`${o.nome} ${o.cidade ?? ""}`}
                  onSelect={() => { onChange(o.id); setOpen(false); }}
                >
                  <Check className={cn("w-4 h-4 mr-2 shrink-0", value === o.id ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{o.nome}</span>
                  {describe(o) && (
                    <span className="ml-auto pl-2 text-[10px] text-muted-foreground whitespace-nowrap">{describe(o)}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
