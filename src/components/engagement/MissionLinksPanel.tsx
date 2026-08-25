import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Link2, Copy, QrCode, Loader2, Plus, AlertTriangle } from "lucide-react";
import { resolvePublicBaseUrl } from "@/lib/public-base-url";

type Props = {
  clientId: string;
  missionId: string;
  missionTitle: string | null;
};

type Dist = {
  id: string;
  short_code: string;
  group_jid: string | null;
  group_name_snapshot: string | null;
  created_at: string;
};

export default function MissionLinksPanel({ clientId, missionId, missionTitle }: Props) {
  const qc = useQueryClient();
  const [groupName, setGroupName] = useState("");
  const [qrFor, setQrFor] = useState<string | null>(null);

  const { data: client } = useQuery({
    queryKey: ["client-public-base", clientId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("clients")
        .select("id, name, public_base_url")
        .eq("id", clientId)
        .maybeSingle();
      return data;
    },
    enabled: !!clientId,
  });

  const base = useMemo(() => resolvePublicBaseUrl(client), [client]);

  const { data: dists = [], isLoading } = useQuery<Dist[]>({
    queryKey: ["mission-links", missionId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("mission_distributions")
        .select("id, short_code, group_jid, group_name_snapshot, created_at")
        .eq("mission_id", missionId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Dist[];
    },
    enabled: !!missionId,
  });

  const gerar = useMutation({
    mutationFn: async (nome: string | null) => {
      const { data, error } = await (supabase as any).rpc("mission_link_generate", {
        p_mission_id: missionId,
        p_group_jid: null,
        p_group_name: nome,
      });
      if (error) throw error;
      return data as { short_code: string; reused: boolean };
    },
    onSuccess: (res) => {
      toast.success(res.reused ? "Link já existia — reutilizado" : "Link gerado");
      setGroupName("");
      qc.invalidateQueries({ queryKey: ["mission-links", missionId] });
    },
    onError: (e: any) => toast.error(e?.message || "Não foi possível gerar o link"),
  });

  const linkFor = (code: string) =>
    `${base.url}/missao/${missionId}?d=${encodeURIComponent(code)}`;

  const mensagemFor = (code: string) =>
    `🚨 *${missionTitle || "Nova missão"}*\n\nAcesse o link abaixo, confirme seu nome e faça a missão. Seu acesso é registrado automaticamente:\n${linkFor(code)}`;

  const copy = async (text: string, msg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(msg);
    } catch {
      toast.error("Não foi possível copiar — copie manualmente");
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Link2 className="h-4 w-4" /> Links de envio
        </CardTitle>
        <CardDescription>
          Gere um <strong>link único</strong> para enviar em qualquer lugar, ou um link por grupo
          para saber de onde veio cada acesso. Quem abrir faz um cadastro rápido (nome + WhatsApp) e
          passa a ser reconhecido automaticamente nas próximas missões.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {base.isPreview && (
          <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            <span>
              Você está no ambiente de pré-visualização. Configure a URL pública do candidato em
              Configurações para que o link funcione para quem está fora do sistema.
            </span>
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs">Nome do grupo (opcional)</Label>
            <Input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Ex.: Grupo Líderes Zona Norte"
              maxLength={80}
            />
          </div>
          <Button
            onClick={() => gerar.mutate(groupName.trim() || null)}
            disabled={gerar.isPending}
            className="gap-2"
          >
            {gerar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Gerar link
          </Button>
        </div>

        {isLoading ? (
          <div className="py-8 text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : dists.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhum link gerado ainda para esta missão.
          </p>
        ) : (
          <div className="space-y-2">
            {dists.map((d) => (
              <div key={d.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{d.group_name_snapshot || "Link único"}</Badge>
                  <code className="text-xs text-muted-foreground">{d.short_code}</code>
                </div>
                <p className="break-all text-xs text-muted-foreground">{linkFor(d.short_code)}</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="gap-1.5"
                    onClick={() => copy(linkFor(d.short_code), "Link copiado")}>
                    <Copy className="h-3.5 w-3.5" /> Copiar link
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5"
                    onClick={() => copy(mensagemFor(d.short_code), "Mensagem copiada")}>
                    <Copy className="h-3.5 w-3.5" /> Copiar mensagem pronta
                  </Button>
                  <Button size="sm" variant="ghost" className="gap-1.5"
                    onClick={() => setQrFor(qrFor === d.id ? null : d.id)}>
                    <QrCode className="h-3.5 w-3.5" /> QR code
                  </Button>
                </div>
                {qrFor === d.id && (
                  <div className="flex justify-center pt-2">
                    <img
                      alt={`QR code do link da missão ${missionTitle || ""}`}
                      className="rounded border bg-white p-2"
                      width={180}
                      height={180}
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(linkFor(d.short_code))}`}
                    />
                  </div>
                )}
                <Textarea
                  readOnly
                  value={mensagemFor(d.short_code)}
                  className="h-20 text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
