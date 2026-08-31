import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { Crown, Users, UserCheck, Search, FileDown, DollarSign, Loader2, FileText, AlertTriangle, Heart, HandCoins, Archive, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  gerarContratoIndividual,
  gerarLoteZip,
  downloadBlob,
  type PessoaContratada,
  type DocModo,
} from "@/lib/eleicao-contrato-docx";
import { isEleicaoContratado, isEleicaoSemContrato, isEleicaoVoluntario } from "@/lib/eleicao-situacao";

type Tipo = "coordenador" | "lider" | "cabo";

interface PessoaRow extends PessoaContratada {
  client_id: string;
  escopo: "campo_grande" | "interior";
  is_voluntario?: boolean | null;
  voluntario_obs?: string | null;
  arquivado_em?: string | null;
  arquivamento_lote_id?: string | null;
  arquivamento_motivo?: string | null;
}

function localKey(r: PessoaRow) {
  const v = r.escopo === "campo_grande" ? r.regiao || r.cidade : r.cidade || r.regiao;
  return (v || "").trim() || "Sem região definida";
}


const TIPO_META: Record<Tipo, { label: string; color: string; icon: any }> = {
  coordenador: { label: "Coordenador", color: "bg-red-500/10 text-red-600 border-red-500/30", icon: Crown },
  lider: { label: "Líder", color: "bg-blue-500/10 text-blue-600 border-blue-500/30", icon: Users },
  cabo: { label: "Cabo", color: "bg-green-500/10 text-green-600 border-green-500/30", icon: UserCheck },
};

const PRESETS_KEY = (clientId: string) => `eleicao_presets_valor_${clientId}`;

const DEFAULT_PRESETS: Record<Tipo, number> = {
  coordenador: 5000,
  lider: 2500,
  cabo: 1000,
};

interface Props {
  clientId: string;
  onChanged?: () => void;
}

