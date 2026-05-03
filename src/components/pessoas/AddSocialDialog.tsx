import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { extractHandleFromUrl } from "@/lib/social-url";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pessoaId: string;
  onSuccess: () => void;
  /** When provided, the dialog edits an existing record instead of inserting */
  editing?: {
    id: string;
    plataforma: string;
    usuario: string | null;
    url_perfil: string | null;
  } | null;
}

const PLATFORM_OPTIONS = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "twitter", label: "Twitter / X" },
  { value: "youtube", label: "YouTube" },
];

export default function AddSocialDialog({ open, onOpenChange, pessoaId, onSuccess, editing }: Props) {
  const [saving, setSaving] = useState(false);
  const [plataforma, setPlataforma] = useState("instagram");
  const [usuario, setUsuario] = useState("");
  const [urlPerfil, setUrlPerfil] = useState("");

  // Sync form when opening for edit / reset on close
  useEffect(() => {
    if (open) {
      if (editing) {
        setPlataforma(editing.plataforma);
        setUsuario(editing.usuario || "");
        setUrlPerfil(editing.url_perfil || "");
      } else {
        reset();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  function reset() {
    setPlataforma("instagram");
    setUsuario("");
    setUrlPerfil("");
  }

  async function handleSave() {
    if (!usuario.trim() && !urlPerfil.trim()) {
      toast.error("Informe o usuário ou URL do perfil");
      return;
    }

    setSaving(true);

    // Se foi colado uma URL, sempre tenta extrair o handle real dela
    // (evita salvar "share", "profile.php" etc como usuário).
    const rawUser = usuario.trim().replace(/^@/, "");
    const rawUrl = urlPerfil.trim();
    const extracted = rawUrl ? extractHandleFromUrl(plataforma, rawUrl) : null;
    const finalUser = extracted || rawUser || null;

    const payload = {
      plataforma,
      usuario: finalUser,
      url_perfil: rawUrl || null,
    };

    const { error } = editing
      ? await supabase.from("pessoa_social").update(payload).eq("id", editing.id)
      : await supabase.from("pessoa_social").insert({ pessoa_id: pessoaId, ...payload } as any);

    if (error) {
      setSaving(false);
      toast.error(editing ? "Erro ao atualizar rede social" : "Erro ao adicionar rede social");
      console.error(error);
      return;
    }

    // Sincroniza supporter_profiles para que o ranking de influenciadores
    // reconheça interações já existentes desse usuário nessa rede.
    try {
      const { data: pessoa } = await supabase
        .from("pessoas")
        .select("supporter_id, client_id")
        .eq("id", pessoaId)
        .maybeSingle();

      const supporterId = (pessoa as any)?.supporter_id as string | null;
      const clientId = (pessoa as any)?.client_id as string | null;
      const handle = (payload.usuario || "").replace("@", "").trim();

      if (supporterId && handle) {
        const avatarUrl =
          plataforma === "facebook"
            ? `https://graph.facebook.com/${handle}/picture?type=large&redirect=true`
            : null;

        const { data: existing } = await supabase
          .from("supporter_profiles")
          .select("id")
          .eq("supporter_id", supporterId)
          .eq("platform", plataforma)
          .maybeSingle();

        if (existing) {
          await supabase
            .from("supporter_profiles")
            .update({
              platform_user_id: handle,
              platform_username: handle,
              ...(avatarUrl ? { profile_picture_url: avatarUrl } : {}),
            } as any)
            .eq("id", (existing as any).id);
        } else {
          await supabase.from("supporter_profiles").insert({
            supporter_id: supporterId,
            platform: plataforma,
            platform_user_id: handle,
            platform_username: handle,
            profile_picture_url: avatarUrl,
          } as any);
        }

        if (clientId) {
          await supabase.rpc("link_orphan_engagement_actions", { p_client_id: clientId } as any);
          await supabase.rpc("calculate_engagement_score", {
            p_supporter_id: supporterId,
            p_days: 30,
          } as any);
        }
      }
    } catch (e) {
      console.warn("Falha ao sincronizar supporter_profiles:", e);
    }

    setSaving(false);
    toast.success(editing ? "Rede social atualizada!" : "Rede social adicionada!");
    reset();
    onOpenChange(false);
    onSuccess();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar Rede Social" : "Adicionar Rede Social"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Plataforma</Label>
            <Select value={plataforma} onValueChange={setPlataforma}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PLATFORM_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Usuário</Label>
            <Input value={usuario} onChange={e => setUsuario(e.target.value)} placeholder="@usuario" maxLength={100} />
          </div>
          <div>
            <Label>URL do Perfil</Label>
            <Input value={urlPerfil} onChange={e => setUrlPerfil(e.target.value)} placeholder="https://..." maxLength={500} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
