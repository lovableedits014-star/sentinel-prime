import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Image as ImageIcon, Upload, Trash2, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

const BUCKET = "candidate-identity";
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

type Identity = {
  id: string;
  client_id: string;
  logo_url: string | null;
  logo_path: string | null;
};

export default function CandidateAssetsCard({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const identityQuery = useQuery({
    queryKey: ["candidate-identity", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidate_identity")
        .select("*")
        .eq("client_id", clientId)
        .maybeSingle();
      if (error) throw error;
      return data as Identity | null;
    },
    enabled: !!clientId,
  });

  const uploadLogo = async (file: File) => {
    if (file.size > MAX_BYTES) {
      toast.error("Logo muito grande (máx. 8 MB).");
      return;
    }
    setUploadingLogo(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${clientId}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || "image/png",
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);

      const oldPath = identityQuery.data?.logo_path;

      const { error: dbErr } = await supabase.from("candidate_identity").upsert(
        {
          client_id: clientId,
          logo_url: pub.publicUrl,
          logo_path: path,
        },
        { onConflict: "client_id" },
      );
      if (dbErr) throw dbErr;

      if (oldPath && oldPath !== path) {
        await supabase.storage.from(BUCKET).remove([oldPath]).catch(() => {});
      }

      toast.success("Logo atualizada!");
      queryClient.invalidateQueries({ queryKey: ["candidate-identity", clientId] });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao enviar logo";
      toast.error(msg);
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  const removeLogo = useMutation({
    mutationFn: async () => {
      const path = identityQuery.data?.logo_path;
      const { error } = await supabase
        .from("candidate_identity")
        .update({ logo_url: null, logo_path: null })
        .eq("client_id", clientId);
      if (error) throw error;
      if (path) await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    },
    onSuccess: () => {
      toast.success("Logo removida.");
      queryClient.invalidateQueries({ queryKey: ["candidate-identity", clientId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao remover logo"),
  });

  const identity = identityQuery.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          Logo da campanha
        </CardTitle>
        <CardDescription>
          Envie a logo do candidato para uso futuro em materiais e integrações da plataforma.
          <br />
          <span className="text-[12px] mt-1 inline-block">
            <strong>Recomendado:</strong> PNG com fundo transparente, mínimo 1024×1024px.
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">Arquivo da logo</Label>
            {identity?.logo_url && (
              <Badge variant="secondary" className="text-[10px]">Logo cadastrada</Badge>
            )}
          </div>

          <div className="flex items-start gap-4">
            <div className="w-32 h-32 rounded-lg border-2 border-dashed flex items-center justify-center bg-muted/40 overflow-hidden shrink-0">
              {identity?.logo_url ? (
                <img
                  src={identity.logo_url}
                  alt="Logo do candidato"
                  className="max-w-full max-h-full object-contain"
                />
              ) : (
                <ImageIcon className="w-8 h-8 text-muted-foreground" />
              )}
            </div>

            <div className="flex-1 space-y-2">
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadLogo(f);
                }}
              />
              <div className="flex gap-2 flex-wrap">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploadingLogo}
                  className="gap-1.5"
                >
                  {uploadingLogo ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  {identity?.logo_url ? "Substituir logo" : "Enviar logo"}
                </Button>
                {identity?.logo_url && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => removeLogo.mutate()}
                    disabled={removeLogo.isPending}
                    className="gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remover
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                PNG com fundo transparente. Recomendado: 1024×1024px ou maior.
              </p>
            </div>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
