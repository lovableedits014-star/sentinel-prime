import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { FileText, Printer, Package, Network, List as ListIcon, Handshake, Heart } from "lucide-react";

export type ExportTipo = "coordenador" | "lider" | "cabo";
export type ExportFormato = "pdf" | "csv" | "print";
export type ExportModo = "lista" | "raiz";

// parceiroId semantics:
//   null      → "todas as dobradinhas" (nenhum filtro)
//   "__none"  → apenas raízes sem parceiro (100% estadual)
//   <uuid>    → raízes com esse parceiro
export const PARCEIRO_SEM = "__none";

export interface ExportConfig {
  formato: ExportFormato;
  modo: ExportModo;
  tipos: ExportTipo[];
  coordenadorId: string | null; // null = todos
  regiao: string | null; // null = todas
  incluirAvulsos: boolean;
  parceiroId: string | null; // null = todas as dobradinhas; "__none" = sem dobradinha
  porParceiro: boolean; // gerar um arquivo por dobradinha
  apenasAvulsos?: boolean;
  apenasReuniao?: boolean;
  apenasNaoReuniao?: boolean;
  voluntarios?: "todos" | "apenas" | "excluir";

}

interface CoordOption { id: string; nome: string; regiao?: string | null }
interface RegiaoOption { value: string; label: string }
interface ParceiroOption { id: string; nome: string; cor?: string; cargo?: string }

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  coordenadores: CoordOption[]; // do escopo atual
  regioes: RegiaoOption[]; // regiões (CG) ou cidades (interior) disponíveis
  escopoTipo: "regiao" | "cidade";
  parceiros?: ParceiroOption[];
  onExport: (cfg: ExportConfig) => void;
}

const TODOS: ExportTipo[] = ["coordenador", "lider", "cabo"];

