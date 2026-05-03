import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  Plus, RefreshCw, Trash2, ExternalLink, Vote, FileText,
  CalendarX, AlertCircle, Info, TrendingDown,
} from "lucide-react";

type Adversario = {
  id: string;
  client_id: string;
  nome: string;
  nome_parlamentar: string | null;
  nivel: "federal_deputado" | "federal_senador" | "estadual_deputado" | "municipal_vereador";
  partido: string | null;
  uf: string | null;
  cargo: string | null;
  id_camara_federal: number | null;
  id_senado_federal: number | null;
  ativo: boolean;
  foto_url: string | null;
};

const NIVEL_LABELS: Record<string, string> = {
  federal_deputado: "Deputado Federal",
  federal_senador: "Senador",
  estadual_deputado: "Deputado Estadual",
  municipal_vereador: "Vereador",
};

export default function RadarParlamentar({ clientId }: { clientId: string | null }) {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedAdv, setSelectedAdv] = useState<Adversario | null>(null);

  // Lista adversários
  const { data: adversarios, isLoading } = useQuery<Adversario[]>({
    queryKey: ["adversarios", clientId],
    enabled: !!clientId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("adversarios_politicos" as any)
        .select("*")
        .eq("client_id", clientId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any) || [];
    },
  });

  // Sincroniza um adversário específico
  const syncMutation = useMutation({
    mutationFn: async (adversarioId: string) => {
      const { data, error } = await supabase.functions.invoke("parlamentar-sync", {
        body: { adversario_id: adversarioId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Sincronização concluída");
      qc.invalidateQueries({ queryKey: ["parlamentar-detalhes"] });
      qc.invalidateQueries({ queryKey: ["parlamentar-sync-log"] });
    },
    onError: (e: any) => toast.error(`Erro: ${e.message}`),
  });

  // Remove adversário
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("adversarios_politicos" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removido");
      qc.invalidateQueries({ queryKey: ["adversarios"] });
    },
  });

  if (!clientId) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Você precisa estar vinculado a um cliente para usar o Radar Parlamentar.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          <strong>Munição política em tempo real.</strong> Cadastre os adversários (deputados/senadores) e o sistema vai puxar
          presença, votações e projetos diretamente das APIs oficiais da Câmara e do Senado.
          Use isso para gerar conteúdo fundamentado: <em>"vereador X faltou Y% das sessões"</em>, <em>"votou contra Z em 2025"</em>, etc.
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Adversários monitorados</h3>
          <p className="text-xs text-muted-foreground">
            {adversarios?.length || 0} político(s) cadastrado(s)
          </p>
        </div>
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="w-4 h-4" /> Cadastrar adversário
            </Button>
          </DialogTrigger>
          <NovoAdversarioDialog
            clientId={clientId}
            onClose={() => {
              setModalOpen(false);
              qc.invalidateQueries({ queryKey: ["adversarios"] });
            }}
          />
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : adversarios?.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Vote className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Nenhum adversário cadastrado ainda.</p>
            <p className="text-xs mt-2">Clique em "Cadastrar adversário" para começar.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {adversarios?.map((adv) => (
            <AdversarioCard
              key={adv.id}
              adv={adv}
              onSync={() => syncMutation.mutate(adv.id)}
              syncing={syncMutation.isPending && syncMutation.variables === adv.id}
              onDelete={() => {
                if (confirm(`Remover ${adv.nome}?`)) deleteMutation.mutate(adv.id);
              }}
              onViewDetails={() => setSelectedAdv(adv)}
            />
          ))}
        </div>
      )}

      {selectedAdv && (
        <DetalhesAdversarioDialog
          adversario={selectedAdv}
          onClose={() => setSelectedAdv(null)}
        />
      )}
    </div>
  );
}

