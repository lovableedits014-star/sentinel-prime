import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  Database, 
  Search, 
  MoreHorizontal, 
  Trash2, 
  Users, 
  Calendar, 
  BarChart3,
  ExternalLink,
  Table as TableIcon
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
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function TelemarketingAdminListas() {
  const [listas, setListas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("");
  const { toast } = useToast();

  const fetchListas = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('tele_admin_resumo_listas');
      if (error) throw error;
      setListas(data || []);
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
    fetchListas();
  }, []);

  const filteredListas = listas.filter(l => 
    l.nome?.toLowerCase().includes(filtro.toLowerCase())
  );

  const totalContatos = listas.reduce((acc, curr) => acc + curr.total_contatos, 0);
  const totalConcluidos = listas.reduce((acc, curr) => acc + curr.concluidos, 0);

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
              <CardDescription>Clique em uma lista para ver o relatório detalhado ou designar operadores.</CardDescription>
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
                      {lista.nome}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="w-3 h-3" />
                        {lista.created_at ? format(new Date(lista.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : '---'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono">
                        {lista.total_contatos}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 w-full max-w-[120px]">
                        <div className="flex justify-between text-[10px] font-medium">
                          <span>{Math.round((lista.concluidos / lista.total_contatos) * 100)}%</span>
                          <span className="text-muted-foreground">{lista.concluidos}/{lista.total_contatos}</span>
                        </div>
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary transition-all" 
                            style={{ width: `${(lista.concluidos / lista.total_contatos) * 100}%` }}
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
                          <DropdownMenuItem className="gap-2">
                            <BarChart3 className="w-4 h-4" /> Relatório
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2 text-destructive">
                            <Trash2 className="w-4 h-4" /> Excluir
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
    </div>
  );
}
