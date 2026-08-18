import React, { useMemo, useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, Users, Edit2, Search, Filter, MapPin, UserCheck, Crown, X, FileDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Pessoa {
  id: string;
  nome: string;
  telefone: string;
  tipo: string;
  status_contratacao?: string;
  participou_reuniao?: boolean;
  parent_id?: string | null;
  regiao?: string | null;
}

interface FunnelManagementProps {
  pessoas: Pessoa[];
  onEdit: (p: Pessoa) => void;
  onQuickUpdate: (id: string, data: any) => Promise<void>;
  onOpenExport?: (reuniaoOnly?: boolean, semReuniaoOnly?: boolean) => void;
}

export function FunnelManagement({ pessoas, onEdit, onQuickUpdate, onOpenExport }: FunnelManagementProps) {
  const [regiaoFilter, setRegiaoFilter] = useState<string>("all");
  const [coordenadorFilter, setCoordenadorFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [localSearchTerm, setLocalSearchTerm] = useState<string>("");
  const [avulsosOnly, setAvulsosOnly] = useState<boolean>(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(localSearchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [localSearchTerm]);

  const coordenadores = useMemo(() => {
    return pessoas.filter(p => p.tipo === "coordenador").sort((a, b) => a.nome.localeCompare(b.nome));
  }, [pessoas]);

  const regioes = useMemo(() => {
    const set = new Set<string>();
    pessoas.forEach(p => { if (p.regiao) set.add(p.regiao); });
    return Array.from(set).sort();
  }, [pessoas]);

  const filteredPessoas = useMemo(() => {
    return pessoas.filter(p => {
      if (searchTerm) {
        const term = searchTerm.toLowerCase().trim();
        const nomeMatch = p.nome.toLowerCase().includes(term);
        const foneMatch = p.telefone && p.telefone.includes(term);
        if (!nomeMatch && !foneMatch) return false;
      }
      if (regiaoFilter !== "all" && p.regiao !== regiaoFilter) return false;
      
      if (avulsosOnly) {
        // Avulsos: Qualquer pessoa sem parent_id (Líderes ou Cabos avulsos)
        if (p.tipo === "coordenador") return false;
        if (p.parent_id) return false;
      } else if (coordenadorFilter !== "all") {
        // Filtrar por time do coordenador (Hierarquia Unificada)
        // A pessoa é o próprio coordenador, OU é um filho direto do coordenador (líder ou cabo),
        // OU é um neto (cabo de um líder que por sua vez é filho do coordenador).
        const isSelf = p.id === coordenadorFilter;
        const isChild = p.parent_id === coordenadorFilter;
        
        let isGrandchild = false;
        if (p.parent_id && !isChild) {
          // Se não for filho direto, verificamos se o pai dessa pessoa é filho do coordenador
          const pai = pessoas.find(prev => prev.id === p.parent_id);
          if (pai && pai.parent_id === coordenadorFilter) {
            isGrandchild = true;
          }
        }
        
        if (!isSelf && !isChild && !isGrandchild) return false;
      }
      
      return true;
    });
  }, [pessoas, regiaoFilter, coordenadorFilter, avulsosOnly, searchTerm]);

  const groups = useMemo(() => {
    return {
      comprometidos: filteredPessoas.filter(p => p.participou_reuniao),
      prospeccao: filteredPessoas.filter(p => !p.participou_reuniao)
    };
  }, [filteredPessoas]);

  const stats = useMemo(() => {
    if (coordenadorFilter === "all") return null;
    const coord = pessoas.find(p => p.id === coordenadorFilter);
    if (!coord) return null;

    const time = pessoas.filter(p => 
      p.parent_id === coord.id || 
      (p.parent_id && pessoas.find(prev => prev.id === p.parent_id)?.parent_id === coord.id)
    );
    const total = time.length;
    const naReuniao = time.filter(p => p.participou_reuniao).length;

    return { total, naReuniao, nome: coord.nome };
  }, [pessoas, coordenadorFilter]);

  const Column = ({ title, list, icon: Icon, color, description }: any) => (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col px-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Icon className={cn("w-4 h-4", color)} />
          {title}
          <Badge variant="secondary" className="ml-1 text-[10px]">{list.length}</Badge>
        </h3>
        {description && <p className="text-[10px] text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="space-y-2 max-h-[700px] overflow-y-auto pr-2 custom-scrollbar">
        {list.length === 0 ? (
          <div className="text-center py-12 border border-dashed rounded-xl text-muted-foreground text-xs bg-muted/20">
            Nenhum contato nesta etapa
          </div>
        ) : (
          list.map((p: any) => (
            <Card key={p.id} className="p-3 hover:shadow-md transition-shadow group relative border-l-4" style={{ borderLeftColor: p.status_contratacao === 'confirmado' ? '#10b981' : p.status_contratacao === 'em_negociacao' ? '#f59e0b' : '#94a3b8' }}>
              <div className="flex justify-between items-start gap-2 mb-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      p.tipo === 'coordenador' ? 'bg-red-500' : p.tipo === 'lider' ? 'bg-blue-500' : 'bg-green-500'
                    )} />
                    <div className="text-sm font-medium leading-tight">{p.nome}</div>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-2">
                    {p.telefone}
                    {p.regiao && <span className="flex items-center gap-0.5"><MapPin className="w-2 h-2" />{p.regiao}</span>}
                  </div>
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

              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border/50 items-center">
                <label className="flex items-center gap-1.5 cursor-pointer bg-muted/50 px-2 py-1 rounded hover:bg-muted transition-colors">
                  <Checkbox 
                    className="h-3.5 w-3.5"
                    checked={p.participou_reuniao}
                    onCheckedChange={(c) => onQuickUpdate(p.id, { participou_reuniao: !!c, reuniao_em: c ? new Date().toISOString() : null })}
                  />
                  <span className="text-[10px] font-semibold">Participou da Reunião</span>
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
  /* é importante na exportação do funil eu fazer um relatorio individual de cada coordenador de quem faltou: ou seja eu preciso saber dos lideres de um coordenador quem estava e quem nao estava na reunião: */
  /* preciso de um filtro de pesquisa  tbm, pra buscar um nome especifico */

  return (
    <div className="flex flex-col gap-6">
      {/* Filtros da Central de Comando */}
      <Card className="p-4 bg-muted/30 border-dashed">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground pr-2 border-r border-border">
            <Filter className="w-4 h-4" />
            Filtros
          </div>
          
          <div className="w-full sm:w-64 relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 opacity-50 text-muted-foreground" />
            <input 
              type="text"
              placeholder="Buscar por nome ou telefone..."
              className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={localSearchTerm}
              onChange={(e) => setLocalSearchTerm(e.target.value)}
            />
          </div>

          <div className="w-full sm:w-48">
            <Select value={regiaoFilter} onValueChange={setRegiaoFilter}>
              <SelectTrigger className="h-9">
                <MapPin className="w-3.5 h-3.5 mr-2 opacity-60" />
                <SelectValue placeholder="Todas as Regiões" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Regiões</SelectItem>
                {regioes.map(r => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-full sm:w-64">
            <Select 
              value={coordenadorFilter} 
              onValueChange={(v) => {
                setCoordenadorFilter(v);
                if (v !== "all") setAvulsosOnly(false);
              }}
            >
              <SelectTrigger className="h-9">
                <Crown className="w-3.5 h-3.5 mr-2 opacity-60 text-red-500" />
                <SelectValue placeholder="Filtrar por Coordenador" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Times</SelectItem>
                {coordenadores.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={avulsosOnly ? "default" : "outline"}
              size="sm"
              className="h-9 gap-1.5"
              onClick={() => {
                setAvulsosOnly(!avulsosOnly);
                if (!avulsosOnly) setCoordenadorFilter("all");
              }}
            >
              <Users className="w-3.5 h-3.5" />
              Apenas Avulsos
            </Button>
          </div>

          {(regiaoFilter !== "all" || coordenadorFilter !== "all" || avulsosOnly || searchTerm) && (
            <Button variant="ghost" size="sm" className="h-9 text-xs gap-1 text-muted-foreground" onClick={() => {
              setRegiaoFilter("all");
              setCoordenadorFilter("all");
              setAvulsosOnly(false);
              setSearchTerm("");
              setLocalSearchTerm("");
            }}>
              <X className="w-3 h-3" /> Limpar
            </Button>
          )}

          <div className="flex-1" />

          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="h-9 gap-1.5"
              onClick={() => onOpenExport?.(false, false)}
            >
              <FileDown className="w-3.5 h-3.5" />
              Exportar Geral
            </Button>

            {coordenadorFilter !== "all" && (
              <Button 
                variant="default" 
                size="sm" 
                className="h-9 gap-1.5 bg-blue-600 hover:bg-blue-700"
                onClick={() => onOpenExport?.(false, false)}
                title="Exportar relatório individual deste coordenador com foco em quem faltou"
              >
                <FileDown className="w-3.5 h-3.5" />
                Relatório de Faltas
              </Button>
            )}
          </div>

          {stats && (
            <div className="ml-auto bg-primary/10 border border-primary/20 px-3 py-1.5 rounded-lg flex items-center gap-3">
              <div className="text-[10px] uppercase font-bold text-primary/70 leading-none">Status do Time: <span className="text-primary">{stats.nome}</span></div>
              <div className="flex items-center gap-2 text-xs font-bold text-primary">
                <Users className="w-3 h-3" />
                {stats.naReuniao} / {stats.total} <span className="text-[10px] opacity-70">comprometidos</span>
              </div>
            </div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Column 
          title="Comprometidos (Na Reunião)" 
          list={groups.comprometidos} 
          icon={UserCheck} 
          color="text-blue-500" 
          description="Contatos que já validaram presença e compromisso com o time"
        />
        <Column 
          title="Em Prospecção / Pendentes" 
          list={groups.prospeccao} 
          icon={Search} 
          color="text-muted-foreground" 
          description="Base de contatos que ainda não confirmaram participação na reunião"
        />
      </div>
    </div>
  );
}