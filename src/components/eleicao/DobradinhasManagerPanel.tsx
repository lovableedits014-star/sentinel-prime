import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Handshake, Search, Users, Crown, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useCandidatosParceiros, type CandidatoParceiro } from "@/hooks/useCandidatosParceiros";
import DobradinhaPropagarDialog from "./DobradinhaPropagarDialog";

interface Pessoa {
  id: string;
  tipo: "coordenador" | "lider" | "cabo";
  escopo: "campo_grande" | "interior";
  regiao: string | null;
  cidade: string | null;
  nome: string;
  parent_id: string | null;
  valor_contratacao: number | null;
  parceiro_id: string | null;
  rateio_estadual: number | null;
  rateio_parceiro: number | null;
}

interface Props {
  clientId: string;
  pessoas: Pessoa[];
  onChanged: () => void;
}

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

function descendentes(raizId: string, all: Pessoa[]): Pessoa[] {
  const childrenMap: Record<string, Pessoa[]> = {};
  all.forEach((p) => { if (p.parent_id) (childrenMap[p.parent_id] ??= []).push(p); });
  const out: Pessoa[] = [];
  const stack = [raizId];
  while (stack.length) {
    const id = stack.pop()!;
    (childrenMap[id] || []).forEach((c) => { out.push(c); stack.push(c.id); });
  }
  return out;
}

interface RaizDraft {
  parceiro_id: string;
  rateio_estadual: number;
  rateio_parceiro: number;
}

