import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { formatCPF } from "@/lib/cpf";

const formatCEP = (v: string) => {
  const d = onlyDigits(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};

import { useCurrentClientId } from "@/hooks/ic/useCurrentClientId";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Crown, Users, UserCheck, Plus, Trash2, ChevronRight, MapPin, Phone, Search, Edit2, KeyRound, CheckCircle2, ChevronDown, MoreHorizontal, Send, Copy, Loader2, MessageCircle, DollarSign, AlertCircle, List, Network, ArrowUpDown, X, Star, BellRing, RefreshCw, Handshake, Heart } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuPortal } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import PrevisaoCustos from "@/components/eleicao/PrevisaoCustos";
import PendentesValorPanel from "@/components/eleicao/PendentesValorPanel";
import ReunioesPanel from "@/components/eleicao/ReunioesPanel";
import EleicaoContractTemplates from "@/components/eleicao/EleicaoContractTemplates";
import EnviarFluxoMenu from "@/components/eleicao/EnviarFluxoMenu";
import PosCadastroEnvioDialog from "@/components/eleicao/PosCadastroEnvioDialog";
import EleicaoConfigPanel from "@/components/eleicao/EleicaoConfigPanel";

import { gerarContratoIndividual, gerarLoteZip, downloadBlob } from "@/lib/eleicao-contrato-docx";
import { FileDown, Package, FileText, Printer, CalendarDays } from "lucide-react";
import { exportEleicaoPdf, exportEleicaoCsv, exportEleicaoPdfRaiz, exportEleicaoCsvRaiz, type ExportPessoa } from "@/lib/eleicao-export-pdf";
import ExportEleicaoDialog, { type ExportConfig } from "@/components/eleicao/ExportEleicaoDialog";
import { exportarCsvConfiguravel, exportarPdfConfiguravel, exportarZipPorCoordenador } from "@/lib/eleicao-export-configuravel";
import { NotifyProgressDialog } from "@/components/eleicao/NotifyProgressDialog";
import IndicacoesPanel from "@/components/eleicao/IndicacoesPanel";
import { useRegioesEleicao } from "@/hooks/useRegioesEleicao";
import { useCandidatosParceiros } from "@/hooks/useCandidatosParceiros";
import DobradinhasManagerPanel from "@/components/eleicao/DobradinhasManagerPanel";
import DobradinhaPropagarDialog from "@/components/eleicao/DobradinhaPropagarDialog";
import DistribuicaoContatosTab from "@/components/eleicao/DistribuicaoContatosTab";
import { FunnelManagement } from "@/components/eleicao/FunnelManagement";
import { getEleicaoSituacao, isEleicaoContratado, isEleicaoSemContrato, isEleicaoVoluntario } from "@/lib/eleicao-situacao";
import ContratadosCumprimentoReport from "@/components/eleicao/ContratadosCumprimentoReport";

// ─── Helpers visuais ────────────────────────────────────────────
const initials = (nome: string) =>
  nome.trim().split(/\s+/).slice(0, 2).map(n => n[0]?.toUpperCase() || "").join("") || "?";

const fmtBRL = (n?: number | null) =>
  (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const onlyDigits = (s: string) => s.replace(/\D/g, "");
const parseValorContratacao = (s: string) => {
  const valor = s.trim();
  if (valor.includes(",")) return Number(valor.replace(/\./g, "").replace(",", ".")) || 0;
  return Number(valor) || 0;
};

const waLink = (telefone: string) => {
  const d = onlyDigits(telefone);
  if (!d) return "";
  const full = d.startsWith("55") ? d : `55${d}`;
  return `https://wa.me/${full}`;
};

const fmtPhone = (s: string) => {
  const d = onlyDigits(s);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s;
};

async function sendCoordBoasVindas(pessoaId: string) {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) { toast.error("Sessão expirada"); return; }
    const resp = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/eleicao-notify-novo-lider`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || (import.meta.env as any).VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ pessoa_id: pessoaId, target: "coordenador_boas_vindas" }),
      },
    );
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data?.error) {
      toast.warning("Não foi possível enviar a mensagem de boas-vindas", { description: data?.error });
      return;
    }
    const r = data?.result;
    if (r?.sent) toast.success("Mensagem de boas-vindas enviada ao coordenador no WhatsApp");
    else if (r?.reason) toast.info(`Boas-vindas não enviada: ${r.reason}`);
    else if (r?.error) toast.warning(`Falha na boas-vindas: ${r.error}`);
    else toast.info("Solicitação processada");
  } catch (e: any) {
    toast.warning("Falha ao enviar boas-vindas ao coordenador", { description: e?.message });
  }
}

async function sendCaboBoasVindas(pessoaId: string) {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) { toast.error("Sessão expirada"); return; }
    const resp = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/eleicao-notify-novo-lider`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || (import.meta.env as any).VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ pessoa_id: pessoaId, target: "cabo_boas_vindas" }),
      },
    );
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data?.error) {
      toast.warning("Não foi possível enviar a mensagem ao cabo eleitoral", { description: data?.error });
      return;
    }
    const r = data?.result;
    if (r?.sent) toast.success("Mensagem de boas-vindas enviada ao cabo eleitoral no WhatsApp");
    else if (r?.reason) toast.info(`Boas-vindas não enviada: ${r.reason}`);
    else if (r?.error) toast.warning(`Falha na boas-vindas: ${r.error}`);
    else toast.info("Solicitação processada");
  } catch (e: any) {
    toast.warning("Falha ao enviar boas-vindas ao cabo eleitoral", { description: e?.message });
  }
}

async function gerarContratosLote(
  pessoas: Pessoa[],
  clientId: string,
  zipName: string,
) {
  const elegiveis = pessoas.filter(p => p.valor_contratacao && p.valor_contratacao > 0);
  const pendentes = pessoas.length - elegiveis.length;
  if (elegiveis.length === 0) {
    toast.error("Nenhuma pessoa do time com valor definido. Defina os valores em 'Pendentes de valor'.");
    return;
  }
  const t = toast.loading(`Gerando ${elegiveis.length} contrato(s)…`);
  try {
    const { blob, pulados } = await gerarLoteZip(elegiveis as any, clientId);
    downloadBlob(blob, `${zipName}.zip`);
    toast.dismiss(t);
    let msg = `${elegiveis.length} contrato(s) gerado(s)`;
    if (pendentes > 0) msg += ` · ${pendentes} sem valor`;
    if (pulados.length > 0) msg += ` · ${pulados.length} sem modelo`;
    toast.success(msg);
  } catch (e: any) {
    toast.dismiss(t);
    toast.error(e.message);
  }
}

type Tipo = "coordenador" | "lider" | "cabo";
type Escopo = "campo_grande" | "interior";
type Regiao = string;

interface Pessoa {
  id: string;
  client_id: string;
  tipo: Tipo;
  escopo: Escopo;
  regiao: Regiao | null;
  cidade: string | null;
  nome: string;
  telefone: string;
  endereco: string;
  rua: string | null;
  numero: string | null;
  bairro: string | null;
  cep?: string | null;
  cpf?: string | null;
  rg?: string | null;
  rg_orgao_expedidor?: string | null;

  parent_id: string | null;
  observacoes: string | null;
  email: string | null;
  user_id: string | null;
  valor_contratacao: number | null;
  vigencia_inicio?: string | null;
  vigencia_fim?: string | null;
  is_favorito_regiao?: boolean | null;
  pode_cadastrar_lider?: boolean | null;
  pode_cadastrar_cabo?: boolean | null;
  parceiro_id?: string | null;
  rateio_estadual?: number | null;
  rateio_parceiro?: number | null;
  status_contratacao?: "pendente" | "em_negociacao" | "confirmado";
  confirmado_em?: string | null;
  participou_reuniao?: boolean;
  reuniao_em?: string | null;
  is_voluntario?: boolean;
  arquivado_em?: string | null;
  arquivado_por?: string | null;
  arquivamento_motivo?: string | null;
  // pre_selecionado depreciado, mantido no tipo apenas para compatibilidade de leitura se necessário
  pre_selecionado?: boolean;
  created_at: string;
}

const TIPO_META: Record<Tipo, { label: string; color: string; icon: any }> = {
  coordenador: { label: "Coordenador", color: "bg-red-500/10 text-red-600 border-red-500/30", icon: Crown },
  lider: { label: "Líder", color: "bg-blue-500/10 text-blue-600 border-blue-500/30", icon: Users },
  cabo: { label: "Cabo Eleitoral", color: "bg-green-500/10 text-green-600 border-green-500/30", icon: UserCheck },
};

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

function genLocalPassword(len = 10) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

// Contexto p/ ações que aparecem em várias linhas/níveis sem precisar passar props
type EleicaoActions = {
  onTogglePermissao: (p: Pessoa, field: "pode_cadastrar_lider" | "pode_cadastrar_cabo") => void;
  onResendLiderFlow: (p: Pessoa) => void;
  onArchive: (p: Pessoa) => void;
};
const EleicaoActionsContext = React.createContext<EleicaoActions | null>(null);

// Contexto da busca atual — usado para auto-expandir blocos e mostrar vínculos
type EleicaoSearchCtx = {
  searchActive: boolean;
  matchedIds: Set<string>;
  nameById: Map<string, string>;
  tipoById: Map<string, Tipo>;
  parentById: Map<string, string | null>;
};
const EleicaoSearchContext = React.createContext<EleicaoSearchCtx>({
  searchActive: false,
  matchedIds: new Set(),
  nameById: new Map(),
  tipoById: new Map(),
  parentById: new Map(),
});


