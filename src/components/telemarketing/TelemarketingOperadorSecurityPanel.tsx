import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Shield, Unlock, KeyRound, RefreshCw, Clock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface Operador {
  id: string;
  nome: string;
  ativo: boolean;
  failed_attempts: number;
  locked_until: string | null;
  last_login_at: string | null;
  password_updated_at: string | null;
}

interface AuditEvent {
  id: string;
  operador_nome: string;
  evento: string;
  detalhe: any;
  created_at: string;
}

const evtLabel: Record<string, string> = {
  login_ok: "Login ok",
  login_falha: "Login falhou",
  login_bloqueado: "Tentativa em conta bloqueada",
  senha_trocada: "Senha trocada",
  desbloqueado: "Desbloqueado manualmente",
};

export default function TelemarketingOperadorSecurityPanel({ clientId }: { clientId: string }) {
  const [operadores, setOperadores] = useState<Operador[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [newSenha, setNewSenha] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    const [op, au] = await Promise.all([
      supabase.from("telemarketing_operadores" as any)
        .select("id,nome,ativo,failed_attempts,locked_until,last_login_at,password_updated_at")
        .eq("client_id", clientId).order("nome"),
      supabase.from("telemarketing_operador_audit" as any)
        .select("id,operador_nome,evento,detalhe,created_at")
        .eq("client_id", clientId).order("created_at", { ascending: false }).limit(50),
    ]);
    setOperadores((op.data as any[]) || []);
    setAudit((au.data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [clientId]);

  const unlock = async (id: string) => {
    const { error } = await supabase.rpc("tele_unlock_operador" as any, { _operador_id: id });
    if (error) { toast.error(error.message); return; }
    toast.success("Operador desbloqueado");
    load();
  };

  const rotatePassword = async (id: string) => {
    const senha = newSenha[id]?.trim();
    if (!senha || senha.length < 6) { toast.error("Senha mínima de 6 caracteres"); return; }
    const { error } = await supabase.rpc("tele_change_operador_password" as any, {
      _operador_id: id, _new_senha: senha,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Senha trocada");
    setNewSenha({ ...newSenha, [id]: "" });
    load();
  };

  const isLocked = (o: Operador) => o.locked_until && new Date(o.locked_until) > new Date();

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Shield className="w-4 h-4" /> Segurança dos operadores</CardTitle>
          <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {operadores.length === 0 && <p className="text-sm text-muted-foreground">Nenhum operador cadastrado.</p>}
          {operadores.map(o => (
            <div key={o.id} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium truncate">{o.nome}</span>
                  {!o.ativo && <Badge variant="secondary" className="text-[10px]">Inativo</Badge>}
                  {isLocked(o) && <Badge variant="destructive" className="text-[10px] flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Bloqueado</Badge>}
                  {o.failed_attempts > 0 && !isLocked(o) && (
                    <Badge variant="outline" className="text-[10px]">{o.failed_attempts} tentativa(s) errada(s)</Badge>
                  )}
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                <span><Clock className="w-3 h-3 inline mr-1" />Último login: {o.last_login_at ? new Date(o.last_login_at).toLocaleString("pt-BR") : "—"}</span>
                <span>Senha atualizada: {o.password_updated_at ? new Date(o.password_updated_at).toLocaleDateString("pt-BR") : "—"}</span>
                {isLocked(o) && <span>Liberado em: {new Date(o.locked_until!).toLocaleString("pt-BR")}</span>}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="password"
                  placeholder="Nova senha (mín. 6)"
                  value={newSenha[o.id] || ""}
                  onChange={(e) => setNewSenha({ ...newSenha, [o.id]: e.target.value })}
                  className="h-8 text-xs"
                />
                <Button size="sm" variant="outline" onClick={() => rotatePassword(o.id)}>
                  <KeyRound className="w-3.5 h-3.5 mr-1" /> Trocar
                </Button>
                {isLocked(o) && (
                  <Button size="sm" variant="outline" onClick={() => unlock(o.id)}>
                    <Unlock className="w-3.5 h-3.5 mr-1" /> Desbloquear
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Auditoria recente</CardTitle>
        </CardHeader>
        <CardContent>
          {audit.length === 0 && <p className="text-sm text-muted-foreground">Sem eventos registrados.</p>}
          <div className="space-y-1 max-h-96 overflow-auto text-xs">
            {audit.map(a => (
              <div key={a.id} className="flex items-center justify-between border-b py-1.5 gap-2">
                <div className="min-w-0">
                  <span className="font-medium">{a.operador_nome}</span>
                  <span className="text-muted-foreground ml-2">{evtLabel[a.evento] || a.evento}</span>
                  {a.detalhe?.failed_attempts && (
                    <span className="text-muted-foreground ml-1">({a.detalhe.failed_attempts}ª)</span>
                  )}
                </div>
                <span className="text-muted-foreground shrink-0 text-[10px]">{new Date(a.created_at).toLocaleString("pt-BR")}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
