import { useEffect, useState } from "react";
import { Check, Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client-selfhosted";

type Cargo = "estadual" | "federal" | "senador" | "governador";

interface Props {
  clientId: string;
  operadorNome: string;
  operadorSenha: string;
  cargo: Cargo;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export default function CandidateAutocomplete({
  clientId, operadorNome, operadorSenha, cargo, value, onChange, placeholder, disabled, className,
}: Props) {
  const [suggestions, setSuggestions] = useState<{ candidato: string; mencoes: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const term = value.trim();
    if (disabled || term.length < 2) { setSuggestions([]); return; }
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const { data } = await supabase.rpc("tele_sugestoes_candidatos" as any, {
        _client_id: clientId, _nome: operadorNome.trim(), _senha: operadorSenha.trim(),
        _cargo: cargo, _termo: term, _limite: 8,
      });
      setSuggestions(((data as any[]) || []).map((item) => ({
        candidato: String(item.candidato), mencoes: Number(item.mencoes || 0),
      })));
      setLoading(false);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [cargo, clientId, disabled, operadorNome, operadorSenha, value]);

  const show = focused && value.trim().length >= 2 && (loading || suggestions.length > 0);

  return <div className="relative">
    <Input
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => window.setTimeout(() => setFocused(false), 150)}
      disabled={disabled}
      className={className}
      autoComplete="off"
    />
    {show && <div className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-lg">
      {loading && <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" />Buscando nomes já registrados...</div>}
      {!loading && suggestions.map((item) => <button
        key={item.candidato}
        type="button"
        className="flex w-full items-center justify-between gap-3 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => { onChange(item.candidato); setFocused(false); }}
      >
        <span className="flex items-center gap-2"><Search className="size-3.5 text-muted-foreground" />{item.candidato}</span>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><Check className="size-3" />{item.mencoes} menção(ões)</span>
      </button>)}
    </div>}
  </div>;
}
