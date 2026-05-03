import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Plus, MessageCircle, MessageSquare, Target, CalendarDays, FileText, History } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const TIPO_CONFIG: Record<string, { label: string; icon: typeof MessageCircle; color: string }> = {
  whatsapp: { label: "WhatsApp", icon: MessageCircle, color: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20" },
  comentario: { label: "Comentário", icon: MessageSquare, color: "text-sky-600 bg-sky-500/10 border-sky-500/20" },
  missao: { label: "Missão", icon: Target, color: "text-amber-600 bg-amber-500/10 border-amber-500/20" },
  evento: { label: "Evento", icon: CalendarDays, color: "text-purple-600 bg-purple-500/10 border-purple-500/20" },
  nota: { label: "Nota", icon: FileText, color: "text-muted-foreground bg-muted border-border" },
};

interface TimelinePoliticaProps {
  pessoaId: string;
  clientId: string;
}

export default function TimelinePolitica({ pessoaId, clientId }: TimelinePoliticaProps) {
  const [eventos, setEventos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tipo, setTipo] = useState("whatsapp");
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");

  useEffect(() => {
    fetchEventos();
  }, [pessoaId]);

  async function fetchEventos() {
    setLoading(true);
    const { data } = await supabase
      .from("timeline_pessoa")
      .select("*")
      .eq("pessoa_id", pessoaId)
      .order("criado_em", { ascending: false })
      .limit(50);
    setEventos((data as any[]) || []);
    setLoading(false);
  }

  async function handleSave() {
    if (!titulo.trim()) {
      toast.error("Preencha o título");
      return;
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Sessão expirada");
      setSaving(false);
      return;
    }

    const { error } = await supabase.from("timeline_pessoa").insert({
      pessoa_id: pessoaId,
      client_id: clientId,
      tipo_evento: tipo,
      titulo: titulo.trim(),
      descricao: descricao.trim() || null,
      criado_por: user.id,
    } as any);

    if (error) {
      toast.error("Erro ao registrar evento");
      console.error(error);
    } else {
      toast.success("Evento registrado");
      setDialogOpen(false);
      setTitulo("");
      setDescricao("");
      setTipo("whatsapp");
      fetchEventos();
    }
    setSaving(false);
  }

  const config = (t: string) => TIPO_CONFIG[t] || TIPO_CONFIG.nota;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-primary" />
          <CardTitle className="text-base">Timeline Política</CardTitle>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setDialogOpen(true)}>
          <Plus className="w-3.5 h-3.5" /> Adicionar evento
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-6">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : eventos.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhum evento registrado ainda.
          </p>
        ) : (
          <div className="relative space-y-0">
            <div className="absolute left-[17px] top-2 bottom-2 w-px bg-border" />

            {eventos.map((item) => {
              const c = config(item.tipo_evento);
              const Icon = c.icon;
              return (
                <div key={item.id} className="relative flex gap-3 pb-4 last:pb-0">
                  <div className={`relative z-10 flex items-center justify-center w-9 h-9 rounded-full border shrink-0 ${c.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 pt-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{c.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(item.criado_em), "dd/MM/yyyy HH:mm")}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-foreground mt-1">{item.titulo}</p>
                    {item.descricao && (
                      <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap">{item.descricao}</p>
                    )}
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
            <DialogTitle>Adicionar Evento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo de evento</Label>
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
              <Label>Título</Label>
              <Input
                placeholder="Ex: Participou da missão..."
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                maxLength={200}
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição (opcional)</Label>
              <Textarea
                placeholder="Detalhes adicionais..."
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                rows={3}
                maxLength={2000}
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
