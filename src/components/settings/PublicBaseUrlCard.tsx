import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Globe, Save, Loader2, ExternalLink, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { isLovablePreviewHost } from "@/lib/public-base-url";

export default function PublicBaseUrlCard({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const [value, setValue] = useState("");

  const { data: client, isLoading } = useQuery({
    queryKey: ["client-public-base-url", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, public_base_url")
        .eq("id", clientId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!clientId,
  });

  useEffect(() => {
    if (client) setValue((client as any).public_base_url ?? "");
  }, [client]);

  const normalized = (() => {
    const raw = value.trim().replace(/\/+$/, "");
    if (!raw) return null;
    try {
      const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      const u = new URL(withProto);
      return `${u.protocol}//${u.host}`;
    } catch {
      return null;
    }
  })();

  const isPreview = normalized ? isLovablePreviewHost(normalized) : false;
  const isValid = value.trim() === "" || (!!normalized && !isPreview);

  const save = useMutation({
    mutationFn: async () => {
      const toSave = value.trim() === "" ? null : normalized;
      if (value.trim() !== "" && !normalized) throw new Error("URL inválida — informe algo como https://seudominio.com");
      if (value.trim() !== "" && isPreview) throw new Error("Essa URL é do preview do Lovable e não abre para destinatários externos. Use o domínio publicado ou um domínio próprio.");
      const { error } = await (supabase as any)
        .from("clients")
        .update({ public_base_url: toSave })
        .eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("URL pública salva");
      qc.invalidateQueries({ queryKey: ["client-public-base-url", clientId] });
      qc.invalidateQueries({ queryKey: ["client-with-active", "disparos"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao salvar"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-primary" />
          URL Pública do Portal
        </CardTitle>
        <CardDescription>
          É a URL usada nos links de missão que vão para os destinatários no WhatsApp. Precisa ser um domínio público — nunca o preview do Lovable, que exige login. Deixe em branco para usar automaticamente a URL de onde o painel estiver aberto.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="public-base-url">URL pública</Label>
          <Input
            id="public-base-url"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://meudominio.com.br  ou  https://minhacampanha.lovable.app"
            disabled={isLoading}
          />
          {value.trim() !== "" && !normalized && (
            <p className="text-xs text-destructive flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> Formato inválido — use https://exemplo.com
            </p>
          )}
          {isPreview && (
            <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> Isso é um endereço de preview do Lovable. Ele exige login e não vai funcionar para destinatários externos.
            </p>
          )}
          {normalized && !isPreview && (
            <p className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> URL válida.
              <a href={normalized} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                Abrir <ExternalLink className="w-3 h-3" />
              </a>
            </p>
          )}
        </div>
        <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
          <p><strong>Como obter uma URL pública:</strong></p>
          <p>1. Clique em <strong>Publicar</strong> no topo do editor para gerar um domínio <code>*.lovable.app</code>; ou</p>
          <p>2. Conecte um domínio próprio em <strong>Configurações do Projeto → Domínios</strong>.</p>
        </div>
        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={save.isPending || isLoading || !isValid}>
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar URL pública
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
