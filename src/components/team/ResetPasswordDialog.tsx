import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, KeyRound, RefreshCw } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  teamMemberId: string;
  userName: string;
  userEmail: string;
}

function generatePassword(len = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#";
  let out = "";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length];
  return out;
}

export default function ResetPasswordDialog({ open, onOpenChange, teamMemberId, userName, userEmail }: Props) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (password.length < 6) return toast.error("Senha mínima de 6 caracteres");
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-platform-user", {
        body: { action: "update", id: teamMemberId, password },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      try { await navigator.clipboard.writeText(`${userEmail} / ${password}`); } catch {}
      toast.success("Senha redefinida — credenciais copiadas para a área de transferência");
      setPassword("");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao redefinir senha");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setPassword(""); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-4 h-4" /> Redefinir senha
          </DialogTitle>
          <DialogDescription>
            {userName} <span className="text-muted-foreground">({userEmail})</span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label className="text-xs">Nova senha</Label>
          <div className="relative">
            <Input
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              className="pr-16"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
              <button type="button" onClick={() => setPassword(generatePassword())} title="Gerar senha forte" className="text-muted-foreground hover:text-foreground">
                <RefreshCw className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => setShow((v) => !v)} className="text-muted-foreground hover:text-foreground">
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Após salvar, as credenciais (email/senha) são copiadas para a área de transferência para você enviar ao usuário.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            Salvar nova senha
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
