import { useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Play, Pause, DollarSign, Archive, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  campaign: any;
  clientId: string;
  onChanged: () => void;
}

export function CampanhaCard({ campaign, clientId, onChanged }: Props) {
  const [loading, setLoading] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [newBudget, setNewBudget] = useState((campaign.daily_budget_cents || 0) / 100);

  async function callAction(action: string, extra: any = {}) {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ads-update-campaign", {
        body: { clientId, campaignLocalId: campaign.id, action, ...extra },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Falha");
      toast.success("Atualizado");
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Erro");
    } finally {
      setLoading(false);
      setBudgetOpen(false);
    }
  }

  const isActive = campaign.status === "ACTIVE";
  const isArchived = campaign.status === "ARCHIVED";

  return (
    <Card>
      <CardContent className="p-4 flex flex-wrap justify-between items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <div className="font-medium">{campaign.nome}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
            <span>{campaign.objetivo}</span>
            <Badge variant={isActive ? "default" : isArchived ? "outline" : "secondary"}>{campaign.status}</Badge>
            {campaign.is_political && <Badge variant="outline">Político</Badge>}
            {campaign.daily_budget_cents && <span>· R$ {(campaign.daily_budget_cents / 100).toFixed(2)}/dia</span>}
          </div>
        </div>
        <div className="flex gap-2">
          {!isArchived && (isActive ? (
            <Button size="sm" variant="outline" onClick={() => callAction("pause")} disabled={loading}>
              <Pause className="h-4 w-4 mr-1" />Pausar
            </Button>
          ) : (
            <Button size="sm" onClick={() => callAction("resume")} disabled={loading}>
              <Play className="h-4 w-4 mr-1" />Ativar
            </Button>
          ))}
          {!isArchived && (
            <Button size="sm" variant="outline" onClick={() => setBudgetOpen(true)} disabled={loading}>
              <DollarSign className="h-4 w-4 mr-1" />Orçamento
            </Button>
          )}
          {!isArchived && (
            <Button size="sm" variant="ghost" onClick={() => { if (confirm("Arquivar campanha?")) callAction("archive"); }} disabled={loading}>
              <Archive className="h-4 w-4" />
            </Button>
          )}
        </div>

        <Dialog open={budgetOpen} onOpenChange={setBudgetOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ajustar orçamento diário</DialogTitle>
              <DialogDescription>Atual: R$ {((campaign.daily_budget_cents || 0) / 100).toFixed(2)}/dia</DialogDescription>
            </DialogHeader>
            <Input type="number" min={5} value={newBudget} onChange={e => setNewBudget(parseFloat(e.target.value) || 0)} />
            <DialogFooter>
              <Button onClick={() => callAction("update_budget", { newDailyBudgetCents: Math.round(newBudget * 100) })} disabled={loading || newBudget < 5}>
                {loading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
