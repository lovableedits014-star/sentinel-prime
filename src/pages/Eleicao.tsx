import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
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
import { Crown, Users, UserCheck, Plus, Trash2, ChevronRight, MapPin, Phone, Search, Edit2, KeyRound, CheckCircle2, ChevronDown, MoreHorizontal, Send, Copy, Loader2, MessageCircle, DollarSign, AlertCircle, List, Network, ArrowUpDown, X, Star, BellRing, RefreshCw } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import PrevisaoCustos from "@/components/eleicao/PrevisaoCustos";
import PendentesValorPanel from "@/components/eleicao/PendentesValorPanel";
import EleicaoContractTemplates from "@/components/eleicao/EleicaoContractTemplates";
import EleicaoConfigPanel from "@/components/eleicao/EleicaoConfigPanel";
import EntradaGrupoPanel from "@/components/eleicao/EntradaGrupoPanel";
import { gerarContratoIndividual, gerarLoteZip, downloadBlob } from "@/lib/eleicao-contrato-docx";
import { FileDown, Package, FileText, Printer } from "lucide-react";
import { exportEleicaoPdf, exportEleicaoCsv, type ExportPessoa } from "@/lib/eleicao-export-pdf";
import { NotifyProgressDialog } from "@/components/eleicao/NotifyProgressDialog";
import { useRegioesEleicao } from "@/hooks/useRegioesEleicao";

// ─── Helpers visuais ────────────────────────────────────────────
const initials = (nome: string) =>
  nome.trim().split(/\s+/).slice(0, 2).map(n => n[0]?.toUpperCase() || "").join("") || "?";

const fmtBRL = (n?: number | null) =>
  (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const onlyDigits = (s: string) => s.replace(/\D/g, "");

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
  parent_id: string | null;
  observacoes: string | null;
  email: string | null;
  user_id: string | null;
  valor_contratacao: number | null;
  is_favorito_regiao?: boolean | null;
  pode_cadastrar_lider?: boolean | null;
  pode_cadastrar_cabo?: boolean | null;
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
};
const EleicaoActionsContext = React.createContext<EleicaoActions | null>(null);