export default function DobradinhasManagerPanel({ clientId, pessoas, onChanged }: Props) {
  const { parceirosAtivos, parceiros } = useCandidatosParceiros(clientId);
  const [search, setSearch] = useState("");
  const [filtroParceiro, setFiltroParceiro] = useState<string>("all"); // 'all' | 'sem' | parceiroId
  const [filtroEscopo, setFiltroEscopo] = useState<"all" | "campo_grande" | "interior">("all");
  const [drafts, setDrafts] = useState<Record<string, RaizDraft>>({});
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [bulkParceiro, setBulkParceiro] = useState<string>("");
  const [bulkEst, setBulkEst] = useState(50);
  const [bulkPar, setBulkPar] = useState(50);
  const [salvando, setSalvando] = useState(false);
  const [propagar, setPropagar] = useState<{ raiz: Pessoa; parceiro: CandidatoParceiro | null; est: number; par: number } | null>(null);

  const parceiroById = useMemo(() => {
    const m: Record<string, CandidatoParceiro> = {};
    parceiros.forEach((p) => { m[p.id] = p; });
    return m;
  }, [parceiros]);

  // Raízes = coordenadores OU líderes avulsos (parent_id null)
  const raizes = useMemo(() => {
    return pessoas.filter(
      (p) => p.tipo === "coordenador" || (p.tipo === "lider" && !p.parent_id)
    );
  }, [pessoas]);

  // Para cada raiz: descendentes + custo total + draft atual
  const linhas = useMemo(() => {
    return raizes.map((r) => {
      const descs = descendentes(r.id, pessoas);
      const time = [r, ...descs];
      const custoTotal = time.reduce((s, p) => s + Number(p.valor_contratacao || 0), 0);
      const lideres = descs.filter((d) => d.tipo === "lider").length;
      const cabos = descs.filter((d) => d.tipo === "cabo").length;
      const draft = drafts[r.id] ?? {
        parceiro_id: r.parceiro_id || "",
        rateio_estadual: r.rateio_estadual ?? 100,
        rateio_parceiro: r.rateio_parceiro ?? 0,
      };
      const dirty =
        (draft.parceiro_id || null) !== (r.parceiro_id || null) ||
        draft.rateio_estadual !== (r.rateio_estadual ?? 100) ||
        draft.rateio_parceiro !== (r.rateio_parceiro ?? 0);
      return { raiz: r, descs, lideres, cabos, custoTotal, draft, dirty };
    });
  }, [raizes, pessoas, drafts]);

  // Filtros
  const linhasFiltradas = useMemo(() => {
    return linhas.filter((l) => {
      if (filtroEscopo !== "all" && l.raiz.escopo !== filtroEscopo) return false;
      if (filtroParceiro === "sem" && l.raiz.parceiro_id) return false;
      if (filtroParceiro !== "all" && filtroParceiro !== "sem" && l.raiz.parceiro_id !== filtroParceiro) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const localizacao = (l.raiz.regiao || l.raiz.cidade || "").toLowerCase();
        if (!l.raiz.nome.toLowerCase().includes(q) && !localizacao.includes(q)) return false;
      }
      return true;
    });
  }, [linhas, filtroEscopo, filtroParceiro, search]);

  // Resumo
  const resumo = useMemo(() => {
    const totalRaizes = linhas.length;
    const semDobradinha = linhas.filter((l) => !l.raiz.parceiro_id).length;
    const porParceiro: Record<string, { nome: string; cor: string; total: number; raizes: number }> = {};
    linhas.forEach((l) => {
      if (!l.raiz.parceiro_id) return;
      const parc = parceiroById[l.raiz.parceiro_id];
      if (!parc) return;
      const time = [l.raiz, ...l.descs];
      const totalFederal = time.reduce(
        (s, p) => s + Number(p.valor_contratacao || 0) * Number(p.rateio_parceiro || 0) / 100,
        0
      );
      porParceiro[parc.id] ??= { nome: parc.nome, cor: parc.cor, total: 0, raizes: 0 };
      porParceiro[parc.id].total += totalFederal;
      porParceiro[parc.id].raizes += 1;
    });
    return { totalRaizes, semDobradinha, porParceiro: Object.values(porParceiro) };
  }, [linhas, parceiroById]);

  function setDraft(id: string, patch: Partial<RaizDraft>) {
    setDrafts((d) => ({
      ...d,
      [id]: {
        ...(d[id] ?? {
          parceiro_id: linhas.find((l) => l.raiz.id === id)?.raiz.parceiro_id || "",
          rateio_estadual: linhas.find((l) => l.raiz.id === id)?.raiz.rateio_estadual ?? 100,
          rateio_parceiro: linhas.find((l) => l.raiz.id === id)?.raiz.rateio_parceiro ?? 0,
        }),
        ...patch,
      },
    }));
  }

  async function aplicar(raiz: Pessoa, draft: RaizDraft, propagarFlag: boolean) {
    setSalvando(true);
    const { data, error } = await supabase.rpc("eleicao_aplicar_dobradinha_raiz" as any, {
      _raiz_id: raiz.id,
      _parceiro_id: draft.parceiro_id || null,
      _rateio_estadual: draft.parceiro_id ? draft.rateio_estadual : 100,
      _rateio_parceiro: draft.parceiro_id ? draft.rateio_parceiro : 0,
      _propagar: propagarFlag,
    });
    setSalvando(false);
    if (error) {
      toast.error(error.message);
      return false;
    }
    toast.success(`Dobradinha aplicada — ${data} pessoa(s) atualizada(s).`);
    // limpa draft
    setDrafts((d) => {
      const { [raiz.id]: _, ...rest } = d;
      return rest;
    });
    onChanged();
    return true;
  }

  async function handleAplicar(linha: typeof linhas[0]) {
    const temDescs = linha.descs.length > 0;
    if (!temDescs) {
      await aplicar(linha.raiz, linha.draft, false);
      return;
    }
    setPropagar({
      raiz: linha.raiz,
      parceiro: linha.draft.parceiro_id ? parceiroById[linha.draft.parceiro_id] : null,
      est: linha.draft.parceiro_id ? linha.draft.rateio_estadual : 100,
      par: linha.draft.parceiro_id ? linha.draft.rateio_parceiro : 0,
    });
  }

  async function confirmPropagar(propagarFlag: boolean) {
    if (!propagar) return;
    const draft = drafts[propagar.raiz.id];
    if (!draft) { setPropagar(null); return; }
    const ok = await aplicar(propagar.raiz, draft, propagarFlag);
    if (ok) setPropagar(null);
  }

  async function aplicarMassa() {
    if (selecionados.size === 0) {
      toast.error("Selecione pelo menos uma raiz");
      return;
    }
    if (bulkEst + bulkPar !== 100) {
      toast.error("A soma dos rateios deve ser 100%");
      return;
    }
    setSalvando(true);
    let ok = 0;
    let fail = 0;
    for (const id of selecionados) {
      const { error } = await supabase.rpc("eleicao_aplicar_dobradinha_raiz" as any, {
        _raiz_id: id,
        _parceiro_id: bulkParceiro || null,
        _rateio_estadual: bulkParceiro ? bulkEst : 100,
        _rateio_parceiro: bulkParceiro ? bulkPar : 0,
        _propagar: true,
      });
      if (error) fail++; else ok++;
    }
    setSalvando(false);
    if (ok) toast.success(`${ok} time(s) atualizado(s) com sucesso.`);
    if (fail) toast.error(`${fail} falha(s) ao atualizar.`);
    setSelecionados(new Set());
    onChanged();
  }

  const ratioOptions = [
    { e: 100, p: 0, label: "100% Est." },
    { e: 70, p: 30, label: "70/30" },
    { e: 50, p: 50, label: "50/50" },
    { e: 0, p: 100, label: "100% Fed." },
  ];

  if (parceirosAtivos.length === 0) {
    return (
      <Card className="p-6 text-center space-y-3">
        <AlertCircle className="w-8 h-8 mx-auto text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Nenhum candidato parceiro cadastrado. Vá em <strong>Configurações</strong> e cadastre os federais
          que entram em dobradinha antes de designar.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Resumo */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Handshake className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">Gestão de dobradinhas</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="rounded-md border p-2.5">
            <div className="text-muted-foreground">Times (raízes)</div>
            <div className="text-lg font-bold">{resumo.totalRaizes}</div>
          </div>
          <div className="rounded-md border p-2.5">
            <div className="text-muted-foreground">Sem dobradinha</div>
            <div className="text-lg font-bold text-amber-600">{resumo.semDobradinha}</div>
          </div>
          {resumo.porParceiro.slice(0, 2).map((p) => (
            <div key={p.nome} className="rounded-md border p-2.5">
              <div className="text-muted-foreground inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.cor }} />
                {p.nome.split(" ")[0]} ({p.raizes})
              </div>
              <div className="text-sm font-bold tabular-nums">{fmt(p.total)}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Filtros + ação em massa */}
      <Card className="p-3 space-y-3">
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Buscar nome, região ou cidade..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={filtroEscopo} onValueChange={(v) => setFiltroEscopo(v as any)}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os escopos</SelectItem>
              <SelectItem value="campo_grande">Campo Grande</SelectItem>
              <SelectItem value="interior">Interior</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filtroParceiro} onValueChange={setFiltroParceiro}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="sem">⚠ Sem dobradinha</SelectItem>
              {parceirosAtivos.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selecionados.size > 0 && (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
            <div className="text-xs font-medium">
              Ação em massa para {selecionados.size} time(s) selecionado(s):
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              <Select value={bulkParceiro || "none"} onValueChange={(v) => setBulkParceiro(v === "none" ? "" : v)}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="Federal" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Sem dobradinha —</SelectItem>
                  {parceirosAtivos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {bulkParceiro && (
                <div className="flex gap-1">
                  {ratioOptions.map((o) => (
                    <Button
                      key={o.label}
                      size="sm"
                      variant={bulkEst === o.e && bulkPar === o.p ? "default" : "outline"}
                      className="h-8 text-xs"
                      onClick={() => { setBulkEst(o.e); setBulkPar(o.p); }}
                    >
                      {o.label}
                    </Button>
                  ))}
                </div>
              )}
              <Button size="sm" onClick={aplicarMassa} disabled={salvando}>
                Aplicar para {selecionados.size}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelecionados(new Set())}>
                Limpar seleção
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Lista */}
      <div className="space-y-2">
        {linhasFiltradas.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            Nenhum time encontrado com esses filtros.
          </Card>
        ) : (
          linhasFiltradas.map((l) => {
            const parcAtual = l.raiz.parceiro_id ? parceiroById[l.raiz.parceiro_id] : null;
            const parcDraft = l.draft.parceiro_id ? parceiroById[l.draft.parceiro_id] : null;
            const isSelected = selecionados.has(l.raiz.id);
            return (
              <Card key={l.raiz.id} className={`p-3 ${isSelected ? "border-primary" : ""}`}>
                <div className="flex gap-3 items-start">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(c) => {
                      setSelecionados((s) => {
                        const n = new Set(s);
                        if (c) n.add(l.raiz.id); else n.delete(l.raiz.id);
                        return n;
                      });
                    }}
                    className="mt-1.5"
                  />
                  <div className="flex-1 min-w-0 space-y-2">
                    {/* Header da raiz */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Crown className={`w-4 h-4 ${l.raiz.tipo === "coordenador" ? "text-red-500" : "text-blue-500"}`} />
                      <span className="font-medium">{l.raiz.nome}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {l.raiz.tipo === "coordenador" ? "Coordenador" : "Líder avulso"}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        {l.raiz.escopo === "campo_grande" ? l.raiz.regiao : l.raiz.cidade}
                      </Badge>
                      {parcAtual && (
                        <Badge className="text-[10px] text-white" style={{ backgroundColor: parcAtual.cor }}>
                          {parcAtual.nome} · {l.raiz.rateio_estadual}/{l.raiz.rateio_parceiro}
                        </Badge>
                      )}
                      {!parcAtual && (
                        <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-500/30">
                          Sem dobradinha
                        </Badge>
                      )}
                    </div>

                    {/* Stats do time */}
                    <div className="text-xs text-muted-foreground flex gap-3 flex-wrap">
                      <span className="inline-flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {l.lideres} líder(es) + {l.cabos} cabo(s)
                      </span>
                      <span>Custo do time: <strong className="text-foreground tabular-nums">{fmt(l.custoTotal)}</strong></span>
                    </div>

                    {/* Editor inline */}
                    <div className="flex gap-2 items-end flex-wrap pt-2 border-t">
                      <div className="flex-1 min-w-[180px]">
                        <label className="text-[10px] uppercase text-muted-foreground block mb-1">Federal parceiro</label>
                        <Select
                          value={l.draft.parceiro_id || "none"}
                          onValueChange={(v) =>
                            setDraft(l.raiz.id, {
                              parceiro_id: v === "none" ? "" : v,
                              rateio_estadual: v === "none" ? 100 : (l.draft.rateio_parceiro > 0 ? l.draft.rateio_estadual : 50),
                              rateio_parceiro: v === "none" ? 0 : (l.draft.rateio_parceiro > 0 ? l.draft.rateio_parceiro : 50),
                            })
                          }
                        >
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">— Sem dobradinha —</SelectItem>
                            {parceirosAtivos.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.cor }} />
                                  {p.nome}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {l.draft.parceiro_id && (
                        <div className="flex gap-1">
                          {ratioOptions.map((o) => {
                            const active = l.draft.rateio_estadual === o.e && l.draft.rateio_parceiro === o.p;
                            return (
                              <Button
                                key={o.label}
                                size="sm"
                                variant={active ? "default" : "outline"}
                                className="h-8 text-[11px] px-2"
                                onClick={() => setDraft(l.raiz.id, { rateio_estadual: o.e, rateio_parceiro: o.p })}
                              >
                                {o.label}
                              </Button>
                            );
                          })}
                        </div>
                      )}

                      <Button
                        size="sm"
                        disabled={!l.dirty || salvando}
                        onClick={() => handleAplicar(l)}
                      >
                        {l.dirty ? "Aplicar" : "—"}
                      </Button>
                    </div>

                    {l.dirty && parcDraft && (
                      <p className="text-[11px] text-primary">
                        ⓘ Mudança pendente: <strong>{parcDraft.nome}</strong> · {l.draft.rateio_estadual}% est / {l.draft.rateio_parceiro}% fed
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      <DobradinhaPropagarDialog
        open={!!propagar}
        raizNome={propagar?.raiz.nome || ""}
        raizId={propagar?.raiz.id || null}
        parceiro={propagar?.parceiro || null}
        rateioEstadual={propagar?.est || 100}
        rateioParceiro={propagar?.par || 0}
        pessoas={pessoas as any}
        onChoose={confirmPropagar}
        onCancel={() => setPropagar(null)}
        loading={salvando}
      />
    </div>
  );
}
