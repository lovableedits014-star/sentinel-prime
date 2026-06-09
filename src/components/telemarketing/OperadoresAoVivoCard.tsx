import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Radio, User2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface OperadorLive {
  operador_nome: string;
  tabela: string;
  contato_id: string;
  contato_nome: string | null;
  contato_telefone: string | null;
  started_at: string;
  expires_at: string;
}

function fmtAgo(ts: string) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

export default function OperadoresAoVivoCard({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<OperadorLive[]>([]);
  const [, setTick] = useState(0);

  const load = async () => {
    const { data } = await supabase.rpc("tele_operadores_ao_vivo" as any, { _client_id: clientId });
    setRows(((data as any[]) || []) as OperadorLive[]);
  };

  useEffect(() => {
    void load();
    const ch = supabase
      .channel(`tele_live_${clientId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "telemarketing_call_assignments", filter: `client_id=eq.${clientId}` },
        () => { void load(); },
      )
      .subscribe();
    const iv = setInterval(() => setTick(t => t + 1), 5000); // refresh "tempo ativo"
    const ivPoll = setInterval(load, 30_000); // safety poll
    return () => { supabase.removeChannel(ch); clearInterval(iv); clearInterval(ivPoll); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Radio className="w-4 h-4 text-green-500 animate-pulse" /> Operadores ao vivo
          </h3>
          <Badge variant="secondary" className="text-[10px]">{rows.length} online</Badge>
        </div>
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum operador atendendo agora.</p>
        ) : (
          <ul className="space-y-1.5">
            {rows.map((r) => (
              <li key={`${r.tabela}-${r.contato_id}`} className="flex items-center justify-between text-xs gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <User2 className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="font-medium truncate">{r.operador_nome}</span>
                  <span className="text-muted-foreground truncate">→ {r.contato_nome || "(sem nome)"}</span>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">há {fmtAgo(r.started_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