function AdversarioCard({
  adv, onSync, syncing, onDelete, onViewDetails,
}: {
  adv: Adversario; onSync: () => void; syncing: boolean; onDelete: () => void; onViewDetails: () => void;
}) {
  const { data: stats } = useQuery({
    queryKey: ["parlamentar-stats", adv.id],
    staleTime: 60_000,
    queryFn: async () => {
      const [pres, vot, prop] = await Promise.all([
        supabase.from("parlamentar_presenca" as any).select("*", { count: "exact", head: true }).eq("adversario_id", adv.id),
        supabase.from("parlamentar_votacoes" as any).select("*", { count: "exact", head: true }).eq("adversario_id", adv.id),
        supabase.from("parlamentar_proposicoes" as any).select("*", { count: "exact", head: true }).eq("adversario_id", adv.id),
      ]);
      return { presenca: pres.count || 0, votacoes: vot.count || 0, proposicoes: prop.count || 0 };
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base truncate">{adv.nome}</CardTitle>
            <CardDescription className="text-xs">
              {NIVEL_LABELS[adv.nivel]} · {adv.partido || "—"} {adv.uf ? `· ${adv.uf}` : ""}
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onDelete} className="h-8 w-8 shrink-0">
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded border p-2">
            <div className="text-lg font-bold">{stats?.votacoes ?? "—"}</div>
            <div className="text-[10px] text-muted-foreground">Votações</div>
          </div>
          <div className="rounded border p-2">
            <div className="text-lg font-bold">{stats?.proposicoes ?? "—"}</div>
            <div className="text-[10px] text-muted-foreground">Projetos</div>
          </div>
          <div className="rounded border p-2">
            <div className="text-lg font-bold">{stats?.presenca ?? "—"}</div>
            <div className="text-[10px] text-muted-foreground">Sessões</div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={onSync} disabled={syncing}>
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Sincronizando..." : "Sincronizar"}
          </Button>
          <Button size="sm" className="flex-1" onClick={onViewDetails}>
            Ver dados
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function NovoAdversarioDialog({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const [nome, setNome] = useState("");
  const [nivel, setNivel] = useState<Adversario["nivel"]>("federal_deputado");
  const [partido, setPartido] = useState("");
  const [uf, setUf] = useState("");
  const [idCamara, setIdCamara] = useState("");
  const [idSenado, setIdSenado] = useState("");
  const [saving, setSaving] = useState(false);

  async function salvar() {
    if (!nome) {
      toast.error("Nome é obrigatório");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("adversarios_politicos" as any).insert({
        client_id: clientId,
        nome,
        nivel,
        partido: partido || null,
        uf: uf || null,
        id_camara_federal: idCamara ? parseInt(idCamara) : null,
        id_senado_federal: idSenado ? parseInt(idSenado) : null,
      });
      if (error) throw error;
      toast.success("Adversário cadastrado");
      onClose();
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Cadastrar adversário</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium">Nome completo *</label>
          <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Fulano de Tal" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium">Nível *</label>
            <Select value={nivel} onValueChange={(v) => setNivel(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="federal_deputado">Deputado Federal</SelectItem>
                <SelectItem value="federal_senador">Senador</SelectItem>
                <SelectItem value="estadual_deputado">Deputado Estadual</SelectItem>
                <SelectItem value="municipal_vereador">Vereador</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium">Partido</label>
            <Input value={partido} onChange={(e) => setPartido(e.target.value)} placeholder="PT, PL, PSDB..." />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium">UF</label>
          <Input value={uf} onChange={(e) => setUf(e.target.value.toUpperCase())} maxLength={2} placeholder="MS" />
        </div>

        {nivel === "federal_deputado" && (
          <div className="rounded border bg-muted/30 p-3 space-y-2">
            <p className="text-xs font-medium">ID Câmara Federal *</p>
            <p className="text-[11px] text-muted-foreground">
              Encontre em <a href="https://www.camara.leg.br/deputados/quem-sao" target="_blank" rel="noreferrer" className="underline">camara.leg.br/deputados</a>.
              Clique no deputado e copie o número da URL (ex: <code>/deputados/204554</code>).
            </p>
            <Input value={idCamara} onChange={(e) => setIdCamara(e.target.value)} placeholder="Ex: 204554" />
          </div>
        )}

        {nivel === "federal_senador" && (
          <div className="rounded border bg-muted/30 p-3 space-y-2">
            <p className="text-xs font-medium">ID Senado Federal *</p>
            <p className="text-[11px] text-muted-foreground">
              Encontre em <a href="https://www25.senado.leg.br/web/senadores/em-exercicio" target="_blank" rel="noreferrer" className="underline">senado.leg.br/senadores</a>.
              Copie o código da URL (ex: <code>/web/senadores/senador/-/perfil/4525</code>).
            </p>
            <Input value={idSenado} onChange={(e) => setIdSenado(e.target.value)} placeholder="Ex: 4525" />
          </div>
        )}

        {(nivel === "estadual_deputado" || nivel === "municipal_vereador") && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Coleta automática para este nível ainda está em desenvolvimento. Cadastre o registro
              para acompanhar manualmente — sincronização federal funciona apenas para deputados
              federais e senadores no momento.
            </AlertDescription>
          </Alert>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button onClick={salvar} disabled={saving}>{saving ? "Salvando..." : "Cadastrar"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function DetalhesAdversarioDialog({ adversario, onClose }: { adversario: Adversario; onClose: () => void }) {
  const { data: votacoes } = useQuery({
    queryKey: ["parlamentar-detalhes", "vot", adversario.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("parlamentar_votacoes" as any)
        .select("*")
        .eq("adversario_id", adversario.id)
        .order("data_votacao", { ascending: false })
        .limit(50);
      return (data as any[]) || [];
    },
  });

  const { data: proposicoes } = useQuery({
    queryKey: ["parlamentar-detalhes", "prop", adversario.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("parlamentar_proposicoes" as any)
        .select("*")
        .eq("adversario_id", adversario.id)
        .order("data_apresentacao", { ascending: false })
        .limit(50);
      return (data as any[]) || [];
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{adversario.nome}</DialogTitle>
          <CardDescription>
            {NIVEL_LABELS[adversario.nivel]} · {adversario.partido || "—"} · {adversario.uf || "—"}
          </CardDescription>
        </DialogHeader>
        <Tabs defaultValue="votacoes">
          <TabsList>
            <TabsTrigger value="votacoes" className="gap-1.5"><Vote className="w-3.5 h-3.5" /> Votações ({votacoes?.length || 0})</TabsTrigger>
            <TabsTrigger value="proposicoes" className="gap-1.5"><FileText className="w-3.5 h-3.5" /> Projetos ({proposicoes?.length || 0})</TabsTrigger>
          </TabsList>
          <TabsContent value="votacoes" className="space-y-2 mt-3">
            {votacoes?.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Nenhuma votação coletada ainda. Clique em "Sincronizar" no card.
              </p>
            )}
            {votacoes?.map((v) => (
              <Card key={v.id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">
                      {new Date(v.data_votacao).toLocaleDateString("pt-BR")}
                      {v.proposicao_codigo && ` · ${v.proposicao_codigo}`}
                    </p>
                    <p className="text-sm mt-1 line-clamp-2">{v.proposicao_ementa || "—"}</p>
                  </div>
                  <Badge variant={
                    v.voto === "sim" ? "default" :
                    v.voto === "nao" ? "destructive" :
                    "secondary"
                  }>
                    {v.voto.toUpperCase()}
                  </Badge>
                </div>
              </Card>
            ))}
          </TabsContent>
          <TabsContent value="proposicoes" className="space-y-2 mt-3">
            {proposicoes?.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Nenhum projeto coletado ainda.
              </p>
            )}
            {proposicoes?.map((p) => (
              <Card key={p.id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium">
                      {p.tipo} {p.numero}/{p.ano}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {p.data_apresentacao && new Date(p.data_apresentacao).toLocaleDateString("pt-BR")}
                    </p>
                    <p className="text-sm mt-1 line-clamp-3">{p.ementa}</p>
                  </div>
                  {p.url_detalhes && (
                    <a href={p.url_detalhes} target="_blank" rel="noreferrer">
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Button>
                    </a>
                  )}
                </div>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}