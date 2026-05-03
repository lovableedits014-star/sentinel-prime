import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, CheckCircle2, XCircle, PhoneOff, Clock, Search, MapPin, User, Vote, Filter } from "lucide-react";

interface TeleResult {
  id: string;
  nome: string;
  telefone: string;
  cidade: string | null;
  bairro: string | null;
  ligacao_status: string | null;
  vota_candidato: string | null;
  candidato_alternativo: string | null;
  operador_nome: string | null;
  ligacao_em: string | null;
  tipo: "lider" | "liderado" | "indicado";
}

interface Props {
  contratados: Array<{
    id: string;
    nome: string;
    telefone: string;
    cidade: string | null;
    bairro: string | null;
    is_lider: boolean;
    ligacao_status?: string | null;
    vota_candidato?: string | null;
    candidato_alternativo?: string | null;
    operador_nome?: string | null;
    ligacao_em?: string | null;
  }>;
  indicados: Array<{
    id: string;
    nome: string;
    telefone: string;
    cidade: string | null;
    bairro: string | null;
    ligacao_status?: string | null;
    vota_candidato?: string | null;
    candidato_alternativo?: string | null;
    operador_nome?: string | null;
    ligacao_em?: string | null;
  }>;
}

export default function TelemarketingResultsPanel({ contratados, indicados }: Props) {
  const [search, setSearch] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroVoto, setFiltroVoto] = useState("todos");
  const [filtroOperador, setFiltroOperador] = useState("todos");

  const allResults = useMemo<TeleResult[]>(() => {
    return [
      ...contratados.map((c) => ({
        id: c.id,
        nome: c.nome,
        telefone: c.telefone,
        cidade: c.cidade,
        bairro: c.bairro,
        ligacao_status: (c as any).ligacao_status || null,
        vota_candidato: (c as any).vota_candidato || null,
        candidato_alternativo: (c as any).candidato_alternativo || null,
        operador_nome: (c as any).operador_nome || null,
        ligacao_em: (c as any).ligacao_em || null,
        tipo: c.is_lider ? "lider" as const : "liderado" as const,
      })),
      ...indicados.map((i) => ({
        id: i.id,
        nome: i.nome,
        telefone: i.telefone,
        cidade: i.cidade,
        bairro: i.bairro,
        ligacao_status: (i as any).ligacao_status || null,
        vota_candidato: (i as any).vota_candidato || null,
        candidato_alternativo: (i as any).candidato_alternativo || null,
        operador_nome: (i as any).operador_nome || null,
        ligacao_em: (i as any).ligacao_em || null,
        tipo: "indicado" as const,
      })),
    ];
  }, [contratados, indicados]);

  const operadores = useMemo(() => {
    const set = new Set<string>();
    allResults.forEach((r) => { if (r.operador_nome) set.add(r.operador_nome); });
    return Array.from(set).sort();
  }, [allResults]);

  const filtered = useMemo(() => {
    return allResults.filter((r) => {
      if (search && !r.nome.toLowerCase().includes(search.toLowerCase()) && !r.telefone.includes(search)) return false;
      if (filtroStatus !== "todos") {
        if (filtroStatus === "pendente" && r.ligacao_status && r.ligacao_status !== "pendente") return false;
        if (filtroStatus !== "pendente" && r.ligacao_status !== filtroStatus) return false;
      }
      if (filtroVoto !== "todos" && r.vota_candidato !== filtroVoto) return false;
      if (filtroOperador !== "todos" && r.operador_nome !== filtroOperador) return false;
      return true;
    });
  }, [allResults, search, filtroStatus, filtroVoto, filtroOperador]);

  // Stats
  const totalLigados = allResults.filter((r) => r.ligacao_status && r.ligacao_status !== "pendente").length;
  const totalPendentes = allResults.length - totalLigados;
  const votaSim = allResults.filter((r) => r.vota_candidato === "sim").length;
  const votaNao = allResults.filter((r) => r.vota_candidato === "nao").length;
  const votoIndeciso = allResults.filter((r) => r.vota_candidato === "indeciso").length;
  const atenderam = allResults.filter((r) => r.ligacao_status === "atendeu").length;
  const naoAtenderam = allResults.filter((r) => r.ligacao_status === "nao_atendeu").length;
  const recusaram = allResults.filter((r) => r.ligacao_status === "recusou").length;

  const statusIcon = (status: string | null) => {
    if (status === "atendeu") return <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />;
    if (status === "nao_atendeu") return <PhoneOff className="w-3.5 h-3.5 text-amber-500" />;
    if (status === "recusou") return <XCircle className="w-3.5 h-3.5 text-destructive" />;
    return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
  };

  const statusLabel = (status: string | null) => {
    if (status === "atendeu") return "Atendeu";
    if (status === "nao_atendeu") return "Não atendeu";
    if (status === "recusou") return "Recusou";
    return "Pendente";
  };

  const votoLabel = (voto: string | null) => {
    if (voto === "sim") return "✅ Vota";
    if (voto === "nao") return "❌ Não vota";
    if (voto === "indeciso") return "🤔 Indeciso";
    return "—";
  };

  const votoBadge = (voto: string | null): "default" | "destructive" | "secondary" | "outline" => {
    if (voto === "sim") return "default";
    if (voto === "nao") return "destructive";
    if (voto === "indeciso") return "secondary";
    return "outline";
  };

  const tipoLabel = (tipo: string) => {
    if (tipo === "lider") return "Líder";
    if (tipo === "liderado") return "Liderado";
    return "Indicado";
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        <Card><CardContent className="p-3 text-center"><p className="text-xl font-bold">{allResults.length}</p><p className="text-[10px] text-muted-foreground">Total</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-xl font-bold text-amber-500">{totalPendentes}</p><p className="text-[10px] text-muted-foreground">Pendentes</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-xl font-bold text-green-600">{atenderam}</p><p className="text-[10px] text-muted-foreground">Atenderam</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-xl font-bold text-muted-foreground">{naoAtenderam}</p><p className="text-[10px] text-muted-foreground">Não atenderam</p></CardContent></Card>
        <Card className="border-green-200 bg-green-50/50 dark:bg-green-950/20"><CardContent className="p-3 text-center"><p className="text-xl font-bold text-green-600">{votaSim}</p><p className="text-[10px] text-muted-foreground">Votam ✅</p></CardContent></Card>
        <Card className="border-red-200 bg-red-50/50 dark:bg-red-950/20"><CardContent className="p-3 text-center"><p className="text-xl font-bold text-destructive">{votaNao}</p><p className="text-[10px] text-muted-foreground">Não votam ❌</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-xl font-bold text-amber-500">{votoIndeciso}</p><p className="text-[10px] text-muted-foreground">Indecisos 🤔</p></CardContent></Card>
      </div>

      {/* Operadores performance */}
      {operadores.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><User className="w-4 h-4 text-primary" />Desempenho por Operador</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {operadores.map((op) => {
                const opResults = allResults.filter((r) => r.operador_nome === op);
                const opSim = opResults.filter((r) => r.vota_candidato === "sim").length;
                return (
                  <div key={op} className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/30">
                    <div>
                      <p className="font-medium text-sm">{op}</p>
                      <p className="text-[10px] text-muted-foreground">{opResults.length} ligações • {opSim} votos confirmados</p>
                    </div>
                    <Badge variant="secondary" className="text-xs">{opResults.length}</Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar nome ou telefone..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 h-9 text-sm" />
        </div>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-[150px] h-9 text-xs"><Filter className="w-3 h-3 mr-1" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos status</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="atendeu">Atendeu</SelectItem>
            <SelectItem value="nao_atendeu">Não atendeu</SelectItem>
            <SelectItem value="recusou">Recusou</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filtroVoto} onValueChange={setFiltroVoto}>
          <SelectTrigger className="w-[140px] h-9 text-xs"><Vote className="w-3 h-3 mr-1" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos votos</SelectItem>
            <SelectItem value="sim">Vota ✅</SelectItem>
            <SelectItem value="nao">Não vota ❌</SelectItem>
            <SelectItem value="indeciso">Indeciso 🤔</SelectItem>
          </SelectContent>
        </Select>
        {operadores.length > 0 && (
          <Select value={filtroOperador} onValueChange={setFiltroOperador}>
            <SelectTrigger className="w-[150px] h-9 text-xs"><User className="w-3 h-3 mr-1" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos operadores</SelectItem>
              {operadores.map((op) => (
                <SelectItem key={op} value={op}>{op}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Results count */}
      <p className="text-xs text-muted-foreground">{filtered.length} resultado(s)</p>

      {/* Results list */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <Phone className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhum resultado encontrado</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <Card key={`${r.tipo}-${r.id}`} className="overflow-hidden">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm truncate">{r.nome}</p>
                      <Badge variant="outline" className="text-[10px] shrink-0">{tipoLabel(r.tipo)}</Badge>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Phone className="w-3 h-3" />
                      <span>{r.telefone}</span>
                    </div>
                    {(r.cidade || r.bairro) && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3" />
                        <span>{[r.bairro, r.cidade].filter(Boolean).join(", ")}</span>
                      </div>
                    )}
                    {r.operador_nome && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <User className="w-3 h-3" />
                        <span>Operador: <span className="font-medium text-foreground">{r.operador_nome}</span></span>
                        {r.ligacao_em && (
                          <span>• {new Date(r.ligacao_em).toLocaleDateString("pt-BR")} {new Date(r.ligacao_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                        )}
                      </div>
                    )}
                    {r.candidato_alternativo && (
                      <p className="text-xs text-muted-foreground">
                        Candidato alternativo: <span className="font-medium text-foreground">{r.candidato_alternativo}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <div className="flex items-center gap-1">
                      {statusIcon(r.ligacao_status)}
                      <span className="text-xs font-medium">{statusLabel(r.ligacao_status)}</span>
                    </div>
                    {r.vota_candidato && (
                      <Badge variant={votoBadge(r.vota_candidato)} className="text-[10px]">
                        {votoLabel(r.vota_candidato)}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
