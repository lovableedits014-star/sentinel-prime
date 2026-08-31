import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Archive, BriefcaseBusiness, ChevronDown, FileText, Heart, List as ListIcon, Network, Package, Printer, SlidersHorizontal, UserRoundX, Users } from "lucide-react";

export type ExportTipo = "coordenador" | "lider" | "cabo";
export type ExportFormato = "pdf" | "csv" | "print";
export type ExportModo = "lista" | "raiz";
export type ExportSituacao = "ativos" | "contratados" | "sem_contrato" | "voluntarios" | "arquivados";
export const PARCEIRO_SEM = "__none";

export interface ExportConfig {
  formato: ExportFormato;
  modo: ExportModo;
  tipos: ExportTipo[];
  coordenadorId: string | null;
  regiao: string | null;
  incluirAvulsos: boolean;
  parceiroId: string | null;
  porParceiro: boolean;
  apenasAvulsos?: boolean;
  apenasReuniao?: boolean;
  apenasNaoReuniao?: boolean;
  voluntarios?: "todos" | "apenas" | "excluir";
  situacaoContrato?: ExportSituacao;
}

interface CoordOption { id: string; nome: string; regiao?: string | null }
interface RegiaoOption { value: string; label: string }
interface ParceiroOption { id: string; nome: string; cor?: string; cargo?: string }
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coordenadores: CoordOption[];
  regioes: RegiaoOption[];
  escopoTipo: "regiao" | "cidade";
  parceiros?: ParceiroOption[];
  onExport: (config: ExportConfig) => void;
}

const TODOS: ExportTipo[] = ["coordenador", "lider", "cabo"];
const TIPO_LABEL: Record<ExportTipo, string> = { coordenador: "Coordenadores", lider: "Líderes", cabo: "Cabos" };
const SITUACOES: Array<{ id: ExportSituacao; label: string; hint: string; icon: typeof Users; active: string }> = [
  { id: "ativos", label: "Todos ativos", hint: "Toda a equipe atual", icon: Users, active: "border-primary bg-primary/5 text-primary" },
  { id: "contratados", label: "Contratados", hint: "Com valor definido", icon: BriefcaseBusiness, active: "border-blue-500 bg-blue-500/5 text-blue-700" },
  { id: "sem_contrato", label: "Sem contrato", hint: "Ainda sem valor", icon: UserRoundX, active: "border-amber-500 bg-amber-500/5 text-amber-700" },
  { id: "voluntarios", label: "Voluntários", hint: "Sem remuneração", icon: Heart, active: "border-emerald-500 bg-emerald-500/5 text-emerald-700" },
  { id: "arquivados", label: "Arquivados", hint: "Fora da operação", icon: Archive, active: "border-slate-500 bg-slate-500/5 text-slate-700" },
];

