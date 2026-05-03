import { useMemo, useState } from "react";
import {
  Briefcase, Search, Users, QrCode, Loader2, FileText,
  CheckCircle2, AlertCircle, PhoneCall, Crown, Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client-selfhosted";

import ContratadosSubNav from "@/components/contratados/ContratadosSubNav";
import KpiCard from "@/components/contratados/KpiCard";
import TeamTree from "@/components/contratados/TeamTree";
import { useContratadosData } from "@/components/contratados/useContratadosData";
import ContractTemplatesManager from "@/components/contratados/ContractTemplatesManager";
import TelemarketingResultsPanel from "@/components/contratados/TelemarketingResultsPanel";

export default function Contratados() {
  const {
    clientId, clientName, contratados, setContratados,
    indicados, setIndicados, checkinStats, loading,
  } = useContratadosData();

  const [search, setSearch] = useState("");
  const [filterLider, setFilterLider] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showLinks, setShowLinks] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  const liderMap = useMemo(() => {
    const m: Record<string, string> = {};
    contratados.filter(c => c.is_lider).forEach(c => { m[c.id] = c.nome; });
    return m;
  }, [contratados]);

  // Trends (últimos 7 dias vs 7 anteriores)
  const trends = useMemo(() => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const lastWeek = (createdAt: string) => {
      const d = new Date(createdAt).getTime();
      return now - d < 7 * day;
    };
    const prevWeek = (createdAt: string) => {
      const d = new Date(createdAt).getTime();
      return now - d >= 7 * day && now - d < 14 * day;
    };
    const indNow = indicados.filter(i => lastWeek(i.created_at)).length;
    const indPrev = indicados.filter(i => prevWeek(i.created_at)).length;
    const indTrend = indPrev === 0 ? (indNow > 0 ? 100 : 0) : Math.round(((indNow - indPrev) / indPrev) * 100);
    return { indTrend };
  }, [indicados]);

  const totalContratados = contratados.length;
  const contratosOk = contratados.filter(c => c.contrato_aceito).length;
  const contratosPct = totalContratados > 0 ? Math.round((contratosOk / totalContratados) * 100) : 0;
  const totalIndicados = indicados.length;
  const pendentes = indicados.filter(i => i.status === "pendente").length;

  const registrationUrl = clientId ? `${window.location.origin}/contratado/${clientId}` : "";
  const portalUrl = clientId ? `${window.location.origin}/portal-contratado/${clientId}` : "";

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="p-4 md:p-6">
      <ContratadosSubNav />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-primary" />
            Equipe de Campo
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Gerencie sua rede hierárquica de líderes e contratados. Acompanhe presença, contratos assinados e meta de indicações.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Dialog open={showTemplates} onOpenChange={setShowTemplates}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5"><FileText className="w-4 h-4" />Modelos de Contrato</Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Modelos de Contrato</DialogTitle></DialogHeader>
              {clientId && <ContractTemplatesManager clientId={clientId} />}
            </DialogContent>
          </Dialog>

          <Dialog open={showLinks} onOpenChange={setShowLinks}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5"><QrCode className="w-4 h-4" />Links Públicos</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Links do Sistema</DialogTitle><DialogDescription>Compartilhe estes links</DialogDescription></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium">👑 Cadastro de Líder</Label>
                  <div className="flex items-center gap-2">
                    <Input value={registrationUrl} readOnly className="text-xs" />
                    <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(registrationUrl); toast.success("Copiado!"); }}><Copy className="w-4 h-4" /></Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Portal do Contratado</Label>
                  <div className="flex items-center gap-2">
                    <Input value={portalUrl} readOnly className="text-xs" />
                    <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(portalUrl); toast.success("Copiado!"); }}><Copy className="w-4 h-4" /></Button>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Contratados" value={totalContratados} hint={`${Object.keys(liderMap).length} líderes`} icon={Users} />
        <KpiCard label="Contratos" value={`${contratosOk}/${totalContratados}`} hint={`${contratosPct}% assinados`} icon={contratosPct >= 70 ? CheckCircle2 : AlertCircle} accent={contratosPct >= 70 ? "success" : "warning"} />
        <KpiCard label="Indicados" value={totalIndicados} icon={Users} trend={{ value: trends.indTrend, label: "vs 7 dias" }} />
        <KpiCard label="Telemarketing" value={pendentes} hint="aguardando ligação" icon={PhoneCall} accent={pendentes > 0 ? "warning" : "success"} />
      </div>

      <Tabs defaultValue="equipe">
        <TabsList>
          <TabsTrigger value="equipe" className="gap-1.5"><Briefcase className="w-3.5 h-3.5" />Equipe</TabsTrigger>
          <TabsTrigger value="indicados" className="gap-1.5"><Users className="w-3.5 h-3.5" />Indicados ({totalIndicados})</TabsTrigger>
          <TabsTrigger value="ligacoes" className="gap-1.5"><PhoneCall className="w-3.5 h-3.5" />Ligações</TabsTrigger>
        </TabsList>

        {/* Equipe */}
        <TabsContent value="equipe" className="mt-4 space-y-4">
          {/* Filtros */}
          <div className="flex flex-col md:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome, telefone, cidade ou zona..." className="pl-9" />
            </div>
            <Select value={filterLider} onValueChange={setFilterLider}>
              <SelectTrigger className="w-full md:w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os líderes</SelectItem>
                {Object.entries(liderMap).map(([id, nome]) => (
                  <SelectItem key={id} value={id}><span className="flex items-center gap-1"><Crown className="w-3 h-3" />{nome}</span></SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full md:w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos status</SelectItem>
                <SelectItem value="ativo">Ativos</SelectItem>
                <SelectItem value="inativo">Inativos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {clientId && (
            <TeamTree
              clientId={clientId}
              clientName={clientName}
              contratados={contratados}
              setContratados={setContratados}
              indicados={indicados}
              setIndicados={setIndicados}
              checkinStats={checkinStats}
              search={search}
              filterLider={filterLider}
              filterStatus={filterStatus}
            />
          )}
        </TabsContent>

        {/* Indicados */}
        <TabsContent value="indicados" className="mt-4 space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Indicados aguardando verificação</CardTitle>
              <p className="text-xs text-muted-foreground">Pessoas indicadas pelos contratados que precisam ser confirmadas por telemarketing.</p>
            </CardHeader>
            <CardContent>
              {indicados.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Nenhum indicado ainda.</p>
                </div>
              ) : (
                <div className="divide-y">
                  {indicados.map(ind => {
                    const cNome = contratados.find(c => c.id === ind.contratado_id)?.nome || "—";
                    return (
                      <div key={ind.id} className="flex items-center justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{ind.nome}</p>
                          <p className="text-xs text-muted-foreground truncate">📞 {ind.telefone}{ind.cidade ? ` • ${ind.cidade}` : ""}</p>
                          <p className="text-xs text-muted-foreground">Indicado por: <span className="font-medium">{cNome}</span></p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant={
                            ind.status === "confirmado" ? "default" :
                            ind.status === "falso" ? "destructive" : "secondary"
                          } className="text-[10px]">{ind.status}</Badge>
                          <Select defaultValue={ind.status} onValueChange={async (v) => {
                            await supabase.from("contratado_indicados").update({ status: v, verified_at: new Date().toISOString() } as any).eq("id", ind.id);
                            setIndicados(prev => prev.map(i => i.id === ind.id ? { ...i, status: v } : i));
                            toast.success("Status atualizado!");
                          }}>
                            <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pendente">⏳ Pendente</SelectItem>
                              <SelectItem value="confirmado">✅ Confirmado</SelectItem>
                              <SelectItem value="falso">❌ Falso</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Ligações */}
        <TabsContent value="ligacoes" className="mt-4">
          <TelemarketingResultsPanel contratados={contratados as any} indicados={indicados as any} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
