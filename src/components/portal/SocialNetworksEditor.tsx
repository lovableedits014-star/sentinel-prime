import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Facebook, Instagram, Edit2, Plus, Trash2, Save, X, Loader2, CheckCircle2, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { extractHandleFromUrl, getSocialProfileUrl } from "@/lib/social-url";

export interface SocialEntry {
  plataforma: string;
  usuario: string | null;
  url_perfil?: string | null;
}

interface Props {
  /** Either "funcionarios" or "contratados" */
  table: "funcionarios" | "contratados";
  recordId: string;
  clientId: string;
  /** Optional — when present, supporter_profiles will be synced to keep ranking live */
  supporterId?: string | null;
  initial: SocialEntry[] | any;
  onChange?: (next: SocialEntry[]) => void;
}

const PLATFORM_OPTIONS = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "tiktok", label: "TikTok" },
];

function PlatformIcon({ p }: { p: string }) {
  if (p === "instagram") return <Instagram className="w-4 h-4 text-pink-500" />;
  if (p === "facebook") return <Facebook className="w-4 h-4 text-blue-600" />;
  if (p === "tiktok") return <span className="text-sm leading-none">🎵</span>;
  return null;
}

export default function SocialNetworksEditor({
  table, recordId, clientId, supporterId, initial, onChange,
}: Props) {
  const normalizedInitial: SocialEntry[] = useMemo(() => {
    if (Array.isArray(initial)) {
      return initial
        .filter(Boolean)
        .map((s: any) => ({
          plataforma: s.plataforma || s.platform || "instagram",
          usuario: s.usuario || s.username || null,
          url_perfil: s.url_perfil || s.url || null,
        }));
    }
    return [];
  }, [initial]);

  const [editMode, setEditMode] = useState(false);
  const [items, setItems] = useState<SocialEntry[]>(normalizedInitial);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setItems(normalizedInitial); }, [normalizedInitial]);

  function update(idx: number, patch: Partial<SocialEntry>) {
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function add() {
    setItems(prev => [...prev, { plataforma: "instagram", usuario: "", url_perfil: "" }]);
  }

  function remove(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    // Normalize each entry: if URL provided, try to extract handle; strip "@"
    const cleaned: SocialEntry[] = [];
    for (const it of items) {
      const rawUrl = (it.url_perfil || "").trim();
      const rawUser = (it.usuario || "").trim().replace(/^@/, "");
      const extracted = rawUrl ? extractHandleFromUrl(it.plataforma, rawUrl) : null;
      const finalUser = extracted || rawUser || "";
      if (!finalUser && !rawUrl) continue; // skip empty rows
      if (!finalUser) {
        toast.error("Não consegui identificar o usuário a partir da URL. Informe o @usuário.");
        return;
      }
      cleaned.push({
        plataforma: it.plataforma,
        usuario: finalUser,
        url_perfil: rawUrl || null,
      });
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from(table as any)
        .update({ redes_sociais: cleaned } as any)
        .eq("id", recordId);
      if (error) throw error;

      // Sync supporter_profiles + recompute engagement when applicable
      if (supporterId) {
        // Wipe and recreate to keep this 100% in sync (small N).
        await supabase
          .from("supporter_profiles" as any)
          .delete()
          .eq("supporter_id", supporterId);

        if (cleaned.length > 0) {
          await supabase.from("supporter_profiles" as any).insert(
            cleaned.map((s) => {
              const handle = (s.usuario || "").replace(/^@/, "");
              const avatarUrl =
                s.plataforma === "facebook"
                  ? `https://graph.facebook.com/${handle}/picture?type=large&redirect=true`
                  : null;
              return {
                supporter_id: supporterId,
                platform: s.plataforma,
                platform_user_id: handle,
                platform_username: handle,
                profile_picture_url: avatarUrl,
              } as any;
            }) as any
          );
        }

        try {
          await supabase.rpc("link_orphan_engagement_actions" as any, { p_client_id: clientId } as any);
          await supabase.rpc("calculate_engagement_score" as any, {
            p_supporter_id: supporterId,
            p_days: 30,
          } as any);
        } catch (e) {
          console.warn("Falha ao recalcular engajamento:", e);
        }
      }

      toast.success("Redes sociais atualizadas!");
      setItems(cleaned);
      onChange?.(cleaned);
      setEditMode(false);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Erro ao salvar redes sociais");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setItems(normalizedInitial);
    setEditMode(false);
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3 gap-2">
          <p className="text-sm font-semibold">Suas Redes Sociais</p>
          {!editMode ? (
            <Button variant="ghost" size="sm" onClick={() => setEditMode(true)} className="h-8">
              <Edit2 className="w-3.5 h-3.5 mr-1" /> Editar
            </Button>
          ) : (
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={handleCancel} disabled={saving} className="h-8 px-2">
                <X className="w-4 h-4" />
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving} className="h-8">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
                Salvar
              </Button>
            </div>
          )}
        </div>

        {!editMode ? (
          items.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhuma rede social vinculada. Toque em <span className="font-medium">Editar</span> para adicionar.
            </p>
          ) : (
            <div className="space-y-2">
              {items.map((s, i) => {
                const handle = (s.usuario || "").replace(/^@/, "");
                const url = s.url_perfil || getSocialProfileUrl(s.plataforma, handle, handle);
                return (
                  <div key={i} className="flex items-center gap-2 text-sm min-w-0">
                    <PlatformIcon p={s.plataforma} />
                    <span className="text-muted-foreground truncate">@{handle}</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    {url && (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto text-primary hover:underline inline-flex items-center gap-1 text-xs shrink-0"
                      >
                        Abrir <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground mt-2">
                Suas interações nessas redes contam pontos automaticamente no ranking.
              </p>
            </div>
          )
        ) : (
          <div className="space-y-3">
            {items.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Adicione ao menos uma rede social para ser monitorado no ranking.
              </p>
            )}
            {items.map((s, i) => (
              <div key={i} className="rounded-md border border-border p-3 space-y-2 bg-muted/30">
                <div className="flex items-end gap-2">
                  <div className="flex-1 min-w-0 space-y-1">
                    <Label className="text-xs">Plataforma</Label>
                    <Select value={s.plataforma} onValueChange={(v) => update(i, { plataforma: v })}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PLATFORM_OPTIONS.map(o => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(i)}
                    className="h-9 px-2 text-destructive hover:text-destructive"
                    aria-label="Remover"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Usuário (@)</Label>
                  <Input
                    value={s.usuario || ""}
                    onChange={(e) => update(i, { usuario: e.target.value })}
                    placeholder="seu_usuario"
                    maxLength={100}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">URL do perfil (opcional)</Label>
                  <Input
                    value={s.url_perfil || ""}
                    onChange={(e) => update(i, { url_perfil: e.target.value })}
                    placeholder="https://..."
                    maxLength={500}
                    className="h-9"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Pode colar a URL completa que extraímos o usuário automaticamente.
                  </p>
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={add}
              className="w-full h-9"
            >
              <Plus className="w-4 h-4 mr-1" /> Adicionar rede
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}