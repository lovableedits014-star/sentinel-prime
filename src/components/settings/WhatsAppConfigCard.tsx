import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MessageCircle, Save, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface WhatsAppConfigCardProps {
  clientId: string;
}

export default function WhatsAppConfigCard({ clientId }: WhatsAppConfigCardProps) {
  const [whatsapp, setWhatsapp] = useState("");
  const [original, setOriginal] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("clients")
      .select("whatsapp_oficial")
      .eq("id", clientId)
      .single()
      .then(({ data }) => {
        const val = (data as any)?.whatsapp_oficial || "";
        setWhatsapp(val);
        setOriginal(val);
        setLoading(false);
      });
  }, [clientId]);

  const handleSave = async () => {
    const cleaned = whatsapp.replace(/\D/g, "");
    if (cleaned && cleaned.length < 10) {
      toast.error("Número inválido. Use o formato com DDI + DDD + número (ex: 5511998887777)");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("clients")
      .update({ whatsapp_oficial: cleaned || null } as any)
      .eq("id", clientId);

    if (error) {
      toast.error("Erro ao salvar");
    } else {
      setOriginal(cleaned);
      setWhatsapp(cleaned);
      toast.success("WhatsApp oficial salvo com sucesso!");
    }
    setSaving(false);
  };

  const hasChanged = whatsapp.replace(/\D/g, "") !== original;
  const previewUrl = whatsapp.replace(/\D/g, "") ? `https://wa.me/${whatsapp.replace(/\D/g, "")}` : "";

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="h-20 bg-muted animate-pulse rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
            <MessageCircle className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <CardTitle>WhatsApp Oficial da Campanha</CardTitle>
            <CardDescription>
              Número usado para confirmação de cadastros e comunicação com apoiadores
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-700 rounded-lg p-3 space-y-1.5">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">⚠️ Importante — Número de envio</p>
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Configure aqui o <strong>mesmo número</strong> conectado no sistema externo de WhatsApp (Ponte API) para que todos os envios saiam de um único número.
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
            🔴 <strong>Atenção:</strong> Mesmo seguindo boas práticas, disparos em massa pelo WhatsApp apresentam risco de banimento da conta. Recomendamos usar um número que possa ser substituído caso isso ocorra — <strong>nunca use seu número pessoal principal</strong>.
          </p>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Número com DDI + DDD</label>
          <div className="flex gap-2">
            <Input
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="5511998887777"
              className="font-mono max-w-xs"
              maxLength={15}
            />
            <Button onClick={handleSave} disabled={saving || !hasChanged} className="gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Apenas números. Exemplo: <code className="bg-muted px-1 rounded">5567992773931</code>
          </p>
        </div>

        {previewUrl && (
          <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-3 space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
              <CheckCircle2 className="w-4 h-4" />
              Link de WhatsApp gerado
            </div>
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-green-600 dark:text-green-400 underline break-all"
            >
              {previewUrl}
            </a>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          💡 Este número será usado automaticamente em links de confirmação após cadastro público de apoiadores.
        </p>
      </CardContent>
    </Card>
  );
}
