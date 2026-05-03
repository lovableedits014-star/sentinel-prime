import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  clientId: string;
}

const toHHMM = (val: string) => (val ? val.slice(0, 5) : "");

export default function WhatsAppWindowSettings({ clientId }: Props) {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("22:00");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("clients")
      .select("whatsapp_window_start, whatsapp_window_end, whatsapp_window_enabled")
      .eq("id", clientId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setEnabled(data.whatsapp_window_enabled ?? true);
          setStart(toHHMM(data.whatsapp_window_start) || "08:00");
          setEnd(toHHMM(data.whatsapp_window_end) || "22:00");
        }
      });
  }, [clientId]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("clients")
      .update({
        whatsapp_window_enabled: enabled,
        whatsapp_window_start: `${start}:00`,
        whatsapp_window_end: `${end}:00`,
      })
      .eq("id", clientId);
    setSaving(false);
    if (error) toast.error("Erro ao salvar: " + error.message);
    else toast.success("Janela horária atualizada.");
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border rounded-lg">
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Clock className="w-4 h-4 text-muted-foreground" />
            Janela de Disparo (horário humano)
            <span className="text-xs text-muted-foreground font-normal">
              · {enabled ? `${toHHMM(start)} – ${toHHMM(end)}` : "24h (desativada)"}
            </span>
          </span>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4 pt-1 space-y-4">
        <p className="text-xs text-muted-foreground">
          Disparos iniciados fora da janela ficam <b>pausados automaticamente</b> e retomam quando a janela reabre.
          Horário considerado: <b>America/Sao_Paulo (UTC-3)</b>.
        </p>
        <div className="flex items-center justify-between">
          <Label htmlFor="window-toggle" className="text-sm">Ativar janela horária</Label>
          <Switch id="window-toggle" checked={enabled} onCheckedChange={setEnabled} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Início</Label>
            <Input type="time" value={start} disabled={!enabled} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Fim</Label>
            <Input type="time" value={end} disabled={!enabled} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <Button onClick={save} disabled={saving} size="sm" className="w-full sm:w-auto">
          {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
          Salvar janela
        </Button>
      </CollapsibleContent>
    </Collapsible>
  );
}