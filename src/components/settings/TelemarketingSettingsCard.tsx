import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Phone, Plus, Trash2, Eye, EyeOff, Copy, ExternalLink, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface Operador {
  id: string;
  nome: string;
  senha: string;
  ativo: boolean;
  created_at: string;
}

export default function TelemarketingSettingsCard({ clientId }: { clientId: string }) {
  const [operadores, setOperadores] = useState<Operador[]>([]);
  const [loading, setLoading] = useState(true);
  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState("");
  const [adding, setAdding] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [copiedLink, setCopiedLink] = useState(false);

  const teleUrl = `${window.location.origin}/telemarketing/${clientId}`;

  const fetchOps = async () => {
    const { data } = await supabase
      .from("telemarketing_operadores")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: true });
    setOperadores((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchOps(); }, [clientId]);

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

  const handleDelete = async (id: string) => {
    if (!confirm("Remover este operador?")) return;
    await supabase.from("telemarketing_operadores").delete().eq("id", id);
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
            <CardDescription>Link de acesso, operadores cadastrados e controle de ligações</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Link de acesso */}
        <div className="border rounded-lg p-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Link de acesso dos operadores</p>
          <div className="bg-muted rounded-md px-3 py-2 flex items-center justify-between gap-2">
            <code className="text-xs text-muted-foreground truncate flex-1">{teleUrl}</code>
            <div className="flex gap-1 shrink-0">
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={copyLink}>
                {copiedLink ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => window.open(teleUrl, "_blank")}>
                <ExternalLink className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Compartilhe este link com os operadores. Eles precisarão do nome e senha cadastrados abaixo para acessar.
          </p>
        </div>

        {/* Cadastro de operadores */}
        <div className="space-y-3">
          <p className="text-sm font-semibold">Operadores cadastrados</p>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs font-medium mb-1 block">Nome</label>
              <Input placeholder="Nome do operador" value={nome} onChange={(e) => setNome(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium mb-1 block">Senha</label>
              <Input placeholder="Senha de acesso" value={senha} onChange={(e) => setSenha(e.target.value)} className="h-9 text-sm" />
            </div>
            <Button size="sm" onClick={handleAdd} disabled={adding} className="h-9">
              <Plus className="w-4 h-4 mr-1" />
              Adicionar
            </Button>
          </div>

          {loading ? (
            <div className="h-20 bg-muted animate-pulse rounded-lg" />
          ) : operadores.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum operador cadastrado</p>
          ) : (
            <div className="space-y-2">
              {operadores.map((op) => (
                <div key={op.id} className="flex items-center justify-between gap-3 border rounded-lg px-3 py-2">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div>
                      <p className="text-sm font-medium">{op.nome}</p>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span>Senha:</span>
                        <code className="bg-muted px-1 rounded">
                          {showPasswords[op.id] ? op.senha : "••••••"}
                        </code>
                        <button
                          onClick={() => setShowPasswords((p) => ({ ...p, [op.id]: !p[op.id] }))}
                          className="hover:text-foreground"
                        >
                          {showPasswords[op.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={op.ativo ? "default" : "secondary"} className="text-[10px]">
                      {op.ativo ? "Ativo" : "Inativo"}
                    </Badge>
                    <Switch checked={op.ativo} onCheckedChange={() => toggleAtivo(op)} />
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(op.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
