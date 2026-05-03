import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ChevronRight, Crown, Briefcase, CheckCircle2, AlertCircle, Users, CalendarCheck,
  Trash2, Copy, Phone, MapPin, Award,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import ContractPrintDialog from "./ContractPrintDialog";
import type { Contratado, Indicado, CheckinAgg } from "./useContratadosData";

interface Props {
  clientId: string;
  clientName: string;
  contratados: Contratado[];
  setContratados: (cb: (prev: Contratado[]) => Contratado[]) => void;
  indicados: Indicado[];
  setIndicados: (cb: (prev: Indicado[]) => Indicado[]) => void;
  checkinStats: Record<string, CheckinAgg>;
  search: string;
  filterLider: string; // "all" | "none" | <id>
  filterStatus: string; // "all" | "ativo" | "inativo"
}

export default function TeamTree({
  clientId, clientName, contratados, setContratados, indicados, setIndicados, checkinStats,
  search, filterLider, filterStatus,
}: Props) {
  const today = new Date().toISOString().split("T")[0];

  const liderMap = useMemo(() => {
    const m: Record<string, string> = {};
    contratados.filter(c => c.is_lider).forEach(c => { m[c.id] = c.nome; });
    return m;
  }, [contratados]);

  // expand state per leader
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (id: string) =>
    setExpanded(prev => ({ ...prev, [id]: prev[id] === undefined ? false : !prev[id] }));
  const isOpen = (id: string) => expanded[id] !== false; // default open

  const matchesSearch = (c: Contratado) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.nome.toLowerCase().includes(q)
      || c.telefone.includes(search)
      || (c.cidade || "").toLowerCase().includes(q)
      || (c.zona_eleitoral || "").toLowerCase().includes(q);
  };
  const matchesStatus = (c: Contratado) => filterStatus === "all" || c.status === filterStatus;

  const indicadosOf = (cid: string) => indicados.filter(i => i.contratado_id === cid);

  const liderIds = contratados.filter(c => c.is_lider).map(c => c.id);
  const visibleLiderIds = filterLider === "all" || filterLider === "none"
    ? liderIds
    : liderIds.filter(id => id === filterLider);

  const noLeaderList = contratados.filter(c => !c.lider_id && !c.is_lider && matchesSearch(c) && matchesStatus(c));
  const showNoLeader = filterLider === "all" || filterLider === "none";

  async function deleteContratado(id: string) {
    if (!confirm("Excluir este contratado? Indicados e check-ins dele também serão removidos.")) return;
    await supabase.from("contratado_indicados").delete().eq("contratado_id", id);
    await supabase.from("contratado_checkins").delete().eq("contratado_id", id);
    const { error } = await supabase.from("contratados").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir."); return; }
    setContratados(prev => prev.filter(c => c.id !== id));
    setIndicados(prev => prev.filter(i => i.contratado_id !== id));
    toast.success("Excluído!");
  }

  async function assignLider(contratadoId: string, liderId: string | null) {
    await supabase.from("contratados").update({ lider_id: liderId } as any).eq("id", contratadoId);
    setContratados(prev => prev.map(c => c.id === contratadoId ? { ...c, lider_id: liderId } : c));
    toast.success(liderId ? "Líder atribuído!" : "Líder removido!");
  }

  async function updateQuota(id: string, quota: number) {
    await supabase.from("contratados").update({ quota_indicados: quota } as any).eq("id", id);
    setContratados(prev => prev.map(c => c.id === id ? { ...c, quota_indicados: quota } : c));
    toast.success("Meta atualizada!");
  }

  if (contratados.length === 0) {
    return (
      <Card className="py-16 text-center text-muted-foreground border-dashed">
        <Briefcase className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="font-medium">Nenhum contratado ainda</p>
        <p className="text-sm mt-1">Compartilhe o link de cadastro de líder para começar.</p>
      </Card>
    );
  }

  const renderMember = (c: Contratado, depth: number) => {
    const inds = indicadosOf(c.id);
    const stats = checkinStats[c.id];
    const cToday = stats?.last === today;
    const meta = c.quota_indicados;
    const pct = meta > 0 ? Math.min(100, Math.round((inds.length / meta) * 100)) : 0;

    return (
      <div
        key={c.id}
        className="group flex flex-col md:flex-row md:items-center gap-3 p-3 hover:bg-muted/30 transition-colors border-b last:border-b-0"
        style={{ paddingLeft: `${depth * 24 + 12}px` }}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-1 h-8 rounded-full bg-border shrink-0" aria-hidden />
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
            c.is_lider ? "bg-amber-500/10 text-amber-600" : "bg-primary/10 text-primary"
          )}>
            {c.is_lider ? <Crown className="w-4 h-4" /> : <Briefcase className="w-4 h-4" />}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{c.nome}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
              <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.telefone}</span>
              {c.cidade && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{c.cidade}</span>}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {c.contrato_aceito ? (
            <Badge variant="outline" className="text-[10px] gap-1 border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3 h-3" />Contrato
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] gap-1 border-amber-500/30 text-amber-600">
              <AlertCircle className="w-3 h-3" />Pendente
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px] gap-1">
            <CalendarCheck className={cn("w-3 h-3", cToday && "text-emerald-500")} />
            {stats?.total || 0}{cToday && " ✓"}
          </Badge>
          <Badge variant="outline" className="text-[10px] gap-1">
            <Users className="w-3 h-3" />{inds.length}/{meta}
          </Badge>
          {inds.length >= meta && meta > 0 && (
            <Badge className="text-[10px] gap-1 bg-emerald-500 hover:bg-emerald-500"><Award className="w-3 h-3" />Meta</Badge>
          )}
        </div>

        <div className="hidden md:block w-32 shrink-0">
          <Progress value={pct} className="h-1.5" />
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {!c.is_lider && (
            <Select value={c.lider_id || "none"} onValueChange={(v) => assignLider(c.id, v === "none" ? null : v)}>
              <SelectTrigger className="h-7 w-[130px] text-xs"><SelectValue placeholder="Líder" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem líder</SelectItem>
                {Object.entries(liderMap).map(([id, nome]) => (
                  <SelectItem key={id} value={id}>{nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Input
            type="number"
            className="w-14 h-7 text-xs"
            defaultValue={c.quota_indicados}
            onBlur={(e) => {
              const v = parseInt(e.target.value);
              if (v > 0 && v !== c.quota_indicados) updateQuota(c.id, v);
            }}
            min={1}
            title="Meta de indicados"
          />
          <ContractPrintDialog
            contratado={c}
            clientName={clientName}
            liderName={c.lider_id ? liderMap[c.lider_id] : (c.is_lider ? c.nome : undefined)}
            clientId={clientId}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => deleteContratado(c.id)}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Card className="overflow-hidden">
      {visibleLiderIds.map(liderId => {
        const lider = contratados.find(c => c.id === liderId);
        if (!lider) return null;
        const membros = contratados.filter(c => c.lider_id === liderId && matchesSearch(c) && matchesStatus(c));
        const matchesLeaderSelf = matchesSearch(lider) && matchesStatus(lider);

        // se filtro está aplicado e nem o líder nem membros batem, oculta
        if (filterLider !== filterLider && !matchesLeaderSelf && membros.length === 0) return null;
        if ((search || filterStatus !== "all") && !matchesLeaderSelf && membros.length === 0) return null;

        const totalInds = membros.reduce((s, c) => s + indicadosOf(c.id).length, 0)
          + indicadosOf(lider.id).length;
        const totalQuota = membros.reduce((s, c) => s + c.quota_indicados, 0) + lider.quota_indicados;
        const pct = totalQuota > 0 ? Math.round((totalInds / totalQuota) * 100) : 0;
        const checkedToday = (membros.filter(c => checkinStats[c.id]?.last === today).length)
          + (checkinStats[lider.id]?.last === today ? 1 : 0);
        const totalEquipe = membros.length + 1;
        const liderRegUrl = `${window.location.origin}/contratado/${clientId}/${liderId}`;
        const open = isOpen(liderId);

        return (
          <div key={liderId} className="border-b last:border-b-0">
            {/* Leader row */}
            <button
              type="button"
              onClick={() => toggle(liderId)}
              className="w-full flex items-center gap-3 p-4 hover:bg-muted/40 transition-colors text-left"
            >
              <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform shrink-0", open && "rotate-90")} />
              <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                <Crown className="w-5 h-5 text-amber-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold truncate">{lider.nome}</p>
                  <Badge variant="secondary" className="text-[10px]">Líder</Badge>
                  {lider.cidade && <span className="text-xs text-muted-foreground">📍 {lider.cidade}</span>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {totalEquipe} {totalEquipe === 1 ? "pessoa" : "pessoas"} • {totalInds}/{totalQuota} indicados • {checkedToday}/{totalEquipe} presença hoje
                </p>
              </div>
              <div className="hidden md:flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Meta</p>
                  <p className="text-sm font-semibold tabular-nums">{pct}%</p>
                </div>
                <div className="w-24">
                  <Progress value={pct} className="h-1.5" />
                </div>
              </div>
            </button>

            {/* Children */}
            {open && (
              <div className="bg-muted/10">
                {/* leader's own row (as a member with kpis) */}
                {renderMember(lider, 1)}
                {membros.length === 0 ? (
                  <div className="text-center py-6 text-xs text-muted-foreground bg-muted/10 border-t">
                    Sem liderados ainda. Copie o link e envie ao líder:
                    <div className="flex items-center gap-2 max-w-md mx-auto mt-2">
                      <code className="flex-1 truncate text-[10px] bg-background border rounded px-2 py-1">{liderRegUrl}</code>
                      <Button size="sm" variant="ghost" className="h-7"
                        onClick={() => { navigator.clipboard.writeText(liderRegUrl); toast.success("Copiado!"); }}>
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  membros.map(m => renderMember(m, 1))
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Sem líder */}
      {showNoLeader && noLeaderList.length > 0 && (
        <div className="border-b last:border-b-0">
          <button
            type="button"
            onClick={() => toggle("__noleader__")}
            className="w-full flex items-center gap-3 p-4 hover:bg-muted/40 transition-colors text-left"
          >
            <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform shrink-0", isOpen("__noleader__") && "rotate-90")} />
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
              <Briefcase className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Sem líder vinculado</p>
              <p className="text-xs text-muted-foreground">{noLeaderList.length} contratados aguardando atribuição</p>
            </div>
          </button>
          {isOpen("__noleader__") && (
            <div className="bg-muted/10">
              {noLeaderList.map(m => renderMember(m, 1))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
