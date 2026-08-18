import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Send, 
  Calendar, 
  Clock, 
  Image as ImageIcon, 
  Video, 
  History, 
  PlusCircle, 
  Facebook, 
  Instagram, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  ExternalLink,
  ChevronRight,
  Upload,
  RefreshCw as RefreshIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { useCurrentClientId } from "@/hooks/ic/useCurrentClientId";
import { useServerFn } from "@tanstack/react-start";
import { publishMetaContent } from "@/lib/meta.functions";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export default function MetaPostings() {
  const { data: clientId } = useCurrentClientId();
  const queryClient = useQueryClient();
  const publishFn = useServerFn(publishMetaContent);

  const [platform, setPlatform] = useState<{ fb: boolean; ig: boolean }>({ fb: false, ig: true });
  const [content, setContent] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [activeTab, setActiveTab] = useState("create");

  // Fetch Meta Status
  const { data: metaStatus, isLoading: isLoadingStatus } = useQuery({
    queryKey: ["meta-status", clientId],
    queryFn: async () => {
      if (!clientId) return null;
      const { data, error } = await supabase.functions.invoke('test-meta-connection', {
        body: { clientId }
      });
      if (error) throw error;
      return data;
    },
    enabled: !!clientId
  });

  // Fetch History
  const { data: history, isLoading: isLoadingHistory } = useQuery({
    queryKey: ["meta-history", clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from('meta_scheduled_posts')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!clientId && activeTab === "history"
  });

  const handlePublish = async () => {
    if (!clientId) return toast.error("Cliente não identificado");
    if (!content && !mediaUrl) return toast.error("Adicione conteúdo ou uma imagem");
    if (!platform.fb && !platform.ig) return toast.error("Selecione pelo menos uma plataforma");

    setIsPublishing(true);
    try {
      const selectedPlatform = platform.fb && platform.ig ? 'both' : platform.fb ? 'facebook' : 'instagram';
      
      const res = await publishFn({
        data: {
          clientId,
          platform: selectedPlatform,
          type: 'feed',
          content,
          mediaUrl: mediaUrl || undefined,
        }
      });

      if (res.success) {
        const errors = res.results.filter((r: any) => !r.success);
        if (errors.length > 0) {
          errors.forEach((err: any) => toast.error(`Erro no ${err.platform}: ${err.error}`));
        } else {
          toast.success("Publicado com sucesso!");
          setContent("");
          setMediaUrl("");
          queryClient.invalidateQueries({ queryKey: ["meta-history", clientId] });
        }
      }
    } catch (error: any) {
      console.error("Publish error:", error);
      toast.error(error.message || "Falha na publicação");
    } finally {
      setIsPublishing(false);
    }
  };

  const isConfigured = metaStatus?.success;
  const hasIG = !!metaStatus?.instagram?.connected;
  const hasFB = !!metaStatus?.page_id;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Postagens & Agendamento</h2>
          <p className="text-muted-foreground text-sm">
            Gerencie sua presença no Facebook e Instagram.
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="create" className="flex items-center gap-2">
            <PlusCircle className="w-4 h-4" />
            Nova Postagem
          </TabsTrigger>
          <TabsTrigger value="scheduled" className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Agendados
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="w-4 h-4" />
            Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="create" className="mt-6 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Editor */}
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Configurar Publicação</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Platform Selection */}
                  <div className="space-y-3">
                    <Label>Publicar em:</Label>
                    <div className="flex gap-4">
                      <div className="flex items-center space-x-2 border rounded-lg p-3 px-4 bg-muted/30">
                        <Checkbox 
                          id="fb" 
                          checked={platform.fb} 
                          onCheckedChange={(v) => setPlatform(p => ({ ...p, fb: !!v }))}
                          disabled={!hasFB}
                        />
                        <Label htmlFor="fb" className="flex items-center gap-2 cursor-pointer">
                          <Facebook className="w-4 h-4 text-blue-600" />
                          <span>Facebook</span>
                          {hasFB && <Badge variant="secondary" className="ml-1 text-[10px]">{metaStatus.page_name}</Badge>}
                          {!hasFB && <Badge variant="outline" className="text-destructive text-[10px]">Não conectado</Badge>}
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2 border rounded-lg p-3 px-4 bg-muted/30">
                        <Checkbox 
                          id="ig" 
                          checked={platform.ig} 
                          onCheckedChange={(v) => setPlatform(p => ({ ...p, ig: !!v }))}
                          disabled={!hasIG}
                        />
                        <Label htmlFor="ig" className="flex items-center gap-2 cursor-pointer">
                          <Instagram className="w-4 h-4 text-pink-600" />
                          <span>Instagram</span>
                          {hasIG && <Badge variant="secondary" className="ml-1 text-[10px]">@{metaStatus.instagram.username}</Badge>}
                          {!hasIG && <Badge variant="outline" className="text-destructive text-[10px]">Não conectado</Badge>}
                        </Label>
                      </div>
                    </div>
                  </div>

                  {/* Media */}
                  <div className="space-y-3">
                    <Label>Mídia (URL da Imagem/Vídeo)</Label>
                    <div className="flex gap-2">
                      <Input 
                        placeholder="https://exemplo.com/imagem.jpg" 
                        value={mediaUrl} 
                        onChange={(e) => setMediaUrl(e.target.value)}
                      />
                      <Button variant="outline" size="icon">
                        <Upload className="w-4 h-4" />
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      A Meta exige uma URL pública acessível para realizar o upload.
                    </p>
                  </div>

                  {/* Text Content */}
                  <div className="space-y-3">
                    <Label>Legenda / Texto</Label>
                    <Textarea 
                      placeholder="O que você quer compartilhar?" 
                      className="min-h-[150px]"
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                    />
                  </div>

                  <div className="flex justify-end pt-4">
                    <Button 
                      className="w-full sm:w-auto px-8" 
                      onClick={handlePublish}
                      disabled={isPublishing || (!platform.fb && !platform.ig)}
                    >
                      {isPublishing ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Publicando...
                        </>
                      ) : (
                        <>
                          <Send className="mr-2 h-4 w-4" />
                          Publicar Agora
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Preview */}
            <div className="space-y-6">
               <Card className="overflow-hidden border-primary/10">
                <CardHeader className="bg-muted/30 py-3">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <ImageIcon className="w-3 h-3" />
                    Preview {platform.ig ? "Instagram" : "Facebook"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="aspect-square bg-muted flex items-center justify-center relative overflow-hidden">
                    {mediaUrl ? (
                      <img src={mediaUrl} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <ImageIcon className="w-8 h-8 opacity-20" />
                        <span className="text-xs">Sem mídia</span>
                      </div>
                    )}
                  </div>
                  <div className="p-4 space-y-3 bg-card">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-muted border" />
                      <div className="flex flex-col">
                        <span className="text-xs font-bold leading-none">
                          {platform.ig ? (metaStatus?.instagram?.username || "usuario") : (metaStatus?.page_name || "Pagina")}
                        </span>
                        <span className="text-[10px] text-muted-foreground">Agora mesmo</span>
                      </div>
                    </div>
                    <p className="text-sm whitespace-pre-wrap line-clamp-4">
                      {content || <span className="text-muted-foreground italic">Sua legenda aparecerá aqui...</span>}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Status/Diagnosis */}
              <Card>
                <CardHeader className="py-3">
                   <CardTitle className="text-sm">Status da Conexão</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Facebook</span>
                    {hasFB ? (
                      <Badge variant="secondary" className="bg-green-500/10 text-green-600 hover:bg-green-500/10 border-green-500/20">Conectado</Badge>
                    ) : (
                      <Badge variant="outline" className="text-destructive">Faltando</Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Instagram</span>
                    {hasIG ? (
                      <Badge variant="secondary" className="bg-green-500/10 text-green-600 hover:bg-green-500/10 border-green-500/20">Conectado</Badge>
                    ) : (
                      <Badge variant="outline" className="text-destructive">Faltando</Badge>
                    )}
                  </div>
                  {!isConfigured && (
                    <div className="pt-2">
                      <Button variant="outline" size="sm" className="w-full text-[10px] h-7" asChild>
                        <a href="/integrations">Configurar nas Integrações</a>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="scheduled" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Publicações Agendadas</CardTitle>
              <CardDescription>Visualize o que está na fila para ser publicado.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground flex flex-col items-center gap-3">
                <Calendar className="w-8 h-8 opacity-20" />
                <p>Nenhuma publicação agendada no momento.</p>
                <Button variant="outline" size="sm" onClick={() => setActiveTab("create")}>Criar primeiro agendamento</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Histórico de Publicações</CardTitle>
                <CardDescription>Logs de envios realizados através do sistema.</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["meta-history", clientId] })}>
                <RefreshIcon className="w-4 h-4 mr-2" /> Atualizar
              </Button>
            </CardHeader>
            <CardContent>
              {isLoadingHistory ? (
                <div className="flex justify-center py-12">
                   <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : history && history.length > 0 ? (
                <div className="border rounded-md">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        <th className="text-left p-3 font-medium">Plataforma</th>
                        <th className="text-left p-3 font-medium">Data</th>
                        <th className="text-left p-3 font-medium">Conteúdo</th>
                        <th className="text-left p-3 font-medium">Status</th>
                        <th className="text-right p-3 font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((post: any) => (
                        <tr key={post.id} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              {post.platform === 'facebook' ? (
                                <Facebook className="w-4 h-4 text-blue-600" />
                              ) : (
                                <Instagram className="w-4 h-4 text-pink-600" />
                              )}
                              <span className="capitalize">{post.platform}</span>
                            </div>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {new Date(post.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                          </td>
                          <td className="p-3 max-w-xs">
                            <p className="truncate">{post.content || "Sem texto"}</p>
                          </td>
                          <td className="p-3">
                            {post.status === 'published' ? (
                              <Badge variant="secondary" className="bg-green-500/10 text-green-600 border-green-500/20">Publicado</Badge>
                            ) : (
                              <Badge variant="destructive" className="bg-red-500/10 text-red-600 border-red-500/20">Erro</Badge>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            {post.meta_id && (
                              <Button variant="ghost" size="sm" asChild>
                                <a href={`https://${post.platform}.com/${post.meta_id}`} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="w-4 h-4" />
                                </a>
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground flex flex-col items-center gap-3">
                  <History className="w-8 h-8 opacity-20" />
                  <p>O histórico aparecerá após as primeiras publicações.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RefreshCw(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  )
}
