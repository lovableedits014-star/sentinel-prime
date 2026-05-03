import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Plus, MessageCircle, Phone, Mail, Calendar, FileText, Clock } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const TIPO_CONFIG: Record<string, { label: string; icon: typeof MessageCircle; color: string }> = {
  whatsapp: { label: "WhatsApp", icon: MessageCircle, color: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20" },
  ligacao: { label: "Ligação", icon: Phone, color: "text-sky-600 bg-sky-500/10 border-sky-500/20" },
  email: { label: "E-mail", icon: Mail, color: "text-amber-600 bg-amber-500/10 border-amber-500/20" },
  reuniao: { label: "Reunião", icon: Calendar, color: "text-purple-600 bg-purple-500/10 border-purple-500/20" },
  nota: { label: "Nota", icon: FileText, color: "text-muted-foreground bg-muted border-border" },
};

interface InteracoesTimelineProps {
  pessoaId: string;
  clientId: string;
}

export default function InteracoesTimeline({ pessoaId, clientId }: InteracoesTimelineProps) {
  const [interacoes, setInteracoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tipo, setTipo] = useState("whatsapp");
  const [descricao, setDescricao] = useState("");

  useEffect(() => {
    fetchInteracoes();
  }, [pessoaId]);

  async function fetchInteracoes() {
    setLoading(true);
    const { data } = await supabase
      .from("interacoes_pessoa")
      .select("*")
      .eq("pessoa_id", pessoaId)
      .order("criado_em", { ascending: false });
    setInteracoes(data || []);
    setLoading(false);
  }

  async function handleSave() {
    if (!descricao.trim()) {
      toast.error("Preencha a descrição");
      return;
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Sessão expirada");
      setSaving(false);
      return;
    }

    const { error } = await supabase.from("interacoes_pessoa").insert({
      pessoa_id: pessoaId,
      client_id: clientId,
      tipo_interacao: tipo,
      descricao: descricao.trim(),
      criado_por: user.id,
    } as any);

    if (error) {
      toast.error("Erro ao registrar interação");
    } else {
      toast.success("Interação registrada");
      setDialogOpen(false);
      setDescricao("");
      setTipo("whatsapp");
      fetchInteracoes();
    }
    setSaving(false);
  }

  const config = (tipo: string) => TIPO_CONFIG[tipo] || TIPO_CONFIG.nota;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          <CardTitle className="text-base">Histórico de Interações</CardTitle>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setDialogOpen(true)}>
          <Plus className="w-3.5 h-3.5" /> Nova interação
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-6">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : interacoes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhuma interação registrada ainda.
          </p>
        ) : (
          <div className="relative space-y-0">
            {/* Timeline line */}
            <div className="absolute left-[17px] top-2 bottom-2 w-px bg-border" />

            {interacoes.map((item, i) => {
              const c = config(item.tipo_interacao);
              const Icon = c.icon;
              return (
                <div key={item.id} className="relative flex gap-3 pb-4 last:pb-0">
                  <div className={`relative z-10 flex items-center justify-center w-9 h-9 rounded-full border shrink-0 ${c.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 pt-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{c.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(item.criado_em), "dd/MM/yyyy HH:mm")}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap">{item.descricao}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Interação</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo de interação</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPO_CONFIG).map(([key, val]) => (
                    <SelectItem key={key} value={key}>{val.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea
                placeholder="Descreva a interação..."
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
