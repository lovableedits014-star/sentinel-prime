import { useState, useEffect, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Phone, User, MapPin, CheckCircle2, XCircle, PhoneOff, Clock, ArrowRight, LogIn, Users, CalendarClock, Lock } from "lucide-react";
import { toast } from "sonner";
import { toWhatsAppBR, fmtPhoneBR } from "@/lib/phone-utils";

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
  tipo: "lider" | "liderado" | "indicado" | "avulso" | "eleicao_indicado" | "estrutura";
  tabela: "contratados" | "contratado_indicados" | "contatos_avulsos" | "eleicao_indicados" | "eleicao_pessoas";
  proxima_tentativa_em: string | null;
  tentativas_count: number | null;
  observacao_tele: string | null;
  locked_by: string | null;
  locked_until: string | null;
  campanha_id: string | null;
  indicador_nome: string | null;
  indicador_tipo: string | null;
  lista_id: string | null;
}

interface CampanhaScript {
  id: string;
  nome: string;
  script_intro: string | null;
  script_perguntas: string[] | null;
  tags_rapidas: string[] | null;
  whatsapp_template?: string | null;
}


export default function Telemarketing() {
  const { clientId } = useParams<{ clientId: string }>();
  const [searchParams] = useSearchParams();
  const campanhaIdParam = searchParams.get("campanha");
  const [operadorNome, setOperadorNome] = useState(searchParams.get("nome") || "");
  const [operadorSenha, setOperadorSenha] = useState(searchParams.get("senha") || "");
  const [loggedIn, setLoggedIn] = useState(false);
  const [contatos, setContatos] = useState<ContatoTele[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [clientName, setClientName] = useState("");
  const [campanhaNome, setCampanhaNome] = useState<string | null>(null);
  const [selectedCampanhaId, setSelectedCampanhaId] = useState<string | null>(campanhaIdParam);
  const [pickingCampanha, setPickingCampanha] = useState(false);
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "lider" | "liderado" | "indicado" | "avulso" | "eleicao_indicado" | "estrutura">("todos");
  const autoLoginAttempted = useRef(false);

  // Form state
  const [ligacaoStatus, setLigacaoStatus] = useState("");
  const [votaCandidato, setVotaCandidato] = useState("");
  const [candidatoAlt, setCandidatoAlt] = useState("");
  const [cidade, setCidade] = useState("");
  const [bairro, setBairro] = useState("");
  const [observacao, setObservacao] = useState("");
  const [proximaTentativa, setProximaTentativa] = useState("");
  const [saving, setSaving] = useState(false);
  const [scripts, setScripts] = useState<CampanhaScript[]>([]);

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
      if (campanhaIdParam) {
        supabase.from("telemarketing_campanhas" as any)
          .select("nome")
          .eq("id", campanhaIdParam)
          .maybeSingle()
          .then(({ data }: any) => { if (data?.nome) setCampanhaNome(data.nome); });
      }
    });
  }, [clientId, campanhaIdParam]);

  // Auto-login when admin opens with ?auto=1&nome=...&senha=...
  useEffect(() => {
    if (autoLoginAttempted.current) return;
    if (!clientId) return;
    if (searchParams.get("auto") !== "1") return;
    if (!operadorNome.trim() || !operadorSenha.trim()) return;
    autoLoginAttempted.current = true;
    handleLogin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);


  const handleLogin = async () => {
    if (!operadorNome.trim() || !operadorSenha.trim()) {
      toast.error("Informe nome e senha para continuar");
      return;
    }
    setLoading(true);

    // Validate operator credentials via SECURITY DEFINER function (senha não trafega na tabela)
    const { data: opRows, error: opErr } = await supabase.rpc("verify_telemarketing_operador" as any, {
      _client_id: clientId!,
      _nome: operadorNome.trim(),
      _senha: operadorSenha.trim(),
    });

    if (opErr) {
      const msg = opErr.message || "";
      if (/bloque/i.test(msg)) {
        toast.error("Conta bloqueada temporariamente por excesso de tentativas. Tente novamente em alguns minutos.");
      } else {
        toast.error("Nome ou senha inválidos");
      }
      setLoading(false);
      return;
    }

    const opData = Array.isArray(opRows) && opRows.length > 0 ? opRows[0] : null;
    if (!opData) {
      toast.error("Nome ou senha inválidos. Após 5 tentativas, a conta é bloqueada por 15 minutos.");
      setLoading(false);
      return;
    }

    // Fetch contacts via secure RPC (operator-authenticated). When opened from
    // the admin "Filas" page, ?campanha=ID restricts the list to that fila.
    const { data: rpcRows, error: rpcErr } = await supabase.rpc("tele_list_contatos" as any, {
      _client_id: clientId!,
      _nome: operadorNome.trim(),
      _senha: operadorSenha.trim(),
      _campanha_id: selectedCampanhaId,
    });
    if (rpcErr) {
      toast.error("Erro ao carregar contatos: " + rpcErr.message);
      setLoading(false);
      return;
    }
    const allContatos: ContatoTele[] = ((rpcRows as any[]) || []).map((r) => ({
      id: r.id,
      nome: r.nome,
      telefone: r.telefone,
      cidade: r.cidade,
      bairro: r.bairro,
      ligacao_status: r.ligacao_status,
      vota_candidato: r.vota_candidato,
      candidato_alternativo: r.candidato_alternativo,
      operador_nome: r.operador_nome,
      ligacao_em: r.ligacao_em,
      tipo: r.tipo as ContatoTele["tipo"],
      tabela: r.tabela as ContatoTele["tabela"],
      proxima_tentativa_em: r.proxima_tentativa_em ?? null,
      tentativas_count: r.tentativas_count ?? 0,
      observacao_tele: r.observacao_tele ?? null,
      locked_by: r.locked_by ?? null,
      locked_until: r.locked_until ?? null,
      campanha_id: r.campanha_id ?? null,
      indicador_nome: r.indicador_nome ?? null,
      indicador_tipo: r.indicador_tipo ?? null,
      lista_id: r.lista_id ?? null,
    }));

    // Filter out contacts that have already been called — they must NOT return to the funnel
    const lista = allContatos.filter(c => !c.ligacao_status || c.ligacao_status === "pendente");

    setContatos(lista);

    // Load campaign scripts (best-effort)
    const { data: scriptRows } = await supabase.rpc("tele_list_campanhas_scripts" as any, {
      _client_id: clientId!,
      _nome: operadorNome.trim(),
      _senha: operadorSenha.trim(),
    });
    setScripts(((scriptRows as any[]) || []).map((s) => ({
      id: s.id,
      nome: s.nome,
      script_intro: s.script_intro,
      script_perguntas: Array.isArray(s.script_perguntas) ? s.script_perguntas : [],
      tags_rapidas: Array.isArray(s.tags_rapidas) ? s.tags_rapidas : [],
    })));

    setLoggedIn(true);
    setLoading(false);

    // Se o operador tem múltiplas campanhas atribuídas e nenhuma foi passada por URL,
    // abre a tela de escolha em vez de já saltar para um contato.
    const campanhasComContato = new Set(lista.map(c => c.campanha_id).filter(Boolean));
    if (!campanhaIdParam && campanhasComContato.size > 1) {
      setPickingCampanha(true);
      return;
    }

    // Picker atômico no servidor: cada operador começa em um contato diferente.
    const { data: pick } = await supabase.rpc("tele_proximo_contato" as any, {
      _client_id: clientId!,
      _nome: operadorNome.trim(),
      _senha: operadorSenha.trim(),
      _campanha_id: selectedCampanhaId,
      _ttl_seconds: 300,
    });
    const res = pick as { found: boolean; tabela?: string; contato_id?: string; lista_id?: string } | null;
    
    // Se o operador tem lista travada, ignoramos escolha de campanha e focamos na lista
    if (res?.lista_id) {
      setPickingCampanha(false);
    }

    if (res?.found) {
      const idx = lista.findIndex(c => c.id === res.contato_id && c.tabela === res.tabela);
      setCurrentIndex(idx >= 0 ? idx : 0);
    } else {
      setCurrentIndex(0);
    }
  };

  const pickCampanha = async (campanhaId: string | null) => {
    setSelectedCampanhaId(campanhaId);
    setPickingCampanha(false);
    setCurrentIndex(0);
    setFiltroTipo("todos");
    resetForm();
    const script = scripts.find(s => s.id === campanhaId);
    setCampanhaNome(script?.nome || null);
    await reloadContatosWithCampanha(campanhaId);
    // salta para o próximo disponível dentro da campanha escolhida
    if (!clientId) return;
    const { data } = await supabase.rpc("tele_proximo_contato" as any, {
      _client_id: clientId,
      _nome: operadorNome.trim(),
      _senha: operadorSenha.trim(),
      _campanha_id: campanhaId,
      _ttl_seconds: 300,
    });
    const res = data as { found: boolean; tabela?: string; contato_id?: string } | null;
    if (res?.found) {
      setContatos(prev => {
        const idx = prev.findIndex(c => c.id === res.contato_id && c.tabela === res.tabela);
        if (idx >= 0) setCurrentIndex(idx);
        return prev;
      });
    }
  };

  const reloadContatosWithCampanha = async (campanhaId: string | null) => {
    if (!clientId) return;
    const { data: rpcRows } = await supabase.rpc("tele_list_contatos" as any, {
      _client_id: clientId,
      _nome: operadorNome.trim(),
      _senha: operadorSenha.trim(),
      _campanha_id: campanhaId,
    });
    const lista: ContatoTele[] = ((rpcRows as any[]) || [])
      .map((r) => ({
        id: r.id, nome: r.nome, telefone: r.telefone,
        cidade: r.cidade, bairro: r.bairro,
        ligacao_status: r.ligacao_status, vota_candidato: r.vota_candidato,
        candidato_alternativo: r.candidato_alternativo, operador_nome: r.operador_nome,
        ligacao_em: r.ligacao_em, tipo: r.tipo as ContatoTele["tipo"],
        tabela: r.tabela as ContatoTele["tabela"],
        proxima_tentativa_em: r.proxima_tentativa_em ?? null,
        tentativas_count: r.tentativas_count ?? 0,
        observacao_tele: r.observacao_tele ?? null,
        locked_by: r.locked_by ?? null, locked_until: r.locked_until ?? null,
        campanha_id: r.campanha_id ?? null,
        indicador_nome: r.indicador_nome ?? null,
        indicador_tipo: r.indicador_tipo ?? null,
        lista_id: r.lista_id ?? null,
      }))
      .filter(c => !c.ligacao_status || c.ligacao_status === "pendente");
    setContatos(lista);
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
    setObservacao("");
    setProximaTentativa("");
  };

  // Recarrega a lista (mantendo o contato atual se ainda existir)
  const reloadContatos = async (preserveId?: { id: string; tabela: string }) => {
    if (!clientId || !operadorNome.trim() || !operadorSenha.trim()) return [] as ContatoTele[];
    const { data: rpcRows } = await supabase.rpc("tele_list_contatos" as any, {
      _client_id: clientId,
      _nome: operadorNome.trim(),
      _senha: operadorSenha.trim(),
      _campanha_id: selectedCampanhaId,
    });
    const lista: ContatoTele[] = ((rpcRows as any[]) || [])
      .map((r) => ({
        id: r.id, nome: r.nome, telefone: r.telefone,
        cidade: r.cidade, bairro: r.bairro,
        ligacao_status: r.ligacao_status, vota_candidato: r.vota_candidato,
        candidato_alternativo: r.candidato_alternativo, operador_nome: r.operador_nome,
        ligacao_em: r.ligacao_em, tipo: r.tipo as ContatoTele["tipo"],
        tabela: r.tabela as ContatoTele["tabela"],
        proxima_tentativa_em: r.proxima_tentativa_em ?? null,
        tentativas_count: r.tentativas_count ?? 0,
        observacao_tele: r.observacao_tele ?? null,
        locked_by: r.locked_by ?? null, locked_until: r.locked_until ?? null,
        campanha_id: r.campanha_id ?? null,
        indicador_nome: r.indicador_nome ?? null,
        indicador_tipo: r.indicador_tipo ?? null,
        lista_id: r.lista_id ?? null,
      }))
      .filter(c => !c.ligacao_status || c.ligacao_status === "pendente");
    setContatos(lista);
    if (preserveId) {
      const idx = lista.findIndex(c => c.id === preserveId.id && c.tabela === preserveId.tabela);
      if (idx >= 0) setCurrentIndex(idx);
    }
    return lista;
  };

  // Picker atômico: servidor escolhe + trava o próximo disponível.
  // Garante que dois operadores nunca recebam o mesmo contato.
  const jumpToProximoDisponivel = async () => {
    if (!clientId) return;
    const { data, error } = await supabase.rpc("tele_proximo_contato" as any, {
      _client_id: clientId,
      _nome: operadorNome.trim(),
      _senha: operadorSenha.trim(),
      _campanha_id: selectedCampanhaId,
      _ttl_seconds: 300,
    });
    if (error) { toast.error("Erro: " + error.message); return; }
    const res = data as { found: boolean; tabela?: string; contato_id?: string } | null;
    if (!res || !res.found) {
      toast.info("Fila vazia no momento — aguardando reagendamentos.");
      return;
    }
    let idx = contatos.findIndex(c => c.id === res.contato_id && c.tabela === res.tabela);
    if (idx < 0) {
      const lista = await reloadContatos();
      idx = lista.findIndex(c => c.id === res.contato_id && c.tabela === res.tabela);
    }
    if (idx >= 0) {
      setFiltroTipo("todos");
      setCurrentIndex(idx);
      resetForm();
    }
  };

  // Reivindica trava de 5min ao abrir o contato; libera ao trocar/pular
  useEffect(() => {
    if (current && clientId) {
      setCidade(current.cidade || "");
      setBairro(current.bairro || "");
      setObservacao("");
      setProximaTentativa("");
      setLigacaoStatus("");
      setVotaCandidato("");
      setCandidatoAlt("");
      supabase.rpc("tele_claim_contato" as any, {
        _client_id: clientId,
        _nome: operadorNome.trim(),
        _senha: operadorSenha.trim(),
        _tabela: current.tabela,
        _id: current.id,
        _ttl_seconds: 300,
      }).then(({ data }: any) => {
        if (data && data.claimed === false && data.operador_nome && data.operador_nome !== operadorNome.trim()) {
          toast.warning(`Este contato está em atendimento por ${data.operador_nome}. Pulando…`);
          void jumpToProximoDisponivel();
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  // Heartbeat: renova a trava a cada 60s
  useEffect(() => {
    if (!current || !clientId) return;
    const iv = setInterval(() => {
      supabase.rpc("tele_heartbeat_contato" as any, {
        _client_id: clientId,
        _nome: operadorNome.trim(),
        _senha: operadorSenha.trim(),
        _tabela: current.tabela,
        _id: current.id,
        _ttl_seconds: 300,
      });
    }, 60_000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, clientId]);

  // Realtime: reflete travas de outros operadores quase em tempo real
  useEffect(() => {
    if (!loggedIn || !clientId) return;
    const ch = supabase
      .channel(`tele_assign_${clientId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "telemarketing_call_assignments", filter: `client_id=eq.${clientId}` },
        () => { void reloadContatos(current ? { id: current.id, tabela: current.tabela } : undefined); },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn, clientId]);


  const handleSave = async () => {
    if (!ligacaoStatus) {
      toast.error("Selecione o resultado da ligação");
      return;
    }
    if (!current) return;

    setSaving(true);
    const proximaTs = proximaTentativa ? new Date(proximaTentativa).toISOString() : null;
    const { data: rpcResult, error } = await supabase.rpc("tele_registrar_ligacao" as any, {
      _client_id: clientId!,
      _nome: operadorNome.trim(),
      _senha: operadorSenha.trim(),
      _tabela: current.tabela,
      _id: current.id,
      _ligacao_status: ligacaoStatus,
      _cidade: cidade.trim() || "",
      _bairro: bairro.trim() || "",
      _vota_candidato: ligacaoStatus === "atendeu" ? (votaCandidato || null) : null,
      _candidato_alternativo: ligacaoStatus === "atendeu" ? (candidatoAlt.trim() || null) : null,
      _observacao: observacao.trim() || null,
      _proxima_tentativa_em: proximaTs,
    });

    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      setSaving(false);
      return;
    }
    const result = rpcResult as { updated?: number; conflict?: boolean; lock_owner?: string } | null;
    if (result?.conflict) {
      toast.error(`Outro operador (${result.lock_owner}) atendeu este contato agora. Indo para o próximo…`);
      setSaving(false);
      resetForm();
      await jumpToProximoDisponivel();
      return;
    }
    if (!result || (result.updated ?? 0) === 0) {
      toast.error("Falha ao salvar no banco. Tente recarregar a página.");
      setSaving(false);
      return;
    }

    setContatos((prev) => prev.filter((i) => i.id !== current.id));
    toast.success("Ligação registrada!");
    setSaving(false);
    resetForm();
    await jumpToProximoDisponivel();
  };

  const skipToNext = async () => {
    if (current && clientId) {
      await supabase.rpc("tele_release_contato" as any, {
        _client_id: clientId,
        _nome: operadorNome.trim(),
        _senha: operadorSenha.trim(),
        _tabela: current.tabela,
        _id: current.id,
      });
    }
    resetForm();
    await jumpToProximoDisponivel();
  };

  const tipoLabel = (tipo: string) => {
    if (tipo === "lider") return "Líder";
    if (tipo === "liderado") return "Liderado";
    if (tipo === "avulso") return "Mailing";
    if (tipo === "eleicao_indicado") return "Eleição";
    if (tipo === "estrutura") return "Estrutura";
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

  // Campaign picker — shown after login when the operator has more than one assigned campaign
  if (pickingCampanha) {
    const contagens = new Map<string | null, number>();
    for (const c of contatos) contagens.set(c.campanha_id, (contagens.get(c.campanha_id) || 0) + 1);
    const opcoes = scripts
      .map(s => ({ id: s.id, nome: s.nome, count: contagens.get(s.id) || 0 }))
      .filter(o => o.count > 0)
      .sort((a, b) => b.count - a.count);
    const semCampanha = contagens.get(null) || 0;

    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Phone className="w-5 h-5 text-primary" />
              Escolha a campanha
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Olá, <strong>{operadorNome}</strong>. Você tem contatos em mais de uma campanha — selecione por qual quer começar. Você pode trocar a qualquer momento.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {opcoes.map(o => (
              <Button
                key={o.id}
                variant="outline"
                className="w-full justify-between h-auto py-3"
                onClick={() => pickCampanha(o.id)}
              >
                <span className="font-medium truncate">{o.nome}</span>
                <Badge variant="secondary">{o.count} pendentes</Badge>
              </Button>
            ))}
            {semCampanha > 0 && (
              <Button
                variant="outline"
                className="w-full justify-between h-auto py-3"
                onClick={() => pickCampanha(null)}
              >
                <span className="font-medium">Contatos gerais (sem campanha)</span>
                <Badge variant="secondary">{semCampanha} pendentes</Badge>
              </Button>
            )}
            {opcoes.length === 0 && semCampanha === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                Nenhum contato disponível no momento.
              </p>
            )}
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
            {campanhaNome && <> · Fila: <span className="font-medium text-foreground">{campanhaNome}</span></>}
            {current?.lista_id && (
              <Badge variant="outline" className="ml-2 bg-amber-500/10 text-amber-700 border-amber-500/20 animate-pulse">
                <Lock className="w-3 h-3 mr-1" />
                Lista Designada
              </Badge>
            )}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {!current?.lista_id && !campanhaIdParam && scripts.length > 1 && (
            <Button size="sm" variant="outline" onClick={() => setPickingCampanha(true)}>
              Trocar campanha
            </Button>
          )}
          <Button size="sm" variant="default" onClick={jumpToProximoDisponivel}>
            <ArrowRight className="w-3.5 h-3.5 mr-1" />
            Próximo disponível
          </Button>
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
      {!current?.lista_id && (
        <div className="flex gap-2 flex-wrap">
        {(["todos", "lider", "liderado", "indicado", "avulso", "eleicao_indicado", "estrutura"] as const).map((f) => (
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
      )}

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
              {/* Phone + WhatsApp */}
              {(() => {
                const wa = toWhatsAppBR(current.telefone);
                const telLink = wa ? `+${wa}` : (current.telefone || "");
                const template = current.campanha_id ? scripts.find(s => s.id === current.campanha_id)?.whatsapp_template : null;
                const msg = template ? String(template).replace(/\{\{\s*nome\s*\}\}/gi, current.nome || "").replace(/\{\{\s*operador\s*\}\}/gi, operadorNome.trim()) : "";
                const waUrl = `https://wa.me/${wa}${msg ? `?text=${encodeURIComponent(msg)}` : ""}`;
                return (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg">
                      <Phone className="w-5 h-5 text-primary" />
                      <span className="text-lg font-bold text-primary">{fmtPhoneBR(wa || current.telefone)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        asChild={!!wa}
                        disabled={!wa}
                        title={wa ? undefined : "Telefone inválido — corrija o cadastro"}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white h-11"
                      >
                        {wa ? (
                        <a href={waUrl} target="_blank" rel="noopener noreferrer" aria-label="Abrir conversa no WhatsApp">

                          <svg viewBox="0 0 24 24" className="w-4 h-4 mr-1 fill-current"><path d="M20.5 3.5A11 11 0 0 0 3.6 17.3L2 22l4.8-1.6a11 11 0 0 0 16.7-9.3 11 11 0 0 0-3-7.6ZM12 20.1a9 9 0 0 1-4.6-1.3l-.3-.2-2.8.9.9-2.8-.2-.3A9.1 9.1 0 1 1 12 20Zm5-6.7c-.3-.1-1.7-.8-2-1-.3-.1-.5-.1-.7.2l-1 1.2c-.2.2-.4.3-.7.1a7.4 7.4 0 0 1-3.6-3.2c-.3-.5.3-.4.8-1.4.1-.2 0-.4-.1-.5l-1-2.4c-.2-.5-.5-.4-.7-.4H7c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.2.2 2 3.1 5 4.3.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 2-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3Z"/></svg>
                          WhatsApp
                        </a>
                        ) : (
                          <span className="flex items-center">WhatsApp</span>
                        )}
                      </Button>

                      <Button asChild variant="outline" className="h-11">
                        <a href={`tel:${telLink}`} aria-label="Ligar por telefone">
                          <Phone className="w-4 h-4 mr-1" />
                          Ligar
                        </a>
                      </Button>
                    </div>
                  </div>
                );
              })()}


              {(current.cidade || current.bairro) && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="w-3.5 h-3.5" />
                  {current.bairro && <span>{current.bairro}</span>}
                  {current.bairro && current.cidade && <span>•</span>}
                  {current.cidade && <span>{current.cidade}</span>}
                </div>
              )}

              {current.indicador_nome && (
                <div className="text-xs bg-violet-500/10 text-violet-700 dark:text-violet-300 border border-violet-500/20 p-2 rounded flex items-center gap-2">
                  <Users className="w-3.5 h-3.5" />
                  Indicado por <span className="font-semibold">{current.indicador_nome}</span>
                  {current.indicador_tipo && (
                    <Badge variant="outline" className="text-[10px] capitalize">{current.indicador_tipo}</Badge>
                  )}
                </div>
              )}

              {current.tipo === "estrutura" && current.indicador_tipo && (
                <div className="text-xs bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 p-2 rounded flex items-center gap-2">
                  <Users className="w-3.5 h-3.5" />
                  Membro da estrutura: <Badge variant="outline" className="text-[10px] capitalize">{current.indicador_tipo}</Badge>
                </div>
              )}

              {/* Lock / tentativas / agendamento info */}
              {current.locked_by && current.locked_by !== operadorNome.trim() && (
                <div className="flex items-center gap-2 text-xs bg-amber-500/10 text-amber-700 dark:text-amber-300 p-2 rounded">
                  <Lock className="w-3.5 h-3.5" />
                  Em atendimento por <span className="font-medium">{current.locked_by}</span>
                </div>
              )}
              {(current.tentativas_count ?? 0) > 0 && (
                <div className="text-[11px] text-muted-foreground">
                  Tentativas anteriores: <span className="font-medium">{current.tentativas_count}</span>
                  {current.proxima_tentativa_em && (
                    <> · Reagendado para {new Date(current.proxima_tentativa_em).toLocaleString("pt-BR")}</>
                  )}
                </div>
              )}
              {current.observacao_tele && (
                <div className="text-xs bg-muted/50 p-2 rounded border">
                  <span className="font-medium">Observação anterior:</span> {current.observacao_tele}
                </div>
              )}

              {/* Script da campanha */}
              {(() => {
                const script = current.campanha_id ? scripts.find(s => s.id === current.campanha_id) : null;
                if (!script || (!script.script_intro && !(script.script_perguntas || []).length && !(script.tags_rapidas || []).length)) return null;
                return (
                  <div className="bg-primary/5 border border-primary/20 rounded p-3 space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Script — {script.nome}</p>
                    {script.script_intro && (
                      <p className="text-xs whitespace-pre-wrap">{script.script_intro}</p>
                    )}
                    {(script.script_perguntas || []).length > 0 && (
                      <ol className="text-xs list-decimal pl-4 space-y-0.5">
                        {(script.script_perguntas || []).map((q, i) => <li key={i}>{q}</li>)}
                      </ol>
                    )}
                    {(script.tags_rapidas || []).length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {(script.tags_rapidas || []).map((t, i) => (
                          <Button
                            key={i}
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-6 text-[10px] px-2"
                            onClick={() => setObservacao((prev) => prev ? `${prev}; ${t}` : t)}
                          >+ {t}</Button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}


              {/* Call result form */}
              <div className="border-t pt-4 space-y-3">
                <p className="font-medium text-sm">Resultado da ligação</p>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
                    onClick={() => {
                      setLigacaoStatus("nao_atendeu");
                      const d = new Date(Date.now() + 60 * 60 * 1000);
                      const pad = (n: number) => String(n).padStart(2, "0");
                      setProximaTentativa(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
                    }}
                    className="text-xs"
                  >
                    <PhoneOff className="w-3.5 h-3.5 mr-1" />
                    Não atendeu (+1h)
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
                  <Button
                    variant={ligacaoStatus === "reagendou" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setLigacaoStatus("reagendou")}
                    className="text-xs"
                  >
                    <CalendarClock className="w-3.5 h-3.5 mr-1" />
                    Reagendar
                  </Button>
                </div>

                {(ligacaoStatus === "reagendou" || ligacaoStatus === "nao_atendeu") && (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Próxima tentativa {ligacaoStatus === "reagendou" ? "(obrigatório)" : "(opcional)"}
                    </label>
                    <Input
                      type="datetime-local"
                      value={proximaTentativa}
                      onChange={(e) => setProximaTentativa(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>
                )}

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
                          Candidato que apoia {votaCandidato === "nao" ? (
                            <span className="text-destructive">(obrigatório)</span>
                          ) : "(opcional)"}
                        </label>
                        <Input
                          placeholder="Nome do candidato..."
                          value={candidatoAlt}
                          onChange={(e) => setCandidatoAlt(e.target.value)}
                          className={`h-9 text-sm ${votaCandidato === "nao" && !candidatoAlt.trim() ? "border-destructive" : ""}`}
                        />
                        {votaCandidato === "nao" && !candidatoAlt.trim() && (
                          <p className="text-[11px] text-destructive mt-1">
                            Informe em quem a pessoa disse que vota para salvar.
                          </p>
                        )}
                      </div>
                    )}

                  </div>
                )}

                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Observação (opcional)</label>
                  <Textarea
                    placeholder="Ex: pediu retorno depois das 18h, número errado, mudou-se..."
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    rows={2}
                    className="text-sm resize-none"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={handleSave}
                    disabled={saving || !ligacaoStatus || (ligacaoStatus === "reagendou" && !proximaTentativa)}
                    className="flex-1"
                  >
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