export default function ExportEleicaoDialog({ open, onOpenChange, coordenadores, regioes, escopoTipo, parceiros = [], onExport }: Props) {
  const [situacao, setSituacao] = useState<ExportSituacao>("ativos");
  const [modo, setModo] = useState<ExportModo>("lista");
  const [tipos, setTipos] = useState<ExportTipo[]>(TODOS);
  const [apenasAvulsos, setApenasAvulsos] = useState(false);
  const [coordenadorId, setCoordenadorId] = useState("__all");
  const [regiao, setRegiao] = useState("__all");
  const [incluirAvulsos, setIncluirAvulsos] = useState(true);
  const [parceiroSel, setParceiroSel] = useState("__all");
  const [porParceiro, setPorParceiro] = useState(false);
  const [reuniao, setReuniao] = useState<"__all" | "reuniao" | "sem_reuniao">("__all");
  const [avancados, setAvancados] = useState(false);

  const coords = useMemo(() => {
    const base = regiao === "__all" ? coordenadores : coordenadores.filter((c) => (c.regiao || "") === regiao);
    return [...base].sort((a, b) => a.nome.localeCompare(b.nome));
  }, [coordenadores, regiao]);

  useEffect(() => {
    if (coordenadorId !== "__all" && !coords.some((c) => c.id === coordenadorId)) setCoordenadorId("__all");
  }, [coordenadorId, coords]);
  useEffect(() => {
    if (!tipos.includes("lider")) { setApenasAvulsos(false); setIncluirAvulsos(false); }
  }, [tipos]);
  useEffect(() => { if (parceiroSel !== "__all") setPorParceiro(false); }, [parceiroSel]);

  const toggleTipo = (tipo: ExportTipo) => setTipos((atual) => atual.includes(tipo) ? atual.filter((item) => item !== tipo) : [...atual, tipo]);
  const filtrosAtivos = [regiao !== "__all", coordenadorId !== "__all", parceiroSel !== "__all", reuniao !== "__all", apenasAvulsos, !incluirAvulsos && tipos.includes("lider"), porParceiro].filter(Boolean).length;

  function exportar(formato: ExportFormato) {
    if (tipos.length === 0) return;
    onExport({
      formato, modo, tipos: apenasAvulsos ? ["lider"] : tipos,
      coordenadorId: coordenadorId === "__all" || apenasAvulsos ? null : coordenadorId,
      regiao: regiao === "__all" ? null : regiao,
      incluirAvulsos: apenasAvulsos || incluirAvulsos,
      parceiroId: parceiroSel === "__all" ? null : parceiroSel,
      porParceiro: parceiroSel === "__all" && porParceiro,
      apenasAvulsos,
      apenasReuniao: reuniao === "reuniao",
      apenasNaoReuniao: reuniao === "sem_reuniao",
      voluntarios: "todos",
      situacaoContrato: situacao,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Exportar cadastros</DialogTitle>
          <DialogDescription>Escolha quem entra no relatório e como deseja organizar o arquivo.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          <section className="space-y-2">
            <div><Label className="font-semibold">1. Quem você quer exportar?</Label><p className="text-xs text-muted-foreground">Escolha uma situação principal.</p></div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {SITUACOES.map((item) => {
                const Icon = item.icon;
                return <button key={item.id} type="button" onClick={() => setSituacao(item.id)} className={cn("rounded-lg border p-2.5 text-left transition-colors hover:bg-muted/40 min-h-[82px]", situacao === item.id ? item.active : "border-border bg-background")}>
                  <Icon className="w-4 h-4 mb-2" /><span className="block text-xs font-semibold leading-tight">{item.label}</span><span className="block text-[10px] text-muted-foreground leading-tight mt-1">{item.hint}</span>
                </button>;
              })}
            </div>
          </section>

          <section className="space-y-3 rounded-lg border p-3">
            <Label className="font-semibold">2. Como organizar?</Label>
            <div className="grid sm:grid-cols-2 gap-2">
              <button type="button" onClick={() => setModo("lista")} className={cn("rounded-md border p-3 text-left flex gap-3", modo === "lista" ? "border-primary bg-primary/5" : "hover:bg-muted/40")}><ListIcon className="w-4 h-4 mt-0.5 text-primary" /><div><p className="text-sm font-medium">Lista simples</p><p className="text-xs text-muted-foreground">Uma tabela única para conferência.</p></div></button>
              <button type="button" onClick={() => setModo("raiz")} className={cn("rounded-md border p-3 text-left flex gap-3", modo === "raiz" ? "border-primary bg-primary/5" : "hover:bg-muted/40")}><Network className="w-4 h-4 mt-0.5 text-primary" /><div><p className="text-sm font-medium">Por equipe</p><p className="text-xs text-muted-foreground">Coordenador, líderes e cabos agrupados.</p></div></button>
            </div>
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground">Cargos incluídos</span>
              <div className="flex flex-wrap gap-2">{TODOS.map((tipo) => <label key={tipo} className={cn("flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer", tipos.includes(tipo) && "border-primary/50 bg-primary/5")}><Checkbox checked={tipos.includes(tipo)} onCheckedChange={() => toggleTipo(tipo)} />{TIPO_LABEL[tipo]}</label>)}</div>
              {tipos.length === 0 && <p className="text-xs text-destructive">Selecione pelo menos um cargo.</p>}
            </div>
          </section>

          <section className="rounded-lg border overflow-hidden">
            <button type="button" className="w-full p-3 flex items-center gap-2 text-left hover:bg-muted/30" onClick={() => setAvancados((v) => !v)}>
              <SlidersHorizontal className="w-4 h-4 text-primary" /><div className="flex-1"><p className="text-sm font-semibold">3. Refinar relatório</p><p className="text-xs text-muted-foreground">Região, equipe, reunião e dobradinha</p></div>
              {filtrosAtivos > 0 && <span className="rounded-full bg-primary text-primary-foreground text-[10px] px-2 py-0.5">{filtrosAtivos} ativo(s)</span>}<ChevronDown className={cn("w-4 h-4 transition-transform", avancados && "rotate-180")} />
            </button>
            {avancados && <div className="border-t p-3 grid sm:grid-cols-2 gap-3 bg-muted/10">
              {regioes.length > 0 && <FilterSelect label={escopoTipo === "cidade" ? "Cidade" : "Região"} value={regiao} onChange={setRegiao} allLabel={escopoTipo === "cidade" ? "Todas as cidades" : "Todas as regiões"} items={regioes} />}
              <FilterSelect label="Equipe" value={coordenadorId} onChange={setCoordenadorId} allLabel="Todas as equipes" disabled={apenasAvulsos} items={coords.map((c) => ({ value: c.id, label: c.nome }))} />
              <FilterSelect label="Participação em reunião" value={reuniao} onChange={(v) => setReuniao(v as typeof reuniao)} allLabel="Todos" items={[{ value: "reuniao", label: "Participou" }, { value: "sem_reuniao", label: "Não participou" }]} />
              {parceiros.length > 0 && <FilterSelect label="Dobradinha" value={parceiroSel} onChange={setParceiroSel} allLabel="Todas as dobradinhas" items={[{ value: PARCEIRO_SEM, label: "Sem dobradinha" }, ...parceiros.map((p) => ({ value: p.id, label: p.nome }))]} />}
              {tipos.includes("lider") && <div className="sm:col-span-2 grid sm:grid-cols-2 gap-2"><ToggleLine label="Incluir líderes avulsos" checked={incluirAvulsos} onChange={setIncluirAvulsos} disabled={apenasAvulsos} /><ToggleLine label="Somente líderes avulsos" checked={apenasAvulsos} onChange={setApenasAvulsos} /></div>}
              {parceiros.length > 0 && parceiroSel === "__all" && <div className="sm:col-span-2"><ToggleLine label="Gerar um arquivo por dobradinha" hint="Separa automaticamente por candidato parceiro." checked={porParceiro} onChange={setPorParceiro} /></div>}
            </div>}
          </section>
        </div>

        <DialogFooter className="gap-2 sm:gap-2 flex-wrap pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="outline" disabled={tipos.length === 0} onClick={() => exportar("csv")}><Package className="w-4 h-4 mr-2" />CSV</Button>
          <Button variant="outline" disabled={tipos.length === 0 || porParceiro} onClick={() => exportar("print")}><Printer className="w-4 h-4 mr-2" />Imprimir</Button>
          <Button disabled={tipos.length === 0} onClick={() => exportar("pdf")}><FileText className="w-4 h-4 mr-2" />Gerar PDF</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FilterSelect({ label, value, onChange, allLabel, items, disabled }: { label: string; value: string; onChange: (value: string) => void; allLabel: string; items: RegiaoOption[]; disabled?: boolean }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label><Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__all">{allLabel}</SelectItem>{items.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>;
}

function ToggleLine({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return <label className="flex items-center justify-between rounded-md border p-2.5 bg-background"><div><p className="text-xs font-medium">{label}</p>{hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}</div><Switch checked={checked} onCheckedChange={onChange} disabled={disabled} /></label>;
}
