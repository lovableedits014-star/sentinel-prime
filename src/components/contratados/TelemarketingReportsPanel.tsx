import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { FileText, Download, Users, Phone, CheckCircle2, XCircle, HelpCircle, Crown, TrendingUp } from "lucide-react";

interface TeleContact {
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
  lider_id?: string | null;
  contratado_id?: string;
}

interface Props {
  contratados: Array<{
    id: string;
    nome: string;
    telefone: string;
    cidade: string | null;
    bairro: string | null;
    is_lider: boolean;
    lider_id: string | null;
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
    contratado_id: string;
    ligacao_status?: string | null;
    vota_candidato?: string | null;
    candidato_alternativo?: string | null;
    operador_nome?: string | null;
    ligacao_em?: string | null;
  }>;
}

const VOTE_COLORS = { sim: "#22c55e", nao: "#ef4444", indeciso: "#f59e0b", sem: "#94a3b8" };
const STATUS_COLORS = { atendeu: "#22c55e", nao_atendeu: "#f59e0b", recusou: "#ef4444", pendente: "#94a3b8" };

export default function TelemarketingReportsPanel({ contratados, indicados }: Props) {
  const [selectedLider, setSelectedLider] = useState<string>("geral");

  const lideres = useMemo(() => contratados.filter(c => c.is_lider), [contratados]);

  const allContacts = useMemo<TeleContact[]>(() => {
    return [
      ...contratados.map(c => ({
        id: c.id, nome: c.nome, telefone: c.telefone, cidade: c.cidade, bairro: c.bairro,
        ligacao_status: (c as any).ligacao_status || null,
        vota_candidato: (c as any).vota_candidato || null,
        candidato_alternativo: (c as any).candidato_alternativo || null,
        operador_nome: (c as any).operador_nome || null,
        ligacao_em: (c as any).ligacao_em || null,
        tipo: c.is_lider ? "lider" as const : "liderado" as const,
        lider_id: c.lider_id,
      })),
      ...indicados.map(i => ({
        id: i.id, nome: i.nome, telefone: i.telefone, cidade: i.cidade, bairro: i.bairro,
        ligacao_status: (i as any).ligacao_status || null,
        vota_candidato: (i as any).vota_candidato || null,
        candidato_alternativo: (i as any).candidato_alternativo || null,
        operador_nome: (i as any).operador_nome || null,
        ligacao_em: (i as any).ligacao_em || null,
        tipo: "indicado" as const,
        contratado_id: i.contratado_id,
      })),
    ];
  }, [contratados, indicados]);

  // Filter by selected leader
  const filtered = useMemo(() => {
    if (selectedLider === "geral") return allContacts;
    // Get liderados of this leader + indicados of those liderados + the leader itself
    const liderMembros = contratados.filter(c => c.lider_id === selectedLider).map(c => c.id);
    const leaderIds = new Set([selectedLider, ...liderMembros]);
    return allContacts.filter(c => {
      if (c.tipo === "lider" || c.tipo === "liderado") return leaderIds.has(c.id);
      if (c.tipo === "indicado") return leaderIds.has(c.contratado_id || "");
      return false;
    });
  }, [allContacts, selectedLider, contratados]);

  // Stats
  const total = filtered.length;
  const ligados = filtered.filter(c => c.ligacao_status && c.ligacao_status !== "pendente").length;
  const pendentes = total - ligados;
  const votaSim = filtered.filter(c => c.vota_candidato === "sim").length;
  const votaNao = filtered.filter(c => c.vota_candidato === "nao").length;
  const votoIndeciso = filtered.filter(c => c.vota_candidato === "indeciso").length;
  const atendeu = filtered.filter(c => c.ligacao_status === "atendeu").length;
  const naoAtendeu = filtered.filter(c => c.ligacao_status === "nao_atendeu").length;
  const recusou = filtered.filter(c => c.ligacao_status === "recusou").length;

  const voteData = [
    { name: "Vota ✅", value: votaSim, color: VOTE_COLORS.sim },
    { name: "Não vota ❌", value: votaNao, color: VOTE_COLORS.nao },
    { name: "Indeciso 🤔", value: votoIndeciso, color: VOTE_COLORS.indeciso },
    { name: "Sem resposta", value: total - votaSim - votaNao - votoIndeciso, color: VOTE_COLORS.sem },
  ].filter(d => d.value > 0);

  const statusData = [
    { name: "Atendeu", value: atendeu, color: STATUS_COLORS.atendeu },
    { name: "Não atendeu", value: naoAtendeu, color: STATUS_COLORS.nao_atendeu },
    { name: "Recusou", value: recusou, color: STATUS_COLORS.recusou },
    { name: "Pendente", value: pendentes, color: STATUS_COLORS.pendente },
  ].filter(d => d.value > 0);

  // Per-leader breakdown for bar chart
  const leaderBreakdown = useMemo(() => {
    return lideres.map(l => {
      const memberIds = contratados.filter(c => c.lider_id === l.id).map(c => c.id);
      const allIds = new Set([l.id, ...memberIds]);
      const contacts = allContacts.filter(c => {
        if (c.tipo === "lider" || c.tipo === "liderado") return allIds.has(c.id);
        if (c.tipo === "indicado") return allIds.has(c.contratado_id || "");
        return false;
      });
      return {
        nome: l.nome.split(" ")[0],
        total: contacts.length,
        sim: contacts.filter(c => c.vota_candidato === "sim").length,
        nao: contacts.filter(c => c.vota_candidato === "nao").length,
        indeciso: contacts.filter(c => c.vota_candidato === "indeciso").length,
        pendente: contacts.filter(c => !c.ligacao_status || c.ligacao_status === "pendente").length,
      };
    }).sort((a, b) => b.sim - a.sim);
  }, [lideres, contratados, allContacts]);

  // Candidate alternatives ranking
  const alternativeRanking = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(c => {
      if (c.candidato_alternativo) {
        const key = c.candidato_alternativo.trim().toLowerCase();
        map[key] = (map[key] || 0) + 1;
      }
    });
    return Object.entries(map)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [filtered]);

  // Export CSV
  const exportCSV = () => {
    const header = "Nome,Telefone,Cidade,Bairro,Tipo,Status Ligação,Vota Candidato,Candidato Alternativo,Operador,Data Ligação";
    const rows = filtered.map(c =>
      [c.nome, c.telefone, c.cidade || "", c.bairro || "", c.tipo,
       c.ligacao_status || "pendente", c.vota_candidato || "", c.candidato_alternativo || "",
       c.operador_nome || "", c.ligacao_em ? new Date(c.ligacao_em).toLocaleString("pt-BR") : ""]
      .map(v => `"${v}"`).join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const liderName = selectedLider === "geral" ? "geral" : lideres.find(l => l.id === selectedLider)?.nome || "lider";
    a.download = `relatorio-telemarketing-${liderName.replace(/\s/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pctSim = ligados > 0 ? Math.round((votaSim / ligados) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Filter + Export */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Crown className="w-4 h-4 text-primary" />
          <Select value={selectedLider} onValueChange={setSelectedLider}>
            <SelectTrigger className="w-[200px] h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="geral">📊 Relatório Geral</SelectItem>
              {lideres.map(l => (
                <SelectItem key={l.id} value={l.id}>👑 {l.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCSV}>
          <Download className="w-3.5 h-3.5" />Exportar CSV
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold">{total}</p>
          <p className="text-[10px] text-muted-foreground">Total contatos</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-primary">{ligados}</p>
          <p className="text-[10px] text-muted-foreground">Ligações feitas</p>
        </CardContent></Card>
        <Card className="border-green-200 bg-green-50/50 dark:bg-green-950/20"><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-green-600">{votaSim}</p>
          <p className="text-[10px] text-muted-foreground">Votam ✅ ({pctSim}%)</p>
        </CardContent></Card>
        <Card className="border-red-200 bg-red-50/50 dark:bg-red-950/20"><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-destructive">{votaNao}</p>
          <p className="text-[10px] text-muted-foreground">Não votam ❌</p>
        </CardContent></Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Pie: Vote intention */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary" />Intenção de Voto
            </CardTitle>
          </CardHeader>
          <CardContent>
            {voteData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={voteData} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius={90} innerRadius={40} paddingAngle={2}>
                    {voteData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(value: number, name: string) => [`${value}`, name]} />
                  <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "12px" }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-10">Sem dados</p>
            )}
          </CardContent>
        </Card>

        {/* Pie: Call status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Phone className="w-4 h-4 text-primary" />Status das Ligações
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius={90} innerRadius={40} paddingAngle={2}>
                    {statusData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(value: number, name: string) => [`${value}`, name]} />
                  <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "12px" }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-10">Sem dados</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bar chart: per leader breakdown (only in general view) */}
      {selectedLider === "geral" && leaderBreakdown.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />Votos por Líder
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(250, leaderBreakdown.length * 50)}>
              <BarChart data={leaderBreakdown} layout="vertical" margin={{ left: 20, right: 30, top: 10, bottom: 10 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="nome" width={100} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                <Bar dataKey="sim" name="Vota ✅" fill={VOTE_COLORS.sim} stackId="a" radius={[0, 0, 0, 0]} />
                <Bar dataKey="nao" name="Não vota ❌" fill={VOTE_COLORS.nao} stackId="a" />
                <Bar dataKey="indeciso" name="Indeciso 🤔" fill={VOTE_COLORS.indeciso} stackId="a" />
                <Bar dataKey="pendente" name="Pendente" fill={VOTE_COLORS.sem} stackId="a" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Alternative candidates ranking */}
      {alternativeRanking.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-primary" />Candidatos Alternativos Mencionados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {alternativeRanking.map((item, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg border bg-muted/30">
                  <span className="text-sm font-medium capitalize">{item.name}</span>
                  <Badge variant="secondary">{item.count} menção(ões)</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detailed list */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />Lista Detalhada ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium">Nome</th>
                  <th className="pb-2 font-medium">Telefone</th>
                  <th className="pb-2 font-medium">Tipo</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Voto</th>
                  <th className="pb-2 font-medium">Alternativo</th>
                  <th className="pb-2 font-medium">Operador</th>
                  <th className="pb-2 font-medium">Data</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={`${c.tipo}-${c.id}`} className="border-b last:border-0">
                    <td className="py-1.5 font-medium">{c.nome}</td>
                    <td className="py-1.5">{c.telefone}</td>
                    <td className="py-1.5">
                      <Badge variant="outline" className="text-[9px]">
                        {c.tipo === "lider" ? "Líder" : c.tipo === "liderado" ? "Liderado" : "Indicado"}
                      </Badge>
                    </td>
                    <td className="py-1.5">
                      <Badge variant={
                        c.ligacao_status === "atendeu" ? "default" :
                        c.ligacao_status === "recusou" ? "destructive" : "secondary"
                      } className="text-[9px]">
                        {c.ligacao_status === "atendeu" ? "Atendeu" :
                         c.ligacao_status === "nao_atendeu" ? "Não atendeu" :
                         c.ligacao_status === "recusou" ? "Recusou" : "Pendente"}
                      </Badge>
                    </td>
                    <td className="py-1.5">
                      {c.vota_candidato === "sim" ? "✅" : c.vota_candidato === "nao" ? "❌" : c.vota_candidato === "indeciso" ? "🤔" : "—"}
                    </td>
                    <td className="py-1.5 text-muted-foreground">{c.candidato_alternativo || "—"}</td>
                    <td className="py-1.5 text-muted-foreground">{c.operador_nome || "—"}</td>
                    <td className="py-1.5 text-muted-foreground">
                      {c.ligacao_em ? new Date(c.ligacao_em).toLocaleDateString("pt-BR") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
