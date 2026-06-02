import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { FileText, Printer, Package, Network, List as ListIcon } from "lucide-react";

export type ExportTipo = "coordenador" | "lider" | "cabo";
export type ExportFormato = "pdf" | "csv" | "print";
export type ExportModo = "lista" | "raiz";

export interface ExportConfig {
  formato: ExportFormato;
  modo: ExportModo;
  tipos: ExportTipo[];
  coordenadorId: string | null; // null = todos
  regiao: string | null; // null = todas
  incluirAvulsos: boolean;
}

interface CoordOption { id: string; nome: string; regiao?: string | null }
interface RegiaoOption { value: string; label: string }

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  coordenadores: CoordOption[]; // do escopo atual
  regioes: RegiaoOption[]; // regiões (CG) ou cidades (interior) disponíveis
  escopoTipo: "regiao" | "cidade";
  onExport: (cfg: ExportConfig) => void;
}

const TODOS: ExportTipo[] = ["coordenador", "lider", "cabo"];

export default function ExportEleicaoDialog({ open, onOpenChange, coordenadores, regioes, escopoTipo, onExport }: Props) {
  const [modo, setModo] = useState<ExportModo>("lista");
  const [tipos, setTipos] = useState<ExportTipo[]>(TODOS);
  const [coordenadorId, setCoordenadorId] = useState<string>("__all");
  const [regiao, setRegiao] = useState<string>("__all");
  const [incluirAvulsos, setIncluirAvulsos] = useState(true);

  const toggleTipo = (t: ExportTipo) => {
    setTipos(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

  const incluiLideresOuCabos = tipos.includes("lider") || tipos.includes("cabo");
  const podeAvulsos = tipos.includes("lider") && coordenadorId === "__all";

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

  function fire(formato: ExportFormato) {
    if (tipos.length === 0) return;
    onExport({
      formato,
      modo,
      tipos,
      coordenadorId: coordenadorId === "__all" ? null : coordenadorId,
      regiao: regiao === "__all" ? null : regiao,
      incluirAvulsos: podeAvulsos ? incluirAvulsos : false,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
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
          <Button variant="outline" disabled={tipos.length === 0} onClick={() => fire("print")}>
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
