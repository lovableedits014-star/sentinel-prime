import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Calendar, Users, Edit, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { format, isPast } from "date-fns";
import { useState } from "react";

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
  titulo: string;
  concluido: boolean;
  display_order: number;
};

const COLUMNS = [
  { id: "pendente", label: "Pendente", color: "bg-muted/50 border-muted-foreground/20" },
  { id: "em_progresso", label: "Em Progresso", color: "bg-amber-500/5 border-amber-500/20" },
  { id: "concluida", label: "Concluída", color: "bg-emerald-500/5 border-emerald-500/20" },
];

const PRIORIDADE_DOT: Record<string, string> = {
  baixa: "bg-slate-400",
  media: "bg-blue-400",
  alta: "bg-orange-400",
  urgente: "bg-red-500 animate-pulse",
};

interface KanbanBoardProps {
  tarefas: Tarefa[];
  checklistItems: ChecklistItem[];
  teamMembers: { id: string; name: string }[];
  onStatusChange: (tarefaId: string, newStatus: string) => void;
  onEdit: (tarefa: Tarefa) => void;
  onDelete: (id: string) => void;
  onToggleChecklist: (itemId: string, concluido: boolean) => void;
}

const KanbanBoard = ({
  tarefas, checklistItems, teamMembers, onStatusChange, onEdit, onDelete, onToggleChecklist,
}: KanbanBoardProps) => {
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const newStatus = result.destination.droppableId;
    const tarefaId = result.draggableId;
    const tarefa = tarefas.find(t => t.id === tarefaId);
    if (tarefa && tarefa.status !== newStatus) {
      onStatusChange(tarefaId, newStatus);
    }
  };

  const getMemberName = (id: string | null) => {
    if (!id) return null;
    return teamMembers.find(m => m.id === id)?.name || null;
  };

  const toggleExpand = (id: string) => {
    setExpandedTasks(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {COLUMNS.map(col => {
          const colTarefas = tarefas.filter(t => t.status === col.id);
          return (
            <div key={col.id} className={`rounded-xl border p-3 ${col.color} min-h-[200px]`}>
              <div className="flex items-center justify-between mb-3 px-1">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {col.label}
                </h4>
                <Badge variant="secondary" className="text-[10px] h-5">
                  {colTarefas.length}
                </Badge>
              </div>
              <Droppable droppableId={col.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`space-y-2 min-h-[100px] rounded-lg transition-colors ${
                      snapshot.isDraggingOver ? "bg-primary/5" : ""
                    }`}
                  >
                    {colTarefas.map((t, index) => {
                      const isOverdue = t.prazo && isPast(new Date(t.prazo + "T23:59:59")) && t.status !== "concluida";
                      const prioDot = PRIORIDADE_DOT[t.prioridade] || PRIORIDADE_DOT.media;
                      const memberName = getMemberName(t.responsavel_id);
                      const items = checklistItems.filter(ci => ci.tarefa_id === t.id);
                      const doneItems = items.filter(ci => ci.concluido).length;
                      const isExpanded = expandedTasks.has(t.id);

                      return (
                        <Draggable key={t.id} draggableId={t.id} index={index}>
                          {(provided, snapshot) => (
                            <Card
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={`${snapshot.isDragging ? "shadow-lg ring-2 ring-primary/30 rotate-1" : ""} ${
                                isOverdue ? "border-destructive/40" : ""
                              }`}
                            >
                              <CardContent className="p-3 space-y-2">
                                <div className="flex items-start gap-2">
                                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${prioDot}`} />
                                  <p className={`text-sm font-medium flex-1 ${
                                    t.status === "concluida" ? "line-through text-muted-foreground" : "text-foreground"
                                  }`}>
                                    {t.titulo}
                                  </p>
                                </div>

                                <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground pl-4">
                                  {memberName && (
                                    <span className="flex items-center gap-0.5">
                                      <Users className="w-3 h-3" /> {memberName}
                                    </span>
                                  )}
                                  {t.prazo && (
                                    <span className={`flex items-center gap-0.5 ${isOverdue ? "text-destructive font-medium" : ""}`}>
                                      <Calendar className="w-3 h-3" />
                                      {format(new Date(t.prazo + "T00:00:00"), "dd/MM")}
                                    </span>
                                  )}
                                  {items.length > 0 && (
                                    <span className="flex items-center gap-0.5">
                                      <CheckCircle2 className="w-3 h-3" /> {doneItems}/{items.length}
                                    </span>
                                  )}
                                </div>

                                {/* Checklist expandable */}
                                {items.length > 0 && (
                                  <div className="pl-4">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); toggleExpand(t.id); }}
                                      className="text-[11px] text-primary/70 hover:text-primary flex items-center gap-0.5"
                                    >
                                      {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                      Checklist
                                    </button>
                                    {isExpanded && (
                                      <div className="mt-1 space-y-1">
                                        {items.sort((a, b) => a.display_order - b.display_order).map(ci => (
                                          <label key={ci.id} className="flex items-center gap-2 text-[11px] cursor-pointer group">
                                            <input
                                              type="checkbox"
                                              checked={ci.concluido}
                                              onChange={() => onToggleChecklist(ci.id, !ci.concluido)}
                                              className="rounded border-muted-foreground/30"
                                              onClick={e => e.stopPropagation()}
                                            />
                                            <span className={ci.concluido ? "line-through text-muted-foreground" : "text-foreground"}>
                                              {ci.titulo}
                                            </span>
                                          </label>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}

                                <div className="flex justify-end gap-0.5 pt-1">
                                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); onEdit(t); }}>
                                    <Edit className="w-3 h-3" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(t.id); }}>
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          )}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
};

export default KanbanBoard;
