import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CalendarCheck, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

export default function PresenceSettingsCard({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient();
  const [days, setDays] = useState<number>(3);
  const [template, setTemplate] = useState<string>("");

  const { data: client, isLoading } = useQuery({
    queryKey: ["client-presence-config", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, presence_absence_days_threshold, presence_absence_message_template")
        .eq("id", clientId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });

  useEffect(() => {
    if (client?.presence_absence_days_threshold) {
      setDays(client.presence_absence_days_threshold);
    }
    if (typeof (client as any)?.presence_absence_message_template === "string") {
      setTemplate((client as any).presence_absence_message_template);
    }
  }, [client]);

  const save = useMutation({
    mutationFn: async () => {
      const value = Math.max(1, Math.min(30, Math.round(days)));
      const trimmed = template.trim();
      if (!trimmed) throw new Error("A mensagem não pode ficar vazia");
      if (trimmed.length > 1000) throw new Error("A mensagem deve ter no máximo 1000 caracteres");
      const { error } = await supabase
        .from("clients")
        .update({
          presence_absence_days_threshold: value,
          presence_absence_message_template: trimmed,
        } as any)
        .eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configuração salva");
      queryClient.invalidateQueries({ queryKey: ["client-presence-config", clientId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao salvar"),
  });

  const preview = template
    .replace(/\{nome\}/g, "Maria")
    .replace(/\{dias\}/g, String(Math.max(1, Math.min(30, Math.round(days || 3)))))
    .replace(/\{campanha\}/g, (client as any)?.name ?? "Sua Campanha");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarCheck className="w-5 h-5 text-primary" />
          Controle de Presença Diária
        </CardTitle>
        <CardDescription>
          Defina após quantos dias sem check-in o sistema deve enviar um lembrete automático no WhatsApp para as pessoas marcadas como obrigadas. Um único lembrete é enviado por pessoa (até que ela faça um novo check-in).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 max-w-xs">
          <Label htmlFor="threshold-days">Dias sem acessar para disparar o lembrete</Label>
          <div className="flex items-center gap-2">
            <Input
              id="threshold-days"
              type="number"
              min={1}
              max={30}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              disabled={isLoading}
            />
          </div>
          <p className="text-xs text-muted-foreground">Mínimo 1, máximo 30 dias.</p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="presence-template">Mensagem enviada no WhatsApp</Label>
          <Textarea
            id="presence-template"
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            disabled={isLoading}
            rows={8}
            className="font-mono text-xs"
            placeholder="Olá, {nome}! Você não acessa o portal há {dias} dias..."
          />
          <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <span>Variáveis disponíveis:</span>
            <code className="px-1.5 py-0.5 rounded bg-muted">{"{nome}"}</code>
            <code className="px-1.5 py-0.5 rounded bg-muted">{"{dias}"}</code>
            <code className="px-1.5 py-0.5 rounded bg-muted">{"{campanha}"}</code>
          </div>
        </div>

        <div className="rounded-lg border bg-background p-3">
          <p className="text-xs font-medium mb-2 text-muted-foreground">Pré-visualização</p>
          <div className="rounded-md bg-[#dcf8c6] text-foreground/90 p-3 text-sm whitespace-pre-wrap leading-relaxed shadow-sm">
            {preview || <span className="text-muted-foreground italic">Digite uma mensagem acima…</span>}
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={save.isPending || isLoading}>
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar configuração
          </Button>
        </div>

        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <p className="font-medium mb-1">Como funciona</p>
          <ul className="text-muted-foreground space-y-1 list-disc list-inside text-xs">
            <li>O sistema executa a verificação diariamente e envia o lembrete via WhatsApp.</li>
            <li>Você marca quem é obrigado em <Link to="/presenca" className="text-primary underline">Controle de Presença</Link>.</li>
            <li>Pessoas sem telefone cadastrado entram no relatório, mas não recebem WhatsApp.</li>
            <li>Para parar lembretes, basta desmarcar a pessoa como obrigada.</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}