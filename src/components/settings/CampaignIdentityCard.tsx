import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { IdCard, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function CampaignIdentityCard({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [cargo, setCargo] = useState("");

  const { data: client, isLoading } = useQuery({
    queryKey: ["client-identity", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, cargo")
        .eq("id", clientId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });

  useEffect(() => {
    if (client) {
      setName(client.name ?? "");
      setCargo(client.cargo ?? "");
    }
  }, [client]);

  const save = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("O nome da campanha é obrigatório");
      if (trimmed.length > 120) throw new Error("Máximo de 120 caracteres no nome");
      const { error } = await supabase
        .from("clients")
        .update({ name: trimmed, cargo: cargo.trim() || null })
        .eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Identidade da campanha atualizada");
      queryClient.invalidateQueries({ queryKey: ["client-identity", clientId] });
      queryClient.invalidateQueries({ queryKey: ["client-presence-config", clientId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao salvar"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IdCard className="w-5 h-5 text-primary" />
          Identidade da Campanha
        </CardTitle>
        <CardDescription>
          Esse nome aparece nas mensagens automáticas (WhatsApp, lembretes, portais públicos). Não use seu email pessoal — coloque o nome da campanha ou do candidato.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="campaign-name">Nome da campanha *</Label>
          <Input
            id="campaign-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: João Silva 2026"
            disabled={isLoading}
            maxLength={120}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="campaign-cargo">Cargo / Função</Label>
          <Input
            id="campaign-cargo"
            value={cargo}
            onChange={(e) => setCargo(e.target.value)}
            placeholder="Ex.: Vereador, Deputado Estadual…"
            disabled={isLoading}
            maxLength={80}
          />
        </div>
        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={save.isPending || isLoading}>
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar identidade
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