export default function Eleicao() {
  const { data: clientId } = useCurrentClientId();
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [escopo, setEscopo] = useState<Escopo>("campo_grande");
  const [regiaoFilter, setRegiaoFilter] = useState<Regiao | "all">("all");
  const { regioes: REGIOES } = useRegioesEleicao(clientId || undefined);

  // dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyPessoaId, setNotifyPessoaId] = useState<string | null>(null);
  const [notifySkip, setNotifySkip] = useState<("coordenador" | "secretaria" | "lider")[]>([]);
  const [editing, setEditing] = useState<Pessoa | null>(null);
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
    parent_id: "" as string,
    liderAvulso: false,
    observacoes: "",
    email: "",
    password: "",
    send_access: true,
    valor_contratacao: "" as string,
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
    const { data, error } = await supabase
      .from("eleicao_pessoas" as any)
      .select("*")
      .eq("client_id", clientId!)
      .order("created_at", { ascending: false });
    if (error) toast.error("Erro ao carregar: " + error.message);
    else setPessoas((data as any) || []);
    setLoading(false);
  }

  function openNew(presets?: Partial<typeof form>) {
    setEditing(null);
    setForm({
      tipo: "coordenador", escopo, regiao: "centro", cidade: "",
      nome: "", telefone: "", rua: "", numero: "", bairro: "",
      parent_id: "", liderAvulso: false, observacoes: "",
      email: "", password: genLocalPassword(), send_access: true,
      valor_contratacao: "",
      ...presets,
    });
    setDialogOpen(true);
  }

  function openEdit(p: Pessoa) {
    setEditing(p);
    // Tenta extrair rua/numero/bairro do endereço legado se ainda não foram preenchidos
    const legado = p.endereco || "";
    setForm({
      tipo: p.tipo, escopo: p.escopo,
      regiao: (p.regiao || "centro") as Regiao,
      cidade: p.cidade || "",
      nome: p.nome, telefone: p.telefone,
      rua: p.rua || legado,
      numero: p.numero || "",
      bairro: p.bairro || "",
      parent_id: p.parent_id || "",
      liderAvulso: p.tipo === "lider" && !p.parent_id,
      observacoes: p.observacoes || "",
      email: p.email || "",
      password: "",
      send_access: false,
      valor_contratacao: p.valor_contratacao != null ? String(p.valor_contratacao) : "",
    });
    setDialogOpen(true);
  }

  async function save() {
    if (!form.nome.trim() || !form.telefone.trim() || !form.bairro.trim()) {
      toast.error("Nome, telefone e bairro são obrigatórios"); return;
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
    const payload: any = {
      client_id: clientId,
      tipo: form.tipo,
      escopo: form.escopo,
      regiao: form.escopo === "campo_grande" ? form.regiao : null,
      cidade: form.escopo === "interior" ? form.cidade.trim() : null,
      nome: form.nome.trim(),
      telefone: form.telefone.trim(),
      rua, numero: numero || null, bairro,
      endereco: enderecoConcat,
      parent_id: form.tipo === "lider" && form.liderAvulso ? null : (form.parent_id || null),
      observacoes: form.observacoes.trim() || null,
      email: form.tipo === "coordenador" && form.email.trim() ? form.email.trim().toLowerCase() : null,
      valor_contratacao: form.valor_contratacao.trim() === "" ? 0 : Number(String(form.valor_contratacao).replace(",", ".")) || 0,
    };
    const q = editing
      ? supabase.from("eleicao_pessoas" as any).update(payload).eq("id", editing.id).select().single()
      : supabase.from("eleicao_pessoas" as any).insert(payload).select().single();
    const { data: savedPessoa, error } = await q;
    if (error) { toast.error(error.message); return; }

    // Disparo automático de notificações ao criar novo líder.
    // Abre o dialog visual de progresso por etapa (Coordenador → Secretaria → Líder).
    // Para líder avulso (sem coordenador), pula as etapas Coordenador e Secretaria.
    if (!editing && form.tipo === "lider" && savedPessoa) {
      toast.success("Líder cadastrado!");
      setDialogOpen(false);
      const isAvulso = !payload.parent_id;
      setNotifySkip(isAvulso ? ["coordenador", "secretaria"] : []);
      setNotifyPessoaId((savedPessoa as any).id);
      setNotifyOpen(true);
      load();
      return;
    }

    if (!editing && form.tipo === "coordenador" && form.send_access) {
      await sendCredentials(savedPessoa as unknown as Pessoa, "whatsapp", {
        email: form.email.trim(),
        password: form.password,
        closeRegisterDialog: true,
      });
      // Após enviar credenciais, dispara também a mensagem de boas-vindas.
      void notifyCoordBoasVindas((savedPessoa as any).id);
      return;
    }

    // Coordenador novo (sem envio de credenciais): manda apenas a boas-vindas.
    if (!editing && form.tipo === "coordenador" && savedPessoa) {
      void notifyCoordBoasVindas((savedPessoa as any).id);
    }

    // Cabo eleitoral novo: dispara boas-vindas com link do grupo da região.
    if (!editing && form.tipo === "cabo" && savedPessoa) {
      void sendCaboBoasVindas((savedPessoa as any).id);
    }


    toast.success(editing ? "Atualizado!" : "Cadastrado!");
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
    setCredPassword(genLocalPassword());
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
  const [credResult, setCredResult] = useState<{ pessoa: Pessoa; portal_url: string; email: string; password: string; message: string; sent: boolean; warning?: string } | null>(null);

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
        },
      });
      if (error) {
        let msg = error.message;
        try { const b = await (error as any).context?.json?.(); if (b?.error) msg = b.error; } catch {}
        throw new Error(msg);
      }
      if (!data?.success) throw new Error(data?.error || "Falha");
      setCredResult({ pessoa: p, ...data });
      if (data.sent) toast.success("Credenciais enviadas por WhatsApp!");
      else if (data.warning) toast.warning(data.warning);
      else toast.success("Credenciais geradas! Copie abaixo.");
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

  const [view, setView] = useState<"cadastros" | "pendentes" | "grupo" | "custos" | "config">("cadastros");
  const [layoutMode, setLayoutMode] = useState<"arvore" | "lista">("arvore");
  const [statusFilter, setStatusFilter] = useState<"todos" | "sem_valor" | "sem_acesso" | "avulsos">("todos");
  const [tipoFilter, setTipoFilter] = useState<"todos" | Tipo>("todos");
  const [sortBy, setSortBy] = useState<"nome" | "valor" | "tipo">("nome");

  const matchesStatus = (p: Pessoa) => {
    if (statusFilter === "sem_valor") return !p.valor_contratacao || p.valor_contratacao === 0;
    if (statusFilter === "sem_acesso") return p.tipo === "coordenador" && !p.user_id;
    if (statusFilter === "avulsos") return p.tipo === "lider" && !p.parent_id;
    return true;
  };
  const matchesTipo = (p: Pessoa) => tipoFilter === "todos" || p.tipo === tipoFilter;

  const matchesSearch = (p: Pessoa) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.nome.toLowerCase().includes(q) || p.telefone.includes(search) || (p.endereco || "").toLowerCase().includes(q);
  };

  const escopoList = pessoas.filter(p =>
    p.escopo === escopo && matchesSearch(p) && matchesStatus(p) && matchesTipo(p)
  );
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
    const f = pessoas.filter(p => p.escopo === escopo);
    const valorTotal = f.reduce((s, p) => s + (p.valor_contratacao || 0), 0);
    const semValor = f.filter(p => !p.valor_contratacao || p.valor_contratacao === 0).length;
    const avulsos = f.filter(p => p.tipo === "lider" && !p.parent_id).length;
    return {
      coord: f.filter(p => p.tipo === "coordenador").length,
      lider: f.filter(p => p.tipo === "lider").length,
      cabo: f.filter(p => p.tipo === "cabo").length,
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
      p.tipo === parentTipo &&
      p.escopo === form.escopo &&
      (form.escopo === "interior" ? p.cidade === form.cidade : p.regiao === form.regiao)
    );
  }, [pessoas, form.tipo, form.escopo, form.regiao, form.cidade]);


  function handleExport(kind: "pdf" | "csv" | "print") {
    const lista = pessoas.filter(p =>
      p.escopo === escopo && matchesSearch(p) && matchesStatus(p) && matchesTipo(p)
    );
    if (lista.length === 0) {
      toast.error("Nenhum cadastro para exportar com os filtros atuais.");
      return;
    }
    const byId = new Map(pessoas.map(p => [p.id, p.nome]));
    const items: ExportPessoa[] = lista.map(p => ({
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
      parent_nome: p.parent_id ? (byId.get(p.parent_id) || null) : null,
    }));
    const escopoLabel = escopo === "campo_grande" ? "Campo Grande" : "Interior";
    const filtros: { label: string; value: string }[] = [];
    if (search) filtros.push({ label: "Busca", value: search });
    if (tipoFilter && tipoFilter !== "todos") filtros.push({ label: "Tipo", value: tipoFilter });
    if (regiaoFilter && regiaoFilter !== "all") filtros.push({ label: escopo === "interior" ? "Cidade" : "Região", value: String(regiaoFilter) });

    const opts = { escopoLabel, pessoas: items, filtros };
    if (kind === "csv") {
      exportEleicaoCsv(opts);
      toast.success(`CSV exportado (${items.length} registros)`);
    } else {
      exportEleicaoPdf(opts);
      if (kind === "print") {
        toast.info("PDF gerado — abra o arquivo e use Ctrl+P para imprimir.");
      } else {
        toast.success(`PDF exportado (${items.length} registros)`);
      }
    }
  }

  return (
    <EleicaoActionsContext.Provider value={{ onTogglePermissao: togglePermissaoCadastro, onResendLiderFlow: openResendLiderFlow }}>
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <FileDown className="w-4 h-4 mr-2" />Exportar
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleExport("pdf")}>
                    <FileText className="w-4 h-4 mr-2" />Exportar como PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("print")}>
                    <Printer className="w-4 h-4 mr-2" />Abrir para imprimir
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleExport("csv")}>
                    <Package className="w-4 h-4 mr-2" />Exportar como CSV (Excel)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button onClick={() => openNew()}><Plus className="w-4 h-4 mr-2" />Novo cadastro</Button>
            </>
          )}
        </div>
      </div>


      <Tabs value={view} onValueChange={(v) => setView(v as any)} className="mb-4">
        <TabsList className="grid grid-cols-5 w-full max-w-3xl">
          <TabsTrigger value="cadastros">Cadastros</TabsTrigger>
          <TabsTrigger value="pendentes" className="gap-1.5">
            Pendentes de valor
            {stats.semValor > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                {stats.semValor}
              </Badge>
            )}
          </TabsTrigger>

          <TabsTrigger value="grupo">Entrada no grupo</TabsTrigger>
          <TabsTrigger value="custos">Previsão de custos</TabsTrigger>
          <TabsTrigger value="config">Configurações</TabsTrigger>
        </TabsList>
      </Tabs>

      {view === "custos" ? (
        <PrevisaoCustos pessoas={pessoas as any} />
      ) : view === "pendentes" ? (
        clientId ? <PendentesValorPanel clientId={clientId} onChanged={load} /> : null
      ) : view === "grupo" ? (
        clientId ? <EntradaGrupoPanel clientId={clientId} /> : null
      ) : view === "config" ? (
        clientId ? <EleicaoConfigPanel clientId={clientId} /> : null
      ) : (
      <Tabs value={escopo} onValueChange={(v) => { setEscopo(v as Escopo); setRegiaoFilter("all"); }}>
        <TabsList className="grid grid-cols-2 w-full max-w-md mb-4">
          <TabsTrigger value="campo_grande">Coord. Campo Grande</TabsTrigger>
          <TabsTrigger value="interior">Coord. Interior</TabsTrigger>
        </TabsList>

        {/* KPIs com cards visuais */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
          <KpiCard label="Total" value={stats.total} icon={Users} tone="neutral" />
          <KpiCard label="Coordenadores" value={stats.coord} icon={Crown} tone="red" />
          <KpiCard label="Líderes" value={stats.lider} icon={Users} tone="blue" />
          <KpiCard label="Cabos" value={stats.cabo} icon={UserCheck} tone="green" />
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
                <SelectItem value="sem_valor">⚠ Sem valor</SelectItem>
                <SelectItem value="sem_acesso">🔒 Coord. sem acesso</SelectItem>
                <SelectItem value="avulsos">⚡ Líderes avulsos</SelectItem>
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
            <span>Mostrando <strong className="text-foreground">{escopoList.length}</strong> resultados</span>
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
              Todas <span className="opacity-70 ml-1">{escopoList.length}</span>
            </button>
            {REGIOES.map(r => {
              const count = escopoList.filter(p => p.regiao === r.value).length;
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo *</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm(f => ({ ...f, tipo: v as Tipo, parent_id: "" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="coordenador">Coordenador</SelectItem>
                    {form.escopo === "campo_grande" && <SelectItem value="lider">Líder</SelectItem>}
                    <SelectItem value="cabo">Cabo eleitoral</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Escopo *</Label>
                <Select value={form.escopo} onValueChange={(v) => setForm(f => ({ ...f, escopo: v as Escopo, parent_id: "", tipo: v === "interior" && f.tipo === "lider" ? "cabo" : f.tipo }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="campo_grande">Campo Grande</SelectItem>
                    <SelectItem value="interior">Interior</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

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

            {form.tipo !== "coordenador" && (
              <div>
                <Label>Indicado por ({form.tipo === "lider" ? "Coordenador" : "Líder"})</Label>
                <Select value={form.parent_id || "none"} onValueChange={(v) => setForm(f => ({ ...f, parent_id: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Sem vínculo —</SelectItem>
                    {possibleParents.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
                {possibleParents.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">Nenhum {form.tipo === "lider" ? "coordenador" : "líder"} cadastrado nesta {form.escopo === "campo_grande" ? "região" : "cidade"} ainda.</p>
                )}
              </div>
            )}

            <div>
              <Label>Nome *</Label>
              <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
            </div>
            <div>
              <Label>Telefone *</Label>
              <Input value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} placeholder="(67) 99999-0000" />
              <p className="text-[11px] text-muted-foreground mt-1">
                O valor de contratação é definido na aba <strong>Pendentes de valor</strong>.
              </p>
            </div>
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
                  <span className="font-bold break-all">{credResult.password}</span>
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
              <p className="text-[11px] text-muted-foreground">Salve esta senha — ela só aparece aqui neste momento.</p>
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
        onClose={() => { setNotifyOpen(false); setNotifyPessoaId(null); }}
      />
    </div>
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
            <div className="px-3 py-2 border-t border-dashed">
              <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1">Líderes sem coordenador</p>
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
  const [expanded, setExpanded] = useState(false);
  const hasTeam = totalEquipe > 0;
  const allDoTime = [coord, ...lideres, ...cabosDir, ...cabosLid];

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
        expanded={expanded}
        onToggle={hasTeam ? () => setExpanded(e => !e) : undefined}
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
  const [open, setOpen] = useState(true);
  const hasCabos = cabos.length > 0;
  

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

function PessoaRow({ p, onEdit, onDelete, onCredentials, onSend, sendingId, indent = 0, teamCount, expanded, onToggle, bulkAction }: {
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
}) {
  const actions = React.useContext(EleicaoActionsContext);
  const onTogglePermissao = actions?.onTogglePermissao;
  const onResendLiderFlow = actions?.onResendLiderFlow;

  const isSending = sendingId === p.id;
  const meta = TIPO_META[p.tipo];
  const Icon = meta.icon;
  const wa = waLink(p.telefone);
  const semValor = !p.valor_contratacao || p.valor_contratacao === 0;
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
          {semValor ? (
            <Badge variant="outline" className="h-4 px-1 text-[9px] border-amber-500/40 text-amber-600 bg-amber-500/10 shrink-0 gap-0.5">
              <AlertCircle className="w-2.5 h-2.5" />sem valor
            </Badge>
          ) : (
            <span className="text-[10px] font-bold tabular-nums text-emerald-700 bg-emerald-500/10 px-1.5 py-0.5 rounded shrink-0">
              {fmtBRL(p.valor_contratacao)}
            </span>
          )}
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
      </div>

      {teamCount !== undefined && (
        <Badge variant="secondary" className="text-[10px] h-5 px-1.5 shrink-0 gap-0.5">
          <Users className="w-2.5 h-2.5" />{teamCount}
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
          <DropdownMenuItem
            disabled={semValor}
            onClick={async () => {
              try {
                await gerarContratoIndividual(p as any, p.client_id);
                toast.success("Contrato gerado!");
              } catch (e: any) { toast.error(e.message); }
            }}
          >
            <FileDown className="w-3.5 h-3.5 mr-2" />Baixar contrato (.docx)
          </DropdownMenuItem>
          {p.tipo === "coordenador" && onSend && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onSend(p, "whatsapp")} disabled={isSending}>
                {isSending ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-2" />}
                Enviar acesso por WhatsApp
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSend(p, "link_only")} disabled={isSending}>
                <Copy className="w-3.5 h-3.5 mr-2" />Gerar link e copiar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onCredentials(p)}>
                <KeyRound className="w-3.5 h-3.5 mr-2" />Definir e enviar acesso
              </DropdownMenuItem>
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
  tone: "neutral" | "red" | "blue" | "green" | "emerald"; small?: boolean;
}) {
  const tones: Record<string, string> = {
    neutral: "from-muted/40 to-muted/10 text-foreground border-border/50",
    red: "from-red-500/15 to-red-500/5 text-red-700 dark:text-red-400 border-red-500/20",
    blue: "from-blue-500/15 to-blue-500/5 text-blue-700 dark:text-blue-400 border-blue-500/20",
    green: "from-green-500/15 to-green-500/5 text-green-700 dark:text-green-400 border-green-500/20",
    emerald: "from-emerald-500/15 to-emerald-500/5 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
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