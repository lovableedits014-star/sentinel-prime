import { useState, useEffect, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Phone,
  User,
  MapPin,
  CheckCircle2,
  XCircle,
  PhoneOff,
  Clock,
  ArrowRight,
  LogIn,
  Users,
  CalendarClock,
  Lock,
  Search,
  RefreshCw,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { toWhatsAppBR, fmtPhoneBR } from "@/lib/phone-utils";
import CandidateAutocomplete from "@/components/telemarketing/CandidateAutocomplete";

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
  tabela:
    | "contratados"
    | "contratado_indicados"
    | "contatos_avulsos"
    | "eleicao_indicados"
    | "eleicao_pessoas";
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

interface FilaDiagnostico {
  filas_autorizadas: number;
  fila_solicitada_valida: boolean;
  disponiveis: number;
  aguardando_retorno: number;
  reservados_ativos: number;
}

const TELE_APP_VERSION = "2026.08.31.2";
const CONTACT_LOCK_SECONDS = 30 * 60;

const mapContato = (r: any): ContatoTele => ({
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
});

// Um contato continua na fila do operador quando:
// - nunca foi trabalhado (sem status ou "pendente"); ou
// - foi marcado como "não atendeu"/"reagendou" e a hora do retorno já chegou.
const isNaFila = (c: { ligacao_status: string | null; proxima_tentativa_em?: string | null }) => {
  const st = c.ligacao_status || "pendente";
  if (st === "pendente") return true;
  if (st === "nao_atendeu" || st === "reagendou") {
    if (!c.proxima_tentativa_em) return true;
    return new Date(c.proxima_tentativa_em).getTime() <= Date.now();
  }
  return false;
};

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
  // Contato aberto fica "travado" pela identidade (id + tabela), nunca pela
  // posição na lista: assim, quando o operador sai da tela para ligar e volta,
  // a atualização da fila não troca o contato em atendimento.
  const [currentKey, setCurrentKey] = useState<{ id: string; tabela: string } | null>(null);
  const pinnedContatoRef = useRef<ContatoTele | null>(null);
  const [clientName, setClientName] = useState("");
  const [campanhaNome, setCampanhaNome] = useState<string | null>(null);
  const [selectedCampanhaId, setSelectedCampanhaId] = useState<string | null>(campanhaIdParam);
  const [pickingCampanha, setPickingCampanha] = useState(false);
  const [filaError, setFilaError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingInactive, setLoadingInactive] = useState(false);
  const [diagnostico, setDiagnostico] = useState<FilaDiagnostico | null>(null);
  const [filtroTipo, setFiltroTipo] = useState<
    "todos" | "lider" | "liderado" | "indicado" | "avulso" | "eleicao_indicado" | "estrutura"
  >("todos");
  const autoLoginAttempted = useRef(false);
  const sessionIdRef = useRef("");

  if (!sessionIdRef.current && typeof window !== "undefined") {
    const storageKey = "sentinelle.telemarketing.session";
    const stored = window.sessionStorage.getItem(storageKey);
    const generated =
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionIdRef.current = stored || generated;
    if (!stored) window.sessionStorage.setItem(storageKey, generated);
  }

  // Form state
  const [ligacaoStatus, setLigacaoStatus] = useState("");
  const [votaCandidato, setVotaCandidato] = useState("");
  const [candidatoAlt, setCandidatoAlt] = useState("");
  const [candFederal, setCandFederal] = useState("");
  const [federalNQ, setFederalNQ] = useState(false);
  const [candSenador, setCandSenador] = useState("");
  const [senadorNQ, setSenadorNQ] = useState(false);
  const [candGovernador, setCandGovernador] = useState("");
  const [governadorNQ, setGovernadorNQ] = useState(false);
  const [cidade, setCidade] = useState("");
  const [bairro, setBairro] = useState("");
  const [observacao, setObservacao] = useState("");
  const [proximaTentativa, setProximaTentativa] = useState("");
  const [saving, setSaving] = useState(false);
  const [scripts, setScripts] = useState<CampanhaScript[]>([]);

  // Busca de contato (retorno de ligação)
  const [buscaTermo, setBuscaTermo] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [buscaResultados, setBuscaResultados] = useState<ContatoTele[]>([]);
  const [buscouVazio, setBuscouVazio] = useState(false);

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
        supabase
          .from("telemarketing_campanhas" as any)
          .select("nome")
          .eq("id", campanhaIdParam)
          .maybeSingle()
          .then(({ data }: any) => {
            if (data?.nome) setCampanhaNome(data.nome);
          });
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
    setFilaError(null);

    // Validate operator credentials via SECURITY DEFINER function (senha não trafega na tabela)
    const { data: opRows, error: opErr } = await supabase.rpc(
      "verify_telemarketing_operador" as any,
      {
        _client_id: clientId!,
        _nome: operadorNome.trim(),
        _senha: operadorSenha.trim(),
      },
    );

    if (opErr) {
      const msg = opErr.message || "";
      if (/bloque/i.test(msg)) {
        toast.error(
          "Conta bloqueada temporariamente por excesso de tentativas. Tente novamente em alguns minutos.",
        );
      } else {
        toast.error("Nome ou senha inválidos");
      }
      setLoading(false);
      return;
    }

    const opData = Array.isArray(opRows) && opRows.length > 0 ? opRows[0] : null;
    if (!opData) {
      toast.error(
        "Nome ou senha inválidos. Após 5 tentativas, a conta é bloqueada por 15 minutos.",
      );
      setLoading(false);
      return;
    }

    // Fetch contacts via secure RPC (operator-authenticated). When opened from
    // the admin "Filas" page, ?campanha=ID restricts the list to that fila.
    let usedCampanhaId = selectedCampanhaId;
    let { data: rpcRows, error: rpcErr } = await supabase.rpc("tele_list_contatos" as any, {
      _client_id: clientId!,
      _nome: operadorNome.trim(),
      _senha: operadorSenha.trim(),
      _campanha_id: usedCampanhaId,
    });
    if (rpcErr) {
      toast.error("Erro ao carregar contatos: " + rpcErr.message);
      setLoading(false);
      return;
    }
    // Link salvo/compartilhado pode apontar para uma fila em que este operador
    // não está marcado. Só faz fallback quando o diagnóstico confirma isso;
    // uma fila válida e temporariamente vazia deve continuar selecionada.
    if (usedCampanhaId && (!rpcRows || (rpcRows as any[]).length === 0)) {
      const diag = await supabase.rpc("tele_diagnostico_fila" as any, {
        _client_id: clientId!,
        _nome: operadorNome.trim(),
        _senha: operadorSenha.trim(),
        _campanha_id: usedCampanhaId,
      });
      const detail = diag.data as FilaDiagnostico | null;
      if (detail && !detail.fila_solicitada_valida) {
        const retry = await supabase.rpc("tele_list_contatos" as any, {
          _client_id: clientId!,
          _nome: operadorNome.trim(),
          _senha: operadorSenha.trim(),
          _campanha_id: null,
        });
        if (!retry.error) {
          rpcRows = retry.data as any;
          usedCampanhaId = null;
          setSelectedCampanhaId(null);
          setCampanhaNome(null);
          window.history.replaceState({}, "", window.location.pathname);
          toast.info("Esta fila não está liberada para você. Carregamos as suas filas.");
        }
      }
    }

    const allContatos: ContatoTele[] = ((rpcRows as any[]) || []).map(mapContato);

    // Filter out contacts that have already been called — they must NOT return to the funnel
    const lista = allContatos.filter(isNaFila);

    setContatos(lista);

    const { data: diagData } = await supabase.rpc("tele_diagnostico_fila" as any, {
      _client_id: clientId!,
      _nome: operadorNome.trim(),
      _senha: operadorSenha.trim(),
      _campanha_id: usedCampanhaId,
    });
    setDiagnostico((diagData as FilaDiagnostico | null) ?? null);

    if (lista.length === 0) {
      toast.info(
        allContatos.length > 0
          ? "Sua fila está sem contatos disponíveis agora (todos já foram trabalhados ou estão aguardando retorno)."
          : "Nenhum contato liberado para você. Peça ao administrador para marcar você nos operadores da fila.",
        { duration: 8000 },
      );
    }

    // Load campaign scripts (best-effort)
    const { data: scriptRows } = await supabase.rpc("tele_list_campanhas_scripts" as any, {
      _client_id: clientId!,
      _nome: operadorNome.trim(),
      _senha: operadorSenha.trim(),
    });
    setScripts(
      ((scriptRows as any[]) || []).map((s) => ({
        id: s.id,
        nome: s.nome,
        script_intro: s.script_intro,
        script_perguntas: Array.isArray(s.script_perguntas) ? s.script_perguntas : [],
        tags_rapidas: Array.isArray(s.tags_rapidas) ? s.tags_rapidas : [],
      })),
    );

    setLoggedIn(true);
    setLoading(false);

    // Se o operador tem múltiplas campanhas atribuídas e nenhuma foi passada por URL,
    // abre a tela de escolha em vez de já saltar para um contato.
    const campanhasComContato = new Set(lista.map((c) => c.campanha_id).filter(Boolean));
    if (!usedCampanhaId && campanhasComContato.size > 1) {
      setPickingCampanha(true);
      return;
    }

    // Picker atômico no servidor: cada operador começa em um contato diferente.
    const { data: pick } = await supabase.rpc("tele_proximo_contato" as any, {
      _client_id: clientId!,
      _nome: operadorNome.trim(),
      _senha: operadorSenha.trim(),
      _campanha_id: usedCampanhaId,
      _ttl_seconds: CONTACT_LOCK_SECONDS,
      _session_id: sessionIdRef.current,
    });
    const res = pick as {
      found: boolean;
      tabela?: string;
      contato_id?: string;
      lista_id?: string;
    } | null;

    // Se o operador tem lista travada, ignoramos escolha de campanha e focamos na lista
    if (res?.lista_id) {
      setPickingCampanha(false);
    }

    if (res?.found) {
      const idx = lista.findIndex((c) => c.id === res.contato_id && c.tabela === res.tabela);
      setCurrentIndex(idx >= 0 ? idx : 0);
      selecionarContato(
        res.contato_id && res.tabela ? { id: res.contato_id, tabela: res.tabela } : null,
      );
    } else {
      setCurrentIndex(0);
      selecionarContato(null);
    }
  };

  const pickCampanha = async (campanhaId: string | null) => {
    const contatoAberto = pinnedContatoRef.current;
    if (contatoAberto && clientId) {
      await supabase.rpc("tele_release_contato" as any, {
        _client_id: clientId,
        _nome: operadorNome.trim(),
        _senha: operadorSenha.trim(),
        _tabela: contatoAberto.tabela,
        _id: contatoAberto.id,
        _session_id: sessionIdRef.current,
      });
    }
    setSelectedCampanhaId(campanhaId);
    setPickingCampanha(false);
    setCurrentIndex(0);
    selecionarContato(null);
    setFiltroTipo("todos");
    resetForm();
    const script = scripts.find((s) => s.id === campanhaId);
    setCampanhaNome(script?.nome || null);
    await reloadContatosWithCampanha(campanhaId);
    // salta para o próximo disponível dentro da campanha escolhida
    if (!clientId) return;
    const { data } = await supabase.rpc("tele_proximo_contato" as any, {
      _client_id: clientId,
      _nome: operadorNome.trim(),
      _senha: operadorSenha.trim(),
      _campanha_id: campanhaId,
      _ttl_seconds: CONTACT_LOCK_SECONDS,
      _session_id: sessionIdRef.current,
    });
    const res = data as { found: boolean; tabela?: string; contato_id?: string } | null;
    if (res?.found) {
      setContatos((prev) => {
        const idx = prev.findIndex((c) => c.id === res.contato_id && c.tabela === res.tabela);
        if (idx >= 0) setCurrentIndex(idx);
        if (res.contato_id && res.tabela)
          selecionarContato({ id: res.contato_id, tabela: res.tabela });
        return prev;
      });
    }
  };

  const reloadContatosWithCampanha = async (campanhaId: string | null) => {
    if (!clientId) return;
    setRefreshing(true);
    setFilaError(null);
    let resolvedCampanhaId = campanhaId;
    let { data: rpcRows, error } = await supabase.rpc("tele_list_contatos" as any, {
      _client_id: clientId,
      _nome: operadorNome.trim(),
      _senha: operadorSenha.trim(),
      _campanha_id: campanhaId,
    });
    if (!error && campanhaId && ((rpcRows as any[]) || []).length === 0) {
      const diag = await supabase.rpc("tele_diagnostico_fila" as any, {
        _client_id: clientId,
        _nome: operadorNome.trim(),
        _senha: operadorSenha.trim(),
        _campanha_id: campanhaId,
      });
      const detail = diag.data as FilaDiagnostico | null;
      if (detail && !detail.fila_solicitada_valida) {
        const fallback = await supabase.rpc("tele_list_contatos" as any, {
          _client_id: clientId,
          _nome: operadorNome.trim(),
          _senha: operadorSenha.trim(),
          _campanha_id: null,
        });
        if (!fallback.error) {
          rpcRows = fallback.data;
          error = null;
          resolvedCampanhaId = null;
          setSelectedCampanhaId(null);
          setCampanhaNome(null);
          window.history.replaceState({}, "", window.location.pathname);
        }
      }
    }
    if (error) {
      setFilaError("Não foi possível atualizar a fila. Seus contatos anteriores foram mantidos.");
      setRefreshing(false);
      return;
    }
    const lista: ContatoTele[] = ((rpcRows as any[]) || []).map(mapContato).filter(isNaFila);
    setContatos(lista);
    const { data: diagData } = await supabase.rpc("tele_diagnostico_fila" as any, {
      _client_id: clientId,
      _nome: operadorNome.trim(),
      _senha: operadorSenha.trim(),
      _campanha_id: resolvedCampanhaId,
    });
    setDiagnostico((diagData as FilaDiagnostico | null) ?? null);
    setRefreshing(false);
  };

  const filteredContatos =
    filtroTipo === "todos" ? contatos : contatos.filter((c) => c.tipo === filtroTipo);

  // A fila pode ser atualizada enquanto o operador alterna entre dispositivos.
  // Nunca deixe um índice antigo esconder os contatos que chegaram da RPC.
  const safeCurrentIndex =
    currentIndex >= 0 && currentIndex < filteredContatos.length ? currentIndex : 0;
  const contatoDaChave = currentKey
    ? filteredContatos.find((c) => c.id === currentKey.id && c.tabela === currentKey.tabela)
    : undefined;
  // Se o contato travado saiu da lista (reagendado por outro dispositivo, fila
  // recarregada etc.), mantemos a última cópia dele em tela para o operador
  // conseguir registrar o que ouviu na ligação.
  // A tela nunca escolhe o primeiro item local por conta propria. Somente o
  // contato devolvido e reservado atomicamente pelo servidor pode virar atual.
  const current = (
    currentKey ? (contatoDaChave ?? pinnedContatoRef.current ?? undefined) : undefined
  ) as ContatoTele | undefined;

  useEffect(() => {
    if (current) pinnedContatoRef.current = current;
  }, [current]);

  const selecionarContato = (row: { id: string; tabela: string } | null) => {
    setCurrentKey(row ? { id: row.id, tabela: row.tabela } : null);
    if (row) pinnedContatoRef.current = null;
  };

  const totalPendentes = filteredContatos.filter(
    (i) => !i.ligacao_status || i.ligacao_status === "pendente",
  ).length;
  const totalRetorno = filteredContatos.filter(
    (i) => i.ligacao_status === "nao_atendeu" || i.ligacao_status === "reagendou",
  ).length;
  const totalLigados = filteredContatos.filter(
    (i) => i.ligacao_status && i.ligacao_status !== "pendente",
  ).length;

  const resetForm = () => {
    setLigacaoStatus("");
    setVotaCandidato("");
    setCandidatoAlt("");
    setCandFederal("");
    setFederalNQ(false);
    setCandSenador("");
    setSenadorNQ(false);
    setCandGovernador("");
    setGovernadorNQ(false);
    setCidade("");
    setBairro("");
    setObservacao("");
    setProximaTentativa("");
  };

  // Recarrega a lista (mantendo o contato atual se ainda existir)
  const reloadContatos = async (preserveId?: { id: string; tabela: string }) => {
    if (!clientId || !operadorNome.trim() || !operadorSenha.trim()) return [] as ContatoTele[];
    setRefreshing(true);
    const { data: rpcRows, error } = await supabase.rpc("tele_list_contatos" as any, {
      _client_id: clientId,
      _nome: operadorNome.trim(),
      _senha: operadorSenha.trim(),
      _campanha_id: selectedCampanhaId,
    });
    if (error) {
      setFilaError("A conexão oscilou. A lista anterior foi mantida; tente novamente.");
      setRefreshing(false);
      return contatos;
    }
    const lista: ContatoTele[] = ((rpcRows as any[]) || []).map(mapContato).filter(isNaFila);
    setFilaError(null);
    setContatos(lista);
    if (preserveId) {
      const idx = lista.findIndex((c) => c.id === preserveId.id && c.tabela === preserveId.tabela);
      if (idx >= 0) setCurrentIndex(idx);
      selecionarContato(preserveId);
    }
    setRefreshing(false);
    return lista;
  };

  // Picker atômico: servidor escolhe + trava o próximo disponível.
  // Garante que dois operadores nunca recebam o mesmo contato.
  const jumpToProximoDisponivel = async (knownContacts?: ContatoTele[]) => {
    if (!clientId) return;
    const { data, error } = await supabase.rpc("tele_proximo_contato" as any, {
      _client_id: clientId,
      _nome: operadorNome.trim(),
      _senha: operadorSenha.trim(),
      _campanha_id: selectedCampanhaId,
      _ttl_seconds: CONTACT_LOCK_SECONDS,
      _session_id: sessionIdRef.current,
    });
    if (error) {
      toast.error("Erro: " + error.message);
      return;
    }
    const res = data as { found: boolean; tabela?: string; contato_id?: string } | null;
    if (!res || !res.found) {
      selecionarContato(null);
      pinnedContatoRef.current = null;
      setCurrentIndex(0);
      toast.info("Fila vazia no momento — aguardando reagendamentos.");
      return;
    }
    let availableContacts = knownContacts ?? contatos;
    let idx = availableContacts.findIndex((c) => c.id === res.contato_id && c.tabela === res.tabela);
    if (idx < 0) {
      availableContacts = await reloadContatos();
      idx = availableContacts.findIndex((c) => c.id === res.contato_id && c.tabela === res.tabela);
    }
    if (idx >= 0) {
      setFiltroTipo("todos");
      setCurrentIndex(idx);
      selecionarContato({ id: res.contato_id!, tabela: res.tabela! });
      resetForm();
    } else {
      selecionarContato(null);
      pinnedContatoRef.current = null;
      setCurrentIndex(0);
      setFilaError("O próximo contato foi reservado, mas não pôde ser carregado. Atualize a fila para tentar novamente.");
    }
  };

  // Reivindica a reserva de 30 min ao abrir o contato. A reserva é global por
  // telefone, inclusive quando a mesma pessoa existe em mais de uma origem.
  useEffect(() => {
    if (current && clientId) {
      setCidade(current.cidade || "");
      setBairro(current.bairro || "");
      // Mantém a observação já registrada visível e permite complementá-la.
      setObservacao(current.observacao_tele || "");
      setProximaTentativa("");
      setLigacaoStatus("");
      setVotaCandidato("");
      setCandidatoAlt("");
      setCandFederal("");
      setFederalNQ(false);
      setCandSenador("");
      setSenadorNQ(false);
      setCandGovernador("");
      setGovernadorNQ(false);
      supabase
        .rpc("tele_claim_contato" as any, {
          _client_id: clientId,
          _nome: operadorNome.trim(),
          _senha: operadorSenha.trim(),
          _tabela: current.tabela,
          _id: current.id,
          _ttl_seconds: CONTACT_LOCK_SECONDS,
          _session_id: sessionIdRef.current,
        })
        .then(({ data }: any) => {
          if (data?.claimed === false) {
            const sameOperator =
              data.operador_nome?.trim().toLocaleLowerCase("pt-BR") ===
              operadorNome.trim().toLocaleLowerCase("pt-BR");
            toast.warning(
              sameOperator
                ? "Este contato está aberto em outro aparelho. Buscando o próximo…"
                : `Este contato está em atendimento por ${data.operador_nome}. Buscando o próximo…`,
            );
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
        _ttl_seconds: CONTACT_LOCK_SECONDS,
        _session_id: sessionIdRef.current,
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
        {
          event: "*",
          schema: "public",
          table: "telemarketing_call_assignments",
          filter: `client_id=eq.${clientId}`,
        },
        () => {
          void reloadContatos();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn, clientId, selectedCampanhaId]);

  // Celulares frequentemente suspendem a aba e perdem eventos de rede/realtime.
  // Ao voltar para a tela ou recuperar a conexão, sincroniza sem apagar a lista atual.
  useEffect(() => {
    if (!loggedIn) return;
    const refreshWhenActive = async () => {
      if (document.visibilityState !== "visible") return;
      // Renova a trava do contato em atendimento antes de sincronizar a fila:
      // o operador saiu para ligar e o contato precisa continuar dele.
      const aberto = pinnedContatoRef.current;
      if (aberto && clientId) {
        const { data: heartbeat } = await supabase.rpc("tele_heartbeat_contato" as any, {
          _client_id: clientId,
          _nome: operadorNome.trim(),
          _senha: operadorSenha.trim(),
          _tabela: aberto.tabela,
          _id: aberto.id,
          _ttl_seconds: CONTACT_LOCK_SECONDS,
          _session_id: sessionIdRef.current,
        });
        const heartbeatResult = heartbeat as { renewed?: boolean } | null;
        if (!heartbeatResult?.renewed) {
          const { data: claim } = await supabase.rpc("tele_claim_contato" as any, {
            _client_id: clientId,
            _nome: operadorNome.trim(),
            _senha: operadorSenha.trim(),
            _tabela: aberto.tabela,
            _id: aberto.id,
            _ttl_seconds: CONTACT_LOCK_SECONDS,
            _session_id: sessionIdRef.current,
          });
          const claimResult = claim as { claimed?: boolean; operador_nome?: string } | null;
          if (!claimResult?.claimed) {
            toast.error(
              `Este contato passou para ${claimResult?.operador_nome || "outro operador"}. A pesquisa foi preservada nesta tela para conferência.`,
            );
            return;
          }
        }
      }
      await reloadContatos(aberto ? { id: aberto.id, tabela: aberto.tabela } : undefined);
    };
    window.addEventListener("online", refreshWhenActive);
    document.addEventListener("visibilitychange", refreshWhenActive);
    return () => {
      window.removeEventListener("online", refreshWhenActive);
      document.removeEventListener("visibilitychange", refreshWhenActive);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn, selectedCampanhaId]);

  const forceAppUpdate = async () => {
    try {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }
      if (typeof caches !== "undefined") {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
    } finally {
      window.location.reload();
    }
  };

  // "Não quis opinar" no estadual encerra o fluxo: não pergunta os demais cargos.
  const perguntarDemaisCargos =
    ligacaoStatus === "atendeu" &&
    (votaCandidato === "sim" || votaCandidato === "nao" || votaCandidato === "indeciso");

  const handleSave = async () => {
    if (!ligacaoStatus) {
      toast.error("Selecione o resultado da ligação");
      return;
    }
    if (!current) return;
    if (ligacaoStatus === "atendeu") {
      if (!votaCandidato) {
        toast.error("Informe o voto para deputado estadual");
        return;
      }
      if (votaCandidato === "nao" && !candidatoAlt.trim()) {
        toast.error("Informe em quem a pessoa vota para deputado estadual");
        return;
      }
      if (perguntarDemaisCargos) {
        if (!candFederal.trim() && !federalNQ) {
          toast.error('Informe o deputado federal ou marque "não quis responder"');
          return;
        }
        if (!candSenador.trim() && !senadorNQ) {
          toast.error('Informe o senador ou marque "não quis responder"');
          return;
        }
        if (!candGovernador.trim() && !governadorNQ) {
          toast.error('Informe o governador ou marque "não quis responder"');
          return;
        }
      }
    }

    setSaving(true);
    const atendeu = ligacaoStatus === "atendeu";
    const proximaTs = proximaTentativa ? new Date(proximaTentativa).toISOString() : null;
    const { data: rpcResult, error } = await supabase.rpc("tele_registrar_ligacao_sessao" as any, {
      _client_id: clientId!,
      _nome: operadorNome.trim(),
      _senha: operadorSenha.trim(),
      _tabela: current.tabela,
      _id: current.id,
      _ligacao_status: ligacaoStatus,
      _cidade: cidade.trim() || "",
      _bairro: bairro.trim() || "",
      _vota_candidato: atendeu ? votaCandidato || null : null,
      _candidato_alternativo: atendeu ? candidatoAlt.trim() || null : null,
      _observacao: observacao.trim() || null,
      _proxima_tentativa_em: proximaTs,
      _candidato_federal: atendeu && perguntarDemaisCargos ? candFederal.trim() || null : null,
      _federal_status:
        atendeu && perguntarDemaisCargos && !candFederal.trim() && federalNQ
          ? "nao_quis_responder"
          : null,
      _candidato_senador: atendeu && perguntarDemaisCargos ? candSenador.trim() || null : null,
      _senador_status:
        atendeu && perguntarDemaisCargos && !candSenador.trim() && senadorNQ
          ? "nao_quis_responder"
          : null,
      _candidato_governador:
        atendeu && perguntarDemaisCargos ? candGovernador.trim() || null : null,
      _governador_status:
        atendeu && perguntarDemaisCargos && !candGovernador.trim() && governadorNQ
          ? "nao_quis_responder"
          : null,
      _session_id: sessionIdRef.current,
    });

    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      setSaving(false);
      return;
    }
    const result = rpcResult as {
      updated?: number;
      conflict?: boolean;
      lock_owner?: string;
    } | null;
    if (result?.conflict) {
      toast.error(
        `Não foi possível salvar: o contato está reservado para ${result.lock_owner || "outro operador"}. Os dados digitados foram mantidos para conferência.`,
      );
      setSaving(false);
      return;
    }
    if (!result || (result.updated ?? 0) === 0) {
      toast.error("Falha ao salvar no banco. Tente recarregar a página.");
      setSaving(false);
      return;
    }

    const completedKey = { id: current.id, tabela: current.tabela };
    setContatos((prev) => prev.filter((i) => !(i.id === completedKey.id && i.tabela === completedKey.tabela)));
    selecionarContato(null);
    pinnedContatoRef.current = null;
    setCurrentIndex(0);
    toast.success("Ligação registrada!");
    resetForm();
    const refreshedContacts = await reloadContatos();
    await jumpToProximoDisponivel(
      refreshedContacts.filter((i) => !(i.id === completedKey.id && i.tabela === completedKey.tabela)),
    );
    setSaving(false);
  };

  const skipToNext = async () => {
    if (!current || !clientId) return;
    const skippedKey = { id: current.id, tabela: current.tabela };
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("tele_skip_contato" as any, {
        _client_id: clientId,
        _nome: operadorNome.trim(),
        _senha: operadorSenha.trim(),
        _tabela: skippedKey.tabela,
        _id: skippedKey.id,
        _session_id: sessionIdRef.current,
        _motivo: "pulado_pelo_operador",
        _cooldown_seconds: 900,
      });
      if (error) throw new Error(error.message);
      const result = data as { skipped?: boolean; released?: boolean } | null;
      if (!result?.skipped) throw new Error("O contato atual não foi liberado.");

      // Retira imediatamente o contato pulado da tela. O cooldown no servidor
      // impede que esta mesma sessão o receba novamente durante 15 minutos.
      const remaining = contatos.filter(
        (row) => !(row.id === skippedKey.id && row.tabela === skippedKey.tabela),
      );
      setContatos(remaining);
      selecionarContato(null);
      pinnedContatoRef.current = null;
      setCurrentIndex(0);
      resetForm();
      await jumpToProximoDisponivel(remaining);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível pular o contato.");
    } finally {
      setSaving(false);
    }
  };

  const trabalharProximoInativo = async () => {
    if (!clientId) return;
    setLoadingInactive(true);
    const contatoAberto = pinnedContatoRef.current;
    const { data, error } = await supabase.rpc("tele_proximo_inativo" as any, {
      _client_id: clientId,
      _nome: operadorNome.trim(),
      _senha: operadorSenha.trim(),
      _campanha_id: selectedCampanhaId,
      _ttl_seconds: CONTACT_LOCK_SECONDS,
      _session_id: sessionIdRef.current,
    });
    if (error) {
      toast.error("Erro ao buscar contato inativo: " + error.message);
      setLoadingInactive(false);
      return;
    }
    if (contatoAberto && !(contatoAberto.id === result.contato_id && contatoAberto.tabela === result.tabela)) {
      await supabase.rpc("tele_release_contato" as any, {
        _client_id: clientId, _nome: operadorNome.trim(), _senha: operadorSenha.trim(),
        _tabela: contatoAberto.tabela, _id: contatoAberto.id, _session_id: sessionIdRef.current,
      });
    }
    const result = data as { found?: boolean; tabela?: string; contato_id?: string } | null;
    if (!result?.found || !result.tabela || !result.contato_id) {
      toast.info("Não há contatos inativos disponíveis nesta fila.");
      setLoadingInactive(false);
      return;
    }
    await reloadContatosWithCampanha(selectedCampanhaId);
    selecionarContato({ id: result.contato_id, tabela: result.tabela });
    setCurrentIndex(0);
    resetForm();
    setLoadingInactive(false);
    toast.success("Contato reativado para uma nova tentativa.");
  };

  const handleBuscar = async () => {
    const termo = buscaTermo.trim();
    if (termo.length < 3) {
      toast.error("Digite ao menos 3 caracteres (nome ou telefone)");
      return;
    }
    if (!clientId) return;
    setBuscando(true);
    setBuscouVazio(false);
    const { data, error } = await supabase.rpc("tele_buscar_retorno" as any, {
      _client_id: clientId,
      _nome: operadorNome.trim(),
      _senha: operadorSenha.trim(),
      _termo: termo,
      // Um retorno pode estar em outra fila liberada para este operador.
      _campanha_id: null,
      _limite: 30,
    });
    setBuscando(false);
    if (error) {
      toast.error("Erro na busca: " + error.message);
      return;
    }
    const rows = ((data as any[]) || []).map(mapContato);
    setBuscaResultados(rows);
    setBuscouVazio(rows.length === 0);
  };

  const abrirContatoBuscado = (row: ContatoTele) => {
    if (row.locked_by && row.locked_by.trim() !== operadorNome.trim()) {
      toast.warning(
        `${row.nome} está em atendimento ativo por ${row.locked_by}. Tente novamente quando o atendimento terminar.`,
      );
      return;
    }
    setFiltroTipo("todos");
    setContatos((prev) => {
      const rest = prev.filter((c) => !(c.id === row.id && c.tabela === row.tabela));
      return [row, ...rest];
    });
    setCurrentIndex(0);
    selecionarContato({ id: row.id, tabela: row.tabela });
    resetForm();
    setBuscaResultados([]);
    setBuscaTermo("");
    setBuscouVazio(false);
    toast.success(`Contato aberto: ${row.nome}`);
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
            {clientName && <p className="text-sm text-muted-foreground">{clientName}</p>}
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
            <div className="flex items-center justify-between pt-2 text-[10px] text-muted-foreground">
              <span>Versão {TELE_APP_VERSION}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[10px]"
                onClick={forceAppUpdate}
              >
                <RefreshCw className="mr-1 h-3 w-3" /> Atualizar sistema
              </Button>
            </div>
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
      .map((s) => ({ id: s.id, nome: s.nome, count: contagens.get(s.id) || 0 }))
      .filter((o) => o.count > 0)
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
              Olá, <strong>{operadorNome}</strong>. Você tem contatos em mais de uma campanha —
              selecione por qual quer começar. Você pode trocar a qualquer momento.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {opcoes.map((o) => (
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
    <div className="min-h-screen w-full max-w-2xl min-w-0 overflow-x-hidden bg-muted/30 p-4 sm:p-6 mx-auto space-y-4">
      {/* Header */}
      <div className="flex min-w-0 items-center justify-between flex-wrap gap-2">
        <div className="min-w-0 max-w-full">
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Phone className="w-5 h-5 text-primary" />
            Telemarketing e Verificação
          </h1>
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight max-w-sm mb-2">
            Central de atendimento para validar indicações e intenção de voto. Utilize o
            click-to-call para ligar diretamente do seu celular e registre o resultado para
            alimentar sua inteligência eleitoral em tempo real.
          </p>
          <p className="text-xs text-muted-foreground break-words">
            Operador: <span className="font-medium text-foreground">{operadorNome}</span>
            {campanhaNome && (
              <>
                {" "}
                · Fila: <span className="font-medium text-foreground">{campanhaNome}</span>
              </>
            )}
            {current?.lista_id && (
              <Badge
                variant="outline"
                className="ml-2 bg-amber-500/10 text-amber-700 border-amber-500/20 animate-pulse"
              >
                <Lock className="w-3 h-3 mr-1" />
                Lista Designada
              </Badge>
            )}
          </p>
        </div>
        <div className="flex max-w-full flex-wrap gap-2 items-center">
          {!current?.lista_id && !campanhaIdParam && scripts.length > 1 && (
            <Button size="sm" variant="outline" onClick={() => setPickingCampanha(true)}>
              Trocar campanha
            </Button>
          )}
          <Button size="sm" variant="default" onClick={() => void jumpToProximoDisponivel()}>
            <ArrowRight className="w-3.5 h-3.5 mr-1" />
            Próximo disponível
          </Button>
          <Button size="sm" variant="outline" onClick={() => void trabalharProximoInativo()} disabled={loadingInactive}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loadingInactive ? "animate-spin" : ""}`} />
            Trabalhar inativo
          </Button>
          <Badge variant="secondary" className="text-xs">
            <Clock className="w-3 h-3 mr-1" />
            {totalPendentes} pendentes
          </Badge>
          {totalRetorno > 0 && (
            <Badge variant="outline" className="text-xs">
              <Clock className="w-3 h-3 mr-1" />
              {totalRetorno} retornos
            </Badge>
          )}

          <Badge variant="default" className="text-xs">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            {totalLigados} ligados
          </Badge>
        </div>
      </div>

      {filaError && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <span className="flex items-center gap-2">
            <WifiOff className="h-4 w-4 shrink-0" />
            {filaError}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void reloadContatos()}
            disabled={refreshing}
          >
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Tentar
            novamente
          </Button>
        </div>
      )}

      {/* Busca de contato (retorno de ligação) */}
      <Card>
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Buscar por nome ou telefone (retornou a ligação?)"
              value={buscaTermo}
              onChange={(e) => setBuscaTermo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleBuscar()}
              className="h-9 text-sm"
            />
            <Button size="sm" className="h-9" onClick={handleBuscar} disabled={buscando}>
              <Search className="w-3.5 h-3.5 mr-1" />
              {buscando ? "..." : "Buscar"}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground leading-tight">
            Use quando a pessoa retornar a ligação: localize o contato (mesmo já trabalhado ou
            agendado) e registre o resultado da pesquisa.
          </p>
          {buscaResultados.length > 0 && (
            <div className="space-y-1 pt-1">
              {buscaResultados.map((r) => (
                <button
                  key={`${r.tabela}-${r.id}`}
                  type="button"
                  onClick={() => abrirContatoBuscado(r)}
                  className="w-full text-left border rounded-md px-2 py-1.5 hover:bg-muted/60 transition"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">{r.nome}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {tipoLabel(r.tipo)}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {fmtPhoneBR(toWhatsAppBR(r.telefone) || r.telefone)}
                    {r.cidade ? ` · ${r.cidade}` : ""}
                    {r.ligacao_status && r.ligacao_status !== "pendente"
                      ? ` · ${r.ligacao_status}`
                      : " · pendente"}
                  </div>
                </button>
              ))}
            </div>
          )}
          {buscouVazio && (
            <p className="text-[11px] text-muted-foreground">
              Nenhum contato encontrado nas filas liberadas para este operador.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Type filter */}

      {!current?.lista_id && (
        <div className="flex gap-2 flex-wrap">
          {(
            [
              "todos",
              "lider",
              "liderado",
              "indicado",
              "avulso",
              "eleicao_indicado",
              "estrutura",
            ] as const
          ).map((f) => (
            <Button
              key={f}
              variant={filtroTipo === f ? "default" : "outline"}
              size="sm"
              className="text-xs"
              onClick={() => {
                setFiltroTipo(f);
                setCurrentIndex(0);
                selecionarContato(null);
                resetForm();
              }}
            >
              {f === "todos" ? (
                <>
                  <Users className="w-3.5 h-3.5 mr-1" />
                  Todos ({contatos.length})
                </>
              ) : (
                <>
                  {tipoLabel(f)} ({contatos.filter((c) => c.tipo === f).length})
                </>
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
              <div className="flex min-w-0 items-center justify-between gap-2">
                <CardTitle className="text-base flex min-w-0 items-center gap-2 break-words">
                  <User className="w-4 h-4 text-primary" />
                  <span className="min-w-0 break-words">{current.nome}</span>
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
                          : current.ligacao_status === "recusou" ||
                              current.ligacao_status === "invalido"
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
                            : current.ligacao_status === "invalido"
                              ? "Número inexistente"
                            : current.ligacao_status}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Phone + WhatsApp */}
              {(() => {
                const wa = toWhatsAppBR(current.telefone);
                const telLink = wa ? `+${wa}` : current.telefone || "";
                const template = current.campanha_id
                  ? scripts.find((s) => s.id === current.campanha_id)?.whatsapp_template
                  : null;
                const msg = template
                  ? String(template)
                      .replace(/\{\{\s*nome\s*\}\}/gi, current.nome || "")
                      .replace(/\{\{\s*operador\s*\}\}/gi, operadorNome.trim())
                  : "";
                const waUrl = `https://wa.me/${wa}${msg ? `?text=${encodeURIComponent(msg)}` : ""}`;
                return (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg">
                      <Phone className="w-5 h-5 text-primary" />
                      <span className="text-lg font-bold text-primary">
                        {fmtPhoneBR(wa || current.telefone)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        asChild={!!wa}
                        disabled={!wa}
                        title={wa ? undefined : "Telefone inválido — corrija o cadastro"}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white h-11"
                      >
                        {wa ? (
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Abrir conversa no WhatsApp"
                          >
                            <svg viewBox="0 0 24 24" className="w-4 h-4 mr-1 fill-current">
                              <path d="M20.5 3.5A11 11 0 0 0 3.6 17.3L2 22l4.8-1.6a11 11 0 0 0 16.7-9.3 11 11 0 0 0-3-7.6ZM12 20.1a9 9 0 0 1-4.6-1.3l-.3-.2-2.8.9.9-2.8-.2-.3A9.1 9.1 0 1 1 12 20Zm5-6.7c-.3-.1-1.7-.8-2-1-.3-.1-.5-.1-.7.2l-1 1.2c-.2.2-.4.3-.7.1a7.4 7.4 0 0 1-3.6-3.2c-.3-.5.3-.4.8-1.4.1-.2 0-.4-.1-.5l-1-2.4c-.2-.5-.5-.4-.7-.4H7c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.2.2 2 3.1 5 4.3.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 2-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3Z" />
                            </svg>
                            WhatsApp
                          </a>
                        ) : (
                          <span className="flex items-center">WhatsApp</span>
                        )}
                      </Button>

                      <Button asChild variant="outline" className="h-11">
                        <a
                          href={`tel:${telLink}`}
                          aria-label="Ligar por telefone"
                          onClick={() => {
                            if (!clientId) return;
                            void supabase.rpc("tele_heartbeat_contato" as any, {
                              _client_id: clientId,
                              _nome: operadorNome.trim(),
                              _senha: operadorSenha.trim(),
                              _tabela: current.tabela,
                              _id: current.id,
                              _ttl_seconds: CONTACT_LOCK_SECONDS,
                              _session_id: sessionIdRef.current,
                            });
                          }}
                        >
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
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {current.indicador_tipo}
                    </Badge>
                  )}
                </div>
              )}

              {current.tipo === "estrutura" && current.indicador_tipo && (
                <div className="text-xs bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 p-2 rounded flex items-center gap-2">
                  <Users className="w-3.5 h-3.5" />
                  Membro da estrutura:{" "}
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {current.indicador_tipo}
                  </Badge>
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
                  Tentativas anteriores:{" "}
                  <span className="font-medium">{current.tentativas_count}</span>
                  {current.proxima_tentativa_em && (
                    <>
                      {" "}
                      · Reagendado para{" "}
                      {new Date(current.proxima_tentativa_em).toLocaleString("pt-BR")}
                    </>
                  )}
                </div>
              )}
              {current.observacao_tele && (
                <div className="text-xs bg-muted/50 p-2 rounded border">
                  <span className="font-medium">Observação anterior:</span>{" "}
                  {current.observacao_tele}
                </div>
              )}

              {/* Script da campanha */}
              {(() => {
                const script = current.campanha_id
                  ? scripts.find((s) => s.id === current.campanha_id)
                  : null;
                if (
                  !script ||
                  (!script.script_intro &&
                    !(script.script_perguntas || []).length &&
                    !(script.tags_rapidas || []).length)
                )
                  return null;
                return (
                  <div className="bg-primary/5 border border-primary/20 rounded p-3 space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                      Script — {script.nome}
                    </p>
                    {script.script_intro && (
                      <p className="text-xs whitespace-pre-wrap">{script.script_intro}</p>
                    )}
                    {(script.script_perguntas || []).length > 0 && (
                      <ol className="text-xs list-decimal pl-4 space-y-0.5">
                        {(script.script_perguntas || []).map((q, i) => (
                          <li key={i}>{q}</li>
                        ))}
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
                            onClick={() => setObservacao((prev) => (prev ? `${prev}; ${t}` : t))}
                          >
                            + {t}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Call result form */}
              <div className="border-t pt-4 space-y-3">
                <p className="font-medium text-sm">Resultado da ligação</p>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
                      const d = new Date(Date.now() + 6 * 60 * 60 * 1000);
                      const pad = (n: number) => String(n).padStart(2, "0");
                      setProximaTentativa(
                        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
                      );
                    }}
                    className="text-xs"
                  >
                    <PhoneOff className="w-3.5 h-3.5 mr-1" />
                    Não atendeu (+6h)
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
                  <Button
                    variant={ligacaoStatus === "invalido" ? "destructive" : "outline"}
                    size="sm"
                    onClick={() => {
                      setLigacaoStatus("invalido");
                      setProximaTentativa("");
                    }}
                    className="text-xs"
                  >
                    <XCircle className="w-3.5 h-3.5 mr-1" />
                    Número inexistente
                  </Button>
                </div>

                {(ligacaoStatus === "reagendou" || ligacaoStatus === "nao_atendeu") && (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Próxima tentativa{" "}
                      {ligacaoStatus === "reagendou" ? "(obrigatório)" : "(opcional)"}
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
                      <label className="text-xs font-medium mb-1.5 block">
                        1. Deputado Estadual (nosso candidato){" "}
                        <span className="text-destructive">*</span>
                      </label>
                      <Select value={votaCandidato} onValueChange={setVotaCandidato}>
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sim">✅ Vota (confirmado)</SelectItem>
                          <SelectItem value="nao">❌ Não vota</SelectItem>
                          <SelectItem value="indeciso">🤔 Indeciso</SelectItem>
                          <SelectItem value="nao_quis_opinar">
                            🚫 Não quis opinar (encerra)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {(votaCandidato === "nao" || votaCandidato === "indeciso") && (
                      <div>
                        <label className="text-xs font-medium mb-1.5 block">
                          Qual estadual vota?{" "}
                          {votaCandidato === "nao" ? (
                            <span className="text-destructive">(obrigatório)</span>
                          ) : (
                            "(opcional)"
                          )}
                        </label>
                        <CandidateAutocomplete
                          clientId={clientId!}
                          operadorNome={operadorNome}
                          operadorSenha={operadorSenha}
                          cargo="estadual"
                          placeholder="Nome do deputado estadual..."
                          value={candidatoAlt}
                          onChange={setCandidatoAlt}
                          className={`h-9 text-sm ${votaCandidato === "nao" && !candidatoAlt.trim() ? "border-destructive" : ""}`}
                        />
                        {votaCandidato === "nao" && !candidatoAlt.trim() && (
                          <p className="text-[11px] text-destructive mt-1">
                            Informe o nome. Se a pessoa não quiser dizer, use "Não quis opinar".
                          </p>
                        )}
                      </div>
                    )}

                    {votaCandidato === "nao_quis_opinar" && (
                      <p className="text-[11px] text-muted-foreground">
                        Atendimento encerrado: os demais cargos não são perguntados.
                      </p>
                    )}

                    {perguntarDemaisCargos && (
                      <div className="space-y-3 border-t pt-3">
                        {(
                          [
                            {
                              key: "federal",
                              label: "2. Deputado Federal",
                              value: candFederal,
                              setValue: setCandFederal,
                              nq: federalNQ,
                              setNq: setFederalNQ,
                            },
                            {
                              key: "senador",
                              label: "3. Senador",
                              value: candSenador,
                              setValue: setCandSenador,
                              nq: senadorNQ,
                              setNq: setSenadorNQ,
                            },
                            {
                              key: "governador",
                              label: "4. Governador",
                              value: candGovernador,
                              setValue: setCandGovernador,
                              nq: governadorNQ,
                              setNq: setGovernadorNQ,
                            },
                          ] as const
                        ).map((c) => {
                          const pendente = !c.value.trim() && !c.nq;
                          return (
                            <div key={c.key}>
                              <label className="text-xs font-medium mb-1.5 block">
                                {c.label} <span className="text-destructive">*</span>
                              </label>
                              <CandidateAutocomplete
                                clientId={clientId!}
                                operadorNome={operadorNome}
                                operadorSenha={operadorSenha}
                                cargo={c.key}
                                placeholder="Nome do candidato..."
                                value={c.value}
                                onChange={(newValue) => {
                                  c.setValue(newValue);
                                  if (newValue.trim()) c.setNq(false);
                                }}
                                disabled={c.nq}
                                className={`h-9 text-sm ${pendente ? "border-destructive" : ""}`}
                              />
                              <Button
                                type="button"
                                size="sm"
                                variant={c.nq ? "secondary" : "ghost"}
                                className="h-7 text-[11px] mt-1"
                                onClick={() => {
                                  c.setNq(!c.nq);
                                  if (!c.nq) c.setValue("");
                                }}
                              >
                                {c.nq ? "✔ Não quis responder" : "Não quis responder"}
                              </Button>
                            </div>
                          );
                        })}
                        <p className="text-[11px] text-muted-foreground">
                          Preencha o nome ou marque "Não quis responder" nos três cargos para
                          salvar.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Observação (opcional)
                  </label>
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
                    disabled={
                      saving ||
                      !ligacaoStatus ||
                      (ligacaoStatus === "reagendou" && !proximaTentativa) ||
                      (ligacaoStatus === "atendeu" && !votaCandidato) ||
                      (ligacaoStatus === "atendeu" &&
                        votaCandidato === "nao" &&
                        !candidatoAlt.trim()) ||
                      (perguntarDemaisCargos &&
                        ((!candFederal.trim() && !federalNQ) ||
                          (!candSenador.trim() && !senadorNQ) ||
                          (!candGovernador.trim() && !governadorNQ)))
                    }
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
            Contato {safeCurrentIndex + 1} de {filteredContatos.length}
          </div>
        </>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Phone className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">
              {diagnostico?.filas_autorizadas === 0
                ? "Você ainda não está marcado em uma fila"
                : diagnostico && diagnostico.aguardando_retorno > 0 && diagnostico.disponiveis === 0
                  ? "Contatos aguardando horário de retorno"
                  : "Nenhum contato disponível agora"}
            </p>
            <p className="text-xs mt-1">
              {diagnostico?.filas_autorizadas === 0
                ? "Peça ao administrador para liberar uma fila para seu operador."
                : diagnostico && diagnostico.aguardando_retorno > 0
                  ? `${diagnostico.aguardando_retorno} contato(s) voltarão à fila no horário agendado.`
                  : "A fila pode estar concluída ou os contatos podem estar em atendimento."}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => void reloadContatos()}
              disabled={refreshing}
            >
              <RefreshCw className={`mr-1 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />{" "}
              Atualizar fila
            </Button>
          </CardContent>
        </Card>
      )}
      <div className="flex items-center justify-center gap-2 pb-3 text-[10px] text-muted-foreground">
        <span>Versão {TELE_APP_VERSION}</span>
        <span>·</span>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0 text-[10px]"
          onClick={forceAppUpdate}
        >
          Atualizar sistema neste aparelho
        </Button>
      </div>
    </div>
  );
}
