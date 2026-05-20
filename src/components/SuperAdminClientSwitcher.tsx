import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { useQueryClient } from "@tanstack/react-query";
import { Crown, ChevronDown, Check, User, Plus, Loader2, Copy } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getImpersonatedClientId, setImpersonatedClientId } from "@/lib/resolveClientId";
import { logTelemetry } from "@/lib/client-telemetry";

interface ClientRow {
  id: string;
  name: string;
  cargo: string | null;
}

function randomPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function SuperAdminClientSwitcher() {
  const qc = useQueryClient();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(getImpersonatedClientId());

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formCargo, setFormCargo] = useState("");
  const [formPassword, setFormPassword] = useState(randomPassword());
  const [creating, setCreating] = useState(false);
  const [createdInfo, setCreatedInfo] = useState<{ email: string; password: string } | null>(null);

  const loadClients = async () => {
    const { data } = await supabase
      .from("clients")
      .select("id, name, cargo")
      .order("name", { ascending: true });
    setClients((data || []) as ClientRow[]);
  };

  useEffect(() => {
    loadClients();
  }, []);

  const active = clients.find((c) => c.id === activeId) || null;

  const select = (id: string | null) => {
    const previous = getImpersonatedClientId();
    setImpersonatedClientId(id);
    setActiveId(id);
    logTelemetry(id ? "impersonation_set" : "impersonation_cleared", { from: previous, to: id });

    const snapshot = qc.getQueryCache().getAll().map((q) => q.queryKey);
    logTelemetry("queries_invalidated", {
      reason: "client_switch",
      to: id,
      count: snapshot.length,
      keys: snapshot.slice(0, 50),
    });

    qc.invalidateQueries();
    toast.success(id ? "Visualizando como gerente selecionado" : "Modo super admin restaurado");
  };

  const openCreate = () => {
    setFormName("");
    setFormEmail("");
    setFormCargo("");
    setFormPassword(randomPassword());
    setCreatedInfo(null);
    setDialogOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formEmail.trim() || formPassword.length < 6) {
      toast.error("Preencha nome, e-mail e senha (mín. 6 caracteres)");
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-gerente", {
        body: {
          name: formName.trim(),
          email: formEmail.trim().toLowerCase(),
          password: formPassword,
          cargo: formCargo.trim() || undefined,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      toast.success("Gerente cadastrado com sucesso");
      setCreatedInfo({ email: formEmail.trim().toLowerCase(), password: formPassword });
      await loadClients();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao cadastrar gerente");
    } finally {
      setCreating(false);
    }
  };

  const copyCredentials = () => {
    if (!createdInfo) return;
    const text = `E-mail: ${createdInfo.email}\nSenha: ${createdInfo.password}`;
    navigator.clipboard.writeText(text);
    toast.success("Credenciais copiadas");
  };

  return (
    <>
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
              Nenhum gerente cadastrado
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
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={openCreate} className="text-primary">
            <Plus className="w-4 h-4 mr-2" />
            <span>Cadastrar novo gerente</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cadastrar novo gerente</DialogTitle>
            <DialogDescription>
              Cria uma nova conta de gerente (cliente SaaS). O gerente poderá fazer login e
              terá seus próprios dados isolados — você (super admin) continua sem ser dono
              de nada, apenas gerenciando.
            </DialogDescription>
          </DialogHeader>

          {createdInfo ? (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
                <p className="text-sm font-medium">Conta criada com sucesso!</p>
                <p className="text-xs text-muted-foreground">
                  Envie estas credenciais para o gerente:
                </p>
                <div className="font-mono text-sm bg-background rounded p-3 border">
                  <div>E-mail: {createdInfo.email}</div>
                  <div>Senha: {createdInfo.password}</div>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={copyCredentials}>
                  <Copy className="w-3.5 h-3.5 mr-1.5" />
                  Copiar credenciais
                </Button>
              </div>
              <DialogFooter>
                <Button onClick={() => setDialogOpen(false)}>Fechar</Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="g-name">Nome completo *</Label>
                <Input
                  id="g-name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ex: João da Silva"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="g-email">E-mail *</Label>
                <Input
                  id="g-email"
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="gerente@exemplo.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="g-cargo">Cargo (opcional)</Label>
                <Input
                  id="g-cargo"
                  value={formCargo}
                  onChange={(e) => setFormCargo(e.target.value)}
                  placeholder="Ex: Vereador, Deputado"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="g-pass">Senha inicial *</Label>
                <div className="flex gap-2">
                  <Input
                    id="g-pass"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setFormPassword(randomPassword())}
                  >
                    Gerar
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  O gerente pode trocar depois nas configurações da conta.
                </p>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={creating}>
                  {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Cadastrar gerente
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
