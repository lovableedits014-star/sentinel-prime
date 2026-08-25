import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ExternalLink, Link2, Loader2, Plus, Trash2 } from "lucide-react";
import { detectLinkKind, isValidHttpUrl } from "@/lib/mission-link-kind";

export type MissionLinkRow = {
  id: string;
  label: string;
  url: string;
  kind: string;
  display_order: number;
};

/** Lista editável de links extras de uma missão já criada. */
export default function MissionLinksEditor({
  clientId,
  missionId,
}: {
  clientId: string;
  missionId: string;
}) {
  const qc = useQueryClient();
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");

  const queryKey = ["mission-extra-links", missionId];

  const { data: links = [], isLoading } = useQuery<MissionLinkRow[]>({
    queryKey,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("portal_mission_links")
        .select("id, label, url, kind, display_order")
        .eq("mission_id", missionId)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data || []) as MissionLinkRow[];
    },
    enabled: !!missionId,
  });

  const add = useMutation({
    mutationFn: async () => {
      const cleanLabel = label.trim();
      const cleanUrl = url.trim();
      if (!cleanUrl || !isValidHttpUrl(cleanUrl)) throw new Error("Informe um endereço começando com https://");
      const { error } = await (supabase as any).from("portal_mission_links").insert({
        mission_id: missionId,
        client_id: clientId,
        label: cleanLabel || "Abrir link",
        url: cleanUrl,
        kind: detectLinkKind(cleanUrl),
        display_order: links.length,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setLabel("");
      setUrl("");
      qc.invalidateQueries({ queryKey });
      toast.success("Link adicionado à missão");
    },
    onError: (e: any) => toast.error(e?.message || "Não foi possível adicionar o link"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("portal_mission_links").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
    onError: (e: any) => toast.error(e?.message || "Não foi possível remover"),
  });

  const move = useMutation({
    mutationFn: async ({ index, dir }: { index: number; dir: -1 | 1 }) => {
      const target = index + dir;
      if (target < 0 || target >= links.length) return;
      const a = links[index];
      const b = links[target];
      const { error } = await (supabase as any)
        .from("portal_mission_links")
        .upsert([
          { id: a.id, display_order: target },
          { id: b.id, display_order: index },
        ]);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
    onError: (e: any) => toast.error(e?.message || "Não foi possível reordenar"),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="h-4 w-4" /> Links desta missão
        </CardTitle>
        <CardDescription>
          Além das publicações do Facebook e do Instagram, você pode colocar quantos links externos quiser
          (site, notícia, YouTube, TikTok, formulário...). Eles aparecem como botões na tela da pessoa e cada
          clique é registrado separadamente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
          <div className="space-y-1.5">
            <Label className="text-xs">Nome do botão</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: Ver notícia" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Endereço do link</Label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div className="flex items-end">
            <Button className="w-full gap-1.5" onClick={() => add.mutate()} disabled={add.isPending || !url.trim()}>
              {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Adicionar
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="py-6 text-center">
            <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : links.length === 0 ? (
          <p className="py-3 text-xs text-muted-foreground">Nenhum link extra cadastrado nesta missão.</p>
        ) : (
          <div className="space-y-2">
            {links.map((l, i) => (
              <div key={l.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                <Badge variant="secondary" className="shrink-0 text-[10px]">{l.kind}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{l.label}</p>
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 truncate text-xs text-muted-foreground hover:underline"
                  >
                    {l.url} <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                </div>
                <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === 0}
                  onClick={() => move.mutate({ index: i, dir: -1 })}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === links.length - 1}
                  onClick={() => move.mutate({ index: i, dir: 1 })}>
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                  onClick={() => remove.mutate(l.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
