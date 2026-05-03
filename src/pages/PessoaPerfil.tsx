import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Pencil, Plus, ExternalLink, User, MapPin, Phone, Mail, Calendar, Tag, Trash2, TrendingUp, Star, Info, Activity, MessageCircle, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import EditarPessoaDialog from "@/components/pessoas/EditarPessoaDialog";
import AddSocialDialog from "@/components/pessoas/AddSocialDialog";
import TimelinePolitica from "@/components/pessoas/TimelinePolitica";
import TagsPoliticas from "@/components/pessoas/TagsPoliticas";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { getWhatsAppLink } from "@/lib/social-url";

const TIPO_LABELS: Record<string, string> = {
  eleitor: "Eleitor", apoiador: "Apoiador", lideranca: "Liderança",
  jornalista: "Jornalista", influenciador: "Influenciador", voluntario: "Voluntário",
  adversario: "Adversário", cidadao: "Cidadão",
};
const NIVEL_LABELS: Record<string, string> = {
  desconhecido: "Desconhecido", simpatizante: "Simpatizante",
  apoiador: "Apoiador", militante: "Militante", opositor: "Opositor",
};
const NIVEL_COLORS: Record<string, string> = {
  desconhecido: "bg-muted text-muted-foreground",
  simpatizante: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  apoiador: "bg-green-500/10 text-green-600 border-green-500/20",
  militante: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  opositor: "bg-red-500/10 text-red-600 border-red-500/20",
};
const ORIGEM_LABELS: Record<string, string> = {
  rede_social: "Rede Social", formulario: "Formulário", evento: "Evento",
  importacao: "Importação", manual: "Manual",
};
const PLATFORM_ICONS: Record<string, string> = {
  facebook: "🔵", instagram: "📸", twitter: "🐦", youtube: "▶️",
};
const CLASSIFICATION_LABELS: Record<string, string> = {
  apoiador_ativo: "Apoiador Ativo",
  apoiador_passivo: "Apoiador Passivo",
  neutro: "Neutro",
  critico: "Crítico",
};
const CLASSIFICATION_COLORS: Record<string, string> = {
  apoiador_ativo: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  apoiador_passivo: "bg-sky-500/10 text-sky-600 border-sky-500/20",
  neutro: "bg-muted text-muted-foreground",
  critico: "bg-orange-500/10 text-orange-600 border-orange-500/20",
};

const STATUS_LEAD_LABELS: Record<string, string> = {
  novo: "Novo", contato_whatsapp: "Contato WhatsApp", em_conversa: "Em Conversa",
  proposta_enviada: "Proposta Enviada", fechado: "Fechado", perdido: "Perdido",
};

const CLASSIF_POLITICA_LABELS: Record<string, string> = {
  apoiador: "Apoiador", simpatizante: "Simpatizante", indefinido: "Indefinido",
  oposicao: "Oposição", lideranca: "Liderança",
};
const CLASSIF_POLITICA_COLORS: Record<string, string> = {
  apoiador: "bg-green-500/10 text-green-600 border-green-500/20",
  simpatizante: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  indefinido: "bg-muted text-muted-foreground",
  oposicao: "bg-red-500/10 text-red-600 border-red-500/20",
  lideranca: "bg-purple-500/10 text-purple-600 border-purple-500/20",
};
const STATUS_LEAD_COLORS: Record<string, string> = {
  novo: "bg-muted text-muted-foreground",
  contato_whatsapp: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  em_conversa: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  proposta_enviada: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  fechado: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  perdido: "bg-red-500/10 text-red-600 border-red-500/20",
};

function getScoreColor(score: number) {
  if (score >= 20) return "text-emerald-600";
  if (score >= 10) return "text-sky-600";
  if (score >= 5) return "text-amber-600";
  return "text-muted-foreground";
}

