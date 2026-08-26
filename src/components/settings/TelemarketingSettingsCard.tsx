import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Phone, Plus, Trash2, KeyRound, Copy, ExternalLink, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface Operador {
  id: string;
  nome: string;
  ativo: boolean;
  created_at: string;
}

export default function TelemarketingSettingsCard({ clientId }: { clientId: string }) {
  const [operadores, setOperadores] = useState<Operador[]>([]);
  const [loading, setLoading] = useState(true);
  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState("");
  const [adding, setAdding] = useState(false);
  const [resetTarget, setResetTarget] = useState<Operador | null>(null);
  const [resetSenha, setResetSenha] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);

  const teleUrl = `${window.location.origin}/telemarketing/${clientId}`;

  const fetchOps = async () => {
    const { data } = await supabase
      .from("telemarketing_operadores")
      .select("id, nome, ativo, created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: true });
    setOperadores((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchOps();
  }, [clientId]);

  const handleAdd = async () => {
    if (!nome.trim() || !senha.trim()) {
      toast.error("Preencha nome e senha");
      return;
    }
    setAdding(true);
    const { error } = await supabase
      .from("telemarketing_operadores")
      .insert({ client_id: clientId, nome: nome.trim(), senha: senha.trim() } as any);
    if (error) {
      toast.error("Erro ao adicionar: " + error.message);
    } else {
      toast.success("Operador cadastrado!");
      setNome("");
      setSenha("");
      fetchOps();
    }
    setAdding(false);
  };

  const toggleAtivo = async (op: Operador) => {
    await supabase
      .from("telemarketing_operadores")
      .update({ ativo: !op.ativo } as any)
      .eq("id", op.id);
    fetchOps();
  };

  const handleDelete = async (op: Operador) => {
    const isTestOperator = ["operador1", "teste admin"].includes(
      op.nome.trim().toLocaleLowerCase("pt-BR"),
    );
    if (isTestOperator) {
      if (
        !confirm(
          `Excluir ${op.nome} por completo? Isso apagará também as ligações e confirmações de voto de teste feitas por este operador. Os contatos voltarão para a fila como pendentes.`,
        )
      )
        return;
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        toast.error("Sessão expirada. Entre novamente.");
        return;
      }
      const response = await fetch("/api/telemarketing/purge-test-operator", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ clientId, operatorId: op.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error("Erro ao remover: " + (result.error || response.statusText));
        return;
      }
      toast.success(`${op.nome} e seus registros de teste foram removidos`);
      fetchOps();
      return;
    }

    const id = op.id;
    if (
      !confirm(
        "Remover este operador? Se ele tiver contatos designados, você poderá reatribuí-los na próxima etapa.",
      )
    )
      return;
    // Verifica se há contatos designados
    const { count } = await supabase
      .from("telemarketing_contatos_avulsos")
      .select("id", { count: "exact", head: true })
      .eq("assigned_operador_id", id);
    if ((count || 0) > 0) {
      const reassign = confirm(
        `Este operador tem ${count} contato(s) designado(s). Clique em OK para redistribuir automaticamente entre os operadores ativos restantes, ou Cancelar para liberar (deixar sem operador designado).`,
      );
      if (reassign) {
        const ativos = operadores.filter((o) => o.ativo && o.id !== id).map((o) => o.id);
        if (ativos.length === 0) {
          toast.error("Nenhum outro operador ativo. Ative um operador antes de remover este.");
          return;
        }
        const { error: rerr } = await supabase.rpc("tele_reassign_from_operador" as any, {
          _client_id: clientId,
          _from_operador_id: id,
          _to_operador_ids: ativos,
        });
        if (rerr) {
          toast.error("Erro ao redistribuir: " + rerr.message);
          return;
        }
        toast.success("Contatos redistribuídos");
      } else {
        // Libera (assigned_operador_id = null)
        await supabase
          .from("telemarketing_contatos_avulsos")
          .update({ assigned_operador_id: null } as any)
          .eq("assigned_operador_id", id);
      }
    }
    const { error } = await supabase.from("telemarketing_operadores").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao remover: " + error.message);
      return;
    }
    toast.success("Operador removido");
    fetchOps();
  };

  const copyLink = () => {
    navigator.clipboard.writeText(teleUrl);
    setCopiedLink(true);
    toast.success("Link do telemarketing copiado!");
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Phone className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle>Central de Telemarketing</CardTitle>
            <CardDescription>
              Link de acesso, operadores cadastrados e controle de ligações
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Link de acesso */}
        <div className="border rounded-lg p-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Link de acesso dos operadores
          </p>
          <div className="bg-muted rounded-md px-3 py-2 flex items-center justify-between gap-2">
            <code className="text-xs text-muted-foreground truncate flex-1">{teleUrl}</code>
            <div className="flex gap-1 shrink-0">
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={copyLink}>
                {copiedLink ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => window.open(teleUrl, "_blank")}
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Compartilhe este link com os operadores. Eles precisarão do nome e senha cadastrados
            abaixo para acessar.
          </p>
        </div>

        {/* Cadastro de operadores */}
        <div className="space-y-3">
          <p className="text-sm font-semibold">Operadores cadastrados</p>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs font-medium mb-1 block">Nome</label>
              <Input
                placeholder="Nome do operador"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium mb-1 block">Senha</label>
              <Input
                placeholder="Senha de acesso"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <Button size="sm" onClick={handleAdd} disabled={adding} className="h-9">
              <Plus className="w-4 h-4 mr-1" />
              Adicionar
            </Button>
          </div>

          {loading ? (
            <div className="h-20 bg-muted animate-pulse rounded-lg" />
          ) : operadores.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhum operador cadastrado
            </p>
          ) : (
            <div className="space-y-2">
              {operadores.map((op) => (
                <div
                  key={op.id}
                  className="flex items-center justify-between gap-3 border rounded-lg px-3 py-2"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div>
                      <p className="text-sm font-medium">{op.nome}</p>
                      <p className="text-xs text-muted-foreground">Senha protegida (hash)</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={op.ativo ? "default" : "secondary"} className="text-[10px]">
                      {op.ativo ? "Ativo" : "Inativo"}
                    </Badge>
                    <Switch checked={op.ativo} onCheckedChange={() => toggleAtivo(op)} />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      title="Redefinir senha"
                      onClick={() => {
                        setResetTarget(op);
                        setResetSenha("");
                      }}
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      onClick={() => handleDelete(op)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {resetTarget && (
          <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
            <p className="text-sm font-medium">Redefinir senha de {resetTarget.nome}</p>
            <div className="flex gap-2">
              <Input
                placeholder="Nova senha"
                value={resetSenha}
                onChange={(e) => setResetSenha(e.target.value)}
                className="h-9 text-sm flex-1"
              />
              <Button
                size="sm"
                onClick={async () => {
                  if (!resetSenha.trim()) {
                    toast.error("Informe a nova senha");
                    return;
                  }
                  const { error } = await supabase
                    .from("telemarketing_operadores")
                    .update({ senha: resetSenha.trim() } as any)
                    .eq("id", resetTarget.id);
                  if (error) {
                    toast.error("Erro: " + error.message);
                    return;
                  }
                  toast.success("Senha atualizada");
                  setResetTarget(null);
                  setResetSenha("");
                }}
              >
                Salvar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setResetTarget(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
