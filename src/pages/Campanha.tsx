import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Target, Plus, Calendar, CheckCircle2, Clock, AlertCircle,
  Trash2, Edit, Users, Flag, ArrowRight, LayoutGrid, List,
  Bell,
} from "lucide-react";
import { format, differenceInDays, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import KanbanBoard from "@/components/campanha/KanbanBoard";
import CampaignMetrics from "@/components/campanha/CampaignMetrics";

type Campanha = {
  id: string;
  client_id: string;
  titulo: string;
  descricao: string | null;
  data_inicio: string;
  data_fim: string | null;
  status: string;
  meta_principal: string | null;
  created_at: string;
};

type Tarefa = {
  id: string;
  campanha_id: string;
  client_id: string;
  titulo: string;
  descricao: string | null;
  responsavel_id: string | null;
  prazo: string | null;
  status: string;
  prioridade: string;
  created_at: string;
};

type ChecklistItem = {
  id: string;
  tarefa_id: string;
  client_id: string;
  titulo: string;
  concluido: boolean;
  display_order: number;
};

type TeamMember = {
  id: string;
  name: string;
  role: string;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  planejamento: { label: "Planejamento", color: "bg-blue-500/10 text-blue-400 border-blue-500/30", icon: Clock },
  em_andamento: { label: "Em Andamento", color: "bg-amber-500/10 text-amber-400 border-amber-500/30", icon: ArrowRight },
  concluida: { label: "Concluída", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 },
  cancelada: { label: "Cancelada", color: "bg-red-500/10 text-red-400 border-red-500/30", icon: AlertCircle },
};

const PRIORIDADE_CONFIG: Record<string, { label: string; color: string }> = {
  baixa: { label: "Baixa", color: "bg-slate-500/10 text-slate-400 border-slate-500/30" },
  media: { label: "Média", color: "bg-blue-500/10 text-blue-400 border-blue-500/30" },
  alta: { label: "Alta", color: "bg-orange-500/10 text-orange-400 border-orange-500/30" },
  urgente: { label: "Urgente", color: "bg-red-500/10 text-red-400 border-red-500/30" },
};

const TAREFA_STATUS: Record<string, { label: string }> = {
  pendente: { label: "Pendente" },
  em_progresso: { label: "Em Progresso" },
  concluida: { label: "Concluída" },
};

const CampanhaPage = () => {
  const [clientId, setClientId] = useState<string | null>(null);
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCampanha, setSelectedCampanha] = useState<Campanha | null>(null);
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");

  // Dialog states
  const [showCampanhaDialog, setShowCampanhaDialog] = useState(false);
  const [showTarefaDialog, setShowTarefaDialog] = useState(false);
  const [editingCampanha, setEditingCampanha] = useState<Campanha | null>(null);
  const [editingTarefa, setEditingTarefa] = useState<Tarefa | null>(null);

  // Campaign form
  const [formTitulo, setFormTitulo] = useState("");
  const [formDescricao, setFormDescricao] = useState("");
  const [formDataInicio, setFormDataInicio] = useState("");
  const [formDataFim, setFormDataFim] = useState("");
  const [formMeta, setFormMeta] = useState("");
  const [formStatus, setFormStatus] = useState("planejamento");

  // Task form
  const [tarefaTitulo, setTarefaTitulo] = useState("");
  const [tarefaDescricao, setTarefaDescricao] = useState("");
  const [tarefaResponsavel, setTarefaResponsavel] = useState("");
  const [tarefaPrazo, setTarefaPrazo] = useState("");
  const [tarefaPrioridade, setTarefaPrioridade] = useState("media");
  const [tarefaStatus, setTarefaStatus] = useState("pendente");
  const [tarefaChecklistText, setTarefaChecklistText] = useState("");

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data: client } = await supabase
      .from("clients").select("id").eq("user_id", session.user.id).maybeSingle();

    let cId = client?.id;
    if (!cId) {
      const { data: tm } = await supabase
        .from("team_members").select("client_id").eq("user_id", session.user.id).eq("status", "active").maybeSingle();
      cId = tm?.client_id;
    }
    if (!cId) { setLoading(false); return; }
    setClientId(cId);

    const [campanhasRes, tarefasRes, teamRes, checklistRes] = await Promise.all([
      supabase.from("campanhas").select("*").eq("client_id", cId).order("created_at", { ascending: false }),
      supabase.from("campanha_tarefas").select("*").eq("client_id", cId).order("prazo", { ascending: true }),
      supabase.from("team_members").select("id, name, role").eq("client_id", cId).eq("status", "active"),
      supabase.from("campanha_tarefa_items").select("*").eq("client_id", cId).order("display_order", { ascending: true }),
    ]);

    if (campanhasRes.data) setCampanhas(campanhasRes.data as Campanha[]);
    if (tarefasRes.data) setTarefas(tarefasRes.data as Tarefa[]);
    if (teamRes.data) setTeamMembers(teamRes.data);
    if (checklistRes.data) setChecklistItems(checklistRes.data as ChecklistItem[]);
    setLoading(false);
  };

  // ─── Campaign CRUD ───
  const openNewCampanha = () => {
    setEditingCampanha(null);
    setFormTitulo(""); setFormDescricao("");
    setFormDataInicio(format(new Date(), "yyyy-MM-dd"));
    setFormDataFim(""); setFormMeta(""); setFormStatus("planejamento");
    setShowCampanhaDialog(true);
  };

  const openEditCampanha = (c: Campanha) => {
    setEditingCampanha(c);
    setFormTitulo(c.titulo); setFormDescricao(c.descricao || "");
    setFormDataInicio(c.data_inicio); setFormDataFim(c.data_fim || "");
    setFormMeta(c.meta_principal || ""); setFormStatus(c.status);
    setShowCampanhaDialog(true);
  };

  const saveCampanha = async () => {
    if (!clientId || !formTitulo.trim()) return;
    const payload = {
      client_id: clientId,
      titulo: formTitulo.trim(),
      descricao: formDescricao.trim() || null,
      data_inicio: formDataInicio,
      data_fim: formDataFim || null,
      meta_principal: formMeta.trim() || null,
      status: formStatus,
    };

    if (editingCampanha) {
      const { error } = await supabase.from("campanhas").update(payload).eq("id", editingCampanha.id);
      if (error) { toast.error("Erro ao atualizar campanha"); return; }
      toast.success("Campanha atualizada");
    } else {
      const { error } = await supabase.from("campanhas").insert(payload);
      if (error) { toast.error("Erro ao criar campanha"); return; }
      toast.success("Campanha criada");
    }
    setShowCampanhaDialog(false);
    loadData();
  };

  const deleteCampanha = async (id: string) => {
    const { error } = await supabase.from("campanhas").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir"); return; }
    toast.success("Campanha excluída");
    if (selectedCampanha?.id === id) setSelectedCampanha(null);
    loadData();
  };

  // ─── Task CRUD ───
  const openNewTarefa = () => {
    setEditingTarefa(null);
    setTarefaTitulo(""); setTarefaDescricao("");
    setTarefaResponsavel(""); setTarefaPrazo("");
    setTarefaPrioridade("media"); setTarefaStatus("pendente");
    setTarefaChecklistText("");
    setShowTarefaDialog(true);
  };

  const openEditTarefa = (t: Tarefa) => {
    setEditingTarefa(t);
    setTarefaTitulo(t.titulo); setTarefaDescricao(t.descricao || "");
    setTarefaResponsavel(t.responsavel_id || "");
    setTarefaPrazo(t.prazo || ""); setTarefaPrioridade(t.prioridade);
    setTarefaStatus(t.status); setTarefaChecklistText("");
    setShowTarefaDialog(true);
  };

  const saveTarefa = async () => {
    if (!clientId || !selectedCampanha || !tarefaTitulo.trim()) return;
    const payload = {
      campanha_id: selectedCampanha.id,
      client_id: clientId,
      titulo: tarefaTitulo.trim(),
      descricao: tarefaDescricao.trim() || null,
      responsavel_id: tarefaResponsavel && tarefaResponsavel !== "none" ? tarefaResponsavel : null,
      prazo: tarefaPrazo || null,
      prioridade: tarefaPrioridade,
      status: tarefaStatus,
    };

    let tarefaId: string | null = null;

    if (editingTarefa) {
      const { error } = await supabase.from("campanha_tarefas").update(payload).eq("id", editingTarefa.id);
      if (error) { toast.error("Erro ao atualizar tarefa"); return; }
      tarefaId = editingTarefa.id;
      toast.success("Tarefa atualizada");
    } else {
      const { data, error } = await supabase.from("campanha_tarefas").insert(payload).select("id").single();
      if (error) { toast.error("Erro ao criar tarefa"); return; }
      tarefaId = data.id;
      toast.success("Tarefa criada");
    }

    // Save checklist items (new ones from text, one per line)
    if (tarefaChecklistText.trim() && tarefaId && clientId) {
      const lines = tarefaChecklistText.split("\n").map(l => l.trim()).filter(Boolean);
      const existingCount = checklistItems.filter(ci => ci.tarefa_id === tarefaId).length;
      const newItems = lines.map((titulo, i) => ({
        tarefa_id: tarefaId!,
        client_id: clientId!,
        titulo,
        display_order: existingCount + i,
        concluido: false,
      }));
      if (newItems.length > 0) {
        await supabase.from("campanha_tarefa_items").insert(newItems);
      }
    }

    setShowTarefaDialog(false);
    loadData();
  };

  const deleteTarefa = async (id: string) => {
    await supabase.from("campanha_tarefas").delete().eq("id", id);
    toast.success("Tarefa excluída");
    loadData();
  };

  const updateTarefaStatus = async (tarefaId: string, newStatus: string) => {
    await supabase.from("campanha_tarefas").update({ status: newStatus }).eq("id", tarefaId);
    loadData();
  };

  const toggleChecklistItem = async (itemId: string, concluido: boolean) => {
    await supabase.from("campanha_tarefa_items").update({ concluido }).eq("id", itemId);
    loadData();
  };

  const deleteChecklistItem = async (itemId: string) => {
    await supabase.from("campanha_tarefa_items").delete().eq("id", itemId);
    loadData();
  };

  // ─── Helpers ───
  const campanhasTarefas = selectedCampanha
    ? tarefas.filter(t => t.campanha_id === selectedCampanha.id)
    : [];

  const campanhaChecklist = selectedCampanha
    ? checklistItems.filter(ci => campanhasTarefas.some(t => t.id === ci.tarefa_id))
    : [];

  const getProgress = (campanhaId: string) => {
    const ct = tarefas.filter(t => t.campanha_id === campanhaId);
    if (ct.length === 0) return 0;
    return Math.round((ct.filter(t => t.status === "concluida").length / ct.length) * 100);
  };

  const getTaskCount = (campanhaId: string) => tarefas.filter(t => t.campanha_id === campanhaId).length;
  const getOverdueCount = (campanhaId: string) =>
    tarefas.filter(t => t.campanha_id === campanhaId && t.prazo && isPast(new Date(t.prazo + "T23:59:59")) && t.status !== "concluida").length;

  const getMemberName = (id: string | null) => {
    if (!id) return "Sem responsável";
    return teamMembers.find(m => m.id === id)?.name || "Desconhecido";
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Target className="w-6 h-6 text-primary" />
            Modo Campanha
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Organize suas campanhas eleitorais ou de mobilização. Crie campanhas com metas, prazos e tarefas — atribua responsáveis da equipe e acompanhe o progresso em um quadro Kanban ou lista.
          </p>
        </div>
        <Button onClick={openNewCampanha} className="gap-2">
          <Plus className="w-4 h-4" /> Nova Campanha
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Campanhas Sidebar */}
        <div className="lg:col-span-1 space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-1">
            Campanhas ({campanhas.length})
          </h2>
          {campanhas.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-6 text-center text-muted-foreground">
                <Target className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhuma campanha criada</p>
                <Button variant="outline" size="sm" className="mt-3 gap-1" onClick={openNewCampanha}>
                  <Plus className="w-3 h-3" /> Criar primeira
                </Button>
              </CardContent>
            </Card>
          ) : (
            campanhas.map(c => {
              const sc = STATUS_CONFIG[c.status] || STATUS_CONFIG.planejamento;
              const Icon = sc.icon;
              const progress = getProgress(c.id);
              const isSelected = selectedCampanha?.id === c.id;
              const overdue = getOverdueCount(c.id);
              return (
                <Card
                  key={c.id}
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    isSelected ? "ring-2 ring-primary shadow-md" : ""
                  }`}
                  onClick={() => setSelectedCampanha(c)}
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-foreground text-sm leading-tight">{c.titulo}</h3>
                      <Badge variant="outline" className={`text-[10px] shrink-0 ${sc.color}`}>
                        <Icon className="w-3 h-3 mr-1" />
                        {sc.label}
                      </Badge>
                    </div>
                    {c.meta_principal && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Flag className="w-3 h-3" /> {c.meta_principal}
                      </p>
                    )}
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {format(new Date(c.data_inicio + "T00:00:00"), "dd MMM", { locale: ptBR })}
                        {c.data_fim && ` → ${format(new Date(c.data_fim + "T00:00:00"), "dd MMM", { locale: ptBR })}`}
                      </span>
                      <span>{getTaskCount(c.id)} tarefas</span>
                    </div>
                    {overdue > 0 && (
                      <p className="text-[11px] text-destructive font-medium flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> {overdue} atrasada(s)
                      </p>
                    )}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Progresso</span>
                        <span>{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-1.5" />
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {/* Detail Panel */}
        <div className="lg:col-span-3">
          {!selectedCampanha ? (
            <Card className="border-dashed h-full flex items-center justify-center min-h-[400px]">
              <CardContent className="text-center text-muted-foreground">
                <Target className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>Selecione uma campanha para ver os detalhes</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Campaign Header */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{selectedCampanha.titulo}</CardTitle>
                      {selectedCampanha.descricao && (
                        <CardDescription className="mt-1">{selectedCampanha.descricao}</CardDescription>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEditCampanha(selectedCampanha)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteCampanha(selectedCampanha.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {selectedCampanha.meta_principal && (
                    <div className="p-3 border border-primary/20 bg-primary/5 rounded-lg flex items-center gap-2 mb-3">
                      <Flag className="w-4 h-4 text-primary shrink-0" />
                      <span className="text-sm font-medium text-foreground">{selectedCampanha.meta_principal}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-[10px] text-muted-foreground uppercase font-medium">Status</p>
                      <p className="font-semibold text-foreground mt-0.5">
                        {STATUS_CONFIG[selectedCampanha.status]?.label || selectedCampanha.status}
                      </p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-[10px] text-muted-foreground uppercase font-medium">Prazo</p>
                      <p className="font-semibold text-foreground mt-0.5">
                        {selectedCampanha.data_fim
                          ? `${differenceInDays(new Date(selectedCampanha.data_fim + "T00:00:00"), new Date())} dias`
                          : "Sem prazo"}
                      </p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-[10px] text-muted-foreground uppercase font-medium">Progresso</p>
                      <p className="font-semibold text-foreground mt-0.5">{getProgress(selectedCampanha.id)}%</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Metrics */}
              {campanhasTarefas.length > 0 && (
                <CampaignMetrics tarefas={campanhasTarefas} teamMembers={teamMembers} />
              )}

              {/* Tasks Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    Tarefas ({campanhasTarefas.length})
                  </h3>
                  <div className="flex border rounded-md overflow-hidden">
                    <button
                      onClick={() => setViewMode("kanban")}
                      className={`p-1.5 ${viewMode === "kanban" ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:text-foreground"}`}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setViewMode("list")}
                      className={`p-1.5 ${viewMode === "list" ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:text-foreground"}`}
                    >
                      <List className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <Button size="sm" onClick={openNewTarefa} className="gap-1">
                  <Plus className="w-3 h-3" /> Tarefa
                </Button>
              </div>

              {/* Views */}
              {campanhasTarefas.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="p-6 text-center text-muted-foreground text-sm">
                    Nenhuma tarefa adicionada a esta campanha
                  </CardContent>
                </Card>
              ) : viewMode === "kanban" ? (
                <KanbanBoard
                  tarefas={campanhasTarefas}
                  checklistItems={campanhaChecklist}
                  teamMembers={teamMembers}
                  onStatusChange={updateTarefaStatus}
                  onEdit={openEditTarefa}
                  onDelete={deleteTarefa}
                  onToggleChecklist={toggleChecklistItem}
                />
              ) : (
                /* List View */
                <div className="space-y-2">
                  {campanhasTarefas.map(t => {
                    const prio = PRIORIDADE_CONFIG[t.prioridade] || PRIORIDADE_CONFIG.media;
                    const isOverdue = t.prazo && isPast(new Date(t.prazo + "T23:59:59")) && t.status !== "concluida";
                    const items = checklistItems.filter(ci => ci.tarefa_id === t.id);
                    const doneItems = items.filter(ci => ci.concluido).length;
                    return (
                      <Card key={t.id} className={isOverdue ? "border-destructive/40" : ""}>
                        <CardContent className="p-3 flex items-center gap-3">
                          <button
                            onClick={() => updateTarefaStatus(t.id, t.status === "concluida" ? "pendente" : "concluida")}
                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                              t.status === "concluida"
                                ? "bg-emerald-500 border-emerald-500"
                                : "border-muted-foreground/30 hover:border-primary"
                            }`}
                          >
                            {t.status === "concluida" && <CheckCircle2 className="w-3 h-3 text-white" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${t.status === "concluida" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                              {t.titulo}
                            </p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <Badge variant="outline" className={`text-[10px] ${prio.color}`}>{prio.label}</Badge>
                              <Badge variant="outline" className="text-[10px]">{TAREFA_STATUS[t.status]?.label || t.status}</Badge>
                              {t.responsavel_id && (
                                <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                                  <Users className="w-3 h-3" /> {getMemberName(t.responsavel_id)}
                                </span>
                              )}
                              {t.prazo && (
                                <span className={`text-[11px] flex items-center gap-0.5 ${isOverdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                                  <Calendar className="w-3 h-3" />
                                  {format(new Date(t.prazo + "T00:00:00"), "dd/MM")}
                                  {isOverdue && " (atrasada)"}
                                </span>
                              )}
                              {items.length > 0 && (
                                <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                                  <CheckCircle2 className="w-3 h-3" /> {doneItems}/{items.length}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditTarefa(t)}>
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteTarefa(t.id)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Campaign Dialog */}
      <Dialog open={showCampanhaDialog} onOpenChange={setShowCampanhaDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCampanha ? "Editar Campanha" : "Nova Campanha"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Título *</label>
              <Input value={formTitulo} onChange={e => setFormTitulo(e.target.value)} placeholder="Ex: Campanha de Rua - Março" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Descrição</label>
              <Textarea value={formDescricao} onChange={e => setFormDescricao(e.target.value)} placeholder="Detalhes da campanha..." rows={3} />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Meta Principal</label>
              <Input value={formMeta} onChange={e => setFormMeta(e.target.value)} placeholder="Ex: Alcançar 500 novos apoiadores" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground">Início</label>
                <Input type="date" value={formDataInicio} onChange={e => setFormDataInicio(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Fim</label>
                <Input type="date" value={formDataFim} onChange={e => setFormDataFim(e.target.value)} />
              </div>
            </div>
            {editingCampanha && (
              <div>
                <label className="text-sm font-medium text-foreground">Status</label>
                <Select value={formStatus} onValueChange={setFormStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCampanhaDialog(false)}>Cancelar</Button>
            <Button onClick={saveCampanha} disabled={!formTitulo.trim()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Task Dialog */}
      <Dialog open={showTarefaDialog} onOpenChange={setShowTarefaDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTarefa ? "Editar Tarefa" : "Nova Tarefa"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Título *</label>
              <Input value={tarefaTitulo} onChange={e => setTarefaTitulo(e.target.value)} placeholder="Ex: Distribuir panfletos no centro" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Descrição</label>
              <Textarea value={tarefaDescricao} onChange={e => setTarefaDescricao(e.target.value)} placeholder="Detalhes..." rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground">Responsável</label>
                <Select value={tarefaResponsavel} onValueChange={setTarefaResponsavel}>
                  <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem responsável</SelectItem>
                    {teamMembers.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Prazo</label>
                <Input type="date" value={tarefaPrazo} onChange={e => setTarefaPrazo(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground">Prioridade</label>
                <Select value={tarefaPrioridade} onValueChange={setTarefaPrioridade}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRIORIDADE_CONFIG).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {editingTarefa && (
                <div>
                  <label className="text-sm font-medium text-foreground">Status</label>
                  <Select value={tarefaStatus} onValueChange={setTarefaStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TAREFA_STATUS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Checklist input */}
            <div>
              <label className="text-sm font-medium text-foreground flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Checklist {editingTarefa ? "(adicionar novos itens)" : ""}
              </label>
              <Textarea
                value={tarefaChecklistText}
                onChange={e => setTarefaChecklistText(e.target.value)}
                placeholder="Um item por linha:&#10;Imprimir material&#10;Reservar local&#10;Confirmar equipe"
                rows={3}
                className="text-sm"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Um item por linha. Serão criados como sub-itens da tarefa.</p>
            </div>

            {/* Existing checklist items (edit mode) */}
            {editingTarefa && checklistItems.filter(ci => ci.tarefa_id === editingTarefa.id).length > 0 && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Itens existentes:</label>
                <div className="mt-1 space-y-1 max-h-32 overflow-y-auto">
                  {checklistItems
                    .filter(ci => ci.tarefa_id === editingTarefa.id)
                    .sort((a, b) => a.display_order - b.display_order)
                    .map(ci => (
                      <div key={ci.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={ci.concluido}
                          onChange={() => toggleChecklistItem(ci.id, !ci.concluido)}
                          className="rounded"
                        />
                        <span className={`flex-1 ${ci.concluido ? "line-through text-muted-foreground" : ""}`}>{ci.titulo}</span>
                        <button onClick={() => deleteChecklistItem(ci.id)} className="text-destructive hover:text-destructive/80">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTarefaDialog(false)}>Cancelar</Button>
            <Button onClick={saveTarefa} disabled={!tarefaTitulo.trim()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CampanhaPage;