export default function ExportEleicaoDialog({ open, onOpenChange, coordenadores, regioes, escopoTipo, parceiros = [], onExport }: Props) {
  const [modo, setModo] = useState<ExportModo>("lista");
  const [tipos, setTipos] = useState<ExportTipo[]>(TODOS);
  const [apenasLideres, setApenasLideres] = useState(false);
  const [apenasAvulsos, setApenasAvulsos] = useState(false);
  const [coordenadorId, setCoordenadorId] = useState<string>("__all");
  const [regiao, setRegiao] = useState<string>("__all");
  const [incluirAvulsos, setIncluirAvulsos] = useState(true);
  const [parceiroSel, setParceiroSel] = useState<string>("__all"); // "__all" | "__none" | uuid
  const [porParceiro, setPorParceiro] = useState(false);
  const [reuniaoFilter, setReuniaoFilter] = useState<"todos" | "reuniao" | "sem_reuniao">("todos");
  const [voluntarios, setVoluntarios] = useState<"todos" | "apenas" | "excluir">("todos");


  const toggleTipo = (t: ExportTipo) => {
    setTipos(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

  const incluiLideresOuCabos = tipos.includes("lider") || tipos.includes("cabo");
  const podeAvulsos = tipos.includes("lider") && coordenadorId === "__all";
  const podePorParceiro = parceiroSel === "__all" && parceiros.length > 0;

  // Reset estados específicos se "líder" não estiver selecionado
  useEffect(() => {
    if (!tipos.includes("lider")) {
      setApenasLideres(false);
      setApenasAvulsos(false);
    }
  }, [tipos]);

  // Coordenadores filtrados pela região escolhida
  const coordsOrdenados = useMemo(() => {
    const base = regiao === "__all" ? coordenadores : coordenadores.filter(c => (c.regiao || "") === regiao);
    return [...base].sort((a, b) => a.nome.localeCompare(b.nome));
  }, [coordenadores, regiao]);

  // Se o coordenador escolhido sumiu por causa do filtro de região, volta para "todos"
  useEffect(() => {
    if (coordenadorId !== "__all" && !coordsOrdenados.some(c => c.id === coordenadorId)) {
      setCoordenadorId("__all");
    }
  }, [coordsOrdenados, coordenadorId]);

  // Se filtrou por um parceiro específico, desliga "um arquivo por dobradinha"
  useEffect(() => {
    if (parceiroSel !== "__all" && porParceiro) setPorParceiro(false);
  }, [parceiroSel, porParceiro]);

  function fire(formato: ExportFormato) {
    if (tipos.length === 0) return;
    const parceiroId =
      parceiroSel === "__all" ? null : parceiroSel; // "__none" ou uuid
    
    // Se "Apenas Líderes" ou "Apenas Avulsos" estiver ativo, forçamos os tipos para ser apenas líder
    const tiposFinal = (apenasLideres || apenasAvulsos) ? ["lider" as ExportTipo] : tipos;

    onExport({
      formato,
      modo,
      tipos: tiposFinal,
      coordenadorId: (coordenadorId === "__all" || apenasAvulsos) ? null : coordenadorId,
      regiao: regiao === "__all" ? null : regiao,
      incluirAvulsos: apenasAvulsos ? true : (podeAvulsos ? incluirAvulsos : false),
      parceiroId,
      porParceiro: podePorParceiro && porParceiro,
      apenasAvulsos: apenasAvulsos,
      apenasReuniao: reuniaoFilter === "reuniao",
      apenasNaoReuniao: reuniaoFilter === "sem_reuniao",
      voluntarios,

    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Exportar cadastros</DialogTitle>
          <DialogDescription>
            Personalize o relatório que será baixado. Os filtros já ativos na tela continuam valendo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Modo */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Tipo de relatório</Label>
            <RadioGroup value={modo} onValueChange={(v) => setModo(v as ExportModo)} className="grid grid-cols-1 gap-2">
              <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/40">
                <RadioGroupItem value="lista" id="modo-lista" className="mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium"><ListIcon className="w-3.5 h-3.5" />Lista simples</div>
                  <p className="text-xs text-muted-foreground">Tabela única agrupada por tipo (Coordenadores → Líderes → Cabos).</p>
                </div>
              </label>
              <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/40">
                <RadioGroupItem value="raiz" id="modo-raiz" className="mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium"><Network className="w-3.5 h-3.5" />Raiz (hierárquica)</div>
                  <p className="text-xs text-muted-foreground">Agrupado por coordenador → seus líderes → cabos de cada líder.</p>
                </div>
              </label>
            </RadioGroup>
          </div>

          {/* Tipos */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Incluir</Label>
            <div className="flex flex-wrap gap-3">
              {TODOS.map(t => (
                <label key={t} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={tipos.includes(t)} onCheckedChange={() => toggleTipo(t)} />
                  <span className="capitalize">
                    {t === "coordenador" ? "Coordenadores" : t === "lider" ? "Líderes" : "Cabos"}
                  </span>
                </label>
              ))}
            </div>
            {tipos.length === 0 && (
              <p className="text-xs text-destructive">Selecione pelo menos um tipo.</p>
            )}

            {tipos.includes("lider") && (
              <div className="space-y-2 mt-2">
                <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 p-2 rounded-md border border-blue-100 dark:border-blue-800">
                  <Checkbox 
                    id="apenas-lideres" 
                    checked={apenasLideres && !apenasAvulsos} 
                    onCheckedChange={(v) => {
                      setApenasLideres(!!v);
                      if (v) setApenasAvulsos(false);
                    }} 
                  />
                  <Label htmlFor="apenas-lideres" className="text-xs font-medium text-blue-700 dark:text-blue-300 cursor-pointer">
                    Extrair apenas Líderes (ignora Coordenadores e Cabos no arquivo final)
                  </Label>
                </div>

                <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 p-2 rounded-md border border-amber-100 dark:border-amber-800">
                  <Checkbox 
                    id="apenas-avulsos" 
                    checked={apenasAvulsos} 
                    onCheckedChange={(v) => {
                      setApenasAvulsos(!!v);
                      if (v) setApenasLideres(false);
                    }} 
                  />
                  <Label htmlFor="apenas-avulsos" className="text-xs font-medium text-amber-700 dark:text-amber-300 cursor-pointer">
                    Extrair apenas Líderes Avulsos (sem coordenador vinculado)
                  </Label>
                </div>
              </div>
            )}
          </div>

          {/* Região / Cidade */}
          {regioes.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold">
                {escopoTipo === "cidade" ? "Cidade" : "Região"}
              </Label>
              <Select value={regiao} onValueChange={setRegiao}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">
                    {escopoTipo === "cidade" ? "Todas as cidades" : "Todas as regiões"}
                  </SelectItem>
                  {regioes.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Dobradinha (parceiro) */}
          {parceiros.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold flex items-center gap-1.5">
                <Handshake className="w-3.5 h-3.5 text-primary" />
                Dobradinha (candidato parceiro)
              </Label>
              <Select value={parceiroSel} onValueChange={setParceiroSel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Todas as dobradinhas</SelectItem>
                  <SelectItem value={PARCEIRO_SEM}>Sem dobradinha (100% estadual)</SelectItem>
                  {parceiros.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full inline-block"
                          style={{ backgroundColor: p.cor || "#3b82f6" }}
                        />
                        <span>{p.nome}</span>
                        {p.cargo && <span className="text-xs text-muted-foreground">· {p.cargo}</span>}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Filtra pela dobradinha aplicada na raiz do coordenador. Líderes e cabos herdam a dobradinha do coordenador ancestral.
              </p>

              {podePorParceiro && (
                <div className="flex items-center justify-between rounded-md border p-3 mt-2">
                  <div className="pr-3">
                    <div className="text-sm font-medium">Gerar um arquivo por dobradinha</div>
                    <p className="text-xs text-muted-foreground">
                      Cria um PDF/CSV separado para cada candidato parceiro (e um para "Sem dobradinha"), pronto para entregar ao parceiro.
                    </p>
                  </div>
                  <Switch checked={porParceiro} onCheckedChange={setPorParceiro} />
                </div>
              )}
            </div>
          )}

          {/* Funil de Reunião */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold flex items-center gap-1.5">
              <Handshake className="w-3.5 h-3.5 text-blue-500" />
              Filtrar por Reunião
            </Label>
            <Select value={reuniaoFilter} onValueChange={(v: any) => setReuniaoFilter(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos (independente de reunião)</SelectItem>
                <SelectItem value="reuniao">Apenas quem participou da reunião</SelectItem>
                <SelectItem value="sem_reuniao">Apenas quem NÃO participou</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Voluntários */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold flex items-center gap-1.5">
              <Heart className="w-3.5 h-3.5 text-emerald-500" />
              Voluntários
            </Label>
            <Select value={voluntarios} onValueChange={(v: any) => setVoluntarios(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos (remunerados + voluntários)</SelectItem>
                <SelectItem value="apenas">Apenas voluntários</SelectItem>
                <SelectItem value="excluir">Apenas remunerados (sem voluntários)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Use "Apenas voluntários" para gerar um relatório separado de gestão dos voluntários.</p>
          </div>

          {/* Coordenador específico */}
          {(incluiLideresOuCabos || modo === "raiz") && coordsOrdenados.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Equipe de um coordenador</Label>
              <Select value={coordenadorId} onValueChange={setCoordenadorId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Todos os coordenadores</SelectItem>
                  {coordsOrdenados.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Ao escolher um coordenador, o relatório traz apenas ele e a equipe vinculada (líderes + cabos).
              </p>
            </div>
          )}

          {/* Avulsos */}
          {podeAvulsos && (
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">Incluir líderes avulsos</div>
                <p className="text-xs text-muted-foreground">Líderes sem coordenador vinculado (e seus cabos).</p>
              </div>
              <Switch checked={incluirAvulsos} onCheckedChange={setIncluirAvulsos} />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2 flex-wrap">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="outline" disabled={tipos.length === 0} onClick={() => fire("csv")}>
            <Package className="w-4 h-4 mr-2" />CSV
          </Button>
          <Button variant="outline" disabled={tipos.length === 0 || porParceiro} onClick={() => fire("print")} title={porParceiro ? "Desligue 'um arquivo por dobradinha' para imprimir" : undefined}>
            <Printer className="w-4 h-4 mr-2" />Imprimir
          </Button>
          <Button disabled={tipos.length === 0} onClick={() => fire("pdf")}>
            <FileText className="w-4 h-4 mr-2" />PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
