import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveClientId } from "@/hooks/useActiveClientId";
import TelemarketingSubNav from "@/components/telemarketing/TelemarketingSubNav";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import { 
  Database, 
  Search, 
  MoreHorizontal, 
  Trash2, 
  Users, 
  Calendar, 
  BarChart3,
  Table as TableIcon,
  AlertTriangle,
  X,
  UserCheck
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function TelemarketingAdminListas() {
  const [listas, setListas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("");
  const [dupesOpen, setDupesOpen] = useState(false);
  const [selectedLista, setSelectedLista] = useState<any>(null);
  const [dupes, setDupes] = useState<any[]>([]);
  const [loadingDupes, setLoadingDupes] = useState(false);
  const { toast } = useToast();
  const { clientId, isLoading: ctxLoading } = useActiveClientId();
  const navigate = useNavigate();

  const fetchListas = async () => {
    if (!clientId) return;
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('tele_admin_resumo_listas' as any, { _client_id: clientId });
      if (error) throw error;
      const rows = (data as any[] | null) || [];
      setListas(rows.map((r: any) => ({
        ...r,
        total_contatos: Number(r.total ?? r.total_contatos ?? 0),
        concluidos: Number(r.ligados ?? r.concluidos ?? 0),
        created_at: r.criado_em ?? r.created_at ?? null,
      })));
    } catch (err: any) {
      toast({
        title: "Erro ao carregar listas",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ctxLoading) return;
    if (!clientId) { setLoading(false); return; }
    fetchListas();
  }, [clientId, ctxLoading]);


  const openDupes = async (lista: any) => {
    setSelectedLista(lista);
    setDupesOpen(true);
    setLoadingDupes(true);
    try {
      const { data, error } = await supabase
        .from('telemarketing_import_duplicatas')
        .select('*')
        .eq('lista_id', lista.id)
        .order('criado_em', { ascending: false });
      
      if (error) throw error;
      setDupes(data || []);
    } catch (err: any) {
      toast({
        title: "Erro ao carregar duplicatas",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoadingDupes(false);
    }
  };

  const filteredListas = listas.filter(l => 
    l.nome?.toLowerCase().includes(filtro.toLowerCase())
  );

  const totalContatos = listas.reduce((acc, curr) => acc + curr.total_contatos, 0);
  const totalConcluidos = listas.reduce((acc, curr) => acc + (curr.concluidos || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Database className="w-6 h-6 text-primary" />
            Gerenciamento de Listas
          </h2>
          <p className="text-muted-foreground">
            Visualize o progresso e gerencie os lotes de contatos importados.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total de Listas</p>
                <h3 className="text-2xl font-bold">{listas.length}</h3>
              </div>
              <div className="p-2 bg-primary/10 rounded-full">
                <TableIcon className="w-5 h-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Contatos Totais</p>
                <h3 className="text-2xl font-bold">{totalContatos.toLocaleString('pt-BR')}</h3>
              </div>
              <div className="p-2 bg-blue-500/10 rounded-full">
                <Users className="w-5 h-5 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Conclusão Geral</p>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-2xl font-bold">
                    {totalContatos > 0 ? Math.round((totalConcluidos / totalContatos) * 100) : 0}%
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    ({totalConcluidos}/{totalContatos})
                  </span>
                </div>
              </div>
              <div className="p-2 bg-green-500/10 rounded-full">
                <BarChart3 className="w-5 h-5 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <CardTitle>Listas Importadas</CardTitle>
              <CardDescription>Gerencie os lotes de importação e verifique duplicatas filtradas pelo sistema.</CardDescription>
            </div>
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Buscar lista..." 
                className="pl-9"
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome da Lista</TableHead>
                <TableHead>Criada em</TableHead>
                <TableHead>Contatos</TableHead>
                <TableHead>Progresso</TableHead>
                <TableHead className="w-[100px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Carregando listas...
                  </TableCell>
                </TableRow>
              ) : filteredListas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Nenhuma lista encontrada.
                  </TableCell>
                </TableRow>
              ) : (
                filteredListas.map((lista) => (
                  <TableRow key={lista.id}>
                    <TableCell className="font-medium">
                      <div className="flex flex-col">
                        <span>{lista.nome}</span>
                        {lista.campanha_nome && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1 uppercase tracking-wider">
                            <Users className="w-3 h-3" /> {lista.campanha_nome}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="w-3 h-3" />
                        {lista.created_at ? format(new Date(lista.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : '---'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono">
                          {lista.total_contatos}
                        </Badge>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 text-[10px] gap-1 px-2"
                          onClick={() => openDupes(lista)}
                        >
                          <AlertTriangle className="w-3 h-3 text-amber-500" />
                          Duplicados
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 w-full max-w-[120px]">
                        <div className="flex justify-between text-[10px] font-medium">
                          <span>{lista.total_contatos > 0 ? Math.round(((lista.concluidos || 0) / lista.total_contatos) * 100) : 0}%</span>
                          <span className="text-muted-foreground">{lista.concluidos || 0}/{lista.total_contatos}</span>
                        </div>
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary transition-all" 
                            style={{ width: `${lista.total_contatos > 0 ? ((lista.concluidos || 0) / lista.total_contatos) * 100 : 0}%` }}
                          />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem className="gap-2" onClick={() => openDupes(lista)}>
                            <AlertTriangle className="w-4 h-4 text-amber-500" /> Ver Duplicados
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2">
                            <BarChart3 className="w-4 h-4" /> Relatório Completo
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2 text-destructive">
                            <Trash2 className="w-4 h-4" /> Excluir Lista
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog de Duplicatas */}
      <Dialog open={dupesOpen} onOpenChange={setDupesOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-2">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  Contatos Duplicados - {selectedLista?.nome}
                </DialogTitle>
                <DialogDescription>
                  Estes contatos foram detectados na planilha, mas ignorados na importação por já existirem no sistema.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {loadingDupes ? (
              <div className="py-12 text-center text-muted-foreground flex flex-col items-center gap-2">
                <Users className="w-8 h-8 animate-pulse text-muted-foreground/40" />
                Carregando histórico de duplicatas...
              </div>
            ) : dupes.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground flex flex-col items-center gap-3 bg-muted/20 rounded-lg border-2 border-dashed">
                <UserCheck className="w-10 h-10 text-green-500/40" />
                <div>
                  <p className="font-medium text-foreground">Lista 100% Limpa!</p>
                  <p className="text-xs">Nenhum contato desta importação era duplicado.</p>
                </div>
              </div>
            ) : (
              <div className="border rounded-md">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Localização</TableHead>
                      <TableHead>Motivo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dupes.map((dupe) => (
                      <TableRow key={dupe.id}>
                        <TableCell className="font-medium">{dupe.nome || 'Sem nome'}</TableCell>
                        <TableCell className="font-mono text-xs">{dupe.telefone}</TableCell>
                        <TableCell className="text-xs">
                          {dupe.bairro}{dupe.bairro && dupe.cidade ? ', ' : ''}{dupe.cidade}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[9px] uppercase">
                            {dupe.motivo === 'global' ? 'Já existe no sistema' : 'Duplicado na lista'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
          
          <div className="p-6 pt-2 border-t bg-muted/30 flex justify-between items-center">
            <span className="text-xs text-muted-foreground">
              Total de <strong>{dupes.length}</strong> duplicatas encontradas
            </span>
            <Button variant="outline" onClick={() => setDupesOpen(false)}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