export default function PendentesValorPanel({ clientId, onChanged }: Props) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PessoaRow[]>([]);
  const [search, setSearch] = useState("");
  const [tipoFilter, setTipoFilter] = useState<Tipo | "all">("all");
  const [regiaoFilter, setRegiaoFilter] = useState<string>("all");
  const [view, setView] = useState<"pendentes" | "definidos" | "voluntarios" | "arquivados">("pendentes");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkValor, setBulkValor] = useState("");
  const [presets, setPresets] = useState<Record<Tipo, number>>(DEFAULT_PRESETS);
  const [savingBulk, setSavingBulk] = useState(false);
  const [generatingZip, setGeneratingZip] = useState(false);
  const [modoDoc, setModoDoc] = useState<DocModo>("ambos");
  const [archiveAvailable, setArchiveAvailable] = useState(true);

  // load presets
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PRESETS_KEY(clientId));
      if (raw) setPresets({ ...DEFAULT_PRESETS, ...JSON.parse(raw) });
    } catch {}
  }, [clientId]);

  function savePresets(next: Record<Tipo, number>) {
    setPresets(next);
    try { localStorage.setItem(PRESETS_KEY(clientId), JSON.stringify(next)); } catch {}
  }

  async function load() {
    setLoading(true);
    const query = await supabase
      .from("eleicao_pessoas" as any)
      .select("id,client_id,nome,tipo,telefone,endereco,cidade,regiao,escopo,parent_id,valor_contratacao,is_voluntario,voluntario_obs,arquivado_em,arquivamento_lote_id,arquivamento_motivo")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });

    if (query.error && /arquivado_em|arquivamento_lote_id|arquivamento_motivo/i.test(query.error.message)) {
      const fallback = await supabase
        .from("eleicao_pessoas" as any)
        .select("id,client_id,nome,tipo,telefone,endereco,cidade,regiao,escopo,parent_id,valor_contratacao,is_voluntario,voluntario_obs")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      setArchiveAvailable(false);
      if (fallback.error) toast.error("Erro: " + fallback.error.message);
      else setRows(((fallback.data as any) || []).map((row: any) => ({ ...row, arquivado_em: null })));
    } else if (query.error) {
      toast.error("Erro: " + query.error.message);
    } else {
      setArchiveAvailable(true);
      setRows((query.data as any) || []);
    }
    setLoading(false);
    setSelected(new Set());
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [clientId]);

  const pendentes = useMemo(() => rows.filter(isEleicaoSemContrato), [rows]);
  const definidos = useMemo(() => rows.filter(isEleicaoContratado), [rows]);
  const voluntarios = useMemo(() => rows.filter(isEleicaoVoluntario), [rows]);
  const arquivados = useMemo(() => rows.filter(r => !!r.arquivado_em), [rows]);
  const base = view === "pendentes" ? pendentes : view === "definidos" ? definidos : view === "voluntarios" ? voluntarios : arquivados;
  const ultimoLote = useMemo(() => [...arquivados]
    .filter(r => r.arquivamento_lote_id)
    .sort((a, b) => (b.arquivado_em || "").localeCompare(a.arquivado_em || ""))[0]?.arquivamento_lote_id || null, [arquivados]);


  const regiaoOptions = useMemo(() => {
    const map = new Map<string, { key: string; label: string; total: number }>();
    base.forEach(r => {
      const key = localKey(r);
      const cur = map.get(key);
      if (cur) cur.total++;
      else map.set(key, { key, label: key, total: 1 });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [base]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return base.filter(r => {
      if (tipoFilter !== "all" && r.tipo !== tipoFilter) return false;
      if (regiaoFilter !== "all" && localKey(r) !== regiaoFilter) return false;
      if (!q) return true;
      return r.nome.toLowerCase().includes(q) || (r.telefone || "").includes(search) || (r.cidade || "").toLowerCase().includes(q);
    });
  }, [base, tipoFilter, regiaoFilter, search]);

  const counts = useMemo(() => {
    const c = { coordenador: 0, lider: 0, cabo: 0 };
    filtered.forEach(r => { c[r.tipo]++; });
    return c;
  }, [filtered]);

  // pessoas que casam com a busca mas estão em outra aba (voluntários / com valor)
  const outraAba = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    const inBase = new Set(base.map(r => r.id));
    return rows.filter(r =>
      !inBase.has(r.id) &&
      (r.nome.toLowerCase().includes(q) || (r.telefone || "").includes(search.trim()))
    );
  }, [rows, base, search]);

  async function marcarVoluntario(ids: string[]) {
    if (ids.length === 0) return;
    setSavingBulk(true);
    const { error } = await supabase
      .from("eleicao_pessoas" as any)
      .update({ is_voluntario: true, voluntario_marcado_em: new Date().toISOString(), valor_contratacao: 0 })
      .in("id", ids);
    setSavingBulk(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${ids.length} pessoa(s) marcada(s) como voluntário (sem custo)`);
    onChanged?.();
    load();
  }

  async function desmarcarVoluntario(ids: string[]) {
    if (ids.length === 0) return;
    setSavingBulk(true);
    const { error } = await supabase
      .from("eleicao_pessoas" as any)
      .update({ is_voluntario: false, voluntario_marcado_em: null })
      .in("id", ids);
    setSavingBulk(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${ids.length} pessoa(s) voltaram para pendentes de valor`);
    onChanged?.();
    load();
  }

  async function arquivarSelecionados() {
    const candidatos = selectedRows.filter(isEleicaoSemContrato);
    const ids = new Set(candidatos.map(p => p.id));
    const comSubordinados = candidatos.filter(p => rows.some(f => f.parent_id === p.id && !f.arquivado_em && !ids.has(f.id)));
    if (comSubordinados.length > 0) {
      toast.error(`${comSubordinados.length} pessoa(s) possuem subordinados ativos. Transfira ou selecione toda a equipe antes.`);
      return;
    }
    if (!confirm(`Arquivar ${candidatos.length} pessoa(s) sem contrato?`)) return;
    setSavingBulk(true);
    const { data: auth } = await supabase.auth.getUser();
    const loteId = crypto.randomUUID();
    const { error } = await supabase.from("eleicao_pessoas" as any).update({
      arquivado_em: new Date().toISOString(),
      arquivado_por: auth.user?.id || null,
      arquivamento_motivo: "Não contratado ao final da seleção",
      arquivamento_lote_id: loteId,
    }).in("id", candidatos.map(p => p.id));
    setSavingBulk(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${candidatos.length} pessoa(s) arquivada(s)`);
    onChanged?.();
    load();
  }

  async function arquivarTodosSemContrato() {
    const candidatos = rows.filter(isEleicaoSemContrato);
    if (candidatos.length === 0) { toast.info("Não há contatos sem contrato para arquivar."); return; }

    // Remove iterativamente pais que ficariam com algum descendente ativo fora do lote.
    const idsSeguros = new Set(candidatos.map(p => p.id));
    let mudou = true;
    while (mudou) {
      mudou = false;
      for (const pessoa of candidatos) {
        if (!idsSeguros.has(pessoa.id)) continue;
        const temFilhoProtegido = rows.some(f => f.parent_id === pessoa.id && !f.arquivado_em && !idsSeguros.has(f.id));
        if (temFilhoProtegido) { idsSeguros.delete(pessoa.id); mudou = true; }
      }
    }
    const seguros = candidatos.filter(p => idsSeguros.has(p.id));
    const protegidos = candidatos.length - seguros.length;
    if (seguros.length === 0) { toast.error("Todos os contatos sem contrato possuem equipes ativas protegidas."); return; }

    const complemento = protegidos > 0 ? `\n\n${protegidos} responsável(is) com subordinados contratados ou voluntários serão preservados.` : "";
    if (!confirm(`1ª confirmação: arquivar ${seguros.length} contato(s) sem contrato?${complemento}`)) return;
    if (!confirm(`2ª confirmação: esta ação retirará ${seguros.length} contato(s) da operação ativa. Deseja realmente continuar?`)) return;

    setSavingBulk(true);
    const { data: auth } = await supabase.auth.getUser();
    const loteId = crypto.randomUUID();
    const { error } = await supabase.from("eleicao_pessoas" as any).update({
      arquivado_em: new Date().toISOString(),
      arquivado_por: auth.user?.id || null,
      arquivamento_motivo: "Arquivamento em massa de contatos sem contrato",
      arquivamento_lote_id: loteId,
    }).in("id", seguros.map(p => p.id));
    setSavingBulk(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${seguros.length} contato(s) arquivado(s). Você pode desfazer este lote.`);
    onChanged?.();
    load();
  }

  async function desfazerUltimoLote() {
    if (!ultimoLote) return;
    const total = arquivados.filter(r => r.arquivamento_lote_id === ultimoLote).length;
    if (!confirm(`Restaurar os ${total} contato(s) do último arquivamento em massa?`)) return;
    setSavingBulk(true);
    const { error } = await supabase.from("eleicao_pessoas" as any)
      .update({ arquivado_em: null })
      .eq("client_id", clientId)
      .eq("arquivamento_lote_id", ultimoLote);
    setSavingBulk(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${total} contato(s) restaurado(s)`);
    onChanged?.();
    load();
  }

  async function restaurarPessoa(pessoa: PessoaRow) {
    const { error } = await supabase.from("eleicao_pessoas" as any).update({ arquivado_em: null }).eq("id", pessoa.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`${pessoa.nome} foi restaurado(a)`);
    onChanged?.();
    load();
  }


  const allSelected = filtered.length > 0 && filtered.every(r => selected.has(r.id));
  const selectedRows = useMemo(() => filtered.filter(r => selected.has(r.id)), [filtered, selected]);

  // Sugerir valor automaticamente quando todos selecionados são do mesmo tipo
  useEffect(() => {
    if (selectedRows.length === 0) return;
    const tipos = new Set(selectedRows.map(r => r.tipo));
    if (tipos.size === 1) {
      const tipo = Array.from(tipos)[0] as Tipo;
      if (!bulkValor) setBulkValor(String(presets[tipo]));
    }
  }, [selectedRows, presets]); // eslint-disable-line

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map(r => r.id)));
  }
  function toggleOne(id: string) {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id); else n.add(id);
    setSelected(n);
  }

  async function aplicarValorEmMassa() {
    const valor = Number(bulkValor.replace(",", "."));
    if (!valor || valor <= 0) { toast.error("Informe um valor válido"); return; }
    if (selectedRows.length === 0) { toast.error("Selecione ao menos uma pessoa"); return; }
    setSavingBulk(true);
    const { error } = await supabase
      .from("eleicao_pessoas" as any)
      .update({ valor_contratacao: valor })
      .in("id", selectedRows.map(r => r.id));
    setSavingBulk(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${selectedRows.length} pessoa(s) contratada(s) por R$ ${valor.toLocaleString("pt-BR")}`);
    setBulkValor("");
    onChanged?.();
    load();
  }

  async function aplicarValorIndividual(p: PessoaRow, valorStr: string) {
    const valor = Number(valorStr.replace(",", "."));
    if (!valor || valor <= 0) { toast.error("Valor inválido"); return false; }
    const { error } = await supabase
      .from("eleicao_pessoas" as any)
      .update({ valor_contratacao: valor })
      .eq("id", p.id);
    if (error) { toast.error(error.message); return false; }
    toast.success(`${p.nome} agora está contratado(a)`);
    onChanged?.();
    load();
    return true;
  }

  async function limparValor(p: PessoaRow) {
    const { error } = await supabase
      .from("eleicao_pessoas" as any)
      .update({ valor_contratacao: 0 })
      .eq("id", p.id);
    if (error) { toast.error(error.message); return false; }
    toast.success(`Valor removido — ${p.nome} voltou para pendentes`);
    onChanged?.();
    load();
    return true;

  }

  async function gerarContrato(p: PessoaRow) {
    try {
      const semValor = !p.valor_contratacao || p.valor_contratacao <= 0;
      const r = await gerarContratoIndividual(p, clientId, modoDoc);
      if (r.faltando.length > 0) toast.warning(`Modelo de ${r.faltando.join(" e ")} não encontrado. Crie em "Modelos de contrato".`);
      else if (semValor) toast.success("Documento gerado com valor para preenchimento à mão.");
      else toast.success(r.gerados.length > 1 ? "Contrato e distrato baixados (.zip)!" : "Documento gerado!");
    }
    catch (e: any) { toast.error(e.message); }
  }

  async function gerarLote() {
    if (selectedRows.length === 0) { toast.error("Selecione ao menos uma pessoa"); return; }
    setGeneratingZip(true);
    try {
      const { blob, pulados } = await gerarLoteZip(selectedRows, clientId, modoDoc);
      downloadBlob(blob, `Contratos-Eleicao-${new Date().toISOString().slice(0, 10)}.zip`);
      if (pulados.length > 0) toast.warning(`${pulados.length} sem modelo de contrato`);
      else toast.success(`${selectedRows.length} contrato(s) gerados`);
    } catch (e: any) { toast.error(e.message); }
    finally { setGeneratingZip(false); }
  }

  return (
    <div className="space-y-3">
      {/* Header / KPIs */}
      <Card className="p-3">
        {!archiveAvailable && (
          <div className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-200">
            A gestão de contratos está disponível. O arquivamento será liberado assim que a migração pendente for aplicada ao banco.
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              Valores de contrato
            </h3>
            <p className="text-xs text-muted-foreground">
              Ao definir um valor, a pessoa passa automaticamente para Contratados e o contrato é considerado assinado.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2 py-1 rounded bg-red-500/10 text-red-600">{counts.coordenador} coord.</span>
            <span className="px-2 py-1 rounded bg-blue-500/10 text-blue-600">{counts.lider} líderes</span>
            <span className="px-2 py-1 rounded bg-green-500/10 text-green-600">{counts.cabo} cabos</span>
            <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-600">{voluntarios.length} voluntários</span>
            <Button size="sm" variant="destructive" className="h-8 text-xs" onClick={arquivarTodosSemContrato} disabled={!archiveAvailable || savingBulk || pendentes.length === 0} title={!archiveAvailable ? "Migração de arquivamento ainda não aplicada" : undefined}>
              {savingBulk ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Archive className="w-3.5 h-3.5 mr-1" />}
              Arquivar todos sem contrato
            </Button>
            {ultimoLote && (
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={desfazerUltimoLote} disabled={savingBulk}>
                <Undo2 className="w-3.5 h-3.5 mr-1" />Desfazer último lote
              </Button>
            )}
          </div>
        </div>

        {/* Alternador de visão */}
        <div className="flex gap-1 mt-3">
          <Button
            size="sm"
            variant={view === "pendentes" ? "default" : "outline"}
            className="h-7 text-xs"
            onClick={() => { setView("pendentes"); setSelected(new Set()); }}
          >
            Pendentes ({pendentes.length})
          </Button>
          <Button
            size="sm"
            variant={view === "definidos" ? "default" : "outline"}
            className="h-7 text-xs"
            onClick={() => { setView("definidos"); setSelected(new Set()); }}
          >
            <DollarSign className="w-3 h-3 mr-1" /> Contratados ({definidos.length})
          </Button>
          <Button
            size="sm"
            variant={view === "voluntarios" ? "default" : "outline"}
            className="h-7 text-xs"
            onClick={() => { setView("voluntarios"); setSelected(new Set()); }}
          >
            <Heart className="w-3 h-3 mr-1" /> Voluntários ({voluntarios.length})
          </Button>
          {archiveAvailable && <Button
            size="sm"
            variant={view === "arquivados" ? "default" : "outline"}
            className="h-7 text-xs"
            onClick={() => { setView("arquivados"); setSelected(new Set()); }}
          >
            <Archive className="w-3 h-3 mr-1" /> Arquivados ({arquivados.length})
          </Button>}
        </div>




        {/* Presets editáveis */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          {(Object.keys(DEFAULT_PRESETS) as Tipo[]).map(t => (
            <div key={t} className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground w-20 shrink-0">{TIPO_META[t].label}:</span>
              <Input
                className="h-7 text-xs"
                inputMode="decimal"
                value={String(presets[t])}
                onChange={e => savePresets({ ...presets, [t]: Number(e.target.value.replace(",", ".")) || 0 })}
              />
            </div>
          ))}
        </div>
      </Card>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9 h-9" placeholder="Buscar nome, telefone…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={regiaoFilter} onValueChange={setRegiaoFilter}>
          <SelectTrigger className="w-56 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as regiões / cidades</SelectItem>
            {regiaoOptions.map(o => (
              <SelectItem key={o.key} value={o.key}>{o.label} ({o.total})</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={tipoFilter} onValueChange={(v) => setTipoFilter(v as any)}>
          <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            <SelectItem value="coordenador">Coordenadores</SelectItem>
            <SelectItem value="lider">Líderes</SelectItem>
            <SelectItem value="cabo">Cabos eleitorais</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Aviso: pessoa buscada está em outra aba */}
      {search.trim().length >= 2 && outraAba.length > 0 && (
        <Card className="p-2.5 border-amber-500/40 bg-amber-500/5 text-xs flex flex-wrap items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
          <span>
            {outraAba.map(r => r.nome).slice(0, 3).join(", ")}
            {outraAba.length > 3 ? ` +${outraAba.length - 3}` : ""} não está nesta aba
            {outraAba.some(r => r.is_voluntario) ? " (marcado como voluntário)" : " (já tem valor definido)"}.
          </span>
          {outraAba.some(r => r.is_voluntario) && (
            <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => { setView("voluntarios"); setSelected(new Set()); }}>
              Ver voluntários
            </Button>
          )}
          {outraAba.some(r => !r.is_voluntario) && (
            <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => { setView("definidos"); setSelected(new Set()); }}>
              Ver com valor
            </Button>
          )}
        </Card>
      )}



      {/* Barra de ações em massa */}
      {selected.size > 0 && (
        <Card className="p-3 border-primary/40 bg-primary/5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{selected.size} selecionado(s)</Badge>
            {view !== "voluntarios" ? (
              <>
                <div className="flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-muted-foreground" />
                  <Input
                    className="h-9 w-32"
                    inputMode="decimal"
                    placeholder="Valor R$"
                    value={bulkValor}
                    onChange={e => setBulkValor(e.target.value.replace(/[^0-9.,]/g, ""))}
                  />
                </div>
                <Button size="sm" onClick={aplicarValorEmMassa} disabled={savingBulk}>
                  {savingBulk ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                  Aplicar a {selected.size}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-emerald-600 border-emerald-500/40"
                  onClick={() => marcarVoluntario(selectedRows.map(r => r.id))}
                  disabled={savingBulk}
                >
                  <Heart className="w-3.5 h-3.5 mr-1" /> Marcar como voluntários
                </Button>
                {view === "pendentes" && (
                  <Button size="sm" variant="outline" onClick={arquivarSelecionados} disabled={savingBulk}>
                    Arquivar sem contrato
                  </Button>
                )}
                <Select value={modoDoc} onValueChange={(v) => setModoDoc(v as DocModo)}>
                  <SelectTrigger className="h-8 w-[190px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ambos">Contrato + Distrato</SelectItem>
                    <SelectItem value="contrato">Somente Contrato</SelectItem>
                    <SelectItem value="distrato">Somente Distrato</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={gerarLote} disabled={generatingZip}>
                  {generatingZip ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <FileDown className="w-3.5 h-3.5 mr-1" />}
                  Gerar documentos (.zip)
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => desmarcarVoluntario(selectedRows.map(r => r.id))}
                disabled={savingBulk}
              >
                <HandCoins className="w-3.5 h-3.5 mr-1" /> Voltar para pendentes
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Limpar</Button>
          </div>
        </Card>
      )}


      {/* Lista */}
      <Card>
        <div className="flex items-center gap-2 px-3 py-2 border-b text-xs text-muted-foreground">
          <Checkbox checked={allSelected} onCheckedChange={toggleAll} disabled={view === "arquivados"} />
          <span>Selecionar todos ({filtered.length})</span>
        </div>
        {loading ? (
          <p className="text-center text-sm text-muted-foreground py-10">Carregando…</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-10">
            {view === "pendentes" ? "Nenhuma pessoa sem contrato. 🎉" : view === "definidos" ? "Nenhum contratado ainda." : view === "voluntarios" ? "Nenhum voluntário marcado." : "Nenhum contato arquivado."}
          </p>

        ) : (
          <div className="divide-y">
            {filtered.map(p => {
              const meta = TIPO_META[p.tipo];
              const Icon = meta.icon;
              return (
                <div key={p.id} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/30">
                  <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggleOne(p.id)} disabled={view === "arquivados"} />
                  <div className={cn("w-7 h-7 rounded-full flex items-center justify-center border", meta.color)}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate flex items-center gap-1.5">
                      {p.nome}
                      {p.is_voluntario && (
                        <Badge variant="outline" className="h-4 px-1 text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                          Voluntário
                        </Badge>
                      )}
                      {!p.is_voluntario && Number(p.valor_contratacao || 0) > 0 && (
                        <Badge variant="outline" className="h-4 px-1 text-[10px] bg-blue-500/10 text-blue-700 border-blue-500/30">Contratado</Badge>
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {meta.label} · {localKey(p)} · {p.telefone}
                      {p.is_voluntario && p.voluntario_obs ? ` · ${p.voluntario_obs}` : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs gap-1"
                    title="Imprimir documento (mesmo sem valor)"
                    onClick={() => gerarContrato(p)}
                  >
                    <FileText className="w-3 h-3" /> Contrato
                  </Button>
                  {p.is_voluntario ? (
                    <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => desmarcarVoluntario([p.id])}>
                      <HandCoins className="w-3 h-3" /> Voltar p/ pendentes
                    </Button>
                  ) : p.arquivado_em ? (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => restaurarPessoa(p)}>
                      <Undo2 className="w-3 h-3" /> Restaurar pessoa
                    </Button>
                  ) : (
                    <>
                      {(p.valor_contratacao || 0) > 0 && (
                        <Badge variant="outline" className="h-6 text-[11px] font-medium">
                          R$ {Number(p.valor_contratacao).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </Badge>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs gap-1 text-emerald-600"
                        onClick={() => marcarVoluntario([p.id])}
                      >
                        <Heart className="w-3 h-3" /> Voluntário
                      </Button>
                      <DefinirValorPopover
                        pessoa={p}
                        onSave={aplicarValorIndividual}
                        onClear={limparValor}
                        suggestion={Number(p.valor_contratacao) > 0 ? Number(p.valor_contratacao) : presets[p.tipo]}
                      />
                    </>
                  )}

                </div>
              );
            })}

          </div>
        )}
      </Card>
    </div>
  );
}

function DefinirValorPopover({
  pessoa,
  onSave,
  onClear,
  suggestion,
}: {
  pessoa: PessoaRow;
  onSave: (p: PessoaRow, valor: string) => Promise<boolean>;
  onClear: (p: PessoaRow) => Promise<boolean>;
  suggestion: number;
}) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(String(suggestion || ""));
  const [saving, setSaving] = useState(false);
  const jaTemValor = Number(pessoa.valor_contratacao || 0) > 0;
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setV(String(suggestion || "")); }}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
          <DollarSign className="w-3 h-3" />
          {jaTemValor ? "Alterar valor" : "Definir valor"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56" align="end">
        <p className="text-xs font-medium mb-2">{pessoa.nome}</p>
        <Input
          className="h-8"
          inputMode="decimal"
          placeholder="R$"
          value={v}
          onChange={e => setV(e.target.value.replace(/[^0-9.,]/g, ""))}
          autoFocus
        />
        <Button
          size="sm"
          className="w-full mt-2"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            const ok = await onSave(pessoa, v);
            setSaving(false);
            if (ok) setOpen(false);
          }}
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}Salvar
        </Button>
        {jaTemValor && (
          <Button
            size="sm"
            variant="ghost"
            className="w-full mt-1 text-xs text-destructive"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              const ok = await onClear(pessoa);
              setSaving(false);
              if (ok) setOpen(false);
            }}
          >
            Remover valor
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

