import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus, MapPin, Calendar, Users2, Target, ClipboardList,
  CheckCircle2, Clock, PlayCircle, Loader2, Tag, Trophy,
} from "lucide-react";
import { toast } from "sonner";

interface Props {
  clientId: string;
}

export default function AcoesExternasTab({ clientId }: Props) {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedAcao, setSelectedAcao] = useState<string | null>(null);

  // Form state
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [local, setLocal] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [metaCadastros, setMetaCadastros] = useState("");
  const [tagNome, setTagNome] = useState("");

  // Assignment dialog
  const [showAssign, setShowAssign] = useState(false);
  const [assignAcaoId, setAssignAcaoId] = useState<string | null>(null);
  const [selectedFuncs, setSelectedFuncs] = useState<string[]>([]);

  const { data: acoes, isLoading } = useQuery({
    queryKey: ["acoes-externas", clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("acoes_externas" as any)
        .select("*")
        .eq("client_id", clientId)
        .order("data_inicio", { ascending: false });
      return (data || []) as any[];
    },
  });

  const { data: funcionarios } = useQuery({
    queryKey: ["funcionarios-list", clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("funcionarios" as any)
        .select("id, nome, cidade")
        .eq("client_id", clientId)
        .eq("status", "ativo")
        .order("nome");
      return (data || []) as any[];
    },
  });

  const { data: assignments } = useQuery({
    queryKey: ["acao-assignments", clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("acao_externa_funcionarios" as any)
        .select("id, acao_id, funcionario_id, cadastros_coletados")
        .eq("client_id", clientId);
      return (data || []) as any[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!titulo.trim() || !dataInicio || !dataFim || !tagNome.trim() || !metaCadastros) {
        throw new Error("Preencha todos os campos obrigatórios");
      }
      const { error } = await supabase.from("acoes_externas" as any).insert({
        client_id: clientId,
        titulo: titulo.trim(),
        descricao: descricao.trim() || null,
        local: local.trim() || null,
        data_inicio: new Date(dataInicio).toISOString(),
        data_fim: new Date(dataFim).toISOString(),
        meta_cadastros: parseInt(metaCadastros),
        tag_nome: tagNome.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ação externa criada!");
      setShowCreate(false);
      resetForm();
      qc.invalidateQueries({ queryKey: ["acoes-externas"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!assignAcaoId || selectedFuncs.length === 0) return;
      // Get existing assignments for this action
      const existing = (assignments || []).filter((a: any) => a.acao_id === assignAcaoId).map((a: any) => a.funcionario_id);
      const toAdd = selectedFuncs.filter(id => !existing.includes(id));
      const toRemove = existing.filter((id: string) => !selectedFuncs.includes(id));

      if (toAdd.length > 0) {
        const { error } = await supabase.from("acao_externa_funcionarios" as any).insert(
          toAdd.map(fid => ({ acao_id: assignAcaoId, funcionario_id: fid, client_id: clientId }))
        );
        if (error) throw error;
      }
      if (toRemove.length > 0) {
        const { error } = await supabase.from("acao_externa_funcionarios" as any)
          .delete()
          .eq("acao_id", assignAcaoId)
          .in("funcionario_id", toRemove);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Equipe atualizada!");
      setShowAssign(false);
      qc.invalidateQueries({ queryKey: ["acao-assignments"] });
    },
    onError: () => toast.error("Erro ao atualizar equipe"),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("acoes_externas" as any)
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status atualizado!");
      qc.invalidateQueries({ queryKey: ["acoes-externas"] });
    },
  });

  const resetForm = () => {
    setTitulo(""); setDescricao(""); setLocal(""); setDataInicio(""); setDataFim(""); setMetaCadastros(""); setTagNome("");
  };

  const openAssign = (acaoId: string) => {
    setAssignAcaoId(acaoId);
    const existing = (assignments || []).filter((a: any) => a.acao_id === acaoId).map((a: any) => a.funcionario_id);
    setSelectedFuncs(existing);
    setShowAssign(true);
  };

  const getStatusBadge = (status: string) => {
    if (status === "ativa") return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200">Ativa</Badge>;
    if (status === "concluida") return <Badge variant="secondary">Concluída</Badge>;
    return <Badge variant="outline">Planejada</Badge>;
  };

  const getAssignedCount = (acaoId: string) => (assignments || []).filter((a: any) => a.acao_id === acaoId).length;
  const getAssignedNames = (acaoId: string) => {
    const funcIds = (assignments || []).filter((a: any) => a.acao_id === acaoId).map((a: any) => a.funcionario_id);
    return (funcionarios || []).filter((f: any) => funcIds.includes(f.id)).map((f: any) => f.nome);
  };

  const getMetaPerFunc = (acao: any) => {
    const count = getAssignedCount(acao.id);
    return count > 0 ? Math.ceil(acao.meta_cadastros / count) : acao.meta_cadastros;
  };

  const getTopCollectors = (acaoId: string) => {
    return (assignments || [])
      .filter((a: any) => a.acao_id === acaoId && a.cadastros_coletados > 0)
      .sort((a: any, b: any) => b.cadastros_coletados - a.cadastros_coletados)
      .slice(0, 5)
      .map((a: any) => {
        const func = (funcionarios || []).find((f: any) => f.id === a.funcionario_id);
        return { nome: func?.nome || "—", cadastros: a.cadastros_coletados };
      });
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">
            Cadastre ações de campo (caminhadas, panfletagens, eventos) e escale funcionários para coletar cadastros com tags específicas.
          </p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5"><Plus className="w-4 h-4" />Nova Ação</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Nova Ação Externa</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Título *</Label>
                <Input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex: Caminhada Av. Brasil" />
              </div>
              <div>
                <Label>Descrição</Label>
                <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Detalhes da ação..." rows={2} />
              </div>
              <div>
                <Label>Local</Label>
                <Input value={local} onChange={e => setLocal(e.target.value)} placeholder="Ex: Av. Brasil, Centro" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Início *</Label>
                  <Input type="datetime-local" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
                </div>
                <div>
                  <Label>Fim *</Label>
                  <Input type="datetime-local" value={dataFim} onChange={e => setDataFim(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Meta de cadastros *</Label>
                  <Input type="number" value={metaCadastros} onChange={e => setMetaCadastros(e.target.value)} placeholder="100" min="1" />
                </div>
                <div>
                  <Label>Tag da ação *</Label>
                  <Input value={tagNome} onChange={e => setTagNome(e.target.value)} placeholder="caminhada-centro" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                A tag será aplicada automaticamente em cada pessoa cadastrada durante esta ação.
              </p>
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="w-full">
                {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}Criar Ação
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Assignment Dialog */}
      <Dialog open={showAssign} onOpenChange={setShowAssign}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Escalar Funcionários</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {(funcionarios || []).map((f: any) => (
              <label key={f.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer">
                <Checkbox
                  checked={selectedFuncs.includes(f.id)}
                  onCheckedChange={(checked) => {
                    setSelectedFuncs(prev => checked ? [...prev, f.id] : prev.filter(id => id !== f.id));
                  }}
                />
                <div>
                  <p className="text-sm font-medium">{f.nome}</p>
                  <p className="text-xs text-muted-foreground">{f.cidade || "—"}</p>
                </div>
              </label>
            ))}
            {(!funcionarios || funcionarios.length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum funcionário ativo cadastrado.</p>
            )}
          </div>
          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-muted-foreground">{selectedFuncs.length} selecionado(s)</p>
            <Button onClick={() => assignMutation.mutate()} disabled={assignMutation.isPending} size="sm">
              {assignMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Actions list */}
      {(!acoes || acoes.length === 0) ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Nenhuma ação externa cadastrada</p>
            <p className="text-xs mt-1">Crie uma ação para começar a escalar funcionários</p>
          </CardContent>
        </Card>
      ) : (
        acoes.map((acao: any) => {
          const assigned = getAssignedCount(acao.id);
          const metaPerFunc = getMetaPerFunc(acao);
          const progress = acao.meta_cadastros > 0 ? Math.min(100, (acao.cadastros_coletados / acao.meta_cadastros) * 100) : 0;
          const names = getAssignedNames(acao.id);
          const topCollectors = getTopCollectors(acao.id);
          const isSelected = selectedAcao === acao.id;

          return (
            <Card key={acao.id} className="overflow-hidden cursor-pointer" onClick={() => setSelectedAcao(isSelected ? null : acao.id)}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-sm">{acao.titulo}</h3>
                      {getStatusBadge(acao.status)}
                    </div>
                    {acao.descricao && <p className="text-xs text-muted-foreground mt-1">{acao.descricao}</p>}
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                  {acao.local && (
                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{acao.local}</span>
                  )}
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(acao.data_inicio).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    {" — "}
                    {new Date(acao.data_fim).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="flex items-center gap-1"><Tag className="w-3 h-3" />{acao.tag_nome}</span>
                </div>

                {/* Progress */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground">
                      <Target className="w-3 h-3 inline mr-1" />
                      {acao.cadastros_coletados}/{acao.meta_cadastros} cadastros
                    </span>
                    <span className="font-medium">{Math.round(progress)}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>

                {/* Team */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Users2 className="w-3 h-3" />
                    <span>{assigned} funcionário(s) escalado(s)</span>
                    {assigned > 0 && <span className="text-muted-foreground/60">• Meta: ~{metaPerFunc}/pessoa</span>}
                  </div>
                  <Button size="sm" variant="outline" className="text-xs h-7" onClick={(e) => { e.stopPropagation(); openAssign(acao.id); }}>
                    Escalar
                  </Button>
                </div>

                {/* Expanded details */}
                {isSelected && (
                  <div className="border-t pt-3 space-y-3">
                    {names.length > 0 && (
                      <div>
                        <p className="text-xs font-medium mb-1">Equipe escalada:</p>
                        <div className="flex flex-wrap gap-1">
                          {names.map((n, i) => <Badge key={i} variant="secondary" className="text-xs">{n}</Badge>)}
                        </div>
                      </div>
                    )}

                    {topCollectors.length > 0 && (
                      <div>
                        <p className="text-xs font-medium mb-1 flex items-center gap-1"><Trophy className="w-3 h-3" />Top coletores:</p>
                        {topCollectors.map((c, i) => (
                          <div key={i} className="flex items-center justify-between text-xs py-0.5">
                            <span>{i + 1}. {c.nome}</span>
                            <span className="font-medium">{c.cadastros}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2">
                      {acao.status === "planejada" && (
                        <Button size="sm" variant="default" className="gap-1 text-xs" onClick={(e) => { e.stopPropagation(); updateStatusMutation.mutate({ id: acao.id, status: "ativa" }); }}>
                          <PlayCircle className="w-3.5 h-3.5" />Ativar
                        </Button>
                      )}
                      {acao.status === "ativa" && (
                        <Button size="sm" variant="secondary" className="gap-1 text-xs" onClick={(e) => { e.stopPropagation(); updateStatusMutation.mutate({ id: acao.id, status: "concluida" }); }}>
                          <CheckCircle2 className="w-3.5 h-3.5" />Concluir
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
