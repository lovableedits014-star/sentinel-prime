import React, { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertCircle, MessageCircle, CheckCircle2, Users, Star, Edit2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Pessoa {
  id: string;
  nome: string;
  telefone: string;
  tipo: string;
  status_contratacao?: string;
  participou_reuniao?: boolean;
  pre_selecionado?: boolean;
}

interface FunnelManagementProps {
  pessoas: Pessoa[];
  onEdit: (p: Pessoa) => void;
  onQuickUpdate: (id: string, data: any) => Promise<void>;
}

export function FunnelManagement({ pessoas, onEdit, onQuickUpdate }: FunnelManagementProps) {
  const groups = useMemo(() => {
    return {
      reuniao: pessoas.filter(p => p.participou_reuniao),
      pre: pessoas.filter(p => p.pre_selecionado && !p.participou_reuniao),
      outros: pessoas.filter(p => !p.participou_reuniao && !p.pre_selecionado)
    };
  }, [pessoas]);

  const Column = ({ title, list, icon: Icon, color }: any) => (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between px-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Icon className={cn("w-4 h-4", color)} />
          {title}
          <Badge variant="secondary" className="ml-1 text-[10px]">{list.length}</Badge>
        </h3>
      </div>
      <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
        {list.length === 0 ? (
          <div className="text-center py-8 border border-dashed rounded-lg text-muted-foreground text-xs">
            Nenhum contato nesta etapa
          </div>
        ) : (
          list.map((p: any) => (
            <Card key={p.id} className="p-3 hover:shadow-md transition-shadow group relative border-l-4" style={{ borderLeftColor: p.status_contratacao === 'confirmado' ? '#10b981' : p.status_contratacao === 'em_negociacao' ? '#f59e0b' : '#94a3b8' }}>
              <div className="flex justify-between items-start gap-2 mb-2">
                <div>
                  <div className="text-sm font-medium leading-tight">{p.nome}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{p.telefone}</div>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" 
                  onClick={() => onEdit(p)}
                >
                  <Edit2 className="w-3 h-3" />
                </Button>
              </div>

              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border/50">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <Checkbox 
                    className="h-3.5 w-3.5"
                    checked={p.participou_reuniao}
                    onCheckedChange={(c) => onQuickUpdate(p.id, { participou_reuniao: !!c, reuniao_em: c ? new Date().toISOString() : null })}
                  />
                  <span className="text-[10px] font-medium">Reunião</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <Checkbox 
                    className="h-3.5 w-3.5"
                    checked={p.pre_selecionado}
                    onCheckedChange={(c) => onQuickUpdate(p.id, { pre_selecionado: !!c })}
                  />
                  <span className="text-[10px] font-medium">Pré-sel.</span>
                </label>
                
                <div className="flex-1" />
                
                {p.status_contratacao === 'confirmado' ? (
                  <Badge className="bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 text-[9px] h-5 px-1.5 border-emerald-500/30">Confirmado</Badge>
                ) : p.status_contratacao === 'em_negociacao' ? (
                  <Badge className="bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 text-[9px] h-5 px-1.5 border-amber-500/30 text-nowrap">Em Negociação</Badge>
                ) : (
                  <Badge variant="outline" className="text-[9px] h-5 px-1.5 text-muted-foreground">Pendente</Badge>
                )}
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
      <Column title="Na Reunião / Com Agente" list={groups.reuniao} icon={Users} color="text-blue-500" />
      <Column title="Pré-selecionados" list={groups.pre} icon={Star} color="text-amber-500" />
      <Column title="Base / Prospecção" list={groups.outros} icon={AlertCircle} color="text-muted-foreground" />
    </div>
  );
}
