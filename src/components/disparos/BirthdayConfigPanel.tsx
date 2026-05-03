import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Cake, Upload, Loader2, CheckCircle, XCircle, ImageIcon, Trash2 } from "lucide-react";

type BirthdayConfig = {
  id: string;
  client_id: string;
  enabled: boolean;
  mensagem_template: string;
  image_url: string | null;
  hora_envio: string;
};

type BirthdayLog = {
  id: string;
  pessoa_nome: string;
  telefone: string;
  status: string;
  erro: string | null;
  enviado_em: string;
};

export default function BirthdayConfigPanel({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const { data: config, isLoading } = useQuery({
    queryKey: ["birthday-config", clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_birthday_config" as any)
        .select("*")
        .eq("client_id", clientId)
        .maybeSingle();
      return data as unknown as BirthdayConfig | null;
    },
    enabled: !!clientId,
  });

  const [enabled, setEnabled] = useState(false);
  const [mensagem, setMensagem] = useState("Feliz aniversário, {nome}! 🎂🎉 Desejamos muita saúde, paz e realizações!");
  const [horaEnvio, setHoraEnvio] = useState("08:00");
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (config) {
      setEnabled(config.enabled);
      setMensagem(config.mensagem_template);
      setHoraEnvio(config.hora_envio?.slice(0, 5) || "08:00");
      setImageUrl(config.image_url);
    }
  }, [config]);

  const { data: logs = [] } = useQuery<BirthdayLog[]>({
    queryKey: ["birthday-logs", clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_birthday_log" as any)
        .select("*")
        .eq("client_id", clientId)
        .order("enviado_em", { ascending: false })
        .limit(50);
      return (data as unknown as BirthdayLog[]) || [];
    },
    enabled: !!clientId,
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        client_id: clientId,
        enabled,
        mensagem_template: mensagem,
        hora_envio: horaEnvio + ":00",
        image_url: imageUrl,
        updated_at: new Date().toISOString(),
      };

      if (config?.id) {
        await supabase
          .from("whatsapp_birthday_config" as any)
          .update(payload)
          .eq("id", config.id);
      } else {
        await supabase
          .from("whatsapp_birthday_config" as any)
          .insert(payload);
      }

      queryClient.invalidateQueries({ queryKey: ["birthday-config", clientId] });
      toast.success("Configuração de aniversário salva!");
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem válida");
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${clientId}/birthday-${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("birthday-images")
        .upload(path, file, { upsert: true });

      if (uploadErr) throw uploadErr;

      const { data: publicUrl } = supabase.storage
        .from("birthday-images")
        .getPublicUrl(path);

      setImageUrl(publicUrl.publicUrl);
      toast.success("Imagem carregada!");
    } catch (err: any) {
      toast.error("Erro no upload: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveImage = () => {
    setImageUrl(null);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Cake className="h-5 w-5 text-primary" />
            Mensagem de Aniversário
          </CardTitle>
          <CardDescription>
            Envio automático diário para pessoas com data de nascimento cadastrada.
            A mensagem será disparada automaticamente no horário configurado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Envio automático ativado</p>
              <p className="text-xs text-muted-foreground">
                {enabled ? "Aniversariantes receberão mensagem diariamente" : "Nenhuma mensagem será enviada"}
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="space-y-2">
            <Label>Horário de envio</Label>
            <Input
              type="time"
              value={horaEnvio}
              onChange={(e) => setHoraEnvio(e.target.value)}
              className="w-40"
            />
            <p className="text-xs text-muted-foreground">
              Horário em que as mensagens serão enviadas automaticamente (horário de Brasília)
            </p>
          </div>

          <div className="space-y-2">
            <Label>Mensagem</Label>
            <Textarea
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              rows={4}
              placeholder="Feliz aniversário, {nome}!"
            />
            <p className="text-xs text-muted-foreground">
              Use <code className="bg-muted px-1 rounded">{"{nome}"}</code> para personalizar.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Imagem de aniversário</Label>
            {imageUrl ? (
              <div className="relative rounded-lg border overflow-hidden max-w-xs">
                <img src={imageUrl} alt="Imagem de aniversário" className="w-full h-auto max-h-48 object-cover" />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2 h-7 w-7"
                  onClick={handleRemoveImage}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <label className="flex items-center gap-3 rounded-lg border border-dashed p-4 cursor-pointer hover:bg-accent/50 transition-colors">
                {uploading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : (
                  <ImageIcon className="h-5 w-5 text-muted-foreground" />
                )}
                <div>
                  <p className="text-sm font-medium">{uploading ? "Enviando..." : "Clique para enviar imagem"}</p>
                  <p className="text-xs text-muted-foreground">PNG, JPG ou WEBP (até 5MB)</p>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                  disabled={uploading}
                />
              </label>
            )}
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...</> : "Salvar configuração"}
          </Button>
        </CardContent>
      </Card>

      {/* Birthday send log */}
      {logs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Cake className="w-4 h-4" /> Últimos envios de aniversário
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ScrollArea className="max-h-[300px]">
              <div className="space-y-1">
                {logs.map((log) => (
                  <div key={log.id} className="flex items-center gap-2 rounded border px-3 py-1.5 text-sm">
                    {log.status === "enviado" ? (
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                    )}
                    <span className="flex-1 truncate">{log.pessoa_nome}</span>
                    <span className="text-xs text-muted-foreground font-mono">{log.telefone}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(log.enviado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                    </span>
                    {log.erro && (
                      <Badge variant="destructive" className="text-xs">{log.erro.slice(0, 30)}</Badge>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