export default function Eleicao() {
  const { data: clientId } = useCurrentClientId();
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [escopo, setEscopo] = useState<Escopo>("campo_grande");
  const [regiaoFilter, setRegiaoFilter] = useState<Regiao | "all">("all");
  const { regioes: REGIOES } = useRegioesEleicao(clientId || undefined);
  const { parceirosAtivos: PARCEIROS } = useCandidatosParceiros(clientId || undefined);

  // dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyPessoaId, setNotifyPessoaId] = useState<string | null>(null);
  const [notifySkip, setNotifySkip] = useState<("coordenador" | "secretaria" | "lider")[]>([]);
  // Pós-cadastro: popup de envio manual (WhatsApp Web do próprio usuário)
  const [posCadastroOpen, setPosCadastroOpen] = useState(false);
  const [posCadastroPessoa, setPosCadastroPessoa] = useState<Pessoa | null>(null);
  const [editing, setEditing] = useState<Pessoa | null>(null);
  const [propagarRaiz, setPropagarRaiz] = useState<{
    raiz: Pessoa;
    parceiroId: string | null;
    rateioEstadual: number;
    rateioParceiro: number;
  } | null>(null);
  const [propagandoLoading, setPropagandoLoading] = useState(false);
  const [form, setForm] = useState({
    tipo: "coordenador" as Tipo,
    escopo: "campo_grande" as Escopo,
    regiao: "centro" as Regiao,
    cidade: "",
    nome: "",
    telefone: "",
    rua: "",
    numero: "",
    bairro: "",
    cep: "",
    cpf: "",
    rg: "",
    rg_orgao_expedidor: "",

    parent_id: "" as string,
    liderAvulso: false,
    observacoes: "",
    email: "",
    password: "",
    send_access: true,
    valor_contratacao: "" as string,
    vigencia_inicio: "" as string,
    vigencia_fim: "" as string,
    parceiro_id: "" as string,
    rateio_estadual: 100 as number,
    rateio_parceiro: 0 as number,
    status_contratacao: "pendente" as "pendente" | "em_negociacao" | "confirmado",
    participou_reuniao: false,
  });

  useEffect(() => { if (clientId) load(); }, [clientId]);

  // Reload disparado por componentes filhos (ex.: toggle de favorito)
  useEffect(() => {
    const handler = () => { if (clientId) load(); };
    window.addEventListener("eleicao:reload-pessoas", handler);
    return () => window.removeEventListener("eleicao:reload-pessoas", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function load() {
    setLoading(true);
    // Usa RPC SECURITY DEFINER para garantir que todo team_member ativo do client
    // veja a árvore completa (coordenadores + líderes + cabos), evitando casos
    // em que a RLS por linha falha por timing de sessão/JWT.
    const { data, error } = await supabase
      .rpc("get_eleicao_pessoas_for_client" as any, { _client_id: clientId! });
    if (error) {
      toast.error("Erro ao carregar: " + error.message);
      setLoading(false);
      return;
    }
    const rows = ((data as any) || []) as Pessoa[];
    rows.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    setPessoas(rows);
    setLoading(false);
  }

  function openNew(presets?: Partial<typeof form>) {
    setEditing(null);
    setForm({
      tipo: "coordenador", escopo, regiao: "centro",
      cidade: escopo === "campo_grande" ? "Campo Grande" : "",
      nome: "", telefone: "", rua: "", numero: "", bairro: "",
      cep: "", cpf: "", rg: "", rg_orgao_expedidor: "",

      parent_id: "", liderAvulso: false, observacoes: "",
      email: "", password: genLocalPassword(), send_access: true,
      valor_contratacao: "",
      vigencia_inicio: "",
      vigencia_fim: "",
      parceiro_id: "",
      rateio_estadual: 100,
      rateio_parceiro: 0,
      status_contratacao: "pendente" as "pendente" | "em_negociacao" | "confirmado",
      participou_reuniao: false,
      ...presets,
    });
    setDialogOpen(true);
  }

  function openEdit(p: Pessoa) {
    setEditing(p);
    // Só usa o `endereco` legado como rua quando ele realmente parece conter rua
    // (diferente do bairro e não é só o concat "rua - bairro" que já guardamos).
    // Caso contrário (cadastros onde só o bairro foi preenchido), deixa Rua em branco.
    const legado = p.endereco || "";
    const bairroAtual = (p.bairro || "").trim();
    const legadoEhSoBairro =
      !!bairroAtual && legado.trim().toLowerCase() === bairroAtual.toLowerCase();
    const ruaFallback = legado && !legadoEhSoBairro
      ? legado.replace(new RegExp(`\\s-\\s*${bairroAtual}\\s*$`, "i"), "").trim()
      : "";
    setForm({
      tipo: p.tipo, escopo: p.escopo,
      regiao: (p.regiao || "centro") as Regiao,
      cidade: p.cidade || "",
      nome: p.nome, telefone: p.telefone,
      rua: p.rua || ruaFallback,
      numero: p.numero || "",
      bairro: p.bairro || "",
      cep: p.cep || "",
      cpf: p.cpf || "",
      rg: p.rg || "",
      rg_orgao_expedidor: p.rg_orgao_expedidor || "",

      parent_id: p.parent_id || "",
      liderAvulso: p.tipo === "lider" && !p.parent_id,
      observacoes: p.observacoes || "",
      email: p.email || "",
      password: "",
      send_access: false,
      valor_contratacao: p.valor_contratacao != null ? String(p.valor_contratacao) : "",
      vigencia_inicio: p.vigencia_inicio ? String(p.vigencia_inicio).slice(0, 10) : "",
      vigencia_fim: p.vigencia_fim ? String(p.vigencia_fim).slice(0, 10) : "",
      parceiro_id: p.parceiro_id || "",
      rateio_estadual: p.rateio_estadual ?? 100,
      rateio_parceiro: p.rateio_parceiro ?? 0,
      status_contratacao: p.status_contratacao || "pendente",
      participou_reuniao: !!p.participou_reuniao,
    });
    setDialogOpen(true);
  }

  async function save() {
    if (!form.nome.trim() || !form.telefone.trim() || !form.bairro.trim()) {
      toast.error("Nome, telefone e bairro são obrigatórios"); return;
    }

    const telLimpo = onlyDigits(form.telefone);
    const dupe = pessoas.find(p => p.id !== editing?.id && onlyDigits(p.telefone) === telLimpo);
    if (dupe) {
      // Buscar o nome do coordenador/pai se houver
      let vinculadoA = "base geral (avulso)";
      if (dupe.parent_id) {
        const pai = pessoas.find(p => p.id === dupe.parent_id);
        if (pai) {
          vinculadoA = `${pai.nome} (${TIPO_META[pai.tipo].label})`;
        }
      }

      toast.error(`Este telefone já está cadastrado!`, {
        description: `Pertence a: ${dupe.nome} (${TIPO_META[dupe.tipo].label})\nVinculado a: ${vinculadoA}`,
        duration: 6000
      });
      return;
    }

    if (form.escopo === "interior" && !form.cidade.trim()) {
      toast.error("Cidade é obrigatória para Interior"); return;
    }
    if (form.tipo === "coordenador" && form.email.trim() && !isValidEmail(form.email)) {
      toast.error("Informe um e-mail válido para o coordenador"); return;
    }
    if (form.tipo === "coordenador" && !editing && form.send_access && (!form.email.trim() || form.password.length < 6)) {
      toast.error("Para enviar acesso, informe e-mail e senha com no mínimo 6 caracteres"); return;
    }
    const rua = form.rua.trim();
    const numero = form.numero.trim();
    const bairro = form.bairro.trim();
    const enderecoConcat = [rua ? `${rua}${numero ? ", " + numero : ""}` : "", bairro].filter(Boolean).join(" - ");
    const isRaiz = form.tipo === "coordenador" || (form.tipo === "lider" && !form.parent_id);
    const valorContratacao = parseValorContratacao(form.valor_contratacao);
    const statusContratacao = valorContratacao > 0 ? "confirmado" : "pendente";
    const payload: any = {
      client_id: clientId,
      tipo: form.tipo,
      escopo: form.escopo,
      regiao: form.escopo === "campo_grande" ? form.regiao : null,
      cidade: form.escopo === "interior"
        ? form.cidade.trim()
        : (form.cidade.trim() || "Campo Grande"),
      nome: form.nome.trim(),
      telefone: form.telefone.trim(),
      rua, numero: numero || null, bairro,
      cep: form.cep.replace(/\D/g, "") || null,
      cpf: form.cpf.replace(/\D/g, "") || null,
      rg: form.rg.trim() || null,
      rg_orgao_expedidor: form.rg_orgao_expedidor.trim() || null,

      endereco: enderecoConcat,
      parent_id: form.parent_id || null,
      observacoes: form.observacoes.trim() || null,
      email: form.tipo === "coordenador" && form.email.trim() ? form.email.trim().toLowerCase() : null,
      valor_contratacao: valorContratacao,
      vigencia_inicio: form.vigencia_inicio || null,
      vigencia_fim: form.vigencia_fim || null,
      status_contratacao: statusContratacao,
      confirmado_em: statusContratacao === "confirmado" ? (editing?.confirmado_em || new Date().toISOString()) : null,
      participou_reuniao: form.participou_reuniao,
      reuniao_em: form.participou_reuniao && !editing?.participou_reuniao ? new Date().toISOString() : (editing?.reuniao_em || null),
    };

    // Dobradinha:
    // - Raiz nova: inclui no payload (não há descendentes pra propagar).
    // - Raiz editando: salva campos base aqui, dobradinha aplicada via RPC após (com diálogo se houver descendentes).
    // - Não-raiz: omite — trigger BEFORE INSERT/UPDATE herda da raiz automaticamente.
    if (isRaiz && !editing) {
      payload.parceiro_id = form.parceiro_id || null;
      payload.rateio_estadual = form.parceiro_id ? form.rateio_estadual : 100;
      payload.rateio_parceiro = form.parceiro_id ? form.rateio_parceiro : 0;
    }

    // Rebaixamento: se está mudando de tipo e vai perder subordinados diretos,
    // pede confirmação e desvincula os filhos (parent_id = null) para virarem avulsos.
    // NADA é apagado — só solta o vínculo.
    let desvincularFilhosDe: string | null = null;
    if (editing && editing.tipo !== form.tipo) {
      const perdeSubordinados =
        (editing.tipo === "coordenador" && form.tipo !== "coordenador") ||
        (editing.tipo === "lider" && form.tipo === "cabo");
      if (perdeSubordinados) {
        const filhos = pessoas.filter(p => p.parent_id === editing.id);
        const lideres = filhos.filter(f => f.tipo === "lider").length;
        const cabos = filhos.filter(f => f.tipo === "cabo").length;
        if (filhos.length > 0) {
          const msg =
            `Este cadastro tem ${lideres} líder(es) e ${cabos} cabo(s) abaixo.\n\n` +
            `Ao rebaixar para ${TIPO_META[form.tipo].label}, esses contatos serão DESVINCULADOS ` +
            `(viram avulsos, sem coordenador/líder). Nenhum contato será apagado — ` +
            `você poderá reatribuí-los depois.\n\nConfirmar rebaixamento?`;
          if (!confirm(msg)) return;
          desvincularFilhosDe = editing.id;
        }
      }
    }

    // Propagação de escopo/região/cidade: quando muda esses campos e existem descendentes,
    // avisa o usuário que TODOS os subordinados vão junto (o trigger no banco propaga).
    if (editing && (
      form.regiao !== editing.regiao ||
      form.escopo !== editing.escopo ||
      form.cidade !== (editing.cidade || "")
    )) {
      // conta descendentes recursivamente
      const filhosPorPai = new Map<string, string[]>();
      pessoas.forEach(p => {
        if (p.parent_id) {
          const arr = filhosPorPai.get(p.parent_id) || [];
          arr.push(p.id);
          filhosPorPai.set(p.parent_id, arr);
        }
      });
      const descIds: string[] = [];
      const stack = [editing.id];
      while (stack.length) {
        const cur = stack.pop()!;
        const fs = filhosPorPai.get(cur) || [];
        fs.forEach(id => { descIds.push(id); stack.push(id); });
      }
      if (descIds.length > 0) {
        const descSet = new Set(descIds);
        const lideres = pessoas.filter(p => descSet.has(p.id) && p.tipo === "lider").length;
        const cabos = pessoas.filter(p => descSet.has(p.id) && p.tipo === "cabo").length;
        const destino =
          form.escopo === "interior"
            ? (form.cidade || "—")
            : (REGIOES.find(r => r.value === form.regiao)?.label || form.regiao);
        const msg =
          `Este cadastro tem ${lideres} líder(es) e ${cabos} cabo(s) abaixo.\n\n` +
          `Ao mudar o escopo/região, TODOS os subordinados serão movidos junto para "${destino}". ` +
          `Nenhum contato será perdido — o vínculo continua igual.\n\nConfirmar?`;
        if (!confirm(msg)) return;
      }
    }

    const q = editing
      ? supabase.from("eleicao_pessoas" as any).update(payload).eq("id", editing.id).select().single()
      : supabase.from("eleicao_pessoas" as any).insert(payload).select().single();
    const { data: savedPessoa, error } = await q;
    if (error) { toast.error(error.message); return; }

    if (desvincularFilhosDe) {
      const { error: errDesv } = await supabase
        .from("eleicao_pessoas" as any)
        .update({ parent_id: null })
        .eq("parent_id", desvincularFilhosDe);
      if (errDesv) {
        toast.error("Cadastro atualizado, mas falhou ao desvincular subordinados: " + errDesv.message);
      } else {
        toast.success("Subordinados desvinculados — agora aparecem como avulsos.");
      }
    }


    // Se está editando uma raiz e a dobradinha mudou, dispara fluxo de propagação
    if (editing && isRaiz) {
      const dobradinhaAtual = {
        parceiro_id: editing.parceiro_id || "",
        rateio_estadual: editing.rateio_estadual ?? 100,
        rateio_parceiro: editing.rateio_parceiro ?? 0,
      };
      const dobradinhaNova = {
        parceiro_id: form.parceiro_id || "",
        rateio_estadual: form.parceiro_id ? form.rateio_estadual : 100,
        rateio_parceiro: form.parceiro_id ? form.rateio_parceiro : 0,
      };
      const mudou =
        dobradinhaAtual.parceiro_id !== dobradinhaNova.parceiro_id ||
        dobradinhaAtual.rateio_estadual !== dobradinhaNova.rateio_estadual ||
        dobradinhaAtual.rateio_parceiro !== dobradinhaNova.rateio_parceiro;
      if (mudou) {
        const temDescs = pessoas.some(p => p.parent_id === editing.id);
        if (!temDescs) {
          // Aplica direto, sem diálogo
          await supabase.rpc("eleicao_aplicar_dobradinha_raiz" as any, {
            _raiz_id: editing.id,
            _parceiro_id: dobradinhaNova.parceiro_id || null,
            _rateio_estadual: dobradinhaNova.rateio_estadual,
            _rateio_parceiro: dobradinhaNova.rateio_parceiro,
            _propagar: false,
          });
        } else {
          // Abre diálogo de propagação
          setPropagarRaiz({
            raiz: editing,
            parceiroId: dobradinhaNova.parceiro_id || null,
            rateioEstadual: dobradinhaNova.rateio_estadual,
            rateioParceiro: dobradinhaNova.rateio_parceiro,
          });
          setDialogOpen(false);
          load();
          return;
        }
      }
    }

    // Novo cadastro: abre o popup de envio MANUAL (WhatsApp Web do próprio usuário).
    if (!editing && savedPessoa) {
      toast.success(`${TIPO_META[form.tipo].label} cadastrado!`);
      setDialogOpen(false);
      load();
      let skip = false;
      try { skip = sessionStorage.getItem("eleicao:skip-pos-cadastro") === "1"; } catch {}
      if (skip) {
        if (form.tipo === "lider") {
          const isAvulso = !payload.parent_id;
          setNotifySkip(isAvulso ? ["coordenador", "secretaria"] : []);
          setNotifyPessoaId((savedPessoa as any).id);
          setNotifyOpen(true);
        } else if (form.tipo === "coordenador") {
          if (form.send_access) {
            await sendCredentials(savedPessoa as unknown as Pessoa, "whatsapp", {
              email: form.email.trim(),
              password: form.password,
            });
          }
          void notifyCoordBoasVindas((savedPessoa as any).id);
        } else if (form.tipo === "cabo") {
          void sendCaboBoasVindas((savedPessoa as any).id);
        }
        return;
      }
      setPosCadastroPessoa(savedPessoa as unknown as Pessoa);
      setPosCadastroOpen(true);
      return;
    }

    const telefoneCorrigido = editing && onlyDigits(editing.telefone) !== onlyDigits(form.telefone);
    toast.success(
      telefoneCorrigido
        ? "Telefone corrigido! As missões anteriores foram reprocessadas."
        : "Atualizado!",
    );
    setDialogOpen(false);
    load();
  }

  async function notifyCoordBoasVindas(pessoaId: string) {
    await sendCoordBoasVindas(pessoaId);
  }


  async function remove(id: string) {
    if (!confirm("Excluir este cadastro? As pessoas vinculadas a ele ficarão sem vínculo.")) return;
    const { error } = await supabase.from("eleicao_pessoas" as any).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Excluído");
    load();
  }

  async function toggleArchive(p: Pessoa) {
    if (!p.arquivado_em) {
      if (!isEleicaoSemContrato(p)) {
        toast.error(p.is_voluntario ? "Voluntários ativos não podem ser arquivados." : "Somente pessoas sem contrato podem ser arquivadas.");
        return;
      }
      const filhosAtivos = pessoas.filter(x => x.parent_id === p.id && !x.arquivado_em);
      if (filhosAtivos.length > 0) {
        toast.error(`Transfira ou desvincule os ${filhosAtivos.length} subordinado(s) ativos antes de arquivar.`);
        return;
      }
      if (!confirm(`Arquivar ${p.nome}? O cadastro poderá ser restaurado depois.`)) return;
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("eleicao_pessoas" as any).update({
        arquivado_em: new Date().toISOString(),
        arquivado_por: auth.user?.id || null,
        arquivamento_motivo: "Não contratado ao final da seleção",
      }).eq("id", p.id);
      if (error) { toast.error(error.message); return; }
      toast.success(`${p.nome} foi arquivado(a)`);
    } else {
      const { error } = await supabase.from("eleicao_pessoas" as any).update({ arquivado_em: null }).eq("id", p.id);
      if (error) { toast.error(error.message); return; }
      toast.success(`${p.nome} foi restaurado(a)`);
    }
    load();
  }

  async function togglePermissaoCadastro(p: Pessoa, field: "pode_cadastrar_lider" | "pode_cadastrar_cabo") {
    const novoValor = !(p[field] ?? true);
    // Otimismo: atualiza local antes do retorno do banco
    setPessoas(prev => prev.map(x => x.id === p.id ? { ...x, [field]: novoValor } : x));
    const { error } = await supabase
      .from("eleicao_pessoas" as any)
      .update({ [field]: novoValor })
      .eq("id", p.id);
    if (error) {
      toast.error(error.message);
      setPessoas(prev => prev.map(x => x.id === p.id ? { ...x, [field]: !novoValor } : x));
      return;
    }
    const label = field === "pode_cadastrar_lider" ? "Líderes" : "Cabos";
    toast.success(novoValor ? `${p.nome} pode cadastrar ${label}` : `${p.nome} bloqueado para cadastrar ${label}`);
  }

  function openResendLiderFlow(p: Pessoa) {
    if (p.tipo !== "lider") return;
    setNotifySkip(!p.parent_id ? ["coordenador", "secretaria"] : []);
    setNotifyPessoaId(p.id);
    setNotifyOpen(true);
  }






  // ─── Credenciais de Coordenador ────────────────────────────────
  const [credOpen, setCredOpen] = useState(false);
  const [credPessoa, setCredPessoa] = useState<Pessoa | null>(null);
  const [credEmail, setCredEmail] = useState("");
  const [credPassword, setCredPassword] = useState("");
  const [credLoading, setCredLoading] = useState(false);

  function openCred(p: Pessoa) {
    setCredPessoa(p);
    setCredEmail(p.email || "");
    setCredPassword("coringa15111");
    setCredOpen(true);
  }

  async function saveCred() {
    if (!credPessoa) return;
    if (!credEmail.trim() || !isValidEmail(credEmail) || credPassword.length < 6) {
      toast.error("Email e senha (mín. 6) obrigatórios"); return;
    }
    setCredLoading(true);
    try {
      const ok = await sendCredentials(credPessoa, "whatsapp", { email: credEmail.trim(), password: credPassword });
      if (ok) setCredOpen(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCredLoading(false);
    }
  }
  // ─── Enviar credenciais (gera senha e envia/copia) ──────────────
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [credResult, setCredResult] = useState<{ pessoa: Pessoa; portal_url: string; email: string; password: string | null; message: string; sent: boolean; warning?: string } | null>(null);

  async function sendCredentials(
    p: Pessoa,
    channel: "whatsapp" | "link_only",
    options?: { email?: string; password?: string; closeRegisterDialog?: boolean }
  ) {
    if (!options?.email && !p.email) {
      openCred(p);
      toast.warning("Informe o e-mail e a senha do coordenador antes de enviar o acesso.");
      return false;
    }
    setSendingId(p.id);
    try {
      const { data, error } = await supabase.functions.invoke("eleicao-send-credentials", {
        body: {
          pessoa_id: p.id,
          channel,
          app_url: window.location.origin,
          email: options?.email,
          password: options?.password,
          reset_password: !!options?.password,
        },
      });
      if (error) {
        let msg = error.message;
        try { const b = await (error as any).context?.json?.(); if (b?.error) msg = b.error; } catch {}
        throw new Error(msg);
      }
      if (!data?.success) throw new Error(data?.error || "Falha");
      setCredResult({ pessoa: p, ...data });
      const senhaMantida = data.password === null || data.password === undefined;
      if (data.sent) toast.success(senhaMantida ? "Acesso enviado por WhatsApp (senha atual mantida)" : "Credenciais enviadas por WhatsApp!");
      else if (data.warning) toast.warning(data.warning);
      else toast.success(senhaMantida ? "Link gerado (senha atual mantida)" : "Credenciais geradas! Copie abaixo.");
      if (options?.closeRegisterDialog) setDialogOpen(false);
      load();
      return true;

    } catch (e: any) {
      toast.error(e.message);
      return false;
    } finally {
      setSendingId(null);
    }
  }

  const [view, setView] = useState<"cadastros" | "funnel" | "reunioes" | "pendentes" | "custos" | "config" | "indicacoes" | "dobradinhas" | "distribuicao" | "relatorio_contratados">("cadastros");
  const [layoutMode, setLayoutMode] = useState<"arvore" | "lista">("arvore");
  const [statusFilter, setStatusFilter] = useState<"todos" | "contratados" | "sem_contrato" | "sem_acesso" | "avulsos" | "voluntarios" | "arquivados" | "reuniao">("todos");
  const [tipoFilter, setTipoFilter] = useState<"todos" | Tipo>("todos");
  const [sortBy, setSortBy] = useState<"nome" | "valor" | "tipo">("nome");

  const matchesStatus = (p: Pessoa) => {
    if (statusFilter === "contratados") return isEleicaoContratado(p);
    if (statusFilter === "sem_contrato") return isEleicaoSemContrato(p);
    if (statusFilter === "sem_acesso") return p.tipo === "coordenador" && !p.user_id;
    if (statusFilter === "avulsos") return p.tipo === "lider" && !p.parent_id && !p.is_voluntario;
    if (statusFilter === "voluntarios") return isEleicaoVoluntario(p);
    if (statusFilter === "arquivados") return !!p.arquivado_em;
    if (statusFilter === "reuniao") return !!p.participou_reuniao;
    return !p.arquivado_em;
  };
  const matchesTipo = (p: Pessoa) => tipoFilter === "todos" || p.tipo === tipoFilter;

  const matchesSearch = (p: Pessoa) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.nome.toLowerCase().includes(q) || p.telefone.includes(search) || (p.endereco || "").toLowerCase().includes(q);
  };

  // Índice global de pessoas para resolver ancestrais (mesmo escopo) e nomes de pais
  const pessoaById = useMemo(() => {
    const m = new Map<string, Pessoa>();
    pessoas.forEach(p => m.set(p.id, p));
    return m;
  }, [pessoas]);

  // Ids efetivamente visíveis no escopo: matches + ancestrais e descendentes.
  // Ao buscar um coordenador/líder, a árvore precisa manter a equipe dele para
  // que a raiz encontrada continue expansível.
  // Sem busca ativa, mantém comportamento antigo (todas as pessoas do escopo que passam nos filtros).
  const visibleIds = useMemo(() => {
    const visible = new Set<string>();
    const baseFiltered = pessoas.filter(
      p => p.escopo === escopo && matchesSearch(p) && matchesStatus(p) && matchesTipo(p),
    );
    baseFiltered.forEach(p => visible.add(p.id));
    if (search) {
      // Para cada match, adiciona ancestrais (líder pai e coordenador avô) para tornar o caminho visível.
      baseFiltered.forEach(p => {
        let cur: string | null = p.parent_id || null;
        let safety = 5;
        while (cur && safety-- > 0) {
          const parent = pessoaById.get(cur);
          if (!parent) break;
          visible.add(parent.id);
          cur = parent.parent_id || null;
        }
      });

      const childrenByParent = new Map<string, Pessoa[]>();
      pessoas.forEach(p => {
        if (p.escopo !== escopo || !p.parent_id) return;
        const children = childrenByParent.get(p.parent_id) || [];
        children.push(p);
        childrenByParent.set(p.parent_id, children);
      });
      baseFiltered.forEach(match => {
        const pending = [...(childrenByParent.get(match.id) || [])];
        const visited = new Set<string>();
        while (pending.length > 0) {
          const child = pending.shift()!;
          if (visited.has(child.id)) continue;
          visited.add(child.id);
          // Os filtros continuam valendo; somente o texto da busca é ignorado
          // para a equipe que está abaixo da pessoa encontrada.
          if (matchesStatus(child) && matchesTipo(child)) visible.add(child.id);
          pending.push(...(childrenByParent.get(child.id) || []));
        }
      });
    }
    return visible;
  }, [pessoas, escopo, search, statusFilter, tipoFilter, pessoaById]);

  // Lista visível no escopo. Mantém o nome original para minimizar mudanças no resto da árvore.
  const escopoList = useMemo(
    () => pessoas.filter(p => p.escopo === escopo && visibleIds.has(p.id)),
    [pessoas, escopo, visibleIds],
  );

  // Ids que realmente correspondem à busca (sem contar ancestrais visíveis por contexto).
  const matchedIds = useMemo(() => {
    if (!search) return new Set<string>();
    return new Set(
      pessoas
        .filter(p => p.escopo === escopo && matchesSearch(p) && matchesStatus(p) && matchesTipo(p))
        .map(p => p.id),
    );
  }, [pessoas, escopo, search, statusFilter, tipoFilter]);

  const searchCtxValue = useMemo<EleicaoSearchCtx>(() => {
    const nameById = new Map<string, string>();
    const tipoById = new Map<string, Tipo>();
    const parentById = new Map<string, string | null>();
    pessoas.forEach(p => {
      nameById.set(p.id, p.nome);
      tipoById.set(p.id, p.tipo);
      parentById.set(p.id, p.parent_id || null);
    });
    return { searchActive: !!search, matchedIds, nameById, tipoById, parentById };
  }, [pessoas, search, matchedIds]);

  const cgRegioes = useMemo(() => {
    if (escopo !== "campo_grande") return [];
    return REGIOES.filter(r => regiaoFilter === "all" || r.value === regiaoFilter);
  }, [escopo, regiaoFilter]);

  const interiorCidades = useMemo(() => {
    if (escopo !== "interior") return [];
    const set = new Set(escopoList.map(p => p.cidade || "").filter(Boolean));
    return Array.from(set).sort();
  }, [escopo, escopoList]);

  const stats = useMemo(() => {
    const f = pessoas.filter(p => p.escopo === escopo && !p.arquivado_em);
    const isVol = (p: any) => !!p.is_voluntario;
    const remunerados = f.filter(p => !isVol(p));
    const valorTotal = remunerados.reduce((s, p) => s + (p.valor_contratacao || 0), 0);
    const semValor = remunerados.filter(p => !p.valor_contratacao || p.valor_contratacao === 0).length;
    const avulsos = remunerados.filter(p => p.tipo === "lider" && !p.parent_id).length;
    return {
      coord: remunerados.filter(p => p.tipo === "coordenador").length,
      lider: remunerados.filter(p => p.tipo === "lider").length,
      cabo: remunerados.filter(p => p.tipo === "cabo").length,
      voluntarios: f.filter(isVol).length,
      contratados: f.filter(isEleicaoContratado).length,
      semContrato: f.filter(isEleicaoSemContrato).length,
      arquivados: pessoas.filter(p => p.escopo === escopo && !!p.arquivado_em).length,
      total: f.length,
      valorTotal,
      semValor,
      avulsos,
    };
  }, [pessoas, escopo]);


  // potential parents for the form
  const possibleParents = useMemo(() => {
    if (form.tipo === "coordenador") return [];
    const parentTipo: Tipo = form.tipo === "lider" ? "coordenador" : "lider";
    return pessoas.filter(p =>
      !p.arquivado_em &&
      p.tipo === parentTipo &&
      p.escopo === form.escopo &&
      (form.escopo === "interior" ? p.cidade === form.cidade : p.regiao === form.regiao)
    );
  }, [pessoas, form.tipo, form.escopo, form.regiao, form.cidade]);


  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  async function handleExport(cfg: ExportConfig) {
    // O diálogo de exportação é a fonte única dos filtros do arquivo. A busca e
    // os filtros visuais da tela não podem zerar silenciosamente uma exportação
    // configurada como "todos".
    let base = pessoas.filter(p => p.escopo === escopo);
    const situacaoRelatorio = cfg.situacaoContrato || "ativos";
    if (situacaoRelatorio === "ativos") base = base.filter(p => !p.arquivado_em);
    if (situacaoRelatorio === "contratados") base = base.filter(isEleicaoContratado);
    if (situacaoRelatorio === "sem_contrato") base = base.filter(isEleicaoSemContrato);
    if (situacaoRelatorio === "voluntarios") base = base.filter(isEleicaoVoluntario);
    if (situacaoRelatorio === "arquivados") base = base.filter(p => !!p.arquivado_em);
    
    // Filtro de reunião se vier do dialog
    if (cfg.apenasReuniao) {
      base = base.filter(p => !!p.participou_reuniao);
    }
    if (cfg.apenasNaoReuniao) {
      base = base.filter(p => !p.participou_reuniao);
    }

    if (cfg.regiao) {
      base = base.filter(p =>
        escopo === "interior" ? p.cidade === cfg.regiao : p.regiao === cfg.regiao
      );
    }

    // Índice: pessoa → parceiro_id efetivo (herdado da raiz)
    const pessoaById = new Map(pessoas.map(p => [p.id, p]));
    const raizDe = (p: Pessoa): Pessoa => {
      let cur: Pessoa | undefined = p;
      const seen = new Set<string>();
      while (cur && cur.parent_id && !seen.has(cur.id)) {
        seen.add(cur.id);
        const parent = pessoaById.get(cur.parent_id);
        if (!parent) break;
        cur = parent;
      }
      return cur || p;
    };
    const parceiroEfetivoDe = (p: Pessoa): string | null => raizDe(p).parceiro_id || null;

    // Para o modo "raiz", precisamos da equipe inteira; aplicamos filtro de tipo
    // só no momento do filtro pós-montagem. Aqui já filtramos por coordenador escolhido.
    let lista = base;
    if (cfg.coordenadorId) {
      const coord = pessoas.find(p => p.id === cfg.coordenadorId);
      if (!coord) { toast.error("Coordenador não encontrado"); return; }
      const lideresDoCoord = new Set(pessoas.filter(p => p.parent_id === coord.id).map(p => p.id));
      lista = base.filter(p =>
        p.id === coord.id ||
        lideresDoCoord.has(p.id) ||
        (p.parent_id && lideresDoCoord.has(p.parent_id))
      );
    }

    // Filtro por dobradinha específica (parceiroId "__none" = sem dobradinha)
    if (cfg.parceiroId) {
      const alvo = cfg.parceiroId === "__none" ? null : cfg.parceiroId;
      lista = lista.filter(p => parceiroEfetivoDe(p) === alvo);
    }

    // Aplica filtro de tipos do dialog
    const tiposSet = new Set(cfg.tipos);
    let listaTipada = lista.filter(p => tiposSet.has(p.tipo));

    // Filtro especial para Líderes Avulsos
    if (cfg.apenasAvulsos) {
      listaTipada = listaTipada.filter(p => p.tipo === "lider" && !p.parent_id);
    } else if (!cfg.incluirAvulsos) {
      // Remove líderes sem coordenador vinculado (avulsos) e os cabos abaixo deles
      const avulsosIds = new Set(
        pessoas.filter(p => p.tipo === "lider" && !p.parent_id).map(p => p.id),
      );
      const isAvulsoOuFilho = (p: Pessoa) =>
        avulsosIds.has(p.id) || (!!p.parent_id && avulsosIds.has(p.parent_id));
      listaTipada = listaTipada.filter(p => !isAvulsoOuFilho(p));
      lista = lista.filter(p => !isAvulsoOuFilho(p));
    }


    // Filtro de voluntários (relatório separado)
    const volMode = cfg.voluntarios || "todos";
    if (volMode === "apenas") {
      listaTipada = listaTipada.filter(p => !!(p as any).is_voluntario);
      lista = lista.filter(p => !!(p as any).is_voluntario);
    } else if (volMode === "excluir") {
      listaTipada = listaTipada.filter(p => !(p as any).is_voluntario);
      lista = lista.filter(p => !(p as any).is_voluntario);
    }


    if (listaTipada.length === 0) {
      toast.error("Nenhum cadastro para exportar com os filtros escolhidos.");
      return;
    }

    const byId = new Map(pessoas.map(p => [p.id, p.nome]));
    const escopoLabel = escopo === "campo_grande" ? "Campo Grande" : "Interior";
    const parceiroById = new Map(PARCEIROS.map(p => [p.id, p]));

    const toExportPessoa = (p: Pessoa): ExportPessoa => ({
      id: p.id, parent_id: p.parent_id, nome: p.nome, tipo: p.tipo, telefone: p.telefone,
      regiao: p.regiao, cidade: p.cidade, bairro: p.bairro, rua: p.rua, numero: p.numero,
      email: p.email, observacoes: p.observacoes, valor_contratacao: p.valor_contratacao,
      participou_reuniao: p.participou_reuniao, reuniao_em: p.reuniao_em,
      is_voluntario: p.is_voluntario, confirmado_em: p.confirmado_em,
      vigencia_inicio: p.vigencia_inicio, vigencia_fim: p.vigencia_fim,
      arquivado_em: p.arquivado_em, arquivamento_motivo: p.arquivamento_motivo,
      parent_nome: p.parent_id ? (byId.get(p.parent_id) || null) : null,
    });

    if (cfg.zipPorCoordenador) {
      const toastId = toast.loading("Gerando PDFs por coordenador…");
      try {
        const qtd = await exportarZipPorCoordenador(listaTipada.map(toExportPessoa), cfg.campos, escopo === "campo_grande" ? "Campo Grande" : "Interior");
        toast.dismiss(toastId); toast.success(`ZIP gerado com ${qtd} PDF(s).`);
      } catch (error: any) {
        toast.dismiss(toastId); toast.error(error?.message || "Não foi possível gerar o ZIP.");
      }
      return;
    }

    const baseFiltros = (): { label: string; value: string }[] => {
      const f: { label: string; value: string }[] = [];
      if (cfg.regiao) {
        const label = escopo === "interior" ? "Cidade" : "Região";
        const valor = escopo === "interior" ? cfg.regiao : (REGIOES.find(r => r.value === cfg.regiao)?.label || cfg.regiao);
        f.push({ label, value: valor });
      }
      f.push({ label: "Tipos", value: cfg.tipos.map(t => t === "coordenador" ? "Coord" : t === "lider" ? "Líder" : "Cabo").join(", ") });
      if (cfg.coordenadorId) {
        const coordNome = byId.get(cfg.coordenadorId) || "";
        f.push({ label: "Equipe", value: coordNome });
      }
      if (cfg.apenasReuniao) f.push({ label: "Reunião", value: "Apenas quem participou" });
      if (cfg.apenasNaoReuniao) f.push({ label: "Reunião", value: "Apenas quem NÃO participou" });
      if (volMode === "apenas") f.push({ label: "Voluntários", value: "Apenas voluntários" });
      if (volMode === "excluir") f.push({ label: "Voluntários", value: "Excluídos (só remunerados)" });
      f.push({ label: "Situação", value: situacaoRelatorio === "ativos" ? "Todos os ativos" : situacaoRelatorio.replace("_", " ") });
      if (!cfg.incluirAvulsos && !cfg.apenasAvulsos) f.push({ label: "Líderes avulsos", value: "Excluídos" });
      return f;


    };

    const rodarExport = (
      pessoasFiltradas: Pessoa[],
      listaBase: Pessoa[], // usada no modo "raiz" para montar a árvore
      dobradinhaLabel: string | null,
      fileNameSuffix: string | undefined,
    ) => {
      const filtros = baseFiltros();
      if (dobradinhaLabel) filtros.push({ label: "Dobradinha", value: dobradinhaLabel });

      const configuraveis = pessoasFiltradas.map(toExportPessoa);
      if (cfg.formato === "csv") {
        exportarCsvConfiguravel(configuraveis, cfg.campos, `cadastros-eleicao-${fileNameSuffix || escopoLabel}`);
        return configuraveis.length;
      }
      if (cfg.formato === "pdf" || cfg.formato === "print") {
        exportarPdfConfiguravel(configuraveis, cfg.campos, cfg.modo === "raiz" ? "Estrutura por Coordenador" : "Cadastros da Eleição", escopoLabel, cfg.formato === "print");
        return configuraveis.length;
      }

      if (cfg.modo === "raiz") {
        const itemsRaiz: ExportPessoa[] = listaBase.map(p => ({
          id: p.id,
          parent_id: p.parent_id,
          nome: p.nome,
          tipo: p.tipo,
          telefone: p.telefone,
          regiao: p.regiao,
          cidade: p.cidade,
          bairro: p.bairro,
          rua: p.rua,
          numero: p.numero,
          email: p.email,
          observacoes: p.observacoes,
          valor_contratacao: p.valor_contratacao,
          participou_reuniao: p.participou_reuniao,
          reuniao_em: p.reuniao_em,
          is_voluntario: p.is_voluntario,
          confirmado_em: p.confirmado_em,
          vigencia_inicio: p.vigencia_inicio,
          vigencia_fim: p.vigencia_fim,
          arquivado_em: p.arquivado_em,
          arquivamento_motivo: p.arquivamento_motivo,
        }));
        const coordFiltro = cfg.coordenadorId
          ? { id: cfg.coordenadorId, nome: byId.get(cfg.coordenadorId) || "" }
          : null;
        const mode: "save" | "print" = cfg.formato === "print" ? "print" : "save";
        const opts = {
          escopoLabel,
          pessoas: itemsRaiz,
          incluirAvulsos: cfg.incluirAvulsos,
          tipos: cfg.tipos,
          coordenadorFiltro: coordFiltro,
          filtros,
          fileNameSuffix,
          mode,
          apenasAvulsos: cfg.apenasAvulsos,
          apenasReuniao: cfg.apenasReuniao,
          apenasNaoReuniao: cfg.apenasNaoReuniao,
        };
        if (cfg.formato === "csv") exportEleicaoCsvRaiz(opts);
        else exportEleicaoPdfRaiz(opts);
        return pessoasFiltradas.length;
      }

      const items: ExportPessoa[] = pessoasFiltradas.map(p => ({
        id: p.id,
        parent_id: p.parent_id,
        nome: p.nome,
        tipo: p.tipo,
        telefone: p.telefone,
        regiao: p.regiao,
        cidade: p.cidade,
        bairro: p.bairro,
        rua: p.rua,
        numero: p.numero,
        email: p.email,
        observacoes: p.observacoes,
        valor_contratacao: p.valor_contratacao,
        participou_reuniao: p.participou_reuniao,
        reuniao_em: p.reuniao_em,
        is_voluntario: p.is_voluntario,
        confirmado_em: p.confirmado_em,
        vigencia_inicio: p.vigencia_inicio,
        vigencia_fim: p.vigencia_fim,
        arquivado_em: p.arquivado_em,
        arquivamento_motivo: p.arquivamento_motivo,
        parent_nome: p.parent_id ? (byId.get(p.parent_id) || null) : null,
      }));
      const mode: "save" | "print" = cfg.formato === "print" ? "print" : "save";
      const opts = { escopoLabel, pessoas: items, filtros, fileNameSuffix, mode, apenasAvulsos: cfg.apenasAvulsos };
      if (cfg.formato === "csv") exportEleicaoCsv(opts);
      else exportEleicaoPdf(opts);
      return items.length;
    };

    // Segmentado: um arquivo por dobradinha
    if (cfg.porParceiro && !cfg.parceiroId) {
      const grupos = new Map<string | null, { pessoasTipadas: Pessoa[]; pessoasBase: Pessoa[] }>();
      for (const p of listaTipada) {
        const k = parceiroEfetivoDe(p);
        if (!grupos.has(k)) grupos.set(k, { pessoasTipadas: [], pessoasBase: [] });
        grupos.get(k)!.pessoasTipadas.push(p);
      }
      // Para o modo raiz também precisamos da lista bruta segmentada
      for (const p of lista) {
        const k = parceiroEfetivoDe(p);
        if (!grupos.has(k)) continue; // só grupos que têm pelo menos 1 tipado
        grupos.get(k)!.pessoasBase.push(p);
      }

      let totalArquivos = 0;
      let totalRegistros = 0;
      for (const [parceiroId, g] of grupos) {
        if (g.pessoasTipadas.length === 0) continue;
        const parc = parceiroId ? parceiroById.get(parceiroId) : null;
        const nome = parc ? parc.nome : "Sem dobradinha";
        const sufixo = parc ? parc.nome : "sem-dobradinha";
        const qtd = rodarExport(g.pessoasTipadas, g.pessoasBase, nome, sufixo);
        totalArquivos++;
        totalRegistros += qtd;
      }
      toast.success(`${totalArquivos} arquivo(s) gerado(s) · ${totalRegistros} registro(s) no total`);
      return;
    }

    // Fluxo simples (com ou sem filtro de dobradinha específica)
    let dobradinhaLabel: string | null = null;
    let sufixo: string | undefined = undefined;
    if (cfg.parceiroId === "__none") {
      dobradinhaLabel = "Sem dobradinha";
      sufixo = "sem-dobradinha";
    } else if (cfg.parceiroId) {
      const parc = parceiroById.get(cfg.parceiroId);
      if (parc) {
        dobradinhaLabel = parc.nome + (parc.cargo ? ` (${parc.cargo})` : "");
        sufixo = parc.nome;
      }
    }
    if (volMode === "apenas") sufixo = [sufixo, "voluntarios"].filter(Boolean).join("-");
    const qtd = rodarExport(listaTipada, lista, dobradinhaLabel, sufixo);

    
    toast.success(cfg.formato === "print" ? "PDF aberto para impressão em nova aba." : `${cfg.formato.toUpperCase()} exportado (${qtd} registros)`);
  }

  const coordenadoresEscopo = useMemo(
    () => pessoas
      .filter(p => p.tipo === "coordenador" && p.escopo === escopo)
      .map(p => ({
        id: p.id,
        nome: p.nome,
        regiao: escopo === "interior" ? (p.cidade || "") : (p.regiao || ""),
      })),
    [pessoas, escopo],
  );

  const regioesExport = useMemo(() => {
    const noEscopo = pessoas.filter(p => p.escopo === escopo);
    if (escopo === "interior") {
      const set = new Set(noEscopo.map(p => p.cidade || "").filter(Boolean));
      return Array.from(set).sort().map(v => ({ value: v, label: v }));
    }
    const set = new Set(noEscopo.map(p => p.regiao || "").filter(Boolean));
    const byValue: Record<string, string> = {};
    for (const r of REGIOES) byValue[r.value] = r.label;
    return Array.from(set).sort().map(v => ({ value: v, label: byValue[v] || v }));
  }, [pessoas, escopo, REGIOES]);

  return (
    <EleicaoActionsContext.Provider value={{ onTogglePermissao: togglePermissaoCadastro, onResendLiderFlow: openResendLiderFlow, onArchive: toggleArchive }}>
    <EleicaoSearchContext.Provider value={searchCtxValue}>
    <div className="container mx-auto p-4 md:p-6 max-w-7xl">

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Eleição</h1>
          <p className="text-sm text-muted-foreground mt-1">Coordenadores, líderes e cabos eleitorais da campanha</p>
        </div>
        <div className="flex items-center gap-2">
          {clientId && <EleicaoContractTemplates clientId={clientId} />}
          {view === "cadastros" && (
            <>
              <Button variant="outline" onClick={() => setExportDialogOpen(true)}>
                <FileDown className="w-4 h-4 mr-2" />Exportar
              </Button>
              {/* consigo exportar um relatorio? */}
              <Button onClick={() => openNew()}><Plus className="w-4 h-4 mr-2" />Novo cadastro</Button>
            </>
          )}
        </div>
      </div>


      <Tabs value={view} onValueChange={(v) => setView(v as any)} className="mb-4">
        <TabsList className="grid h-auto grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 w-full max-w-7xl">
          <TabsTrigger value="cadastros">Cadastros</TabsTrigger>
          <TabsTrigger value="funnel" className="gap-1.5">
            <Handshake className="w-3.5 h-3.5" />
            Funil / Reunião
          </TabsTrigger>
          <TabsTrigger value="reunioes" className="gap-1.5">
            <CalendarDays className="w-3.5 h-3.5" />
            Reuniões
          </TabsTrigger>
          <TabsTrigger value="pendentes" className="gap-1.5">
            Pendentes de valor
            {stats.semValor > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                {stats.semValor}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="indicacoes">Indicações</TabsTrigger>
          <TabsTrigger value="relatorio_contratados" className="gap-1.5">
            <FileText className="w-3.5 h-3.5" />Relatório
          </TabsTrigger>
          <TabsTrigger value="distribuicao" className="gap-1.5">
            <Send className="w-3.5 h-3.5" />
            Distribuição
          </TabsTrigger>
          <TabsTrigger value="dobradinhas" className="gap-1.5">
            <Handshake className="w-3.5 h-3.5" />
            Dobradinhas
          </TabsTrigger>
          <TabsTrigger value="custos">Previsão de custos</TabsTrigger>
          <TabsTrigger value="config">Configurações</TabsTrigger>
        </TabsList>
      </Tabs>

      {view === "reunioes" ? (
        clientId ? <ReunioesPanel clientId={clientId} /> : null
      ) : view === "custos" ? (
        <PrevisaoCustos pessoas={pessoas as any} clientId={clientId || undefined} />
      ) : view === "funnel" ? (
        <FunnelManagement 
          pessoas={pessoas.filter(p => !p.arquivado_em && !p.is_voluntario).map(p => ({
            ...p,
            status_contratacao: Number(p.valor_contratacao || 0) > 0 ? "confirmado" : "pendente",
          })) as any}
          onEdit={openEdit} 
          onOpenExport={(reuniao, semReuniao) => {
            // Aqui poderíamos passar presets para o dialog, mas o dialog já tem o campo de reunião agora.
            setExportDialogOpen(true);
          }}
          onQuickUpdate={async (id, data) => {
            const { error } = await supabase.from("eleicao_pessoas" as any).update(data).eq("id", id);
            if (error) toast.error(error.message);
            else {
              toast.success("Atualizado!");
              load();
            }
          }}
        />
      ) : view === "pendentes" ? (
        clientId ? <PendentesValorPanel clientId={clientId} onChanged={load} /> : null
      ) : view === "indicacoes" ? (
        clientId ? <IndicacoesPanel clientId={clientId} /> : null
      ) : view === "relatorio_contratados" ? (
        clientId ? <ContratadosCumprimentoReport clientId={clientId} /> : null
      ) : view === "distribuicao" ? (
        clientId ? <DistribuicaoContatosTab clientId={clientId} /> : null
      ) : view === "dobradinhas" ? (
        clientId ? <DobradinhasManagerPanel clientId={clientId} pessoas={pessoas as any} onChanged={load} /> : null
      ) : view === "config" ? (
        clientId ? <EleicaoConfigPanel clientId={clientId} /> : null
      ) : (
      <Tabs value={escopo} onValueChange={(v) => { setEscopo(v as Escopo); setRegiaoFilter("all"); }}>
        <TabsList className="grid grid-cols-2 w-full max-w-md mb-4">
          <TabsTrigger value="campo_grande">Coord. Campo Grande</TabsTrigger>
          <TabsTrigger value="interior">Coord. Interior</TabsTrigger>
        </TabsList>

        {/* KPIs com cards visuais */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 mb-4">
          <KpiCard label="Total" value={stats.total} icon={Users} tone="neutral" />
          <KpiCard label="Contratados" value={stats.contratados} icon={UserCheck} tone="blue" />
          <KpiCard label="Sem contrato" value={stats.semContrato} icon={AlertCircle} tone="amber" />
          <KpiCard label="Voluntários" value={stats.voluntarios} icon={Heart} tone="emerald" />
          <KpiCard label="Arquivados" value={stats.arquivados} icon={Trash2} tone="neutral" />
          <KpiCard label="Investimento" value={fmtBRL(stats.valorTotal)} icon={DollarSign} tone="emerald" small />

        </div>

        {/* Toolbar: busca + tipo + status + ordenação + layout */}
        <div className="flex flex-col lg:flex-row gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9 h-9" placeholder="Buscar nome, telefone ou endereço…" value={search} onChange={e => setSearch(e.target.value)} />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={tipoFilter} onValueChange={(v) => setTipoFilter(v as any)}>
              <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os tipos</SelectItem>
                <SelectItem value="coordenador">Coordenadores</SelectItem>
                <SelectItem value="lider">Líderes</SelectItem>
                <SelectItem value="cabo">Cabos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="contratados">✅ Contratados</SelectItem>
                <SelectItem value="sem_contrato">⚠ Sem contrato</SelectItem>
                  <SelectItem value="sem_acesso">🔒 Coord. sem acesso</SelectItem>
                  <SelectItem value="avulsos">⚡ Líderes avulsos</SelectItem>
                  <SelectItem value="voluntarios">❤️ Voluntários</SelectItem>
                  <SelectItem value="arquivados">🗄 Arquivados</SelectItem>
                <SelectItem value="reuniao">👥 Participou da Reunião</SelectItem>
                {/* Item Pré-selecionado removido */}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
              <SelectTrigger className="h-9 w-[130px]"><ArrowUpDown className="w-3.5 h-3.5 mr-1" /><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nome">Nome</SelectItem>
                <SelectItem value="valor">Valor</SelectItem>
                <SelectItem value="tipo">Tipo</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center border border-border rounded-md p-0.5 h-9">
              <button
                onClick={() => setLayoutMode("arvore")}
                className={cn("h-8 px-2.5 rounded text-xs font-medium flex items-center gap-1.5 transition-colors",
                  layoutMode === "arvore" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground")}
                title="Visualização em árvore"
              ><Network className="w-3.5 h-3.5" />Árvore</button>
              <button
                onClick={() => setLayoutMode("lista")}
                className={cn("h-8 px-2.5 rounded text-xs font-medium flex items-center gap-1.5 transition-colors",
                  layoutMode === "lista" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground")}
                title="Visualização em lista"
              ><List className="w-3.5 h-3.5" />Lista</button>
            </div>
          </div>
        </div>

        {(statusFilter !== "todos" || tipoFilter !== "todos" || search) && (
          <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
            <span>Mostrando <strong className="text-foreground">{search ? matchedIds.size : escopoList.length}</strong> resultados</span>
            <button onClick={() => { setStatusFilter("todos"); setTipoFilter("todos"); setSearch(""); }} className="text-primary hover:underline">limpar filtros</button>
          </div>
        )}

        {/* Chips de região (CG) */}
        {escopo === "campo_grande" && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            <button
              onClick={() => setRegiaoFilter("all")}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium border transition-colors",
                regiaoFilter === "all" ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted border-border"
              )}
            >
              Todas <span className="opacity-70 ml-1">{search ? matchedIds.size : escopoList.length}</span>
            </button>
            {(() => {
              const avulsosCount = pessoas.filter(p => p.escopo === escopo && p.tipo === "lider" && !p.parent_id && !p.is_voluntario && (!search || matchedIds.has(p.id))).length;
              const active = statusFilter === "avulsos";
              return (
                <button
                  onClick={() => { setStatusFilter(active ? "todos" : "avulsos"); setRegiaoFilter("all"); }}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-xs font-medium border transition-colors",
                    active ? "bg-amber-500 text-white border-amber-500" : "bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300",
                    avulsosCount === 0 && !active && "opacity-50"
                  )}
                >
                  ⚡ Avulsos <span className="opacity-70 ml-1">{avulsosCount}</span>
                </button>
              );
            })()}
            {(() => {
              const voluntariosCount = pessoas.filter(p => p.escopo === escopo && !!p.is_voluntario && (!search || matchedIds.has(p.id))).length;
              const active = statusFilter === "voluntarios";
              return (
                <button
                  onClick={() => { setStatusFilter(active ? "todos" : "voluntarios"); setRegiaoFilter("all"); }}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-xs font-medium border transition-colors",
                    active ? "bg-emerald-500 text-white border-emerald-500" : "bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300",
                    voluntariosCount === 0 && !active && "opacity-50"
                  )}
                >
                  ❤️ Voluntários <span className="opacity-70 ml-1">{voluntariosCount}</span>
                </button>
              );
            })()}
            {REGIOES.map(r => {

              const count = search
                ? escopoList.filter(p => p.regiao === r.value && matchedIds.has(p.id)).length
                : escopoList.filter(p => p.regiao === r.value).length;
              const active = regiaoFilter === r.value;
              return (
                <button
                  key={r.value}
                  onClick={() => setRegiaoFilter(active ? "all" : r.value)}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-xs font-medium border transition-colors",
                    active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted border-border",
                    count === 0 && !active && "opacity-50"
                  )}
                >
                  {r.label} <span className="opacity-70 ml-1">{count}</span>
                </button>
              );
            })}
          </div>
        )}

        <TabsContent value="campo_grande" className="space-y-2 mt-0">
          {loading ? <p className="text-center text-muted-foreground py-8">Carregando…</p> :
            layoutMode === "lista" ? (
              <ListaPlana
                pessoas={regiaoFilter === "all" ? escopoList : escopoList.filter(p => p.regiao === regiaoFilter)}
                sortBy={sortBy}
                onEdit={openEdit}
                onDelete={remove}
                onCredentials={openCred}
                onSend={sendCredentials}
                sendingId={sendingId}
              />
            ) : (
            cgRegioes.map(r => {
              const list = escopoList.filter(p => p.regiao === r.value);
              if (list.length === 0 && regiaoFilter === "all") return null;
              return (
                <RegionBlock
                  key={r.value}
                  title={r.label}
                  pessoas={list}
                  defaultOpen={regiaoFilter !== "all" || !!search}
                  onAdd={() => openNew({ escopo: "campo_grande", regiao: r.value })}
                  onEdit={openEdit}
                  onDelete={remove}
                  onCredentials={openCred}
                  onSend={sendCredentials}
                  sendingId={sendingId}
                />
              );
            }))
          }
          {!loading && escopoList.length === 0 && (
            <Card className="py-12 text-center text-muted-foreground border-dashed">
              <Crown className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhum cadastro encontrado</p>
              <Button variant="link" onClick={() => openNew({ escopo: "campo_grande" })}>Cadastrar primeiro</Button>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="interior" className="space-y-2 mt-0">
          {loading ? <p className="text-center text-muted-foreground py-8">Carregando…</p> :
            layoutMode === "lista" ? (
              <ListaPlana
                pessoas={escopoList}
                sortBy={sortBy}
                onEdit={openEdit}
                onDelete={remove}
                onCredentials={openCred}
                onSend={sendCredentials}
                sendingId={sendingId}
              />
            ) : interiorCidades.length === 0 ? (
              <Card className="py-12 text-center text-muted-foreground border-dashed">
                <MapPin className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhuma cidade cadastrada ainda</p>
                <Button variant="link" onClick={() => openNew({ escopo: "interior" })}>Cadastrar primeiro coordenador</Button>
              </Card>
            ) : interiorCidades.map(cidade => (
              <RegionBlock
                key={cidade}
                title={cidade}
                pessoas={escopoList.filter(p => p.cidade === cidade)}
                defaultOpen={!!search}
                onAdd={() => openNew({ escopo: "interior", cidade })}
                onEdit={openEdit}
                onDelete={remove}
                onCredentials={openCred}
                onSend={sendCredentials}
                sendingId={sendingId}
                interior
              />
            ))
          }
        </TabsContent>
      </Tabs>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] sm:max-h-[90vh] p-0 gap-0 flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <DialogTitle>{editing ? "Editar cadastro" : "Novo cadastro"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 px-6 py-2 overflow-y-auto flex-1 min-h-0">
            {/* Bloco de tipo e escopo */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo *</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm(f => ({ ...f, tipo: v as Tipo, parent_id: "" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="coordenador">Coordenador</SelectItem>
                    <SelectItem value="lider">Líder</SelectItem>
                    <SelectItem value="cabo">Cabo eleitoral</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Escopo *</Label>
                <Select value={form.escopo} onValueChange={(v) => setForm(f => ({ ...f, escopo: v as Escopo, parent_id: "" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="campo_grande">Campo Grande</SelectItem>
                    <SelectItem value="interior">Interior</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Bloco de Região / Cidade */}
            {form.escopo === "campo_grande" ? (
              <div>
                <Label>Região *</Label>
                <Select value={form.regiao} onValueChange={(v) => setForm(f => ({ ...f, regiao: v as Regiao, parent_id: "" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REGIOES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <Label>Cidade *</Label>
                <Input value={form.cidade} onChange={e => setForm(f => ({ ...f, cidade: e.target.value, parent_id: "" }))} placeholder="Ex: Dourados" />
              </div>
            )}

            {/* Vínculos (Superior) */}
            {form.tipo !== "coordenador" && (
              <div className="space-y-2">
                <div>
                  <Label className="flex justify-between items-center">
                    <span>{form.tipo === "lider" ? "Coordenador Responsável" : "Vinculado a (Líder ou Coordenador)"}</span>
                    {form.tipo === "lider" && (
                      <button 
                        type="button" 
                        onClick={() => setForm(f => ({ ...f, parent_id: "" }))}
                        className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors", 
                          !form.parent_id ? "bg-amber-500 text-white border-amber-600" : "text-muted-foreground hover:bg-muted border-border")}
                      >
                        Avulso
                      </button>
                    )}
                  </Label>
                  <Select value={form.parent_id || "none"} onValueChange={(v) => setForm(f => ({ ...f, parent_id: v === "none" ? "" : v }))}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione o superior..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Sem superior (Avulso) —</SelectItem>
                      {(() => {
                        // Lógica de filtro para parent_id
                        const escopoValue = form.escopo === "interior" ? form.cidade : form.regiao;
                        const potential = pessoas.filter(p => {
                          if (p.id === editing?.id) return false;
                          const pEscopo = p.escopo === "interior" ? p.cidade : p.regiao;
                          if (pEscopo !== escopoValue) return false;
                          
                          if (form.tipo === "lider") {
                            // Líderes vinculam-se apenas a Coordenadores
                            return p.tipo === "coordenador";
                          } else if (form.tipo === "cabo") {
                            // Cabos vinculam-se a Líderes ou Coordenadores
                            return p.tipo === "lider" || p.tipo === "coordenador";
                          }
                          return false;
                        });

                        if (potential.length === 0) return <SelectItem value="no-options" disabled>Nenhum superior disponível nesta localidade</SelectItem>;

                        return potential.sort((a,b) => a.nome.localeCompare(b.nome)).map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            <span className="flex items-center gap-2">
                              <Badge variant="outline" className={cn("text-[9px] h-4 px-1 leading-none uppercase", TIPO_META[p.tipo].color)}>
                                {TIPO_META[p.tipo].label.split(" ")[0]}
                              </Badge>
                              {p.nome}
                            </span>
                          </SelectItem>
                        ));
                      })()}
                    </SelectContent>
                  </Select>
                  {!form.parent_id && (
                    <p className="text-[10px] text-muted-foreground italic mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Este {TIPO_META[form.tipo].label} será cadastrado como Avulso (sem superior).
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Status e Reunião */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="rounded-md border border-border bg-muted/20 p-2 flex items-center gap-2">
                <Handshake className="w-4 h-4 text-blue-600" />
                <div>
                  <p className="text-[11px] font-medium">Situação automática</p>
                  <p className="text-[9px] text-muted-foreground">Ao definir o valor, passa para Contratados.</p>
                </div>
              </div>

              <label className="flex items-center gap-2 p-2 rounded-md border border-border bg-muted/20 cursor-pointer hover:bg-muted/30 transition-colors">
                <Checkbox
                  checked={form.participou_reuniao}
                  onCheckedChange={(c) => setForm(f => ({ ...f, participou_reuniao: !!c }))}
                />
                <div className="flex flex-col">
                  <span className="text-[11px] font-medium flex items-center gap-1">
                    <Users className="w-3 h-3 text-blue-500" /> Na Reunião
                  </span>
                  <p className="text-[9px] text-muted-foreground">Marcar presença física</p>
                </div>
              </label>
            </div>

            <div>
              <Label>Nome *</Label>
              <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
            </div>
            <div>
              <Label>Telefone *</Label>
              <Input value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} placeholder="(67) 99999-0000" />
            </div>
            {editing && (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
                <Label htmlFor="edit-valor-contratacao" className="flex items-center gap-1.5">
                  <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
                  Valor da contratação
                </Label>
                <div className="relative mt-1.5">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                  <Input
                    id="edit-valor-contratacao"
                    className="pl-10"
                    value={form.valor_contratacao}
                    onChange={e => {
                      const valor = e.target.value.replace(/[^\d,.]/g, "");
                      const numero = parseValorContratacao(valor);
                      setForm(f => ({
                        ...f,
                        valor_contratacao: valor,
                        status_contratacao: numero > 0 ? "confirmado" : "pendente",
                      }));
                    }}
                    placeholder="0,00"
                    inputMode="decimal"
                  />
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Use 0 ou deixe vazio para voltar a “Sem contrato”. A aba Pendentes de valor continuará disponível.
                </p>
              </div>
            )}
            {form.tipo === "coordenador" && (
              <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>E-mail de acesso</Label>
                    <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="coordenador@email.com" />
                  </div>
                  {!editing && <div>
                    <div className="flex items-center justify-between gap-2">
                      <Label>Senha</Label>
                      <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setForm(f => ({ ...f, password: genLocalPassword() }))}>
                        Gerar
                      </Button>
                    </div>
                    <Input value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Mínimo 6 caracteres" />
                  </div>}
                </div>
                {!editing && (
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Checkbox checked={form.send_access} onCheckedChange={(checked) => setForm(f => ({ ...f, send_access: !!checked }))} />
                    Enviar acesso no WhatsApp ao cadastrar
                  </label>
                )}
              </div>
            )}
            <div className="grid grid-cols-[1fr_100px] gap-2">
              <div>
                <Label>Rua</Label>
                <Input value={form.rua} onChange={e => setForm(f => ({ ...f, rua: e.target.value }))} placeholder="Av. Afonso Pena (opcional)" />
              </div>
              <div>
                <Label>Nº</Label>
                <Input value={form.numero} onChange={e => setForm(f => ({ ...f, numero: e.target.value }))} placeholder="1234" />
              </div>
            </div>
            <div>
              <Label>Bairro *</Label>
              <Input value={form.bairro} onChange={e => setForm(f => ({ ...f, bairro: e.target.value }))} placeholder="Centro" />
            </div>

            <div className="rounded-md border p-3 space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Documentos (usados no contrato e distrato)
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>CPF</Label>
                  <Input
                    value={formatCPF(form.cpf)}
                    onChange={e => setForm(f => ({ ...f, cpf: onlyDigits(e.target.value).slice(0, 11) }))}
                    placeholder="000.000.000-00"
                    inputMode="numeric"
                    maxLength={14}
                  />
                </div>
                <div>
                  <Label>CEP</Label>
                  <Input
                    value={formatCEP(form.cep)}
                    onChange={e => setForm(f => ({ ...f, cep: onlyDigits(e.target.value).slice(0, 8) }))}
                    placeholder="79000-000"
                    inputMode="numeric"
                    maxLength={9}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>RG</Label>
                  <Input value={form.rg} onChange={e => setForm(f => ({ ...f, rg: e.target.value }))} placeholder="0000000" maxLength={30} />
                </div>
                <div>
                  <Label>Órgão expedidor</Label>
                  <Input
                    value={form.rg_orgao_expedidor}
                    onChange={e => setForm(f => ({ ...f, rg_orgao_expedidor: e.target.value }))}
                    placeholder="SEJUSP/MS"
                    maxLength={30}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Vigência, dados bancários e a data do contrato ficam em branco no documento para preencher à mão.
              </p>
            </div>




            {(() => {
              const isRaiz = form.tipo === "coordenador" || (form.tipo === "lider" && form.liderAvulso);
              if (!isRaiz) {
                // Mostra dobradinha herdada da raiz (sobe a árvore)
                if (!form.parent_id) return null;
                let parent = pessoas.find(p => p.id === form.parent_id);
                while (parent && parent.parent_id) {
                  parent = pessoas.find(p => p.id === parent!.parent_id);
                }
                if (!parent) return null;
                const parc = PARCEIROS.find(p => p.id === parent!.parceiro_id);
                return (
                  <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
                    <div className="flex items-center gap-1.5 font-medium text-muted-foreground">
                      <Handshake className="w-3.5 h-3.5" />
                      Dobradinha herdada do time de <strong className="text-foreground">{parent.nome}</strong>
                    </div>
                    {parc ? (
                      <div className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: parc.cor }} />
                        <span className="font-medium">{parc.nome}</span>
                        <span className="text-muted-foreground">
                          · {parent.rateio_estadual ?? 100}% estadual / {parent.rateio_parceiro ?? 0}% federal
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground italic">Sem dobradinha (100% estadual)</span>
                    )}
                    <p className="text-[10px] text-muted-foreground/70">
                      Para alterar, edite a dobradinha do coordenador na aba "Dobradinhas".
                    </p>
                  </div>
                );
              }
              return PARCEIROS.length > 0 && (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Handshake className="w-4 h-4 text-primary" />
                  Dobradinha (opcional)
                </div>
                <div>
                  <Label className="text-xs">Candidato federal parceiro</Label>
                  <Select
                    value={form.parceiro_id || "none"}
                    onValueChange={(v) => setForm(f => ({
                      ...f,
                      parceiro_id: v === "none" ? "" : v,
                      rateio_estadual: v === "none" ? 100 : (f.rateio_parceiro > 0 ? f.rateio_estadual : 50),
                      rateio_parceiro: v === "none" ? 0 : (f.rateio_parceiro > 0 ? f.rateio_parceiro : 50),
                    }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Sem dobradinha — só estadual" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Sem dobradinha (100% estadual) —</SelectItem>
                      {PARCEIROS.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          <span className="inline-flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.cor }} />
                            {p.nome}{p.partido ? ` (${p.partido})` : ""}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {form.parceiro_id && (
                  <div className="space-y-2">
                    <Label className="text-xs">Quem paga os custos?</Label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {[
                        { e: 100, p: 0, label: "100% Estadual" },
                        { e: 70, p: 30, label: "70 / 30" },
                        { e: 50, p: 50, label: "50 / 50" },
                        { e: 0, p: 100, label: "100% Federal" },
                      ].map(opt => {
                        const active = form.rateio_estadual === opt.e && form.rateio_parceiro === opt.p;
                        return (
                          <Button
                            key={opt.label}
                            type="button"
                            size="sm"
                            variant={active ? "default" : "outline"}
                            className="text-xs h-8"
                            onClick={() => setForm(f => ({ ...f, rateio_estadual: opt.e, rateio_parceiro: opt.p }))}
                          >
                            {opt.label}
                          </Button>
                        );
                      })}
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div>
                        <Label className="text-[10px] uppercase text-muted-foreground">Estadual paga (%)</Label>
                        <Input
                          type="number" min={0} max={100}
                          value={form.rateio_estadual}
                          onChange={(e) => {
                            const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                            setForm(f => ({ ...f, rateio_estadual: v, rateio_parceiro: 100 - v }));
                          }}
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] uppercase text-muted-foreground">Federal paga (%)</Label>
                        <Input
                          type="number" min={0} max={100}
                          value={form.rateio_parceiro}
                          onChange={(e) => {
                            const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                            setForm(f => ({ ...f, rateio_parceiro: v, rateio_estadual: 100 - v }));
                          }}
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      A soma sempre é 100%. Ao definir um lado, o outro ajusta automaticamente.
                    </p>
                  </div>
                )}
              </div>
              );
            })()}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Início do contrato</Label>
                <Input
                  type="date"
                  value={form.vigencia_inicio}
                  onChange={e => setForm(f => ({ ...f, vigencia_inicio: e.target.value }))}
                />
              </div>
              <div>
                <Label>Término do contrato</Label>
                <Input
                  type="date"
                  value={form.vigencia_fim}
                  onChange={e => setForm(f => ({ ...f, vigencia_fim: e.target.value }))}
                />
              </div>
              <p className="col-span-2 text-[11px] text-muted-foreground -mt-1">
                Usado na Cláusula Segunda do contrato. Se ficar vazio, sai em branco para preencher à mão.
              </p>
            </div>

            <div>
              <Label>Observações</Label>
              <Textarea rows={2} value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
            </div>

          </div>
          <DialogFooter className="px-6 py-4 border-t shrink-0">
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={save}>{editing ? "Salvar" : "Cadastrar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog credenciais */}
      <Dialog open={credOpen} onOpenChange={setCredOpen}>
        <DialogContent className="max-w-sm w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <DialogHeader><DialogTitle>Acesso ao portal — {credPessoa?.nome}</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Defina email e senha para salvar o acesso e enviar pelo WhatsApp conectado.</p>
          <div className="space-y-3 mt-2">
            <div><Label>E-mail *</Label><Input type="email" value={credEmail} onChange={e => setCredEmail(e.target.value)} placeholder="coordenador@email.com" /></div>
            <div><Label>Senha *</Label><Input value={credPassword} onChange={e => setCredPassword(e.target.value)} placeholder="Mínimo 6 caracteres" /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCredOpen(false)}>Cancelar</Button>
            <Button onClick={saveCred} disabled={credLoading}>{credLoading ? "Enviando…" : "Salvar e enviar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog resultado de credenciais geradas */}
      <Dialog open={!!credResult} onOpenChange={(o) => !o && setCredResult(null)}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {credResult?.sent ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <Copy className="w-5 h-5 text-primary" />}
              {credResult?.sent ? "Acesso enviado!" : "Acesso gerado"}
            </DialogTitle>
          </DialogHeader>
          {credResult && (
            <div className="space-y-3">
              {credResult.warning && (
                <div className="text-xs bg-amber-500/10 text-amber-700 dark:text-amber-400 p-2 rounded border border-amber-500/30">
                  ⚠️ {credResult.warning}
                </div>
              )}
              {credResult.sent && (
                <div className="text-xs bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 p-2 rounded border border-emerald-500/30">
                  ✓ Mensagem enviada para <strong>{credResult.pessoa.telefone}</strong>
                </div>
              )}
              <div className="space-y-2 text-sm bg-muted/40 p-3 rounded font-mono">
                <div className="flex flex-col gap-0.5">
                  <span className="text-muted-foreground text-xs">Portal:</span>
                  <span className="break-all text-xs">{credResult.portal_url}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-muted-foreground text-xs">E-mail:</span>
                  <span className="break-all text-xs">{credResult.email}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-muted-foreground text-xs">Senha:</span>
                  {credResult.password ? (
                    <span className="font-bold break-all">{credResult.password}</span>
                  ) : (
                    <span className="text-xs italic text-muted-foreground">Senha atual mantida (não foi alterada)</span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { navigator.clipboard.writeText(credResult.message); toast.success("Mensagem copiada"); }}>
                  <Copy className="w-4 h-4 mr-2" />Copiar
                </Button>
                {!credResult.sent && (
                  <Button className="flex-1" disabled={sendingId === credResult.pessoa.id} onClick={() => sendCredentials(credResult.pessoa, "whatsapp")}>
                    <Send className="w-4 h-4 mr-2" />{sendingId === credResult.pessoa.id ? "Enviando..." : "Enviar via WhatsApp"}
                  </Button>
                )}
              </div>
              {credResult.password && (
                <p className="text-[11px] text-muted-foreground">Salve esta senha — ela só aparece aqui neste momento.</p>
              )}

            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setCredResult(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NotifyProgressDialog
        open={notifyOpen}
        pessoaId={notifyPessoaId}
        skipSteps={notifySkip}
        onClose={() => { setNotifyOpen(false); setNotifyPessoaId(null); setNotifySkip([]); }}
      />

      <DobradinhaPropagarDialog
        open={!!propagarRaiz}
        raizNome={propagarRaiz?.raiz.nome || ""}
        raizId={propagarRaiz?.raiz.id || null}
        parceiro={
          propagarRaiz?.parceiroId
            ? (PARCEIROS.find(p => p.id === propagarRaiz.parceiroId) || null)
            : null
        }
        rateioEstadual={propagarRaiz?.rateioEstadual || 100}
        rateioParceiro={propagarRaiz?.rateioParceiro || 0}
        pessoas={pessoas as any}
        loading={propagandoLoading}
        onCancel={() => setPropagarRaiz(null)}
        onChoose={async (propagar) => {
          if (!propagarRaiz) return;
          setPropagandoLoading(true);
          const { data, error } = await supabase.rpc("eleicao_aplicar_dobradinha_raiz" as any, {
            _raiz_id: propagarRaiz.raiz.id,
            _parceiro_id: propagarRaiz.parceiroId,
            _rateio_estadual: propagarRaiz.rateioEstadual,
            _rateio_parceiro: propagarRaiz.rateioParceiro,
            _propagar: propagar,
          });
          setPropagandoLoading(false);
          if (error) {
            toast.error(error.message);
            return;
          }
          toast.success(`${data} pessoa(s) atualizada(s).`);
          setPropagarRaiz(null);
          load();
        }}
      />

      <PosCadastroEnvioDialog
        open={posCadastroOpen}
        onOpenChange={(o) => { setPosCadastroOpen(o); if (!o) setPosCadastroPessoa(null); }}
        pessoa={posCadastroPessoa as any}
        showInstanceOption={posCadastroPessoa?.tipo === "lider"}
        onTriggerInstanceFlow={(p) => {
          const isAvulso = !p.parent_id;
          setNotifySkip(isAvulso ? ["coordenador", "secretaria"] : []);
          setNotifyPessoaId(p.id);
          setNotifyOpen(true);
        }}
      />

      <ExportEleicaoDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        coordenadores={coordenadoresEscopo}
        regioes={regioesExport}
        escopoTipo={escopo === "interior" ? "cidade" : "regiao"}
        parceiros={PARCEIROS.map(p => ({ id: p.id, nome: p.nome, cor: p.cor, cargo: p.cargo }))}
        onExport={handleExport}
      />
    </div>
    </EleicaoSearchContext.Provider>
    </EleicaoActionsContext.Provider>
  );
}

function RegionBlock({
  title, pessoas, onAdd, onEdit, onDelete, onCredentials, onSend, sendingId, interior, defaultOpen,
}: {
  title: string;
  pessoas: Pessoa[];
  onAdd: () => void;
  onEdit: (p: Pessoa) => void;
  onCredentials: (p: Pessoa) => void;
  onSend: (p: Pessoa, channel: "whatsapp" | "link_only") => void;
  sendingId: string | null;
  onDelete: (id: string) => void;
  interior?: boolean;
  defaultOpen?: boolean;
}) {
  const coords = pessoas.filter(p => p.tipo === "coordenador");
  const lideres = pessoas.filter(p => p.tipo === "lider");
  const cabos = pessoas.filter(p => p.tipo === "cabo");
  const lideresOrfaos = lideres.filter(p => !p.parent_id);
  const cabosOrfaos = cabos.filter(p => !p.parent_id);
  const hasContent = pessoas.length > 0;
  const [open, setOpen] = useState(defaultOpen ?? hasContent);

  const valorTotal = pessoas.reduce((s, p) => s + (p.valor_contratacao || 0), 0);
  const semValor = pessoas.filter(p => !p.valor_contratacao || p.valor_contratacao === 0).length;

  return (
    <Card className="overflow-hidden border-border/60 shadow-sm">
      <div
        onClick={() => hasContent && setOpen(o => !o)}
        className={cn(
          "flex items-center gap-2 px-3 py-2.5 group bg-gradient-to-r from-muted/30 to-transparent",
          hasContent && "cursor-pointer hover:from-muted/50"
        )}
      >
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform shrink-0", !open && "-rotate-90", !hasContent && "opacity-30")} />
        <div className="w-7 h-7 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <MapPin className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate leading-tight">{title}</p>
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {pessoas.length > 0 ? `${pessoas.length} pessoa(s) · ${fmtBRL(valorTotal)}` : "vazio"}
            {semValor > 0 && <span className="ml-1 text-amber-600">· {semValor} sem valor</span>}
          </p>
        </div>
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
          {coords.length > 0 && <span className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-600 font-medium" title="Coordenadores">{coords.length}<span className="hidden sm:inline">c</span></span>}
          {lideres.length > 0 && <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 font-medium" title="Líderes">{lideres.length}<span className="hidden sm:inline">l</span></span>}
          {cabos.length > 0 && <span className="px-1.5 py-0.5 rounded bg-green-500/10 text-green-600 font-medium" title="Cabos">{cabos.length}<span className="hidden sm:inline">cb</span></span>}
        </div>
        {hasContent && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[11px] gap-1 hidden md:inline-flex"
            onClick={(e) => { e.stopPropagation(); gerarContratosLote(pessoas, pessoas[0].client_id, `Contratos - ${title}`); }}
            title={`Gerar contratos de ${title}`}
          >
            <Package className="w-3 h-3" />
            <span className="hidden lg:inline">Contratos</span>
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={(e) => { e.stopPropagation(); onAdd(); }} title="Adicionar nesta área">
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>

      {open && hasContent && (
        <div className="border-t bg-muted/20">
          {coords.map(c => (
            <CoordBlock key={c.id} coord={c} all={pessoas} onEdit={onEdit} onDelete={onDelete} onCredentials={onCredentials} onSend={onSend} sendingId={sendingId} interior={interior} />
          ))}
          {lideresOrfaos.length > 0 && (
            <div className="px-3 py-2 border-t border-dashed bg-amber-500/5">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <Star className="w-3 h-3 text-amber-600 shrink-0" />
                  <p className="text-[10px] uppercase tracking-wide font-semibold text-amber-700 dark:text-amber-400 truncate">
                    Líderes avulsos (sem coordenador) · {lideresOrfaos.length}
                    {(() => {
                      const tot = lideresOrfaos.reduce((s, p) => s + (p.valor_contratacao || 0), 0);
                      const sv = lideresOrfaos.filter(p => !p.valor_contratacao || p.valor_contratacao === 0).length;
                      return <span className="font-normal text-muted-foreground normal-case ml-1">· {fmtBRL(tot)}{sv > 0 ? ` · ${sv} sem valor` : ""}</span>;
                    })()}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[10px] gap-1 shrink-0"
                  onClick={(e) => { e.stopPropagation(); gerarContratosLote(lideresOrfaos, lideresOrfaos[0].client_id, `Líderes avulsos - ${title}`); }}
                  title="Gerar contratos só dos líderes avulsos desta região"
                >
                  <Package className="w-3 h-3" />Contratos avulsos
                </Button>
              </div>
              {lideresOrfaos.map(l => <PessoaRow key={l.id} p={l} onEdit={onEdit} onDelete={onDelete} onCredentials={onCredentials} onSend={onSend} sendingId={sendingId} />)}
            </div>
          )}
          {cabosOrfaos.length > 0 && (
            <div className="px-3 py-2 border-t border-dashed">
              <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1">Cabos sem líder</p>
              {cabosOrfaos.map(c => <PessoaRow key={c.id} p={c} onEdit={onEdit} onDelete={onDelete} onCredentials={onCredentials} onSend={onSend} sendingId={sendingId} />)}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function CoordBlock({ coord, all, onEdit, onDelete, onCredentials, onSend, sendingId, interior }: {
  coord: Pessoa; all: Pessoa[]; onEdit: (p: Pessoa) => void; onDelete: (id: string) => void; onCredentials: (p: Pessoa) => void;
  onSend: (p: Pessoa, channel: "whatsapp" | "link_only") => void; sendingId: string | null; interior?: boolean;
}) {
  const lideres = all.filter(p => p.tipo === "lider" && p.parent_id === coord.id);
  const cabosDir = all.filter(p => p.tipo === "cabo" && p.parent_id === coord.id);
  const cabosLid = lideres.flatMap(l => all.filter(p => p.tipo === "cabo" && p.parent_id === l.id));
  const totalEquipe = lideres.length + cabosDir.length + cabosLid.length;
  const hasTeam = totalEquipe > 0;
  const allDoTime = [coord, ...lideres, ...cabosDir, ...cabosLid];

  const { searchActive, matchedIds } = React.useContext(EleicaoSearchContext);
  // Conta matches dentro da equipe (excluindo o próprio coord para destacar "achou alguém aqui dentro").
  const matchesNaEquipe = useMemo(() => {
    if (!searchActive) return 0;
    return [...lideres, ...cabosDir, ...cabosLid].filter(p => matchedIds.has(p.id)).length;
  }, [searchActive, matchedIds, lideres, cabosDir, cabosLid]);
  const autoExpand = searchActive && (matchedIds.has(coord.id) || matchesNaEquipe > 0);
  const [userToggled, setUserToggled] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // Quando a busca muda e há matches dentro, abre. Quando a busca some, volta a fechar (a não ser que o usuário tenha aberto manualmente).
  React.useEffect(() => {
    if (autoExpand) {
      setExpanded(true);
      setUserToggled(false);
    } else if (!userToggled) {
      setExpanded(false);
    }
  }, [autoExpand, userToggled]);

  return (
    <div className="border-b last:border-b-0">
      <PessoaRow
        p={coord}
        onEdit={onEdit}
        onDelete={onDelete}
        onCredentials={onCredentials}
        onSend={onSend}
        sendingId={sendingId}
        teamCount={hasTeam ? totalEquipe : undefined}
        matchInTeam={matchesNaEquipe}
        expanded={expanded}
        onToggle={hasTeam ? () => { setUserToggled(true); setExpanded(e => !e); } : undefined}
        bulkAction={hasTeam ? {
          label: "Contratos da equipe",
          onClick: () => {
            const local = coord.cidade || (coord.regiao ? (coord.regiao.charAt(0).toUpperCase() + coord.regiao.slice(1)) : "");
            const zipName = local
              ? `Coordenador ${coord.nome} - ${local}`
              : `Coordenador ${coord.nome}`;
            gerarContratosLote(allDoTime, coord.client_id, zipName);
          },
        } : undefined}
      />
      {expanded && hasTeam && (
        <div className="bg-muted/10 pb-1">
          {lideres.map(l => (
            <LiderBlock
              key={l.id}
              lider={l}
              all={all}
              onEdit={onEdit}
              onDelete={onDelete}
              onCredentials={onCredentials}
              onSend={onSend}
              sendingId={sendingId}
            />
          ))}
          {interior && cabosDir.map(cb => <PessoaRow key={cb.id} p={cb} onEdit={onEdit} onDelete={onDelete} onCredentials={onCredentials} onSend={onSend} sendingId={sendingId} indent={1} />)}
        </div>
      )}
    </div>
  );
}

function LiderBlock({ lider, all, onEdit, onDelete, onCredentials, onSend, sendingId }: {
  lider: Pessoa; all: Pessoa[]; onEdit: (p: Pessoa) => void; onDelete: (id: string) => void; onCredentials: (p: Pessoa) => void;
  onSend: (p: Pessoa, channel: "whatsapp" | "link_only") => void; sendingId: string | null;
}) {
  const cabos = all.filter(p => p.tipo === "cabo" && p.parent_id === lider.id);
  const hasCabos = cabos.length > 0;
  const { searchActive, matchedIds } = React.useContext(EleicaoSearchContext);
  const matchesNaEquipe = useMemo(
    () => (searchActive ? cabos.filter(c => matchedIds.has(c.id)).length : 0),
    [searchActive, matchedIds, cabos],
  );
  const [open, setOpen] = useState(true);
  React.useEffect(() => {
    if (searchActive && (matchedIds.has(lider.id) || matchesNaEquipe > 0)) setOpen(true);
  }, [searchActive, matchedIds, lider.id, matchesNaEquipe]);

  return (
    <div className="border-t border-border/40">
      <PessoaRow
        p={lider}
        onEdit={onEdit}
        onDelete={onDelete}
        onCredentials={onCredentials}
        onSend={onSend}
        sendingId={sendingId}
        indent={1}
        teamCount={hasCabos ? cabos.length : undefined}
        matchInTeam={matchesNaEquipe}
        expanded={open}
        onToggle={hasCabos ? () => setOpen(o => !o) : undefined}
      />
      {open && cabos.map(cb => (
        <PessoaRow key={cb.id} p={cb} onEdit={onEdit} onDelete={onDelete} onCredentials={onCredentials} onSend={onSend} sendingId={sendingId} indent={2} />
      ))}
    </div>
  );
}

function FavoritoToggle({ pessoa }: { pessoa: Pessoa }) {
  const [busy, setBusy] = useState(false);
  const isFav = !!pessoa.is_favorito_regiao;
  const regiaoLabel = pessoa.regiao || "";

  async function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (busy) return;
    if (isFav) {
      if (!confirm(`Remover ${pessoa.nome} como coordenador favorito da região ${regiaoLabel}?\n\nSem favorito, novos líderes notificarão o coordenador mais antigo da região.`)) return;
    } else {
      if (!confirm(`Definir ${pessoa.nome} como coordenador favorito da região ${regiaoLabel}?\n\nEle passará a receber as notificações de novos líderes cadastrados nesta região (substituindo o atual favorito, se houver).`)) return;
    }
    setBusy(true);
    try {
      if (isFav) {
        const { error } = await supabase
          .from("eleicao_pessoas" as any)
          .update({ is_favorito_regiao: false })
          .eq("id", pessoa.id);
        if (error) throw error;
        toast.success("Favorito removido");
      } else {
        // Desmarca os outros favoritos da mesma região e marca este (em duas etapas — o índice único garante consistência).
        const { error: e1 } = await supabase
          .from("eleicao_pessoas" as any)
          .update({ is_favorito_regiao: false })
          .eq("client_id", pessoa.client_id)
          .eq("tipo", "coordenador")
          .eq("escopo", pessoa.escopo)
          .eq("regiao", pessoa.regiao as any)
          .eq("is_favorito_regiao", true);
        if (e1) throw e1;
        const { error: e2 } = await supabase
          .from("eleicao_pessoas" as any)
          .update({ is_favorito_regiao: true })
          .eq("id", pessoa.id);
        if (e2) throw e2;
        toast.success(`${pessoa.nome} é o novo favorito de ${regiaoLabel}`);
      }
      window.dispatchEvent(new Event("eleicao:reload-pessoas"));
    } catch (err: any) {
      toast.error("Falha ao atualizar favorito: " + (err?.message || "erro desconhecido"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className={cn(
        "shrink-0 inline-flex items-center justify-center rounded p-0.5 transition-colors",
        isFav ? "text-amber-500 hover:text-amber-600" : "text-muted-foreground/40 hover:text-amber-500",
        busy && "opacity-50 cursor-wait",
      )}
      title={isFav
        ? `Favorito da região ${regiaoLabel} — recebe notificações de novos líderes. Clique para remover.`
        : `Definir como favorito da região ${regiaoLabel} (recebe notificações de novos líderes).`}
      aria-label={isFav ? "Remover como favorito da região" : "Definir como favorito da região"}
    >
      <Star className={cn("w-3.5 h-3.5", isFav && "fill-current")} />
    </button>
  );
}

function PessoaRow({ p, onEdit, onDelete, onCredentials, onSend, sendingId, indent = 0, teamCount, expanded, onToggle, bulkAction, matchInTeam }: {
  p: Pessoa;
  onEdit: (p: Pessoa) => void;
  onDelete: (id: string) => void;
  onCredentials: (p: Pessoa) => void;
  onSend?: (p: Pessoa, channel: "whatsapp" | "link_only") => void;
  sendingId?: string | null;
  indent?: number;
  teamCount?: number;
  expanded?: boolean;
  onToggle?: () => void;
  bulkAction?: { label: string; onClick: () => void };
  matchInTeam?: number;
}) {
  const actions = React.useContext(EleicaoActionsContext);
  const onTogglePermissao = actions?.onTogglePermissao;
  const onResendLiderFlow = actions?.onResendLiderFlow;
  const onArchive = actions?.onArchive;
  const { searchActive, matchedIds, nameById, tipoById } = React.useContext(EleicaoSearchContext);
  const isMatch = searchActive && matchedIds.has(p.id);
  const parentName = p.parent_id ? nameById.get(p.parent_id) : null;
  const parentTipo = p.parent_id ? tipoById.get(p.parent_id) : null;


  const isSending = sendingId === p.id;
  const meta = TIPO_META[p.tipo];
  const Icon = meta.icon;
  const wa = waLink(p.telefone);
  const semValor = !p.valor_contratacao || p.valor_contratacao === 0;
  const situacao = getEleicaoSituacao(p);
  const tipoBg: Record<Tipo, string> = {
    coordenador: "bg-red-500 text-white",
    lider: "bg-blue-500 text-white",
    cabo: "bg-green-500 text-white",
  };

  return (
    <div
      className={cn(
        "group relative flex items-center gap-2.5 px-3 py-2 hover:bg-muted/40 transition-colors border-l-2 border-transparent",
        onToggle && "cursor-pointer",
        indent === 0 && "py-2.5 hover:border-l-primary/50",
        indent === 1 && "hover:border-l-blue-500/50",
        indent === 2 && "hover:border-l-green-500/50",
        isMatch && "bg-yellow-100/60 dark:bg-yellow-500/10 border-l-yellow-400",
      )}
      style={{ paddingLeft: `${10 + indent * 22}px` }}
      onClick={onToggle}
    >
      {onToggle ? (
        <ChevronRight className={cn("w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform", expanded && "rotate-90")} />
      ) : indent > 0 ? (
        <div className="w-3.5 shrink-0 text-muted-foreground/30 text-xs font-mono leading-none">└</div>
      ) : (
        <div className="w-3.5 shrink-0" />
      )}

      {/* Avatar com iniciais + ícone tipo */}
      <div className="relative shrink-0">
        <div className={cn(
          "rounded-full flex items-center justify-center font-bold tabular-nums shadow-sm",
          indent === 0 ? "w-9 h-9 text-xs" : "w-7 h-7 text-[10px]",
          tipoBg[p.tipo],
        )}>
          {initials(p.nome)}
        </div>
        <div className={cn(
          "absolute -bottom-0.5 -right-0.5 rounded-full bg-background border-2 border-background flex items-center justify-center",
          indent === 0 ? "w-4 h-4" : "w-3.5 h-3.5",
        )}>
          <Icon className={cn("text-muted-foreground", indent === 0 ? "w-2.5 h-2.5" : "w-2 h-2")} />
        </div>
      </div>

      {/* Nome + dados */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={cn("text-sm truncate", indent === 0 ? "font-semibold" : "font-medium")}>{p.nome}</span>
          {/* Badge de pré-selecionado removida conforme plano */}
          {p.participou_reuniao && <Badge variant="outline" className="h-5 bg-blue-500/10 text-blue-600 border-blue-500/20 text-[9px] gap-1 px-1"><Users className="w-2.5 h-2.5" /> Reunião</Badge>}
          <Badge variant="outline" className={cn("h-4 px-1 text-[9px] shrink-0",
            situacao === "contratado" && "border-blue-500/30 text-blue-700 bg-blue-500/10",
            situacao === "sem_contrato" && "border-amber-500/30 text-amber-700 bg-amber-500/10",
            situacao === "voluntario" && "border-emerald-500/30 text-emerald-700 bg-emerald-500/10",
            situacao === "arquivado" && "border-slate-500/30 text-slate-600 bg-slate-500/10",
          )}>{situacao === "sem_contrato" ? "Sem contrato" : situacao === "voluntario" ? "Voluntário" : situacao === "arquivado" ? "Arquivado" : "Contratado"}</Badge>
          {p.tipo === "coordenador" && p.escopo === "campo_grande" && p.regiao && (
            <FavoritoToggle pessoa={p} />
          )}
          {p.tipo === "coordenador" && p.user_id && (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-label="Acesso configurado" />
          )}
          {p.tipo === "coordenador" && p.pode_cadastrar_lider === false && (
            <Badge variant="outline" className="h-4 px-1 text-[9px] border-amber-500/40 text-amber-700 bg-amber-500/10 shrink-0 gap-0.5" title="Bloqueado para cadastrar líderes">
              🔒 Líderes
            </Badge>
          )}
          {p.tipo === "coordenador" && p.pode_cadastrar_cabo === false && (
            <Badge variant="outline" className="h-4 px-1 text-[9px] border-amber-500/40 text-amber-700 bg-amber-500/10 shrink-0 gap-0.5" title="Bloqueado para cadastrar cabos">
              🔒 Cabos
            </Badge>
          )}
          {situacao === "sem_contrato" ? (
            <Badge variant="outline" className="h-4 px-1 text-[9px] border-amber-500/40 text-amber-600 bg-amber-500/10 shrink-0 gap-0.5">
              <AlertCircle className="w-2.5 h-2.5" />sem valor
            </Badge>
          ) : situacao === "contratado" ? (
            <span className="text-[10px] font-bold tabular-nums text-emerald-700 bg-emerald-500/10 px-1.5 py-0.5 rounded shrink-0">
              {fmtBRL(p.valor_contratacao)}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
          {p.telefone && (
            <a
              href={wa}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 hover:text-emerald-600 transition-colors"
              title="Abrir no WhatsApp"
            >
              <MessageCircle className="w-3 h-3" />
              <span className="tabular-nums">{fmtPhone(p.telefone)}</span>
            </a>
          )}
          {p.endereco && (
            <span className="truncate hidden md:inline">· <MapPin className="w-2.5 h-2.5 inline mr-0.5" />{p.endereco}</span>
          )}
        </div>
        {parentName && (p.tipo === "lider" || p.tipo === "cabo") && (
          <div className="text-[10.5px] text-muted-foreground/90 mt-0.5 italic truncate">
            ↳ Vinculado a {parentTipo === "coordenador" ? "coordenador" : "líder"} <span className="font-medium text-foreground/80 not-italic">{parentName}</span>
          </div>
        )}
      </div>

      {teamCount !== undefined && (
        <Badge variant="secondary" className="text-[10px] h-5 px-1.5 shrink-0 gap-0.5">
          <Users className="w-2.5 h-2.5" />{teamCount}
        </Badge>
      )}
      {matchInTeam !== undefined && matchInTeam > 0 && (
        <Badge className="text-[10px] h-5 px-1.5 shrink-0 gap-0.5 bg-yellow-400 text-yellow-950 hover:bg-yellow-400">
          <Search className="w-2.5 h-2.5" />{matchInTeam} na equipe
        </Badge>
      )}
      {bulkAction && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[11px] gap-1 shrink-0 hidden md:inline-flex"
          onClick={(e) => { e.stopPropagation(); bulkAction.onClick(); }}
          title={bulkAction.label}
        >
          <Package className="w-3 h-3" />
          <span className="hidden lg:inline">{bulkAction.label}</span>
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0 opacity-50 group-hover:opacity-100 focus:opacity-100">
            <MoreHorizontal className="w-3.5 h-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={() => onEdit(p)}>
            <Edit2 className="w-3.5 h-3.5 mr-2" />Editar
          </DropdownMenuItem>
          {p.telefone && (
            <DropdownMenuItem onClick={() => window.open(wa, "_blank")}>
              <MessageCircle className="w-3.5 h-3.5 mr-2" />Abrir WhatsApp
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <EnviarFluxoMenu pessoa={p as any} />
          <DropdownMenuSeparator />
          {([
            { modo: "ambos" as const, label: "Baixar contrato + distrato (.zip)" },
            { modo: "contrato" as const, label: "Baixar somente contrato (.docx)" },
            { modo: "distrato" as const, label: "Baixar somente distrato (.docx)" },
          ]).map(opt => (
            <DropdownMenuItem
              key={opt.modo}
              disabled={semValor}
              title={semValor ? "Defina o valor em 'Pendentes de valor' para liberar o contrato" : opt.label}
              onClick={async () => {
                try {
                  const r = await gerarContratoIndividual(p as any, p.client_id, opt.modo);
                  if (r.faltando.length > 0) {
                    toast.warning(`Modelo de ${r.faltando.join(" e ")} não encontrado para ${p.tipo}. Crie em "Modelos de contrato".`);
                  } else {
                    toast.success(r.gerados.length > 1 ? "Contrato e distrato baixados (.zip)!" : "Documento gerado!");
                  }
                } catch (e: any) { toast.error(e.message); }
              }}
            >

              <FileDown className="w-3.5 h-3.5 mr-2" />{opt.label}{semValor && <span className="ml-auto text-[10px] opacity-60">sem valor</span>}
            </DropdownMenuItem>
          ))}

          {p.tipo === "coordenador" && onSend && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger disabled={isSending}>
                  {isSending ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <KeyRound className="w-3.5 h-3.5 mr-2" />}
                  Acesso ao portal
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onClick={() => onSend(p, "whatsapp")} disabled={isSending}>
                      <Send className="w-3.5 h-3.5 mr-2" />Enviar por WhatsApp
                      <span className="ml-auto text-[10px] opacity-60">mantém senha</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onSend(p, "link_only")} disabled={isSending}>
                      <Copy className="w-3.5 h-3.5 mr-2" />Copiar link de acesso
                      <span className="ml-auto text-[10px] opacity-60">mantém senha</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onCredentials(p)}>
                      <RefreshCw className="w-3.5 h-3.5 mr-2" />Redefinir senha e enviar…
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>

              <DropdownMenuItem onClick={() => sendCoordBoasVindas(p.id)}>
                <BellRing className="w-3.5 h-3.5 mr-2" />Enviar boas-vindas (grupo)
              </DropdownMenuItem>
              {onTogglePermissao && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onTogglePermissao(p, "pode_cadastrar_lider")}>
                    {p.pode_cadastrar_lider === false ? "✅ Permitir" : "🚫 Bloquear"} cadastro de Líderes
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onTogglePermissao(p, "pode_cadastrar_cabo")}>
                    {p.pode_cadastrar_cabo === false ? "✅ Permitir" : "🚫 Bloquear"} cadastro de Cabos
                  </DropdownMenuItem>
                </>
              )}
            </>
          )}
          {p.tipo === "lider" && onResendLiderFlow && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onResendLiderFlow(p)}>
                <RefreshCw className="w-3.5 h-3.5 mr-2" />Reenviar fluxo de cadastro
              </DropdownMenuItem>
            </>
          )}

          <DropdownMenuSeparator />
          {onArchive && (p.arquivado_em || situacao === "sem_contrato") && (
            <DropdownMenuItem onClick={() => onArchive(p)}>
              <Trash2 className="w-3.5 h-3.5 mr-2" />{p.arquivado_em ? "Restaurar cadastro" : "Arquivar cadastro"}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => onDelete(p.id)} className="text-destructive focus:text-destructive">
            <Trash2 className="w-3.5 h-3.5 mr-2" />Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ─── KPI Card visual ────────────────────────────────────────────
function KpiCard({ label, value, icon: Icon, tone, small }: {
  label: string; value: number | string; icon: any;
  tone: "neutral" | "red" | "blue" | "green" | "emerald" | "amber"; small?: boolean;
}) {
  const tones: Record<string, string> = {
    neutral: "from-muted/40 to-muted/10 text-foreground border-border/50",
    red: "from-red-500/15 to-red-500/5 text-red-700 dark:text-red-400 border-red-500/20",
    blue: "from-blue-500/15 to-blue-500/5 text-blue-700 dark:text-blue-400 border-blue-500/20",
    green: "from-green-500/15 to-green-500/5 text-green-700 dark:text-green-400 border-green-500/20",
    emerald: "from-emerald-500/15 to-emerald-500/5 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
    amber: "from-amber-500/15 to-amber-500/5 text-amber-700 dark:text-amber-400 border-amber-500/20",
  };
  return (
    <div className={cn("relative rounded-xl border bg-gradient-to-br p-3 overflow-hidden", tones[tone])}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider opacity-70 font-semibold">{label}</p>
          <p className={cn("font-bold tabular-nums leading-tight mt-0.5 truncate", small ? "text-base" : "text-2xl")}>{value}</p>
        </div>
        <Icon className={cn("opacity-40 shrink-0", small ? "w-4 h-4" : "w-5 h-5")} />
      </div>
    </div>
  );
}

// ─── Lista plana ordenável ──────────────────────────────────────
function ListaPlana({ pessoas, sortBy, onEdit, onDelete, onCredentials, onSend, sendingId }: {
  pessoas: Pessoa[];
  sortBy: "nome" | "valor" | "tipo";
  onEdit: (p: Pessoa) => void;
  onDelete: (id: string) => void;
  onCredentials: (p: Pessoa) => void;
  onSend: (p: Pessoa, channel: "whatsapp" | "link_only") => void;
  sendingId: string | null;
}) {
  const tipoOrder: Record<Tipo, number> = { coordenador: 0, lider: 1, cabo: 2 };
  const sorted = [...pessoas].sort((a, b) => {
    if (sortBy === "valor") return (b.valor_contratacao || 0) - (a.valor_contratacao || 0);
    if (sortBy === "tipo") return tipoOrder[a.tipo] - tipoOrder[b.tipo] || a.nome.localeCompare(b.nome);
    return a.nome.localeCompare(b.nome);
  });

  if (sorted.length === 0) {
    return (
      <Card className="py-12 text-center text-muted-foreground border-dashed">
        <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
        <p className="text-sm">Nenhum resultado</p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden divide-y divide-border/40">
      {sorted.map(p => (
        <PessoaRow
          key={p.id}
          p={p}
          onEdit={onEdit}
          onDelete={onDelete}
          onCredentials={onCredentials}
          onSend={onSend}
          sendingId={sendingId}
        />
      ))}
    </Card>
  );
}
