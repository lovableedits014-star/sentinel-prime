import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { useQueryClient } from "@tanstack/react-query";
import { Crown, ChevronDown, Check, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { getImpersonatedClientId, setImpersonatedClientId } from "@/lib/resolveClientId";

interface ClientRow {
  id: string;
  name: string;
  cargo: string | null;
}

export default function SuperAdminClientSwitcher() {
  const qc = useQueryClient();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(getImpersonatedClientId());

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, name, cargo")
        .order("name", { ascending: true });
      setClients((data || []) as ClientRow[]);
    })();
  }, []);

  const active = clients.find((c) => c.id === activeId) || null;

  const select = (id: string | null) => {
    setImpersonatedClientId(id);
    setActiveId(id);
    qc.invalidateQueries();
    toast.success(id ? "Visualizando como gerente selecionado" : "Modo super admin restaurado");
    // Reload to ensure all client-id-dependent UI re-fetches with the new context.
    setTimeout(() => window.location.reload(), 250);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="w-full flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-left hover:bg-amber-500/20 transition-colors"
          title="Trocar de gerente (Super Admin)"
        >
          <Crown className="w-4 h-4 text-amber-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-amber-300/80 leading-tight">
              {active ? "Gerente" : "Super Admin"}
            </p>
            <p className="text-xs font-semibold text-sidebar-foreground truncate leading-tight">
              {active ? active.name : "Selecionar gerente"}
            </p>
            {active?.cargo && (
              <p className="text-[10px] text-sidebar-foreground/60 truncate leading-tight">
                {active.cargo}
              </p>
            )}
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-sidebar-foreground/60 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72 max-h-96 overflow-y-auto" align="start">
        <DropdownMenuLabel>Acessar como gerente</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => select(null)}>
          <User className="w-4 h-4 mr-2" />
          <span className="flex-1">Nenhum (Super Admin)</span>
          {!activeId && <Check className="w-4 h-4" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {clients.length === 0 ? (
          <div className="px-2 py-3 text-xs text-muted-foreground text-center">
            Nenhum cliente cadastrado
          </div>
        ) : (
          clients.map((c) => (
            <DropdownMenuItem key={c.id} onClick={() => select(c.id)}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{c.name}</p>
                {c.cargo && <p className="text-xs text-muted-foreground truncate">{c.cargo}</p>}
              </div>
              {activeId === c.id && <Check className="w-4 h-4 ml-2 shrink-0" />}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
