import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, User, MapPin, CheckCircle2, XCircle, PhoneOff, Clock, ArrowRight, LogIn, Users } from "lucide-react";
import { toast } from "sonner";

interface ContatoTele {
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
  tabela: "contratados" | "contratado_indicados";
}

export default function Telemarketing() {
  const { clientId } = useParams<{ clientId: string }>();
  const [operadorNome, setOperadorNome] = useState("");
  const [operadorSenha, setOperadorSenha] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [contatos, setContatos] = useState<ContatoTele[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [clientName, setClientName] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "lider" | "liderado" | "indicado">("todos");

  // Form state
  const [ligacaoStatus, setLigacaoStatus] = useState("");
  const [votaCandidato, setVotaCandidato] = useState("");
  const [candidatoAlt, setCandidatoAlt] = useState("");
  const [cidade, setCidade] = useState("");
  const [bairro, setBairro] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Force anon role to ensure RLS anon policies apply
    supabase.auth.signOut().then(() => {
      if (clientId) {
        supabase
          .from("clients")
          .select("name")
          .eq("id", clientId)
          .maybeSingle()
          .then(({ data }) => {
            if (data) setClientName(data.name);
          });
      }
    });
  }, [clientId]);

  const handleLogin = async () => {
    if (!operadorNome.trim() || !operadorSenha.trim()) {
      toast.error("Informe nome e senha para continuar");
      return;
    }
    setLoading(true);

    // Validate operator credentials
    const { data: opData } = await supabase
      .from("telemarketing_operadores")
      .select("id, nome")
      .eq("client_id", clientId!)
      .eq("nome", operadorNome.trim())
      .eq("senha", operadorSenha.trim())
      .eq("ativo", true)
      .maybeSingle();

    if (!opData) {
      toast.error("Nome ou senha inválidos");
      setLoading(false);
      return;
    }

    // Fetch contratados (líderes + liderados)
    const { data: contratadosData } = await supabase
      .from("contratados")
      .select("id, nome, telefone, cidade, bairro, is_lider, ligacao_status, vota_candidato, candidato_alternativo, operador_nome, ligacao_em")
      .eq("client_id", clientId!)
      .order("created_at", { ascending: true });

    // Fetch indicados
    const { data: indicadosData } = await supabase
      .from("contratado_indicados")
      .select("id, nome, telefone, cidade, bairro, ligacao_status, vota_candidato, candidato_alternativo, operador_nome, ligacao_em")
      .eq("client_id", clientId!)
      .order("created_at", { ascending: true });

    const allContatos: ContatoTele[] = [
      ...(contratadosData || []).map((c: any) => ({
        id: c.id,
        nome: c.nome,
        telefone: c.telefone,
        cidade: c.cidade,
        bairro: c.bairro,
        ligacao_status: c.ligacao_status,
        vota_candidato: c.vota_candidato,
        candidato_alternativo: c.candidato_alternativo,
        operador_nome: c.operador_nome,
        ligacao_em: c.ligacao_em,
        tipo: c.is_lider ? "lider" as const : "liderado" as const,
        tabela: "contratados" as const,
      })),
      ...(indicadosData || []).map((i: any) => ({
        id: i.id,
        nome: i.nome,
        telefone: i.telefone,
        cidade: i.cidade,
        bairro: i.bairro,
        ligacao_status: i.ligacao_status,
        vota_candidato: i.vota_candidato,
        candidato_alternativo: i.candidato_alternativo,
        operador_nome: i.operador_nome,
        ligacao_em: i.ligacao_em,
        tipo: "indicado" as const,
        tabela: "contratado_indicados" as const,
      })),
    ];

    // Filter out contacts that have already been called — they must NOT return to the funnel
    const lista = allContatos.filter(c => !c.ligacao_status || c.ligacao_status === "pendente");

    setContatos(lista);
    const firstPending = lista.findIndex(
      (i) => !i.ligacao_status || i.ligacao_status === "pendente"
    );
    setCurrentIndex(firstPending >= 0 ? firstPending : 0);
    setLoggedIn(true);
    setLoading(false);
  };

  const filteredContatos = filtroTipo === "todos"
    ? contatos
    : contatos.filter((c) => c.tipo === filtroTipo);

  const current = filteredContatos[currentIndex] as ContatoTele | undefined;

  const totalPendentes = filteredContatos.filter(
    (i) => !i.ligacao_status || i.ligacao_status === "pendente"
  ).length;
  const totalLigados = filteredContatos.filter(
    (i) => i.ligacao_status && i.ligacao_status !== "pendente"
  ).length;

  const resetForm = () => {
    setLigacaoStatus("");
    setVotaCandidato("");
    setCandidatoAlt("");
    setCidade("");
    setBairro("");
  };

  useEffect(() => {
    if (current) {
      setCidade(current.cidade || "");
      setBairro(current.bairro || "");
      setLigacaoStatus("");
      setVotaCandidato("");
      setCandidatoAlt("");
    }
  }, [currentIndex, filtroTipo]);

  const handleSave = async () => {
    if (!ligacaoStatus) {
      toast.error("Selecione o resultado da ligação");
      return;
    }
    if (!current) return;

    setSaving(true);
    const updateData: Record<string, any> = {
      ligacao_status: ligacaoStatus,
      operador_nome: operadorNome.trim(),
      ligacao_em: new Date().toISOString(),
      cidade: cidade.trim() || null,
      bairro: bairro.trim() || null,
    };

    if (ligacaoStatus === "atendeu") {
      updateData.vota_candidato = votaCandidato || null;
      updateData.candidato_alternativo = candidatoAlt.trim() || null;
      if (current.tabela === "contratado_indicados") {
        if (votaCandidato === "sim") updateData.status = "confirmado";
        else if (votaCandidato === "nao") updateData.status = "rejeitado";
      }
    }

    const { data: updatedRows, error } = await supabase
      .from(current.tabela)
      .update(updateData)
      .eq("id", current.id)
      .select();

    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      setSaving(false);
      return;
    }

    if (!updatedRows || updatedRows.length === 0) {
      toast.error("Falha ao salvar no banco — nenhuma linha foi atualizada. Tente recarregar a página.");
      setSaving(false);
      return;
    }

    // Update local state
    setContatos((prev) =>
      prev.map((i) =>
        i.id === current.id ? { ...i, ...updateData } : i
      )
    );

    toast.success("Ligação registrada!");
    setSaving(false);

    // Move to next pending in filtered list
    const nextPending = filteredContatos.findIndex(
      (i, idx) => idx > currentIndex && (!i.ligacao_status || i.ligacao_status === "pendente")
    );
    if (nextPending >= 0) {
      setCurrentIndex(nextPending);
    } else {
      const fromStart = filteredContatos.findIndex(
        (i, idx) => idx !== currentIndex && (!i.ligacao_status || i.ligacao_status === "pendente")
      );
      if (fromStart >= 0) {
        setCurrentIndex(fromStart);
      } else {
        toast.success("🎉 Todos os contatos foram ligados!");
      }
    }
    resetForm();
  };

  const skipToNext = () => {
    const next = filteredContatos.findIndex(
      (i, idx) => idx > currentIndex && (!i.ligacao_status || i.ligacao_status === "pendente")
    );
    if (next >= 0) {
      setCurrentIndex(next);
      resetForm();
    } else {
      toast.info("Não há mais contatos pendentes");
    }
  };

  const tipoLabel = (tipo: string) => {
    if (tipo === "lider") return "Líder";
    if (tipo === "liderado") return "Liderado";
    return "Indicado";
  };

  const tipoBadgeVariant = (tipo: string): "default" | "secondary" | "outline" => {
    if (tipo === "lider") return "default";
    if (tipo === "liderado") return "secondary";
    return "outline";
  };

  // Login screen
  if (!loggedIn) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
              <Phone className="w-7 h-7 text-primary" />
            </div>
            <CardTitle className="text-xl">Central de Telemarketing</CardTitle>
            {clientName && (
              <p className="text-sm text-muted-foreground">{clientName}</p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Seu nome (operador)</label>
              <Input
                placeholder="Digite seu nome..."
                value={operadorNome}
                onChange={(e) => setOperadorNome(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Senha</label>
              <Input
                type="password"
                placeholder="Digite sua senha..."
                value={operadorSenha}
                onChange={(e) => setOperadorSenha(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
            </div>
            <Button onClick={handleLogin} className="w-full" disabled={loading}>
              <LogIn className="w-4 h-4 mr-2" />
              {loading ? "Validando..." : "Entrar"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 p-4 sm:p-6 max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Phone className="w-5 h-5 text-primary" />
            Telemarketing e Verificação
          </h1>
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight max-w-sm mb-2">
            Central de atendimento para validar indicações e intenção de voto. Utilize o click-to-call para ligar diretamente do seu celular e registre o resultado para alimentar sua inteligência eleitoral em tempo real.
          </p>
          <p className="text-xs text-muted-foreground">
            Operador: <span className="font-medium text-foreground">{operadorNome}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary" className="text-xs">
            <Clock className="w-3 h-3 mr-1" />
            {totalPendentes} pendentes
          </Badge>
          <Badge variant="default" className="text-xs">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            {totalLigados} ligados
          </Badge>
        </div>
      </div>

      {/* Type filter */}
      <div className="flex gap-2 flex-wrap">
        {(["todos", "lider", "liderado", "indicado"] as const).map((f) => (
          <Button
            key={f}
            variant={filtroTipo === f ? "default" : "outline"}
            size="sm"
            className="text-xs"
            onClick={() => { setFiltroTipo(f); setCurrentIndex(0); resetForm(); }}
          >
            {f === "todos" ? (
              <><Users className="w-3.5 h-3.5 mr-1" />Todos ({contatos.length})</>
            ) : (
              <>{tipoLabel(f)} ({contatos.filter(c => c.tipo === f).length})</>
            )}
          </Button>
        ))}
      </div>

      {/* Current contact */}
      {current ? (
        <>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="w-4 h-4 text-primary" />
                  {current.nome}
                </CardTitle>
                <div className="flex gap-1.5 shrink-0">
                  <Badge variant={tipoBadgeVariant(current.tipo)} className="text-[10px]">
                    {tipoLabel(current.tipo)}
                  </Badge>
                  <Badge
                    variant={
                      current.ligacao_status === "atendeu"
                        ? "default"
                        : current.ligacao_status === "nao_atendeu"
                        ? "secondary"
                        : current.ligacao_status === "recusou"
                        ? "destructive"
                        : "outline"
                    }
                    className="text-[10px]"
                  >
                    {!current.ligacao_status || current.ligacao_status === "pendente"
                      ? "Pendente"
                      : current.ligacao_status === "atendeu"
                      ? "Atendeu"
                      : current.ligacao_status === "nao_atendeu"
                      ? "Não atendeu"
                      : current.ligacao_status === "recusou"
                      ? "Recusou"
                      : current.ligacao_status}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Phone */}
              <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg">
                <Phone className="w-5 h-5 text-primary" />
                <a
                  href={`tel:${current.telefone}`}
                  className="text-lg font-bold text-primary hover:underline"
                >
                  {current.telefone}
                </a>
              </div>

              {(current.cidade || current.bairro) && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="w-3.5 h-3.5" />
                  {current.bairro && <span>{current.bairro}</span>}
                  {current.bairro && current.cidade && <span>•</span>}
                  {current.cidade && <span>{current.cidade}</span>}
                </div>
              )}

              {/* Call result form */}
              <div className="border-t pt-4 space-y-3">
                <p className="font-medium text-sm">Resultado da ligação</p>

                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant={ligacaoStatus === "atendeu" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setLigacaoStatus("atendeu")}
                    className="text-xs"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    Atendeu
                  </Button>
                  <Button
                    variant={ligacaoStatus === "nao_atendeu" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setLigacaoStatus("nao_atendeu")}
                    className="text-xs"
                  >
                    <PhoneOff className="w-3.5 h-3.5 mr-1" />
                    Não atendeu
                  </Button>
                  <Button
                    variant={ligacaoStatus === "recusou" ? "destructive" : "outline"}
                    size="sm"
                    onClick={() => setLigacaoStatus("recusou")}
                    className="text-xs"
                  >
                    <XCircle className="w-3.5 h-3.5 mr-1" />
                    Recusou
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Cidade</label>
                    <Input
                      placeholder="Cidade"
                      value={cidade}
                      onChange={(e) => setCidade(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Bairro</label>
                    <Input
                      placeholder="Bairro"
                      value={bairro}
                      onChange={(e) => setBairro(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>
                </div>

                {ligacaoStatus === "atendeu" && (
                  <div className="space-y-3 bg-muted/50 p-3 rounded-lg">
                    <div>
                      <label className="text-xs font-medium mb-1.5 block">Vota no candidato?</label>
                      <Select value={votaCandidato} onValueChange={setVotaCandidato}>
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sim">✅ Sim, vota</SelectItem>
                          <SelectItem value="nao">❌ Não vota</SelectItem>
                          <SelectItem value="indeciso">🤔 Indeciso</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {(votaCandidato === "nao" || votaCandidato === "indeciso") && (
                      <div>
                        <label className="text-xs font-medium mb-1.5 block">
                          Candidato que apoia (opcional)
                        </label>
                        <Input
                          placeholder="Nome do candidato..."
                          value={candidatoAlt}
                          onChange={(e) => setCandidatoAlt(e.target.value)}
                          className="h-9 text-sm"
                        />
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button onClick={handleSave} disabled={saving || !ligacaoStatus} className="flex-1">
                    {saving ? "Salvando..." : "Salvar e Próximo"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={skipToNext}>
                    Pular
                    <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="text-center text-xs text-muted-foreground">
            Contato {currentIndex + 1} de {filteredContatos.length}
          </div>
        </>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Phone className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhum contato disponível</p>
            <p className="text-xs mt-1">Não há contatos cadastrados para este filtro</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