export default function PessoaPerfil() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [pessoa, setPessoa] = useState<any>(null);
  const [socials, setSocials] = useState<any[]>([]);
  const [supporter, setSupporter] = useState<any>(null);
  const [engagementActions, setEngagementActions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [socialOpen, setSocialOpen] = useState(false);
  const [editingSocial, setEditingSocial] = useState<any>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => { if (id) fetchData(); }, [id]);

  async function fetchData() {
    setLoading(true);
    const [pessoaRes, socialRes] = await Promise.all([
      supabase.from("pessoas").select("*").eq("id", id!).single(),
      supabase.from("pessoa_social").select("*").eq("pessoa_id", id!).order("created_at"),
    ]);

    if (pessoaRes.error) {
      toast.error("Pessoa não encontrada");
      navigate("/pessoas");
      return;
    }

    setPessoa(pessoaRes.data);
    setSocials(socialRes.data || []);

    // Fetch linked supporter data
    if (pessoaRes.data.supporter_id) {
      const [suppRes, actionsRes] = await Promise.all([
        supabase.from("supporters").select("*").eq("id", pessoaRes.data.supporter_id).single(),
        supabase.from("engagement_actions")
          .select("id, action_type, platform, action_date, post_id")
          .eq("supporter_id", pessoaRes.data.supporter_id)
          .order("action_date", { ascending: false })
          .limit(20),
      ]);
      setSupporter(suppRes.data || null);
      setEngagementActions(actionsRes.data || []);
    } else {
      setSupporter(null);
      setEngagementActions([]);
    }

    setLoading(false);
  }

  async function handleDeleteSocial(socialId: string) {
    const { error } = await supabase.from("pessoa_social").delete().eq("id", socialId);
    if (error) { toast.error("Erro ao remover rede social"); }
    else { toast.success("Rede social removida"); setSocials(prev => prev.filter(s => s.id !== socialId)); }
  }

  async function handleDeletePessoa() {
    if (!pessoa) return;
    if (pessoa.supporter_id) {
      await supabase.from("supporter_profiles").delete().eq("supporter_id", pessoa.supporter_id);
      await supabase.from("supporters").delete().eq("id", pessoa.supporter_id);
    }
    await supabase.from("pessoa_social").delete().eq("pessoa_id", pessoa.id);
    const { error } = await supabase.from("pessoas").delete().eq("id", pessoa.id);
    if (error) { toast.error("Erro ao excluir pessoa"); }
    else { toast.success("Pessoa excluída"); navigate("/pessoas"); }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!pessoa) return null;

  const InfoRow = ({ icon: Icon, label, value }: { icon: any; label: string; value: string | null }) => (
    <div className="flex items-start gap-3 py-2">
      <Icon className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground">{value || "—"}</p>
      </div>
    </div>
  );

  const ACTION_TYPE_LABELS: Record<string, string> = {
    comment: "💬 Comentário",
    like: "👍 Curtida",
    share: "🔗 Compartilhamento",
    reaction: "❤️ Reação",
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/pessoas")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">{pessoa.nome}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant="outline" className="text-xs">{TIPO_LABELS[pessoa.tipo_pessoa] || pessoa.tipo_pessoa}</Badge>
            <Badge variant="outline" className={`text-xs ${NIVEL_COLORS[pessoa.nivel_apoio] || ""}`}>
              {NIVEL_LABELS[pessoa.nivel_apoio] || pessoa.nivel_apoio}
            </Badge>
            {supporter?.classification && (
              <Badge variant="outline" className={`text-xs ${CLASSIFICATION_COLORS[supporter.classification] || ""}`}>
                {CLASSIFICATION_LABELS[supporter.classification] || supporter.classification}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setEditOpen(true)}>
            <Pencil className="w-4 h-4" /> Editar
          </Button>
          <Button variant="outline" className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="w-4 h-4" /> Excluir
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Dados Pessoais</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
              <InfoRow icon={User} label="Nome" value={pessoa.nome} />
              <InfoRow icon={Mail} label="Email" value={pessoa.email} />
              <div className="flex items-start gap-3 py-2">
                <Phone className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Telefone</p>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{pessoa.telefone || "—"}</p>
                    {(() => {
                      const waLink = getWhatsAppLink(pessoa.telefone);
                      return waLink ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <a href={waLink} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center justify-center h-6 w-6 rounded text-emerald-600 hover:bg-emerald-500/10 transition-colors">
                              <MessageCircle className="w-4 h-4" />
                            </a>
                          </TooltipTrigger>
                          <TooltipContent>Conversar no WhatsApp</TooltipContent>
                        </Tooltip>
                      ) : pessoa.telefone ? null : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center justify-center h-6 w-6 rounded text-muted-foreground/40 cursor-not-allowed">
                              <MessageCircle className="w-4 h-4" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Telefone não cadastrado</TooltipContent>
                        </Tooltip>
                      );
                    })()}
                  </div>
                </div>
              </div>
              <InfoRow icon={Calendar} label="Data de Nascimento" value={pessoa.data_nascimento ? format(new Date(pessoa.data_nascimento + "T00:00:00"), "dd/MM/yyyy") : null} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Localização</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
              <InfoRow icon={MapPin} label="Cidade" value={pessoa.cidade} />
              <InfoRow icon={MapPin} label="Bairro" value={pessoa.bairro} />
              <div className="sm:col-span-2">
                <InfoRow icon={MapPin} label="Endereço" value={pessoa.endereco} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Classificação Política</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-x-6">
              <InfoRow icon={Tag} label="Tipo de Pessoa" value={TIPO_LABELS[pessoa.tipo_pessoa] || pessoa.tipo_pessoa} />
              <InfoRow icon={Tag} label="Nível de Apoio" value={NIVEL_LABELS[pessoa.nivel_apoio] || pessoa.nivel_apoio} />
              <InfoRow icon={Tag} label="Origem do Contato" value={ORIGEM_LABELS[pessoa.origem_contato] || pessoa.origem_contato} />
            </CardContent>
          </Card>

          {/* Engagement Card */}
          {supporter && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  <CardTitle className="text-base">Engajamento nas Redes</CardTitle>
                </div>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="w-4 h-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-[250px]">
                    <p className="text-xs">Pontuação calculada automaticamente com base nas interações desta pessoa nas suas publicações (comentários, curtidas, reações e compartilhamentos).</p>
                  </TooltipContent>
                </Tooltip>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Score overview */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 rounded-lg bg-muted/50 border">
                    <p className={`text-2xl font-bold ${getScoreColor(supporter.engagement_score || 0)}`}>
                      {supporter.engagement_score || 0}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">Score</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted/50 border">
                    <p className="text-2xl font-bold text-foreground">{engagementActions.length}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Interações</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted/50 border">
                    <p className="text-sm font-medium text-foreground mt-1">
                      {supporter.last_interaction_date 
                        ? format(new Date(supporter.last_interaction_date), "dd/MM") 
                        : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">Última Interação</p>
                  </div>
                </div>

                {/* Recent actions */}
                {engagementActions.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5" />
                      Últimas interações
                    </p>
                    <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                      {engagementActions.map((a) => (
                        <div key={a.id} className="flex items-center justify-between py-1.5 px-2 rounded text-xs bg-muted/30">
                          <span>{ACTION_TYPE_LABELS[a.action_type] || a.action_type}</span>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <span className="capitalize">{a.platform}</span>
                            <span>{format(new Date(a.action_date), "dd/MM HH:mm")}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {engagementActions.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    Nenhuma interação registrada ainda. As interações serão detectadas automaticamente ao sincronizar com a Meta.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* No engagement tracking info */}
          {!supporter && socials.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="py-6 text-center space-y-2">
                <TrendingUp className="w-8 h-8 mx-auto text-muted-foreground/50" />
                <p className="text-sm font-medium text-muted-foreground">Engajamento não rastreado</p>
                <p className="text-xs text-muted-foreground">
                  Adicione uma rede social para que as interações desta pessoa sejam rastreadas automaticamente no ranking de engajamento.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Timeline Política */}
          <TimelinePolitica pessoaId={pessoa.id} clientId={pessoa.client_id} />

          {/* TAGS Políticas */}
          <TagsPoliticas pessoaId={pessoa.id} clientId={pessoa.client_id} />

          {pessoa.notas_internas && (
            <Card>
              <CardHeader><CardTitle className="text-base">Notas Internas</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-foreground whitespace-pre-wrap">{pessoa.notas_internas}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* WhatsApp Confirmation */}
          <Card className={pessoa.whatsapp_confirmado ? "border-emerald-500/30 bg-emerald-500/5" : ""}>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <MessageCircle className={`w-5 h-5 ${pessoa.whatsapp_confirmado ? "text-emerald-600" : "text-muted-foreground"}`} />
                <CardTitle className="text-base">WhatsApp</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm">Confirmação:</span>
                {pessoa.whatsapp_confirmado ? (
                  <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Confirmado
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">Pendente</Badge>
                )}
              </div>
              {!pessoa.whatsapp_confirmado ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full gap-2 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10"
                  onClick={async () => {
                    const { error } = await supabase
                      .from("pessoas")
                      .update({ whatsapp_confirmado: true } as any)
                      .eq("id", pessoa.id);
                    if (error) toast.error("Erro ao confirmar");
                    else {
                      setPessoa({ ...pessoa, whatsapp_confirmado: true });
                      toast.success("WhatsApp confirmado!");
                    }
                  }}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Marcar como confirmado
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full text-xs text-muted-foreground"
                  onClick={async () => {
                    const { error } = await supabase
                      .from("pessoas")
                      .update({ whatsapp_confirmado: false } as any)
                      .eq("id", pessoa.id);
                    if (error) toast.error("Erro ao reverter");
                    else {
                      setPessoa({ ...pessoa, whatsapp_confirmado: false });
                      toast.success("Confirmação removida");
                    }
                  }}
                >
                  Remover confirmação
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Status do Lead */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Status do Lead</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm">Atual:</span>
                <Badge variant="outline" className={`text-xs ${STATUS_LEAD_COLORS[(pessoa as any).status_lead] || ""}`}>
                  {STATUS_LEAD_LABELS[(pessoa as any).status_lead] || (pessoa as any).status_lead || "Novo"}
                </Badge>
              </div>
              <Select
                value={(pessoa as any).status_lead || "novo"}
                onValueChange={async (value) => {
                  const { error } = await supabase
                    .from("pessoas")
                    .update({ status_lead: value } as any)
                    .eq("id", pessoa.id);
                  if (error) toast.error("Erro ao atualizar status");
                  else {
                    setPessoa({ ...pessoa, status_lead: value });
                    toast.success("Status atualizado!");
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LEAD_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Classificação Política */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Classificação Política</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm">Atual:</span>
                <Badge variant="outline" className={`text-xs ${CLASSIF_POLITICA_COLORS[(pessoa as any).classificacao_politica] || ""}`}>
                  {CLASSIF_POLITICA_LABELS[(pessoa as any).classificacao_politica] || (pessoa as any).classificacao_politica || "Indefinido"}
                </Badge>
              </div>
              <Select
                value={(pessoa as any).classificacao_politica || "indefinido"}
                onValueChange={async (value) => {
                  const { error } = await supabase
                    .from("pessoas")
                    .update({ classificacao_politica: value } as any)
                    .eq("id", pessoa.id);
                  if (error) toast.error("Erro ao atualizar classificação");
                  else {
                    setPessoa({ ...pessoa, classificacao_politica: value });
                    toast.success("Classificação atualizada!");
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CLASSIF_POLITICA_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">Redes Sociais</CardTitle>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setSocialOpen(true)}>
                <Plus className="w-3.5 h-3.5" /> Adicionar
              </Button>
            </CardHeader>
            <CardContent>
              {socials.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma rede social vinculada</p>
              ) : (
                <div className="space-y-3">
                  {socials.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                      <span className="text-lg">{PLATFORM_ICONS[s.plataforma] || "🌐"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium capitalize">{s.plataforma}</p>
                        <p className="text-xs text-muted-foreground truncate">{s.usuario || "—"}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        {s.url_perfil && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                            <a href={s.url_perfil} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => { setEditingSocial(s); setSocialOpen(true); }}
                          title="Editar"
                        >
                          ✎
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDeleteSocial(s.id)}>✕</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Informações do Registro</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <p>Criado em: {format(new Date(pessoa.created_at), "dd/MM/yyyy HH:mm")}</p>
              <p>Atualizado em: {format(new Date(pessoa.updated_at), "dd/MM/yyyy HH:mm")}</p>
              {supporter && (
                <p>Rastreamento ativo: <span className="text-emerald-600 font-medium">✓ Engajamento vinculado</span></p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <EditarPessoaDialog open={editOpen} onOpenChange={setEditOpen} pessoa={pessoa} onSuccess={fetchData} />
      <AddSocialDialog
        open={socialOpen}
        onOpenChange={(o) => { setSocialOpen(o); if (!o) setEditingSocial(null); }}
        pessoaId={pessoa.id}
        onSuccess={fetchData}
        editing={editingSocial}
      />
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir pessoa</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{pessoa.nome}</strong>?
              {pessoa.supporter_id && " O perfil de engajamento vinculado também será removido."}
              {" "}Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePessoa} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
