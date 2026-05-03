import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Merge, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

/**
 * Mescla múltiplas variantes (cidade ou bairro) em um nome canônico único.
 * Atualiza pessoas, contratados, contratado_indicados e funcionarios.
 */
export interface MergeLocalitiesDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientId: string | null;
  /** Tipo de campo a mesclar */
  field: "cidade" | "bairro";
  /** Variantes selecionadas (com contagem). Ex: [{ name: "Campo Grande", count: 30 }, { name: "campo grande", count: 5 }] */
  variants: Array<{ name: string; count: number }>;
  /** Para bairro: cidade-pai (canônica) — restringe o UPDATE a registros dessa cidade. */
  parentCity?: string | null;
  onSuccess?: () => void;
}

const canon = (v: string | null | undefined) =>
  (v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const TABLES = ["pessoas", "contratados", "contratado_indicados", "funcionarios", "supporter_accounts"] as const;

const dbFieldFor = (table: (typeof TABLES)[number], field: "cidade" | "bairro") => {
  if (table === "supporter_accounts") return field === "cidade" ? "city" : "neighborhood";
  return field;
};

export function MergeLocalitiesDialog({
  open,
  onOpenChange,
  clientId,
  field,
  variants,
  parentCity,
  onSuccess,
}: MergeLocalitiesDialogProps) {
  const [mode, setMode] = useState<"pick" | "custom">("pick");
  const [picked, setPicked] = useState<string>("");
  const [custom, setCustom] = useState<string>("");
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (open && variants.length > 0) {
      // por padrão escolhe o mais frequente
      const top = [...variants].sort((a, b) => b.count - a.count)[0];
      setPicked(top.name);
      setCustom(top.name);
      setMode("pick");
    }
  }, [open, variants]);

  const finalName = (mode === "pick" ? picked : custom).trim();

  const totalAffected = useMemo(
    () => variants.filter((v) => canon(v.name) !== canon(finalName)).reduce((s, v) => s + v.count, 0),
    [variants, finalName],
  );

  const handleMerge = async () => {
    if (!clientId || !finalName) return;
    setRunning(true);
    try {
      const finalCanon = canon(finalName);
      const oldNames = variants.map((v) => v.name).filter((n) => canon(n) !== finalCanon);
      if (oldNames.length === 0) {
        toast({ title: "Nada a mesclar", description: "Todas as variantes já são iguais ao nome final." });
        setRunning(false);
        onOpenChange(false);
        return;
      }
      const parentCanon = canon(parentCity);
      let totalUpdated = 0;

      for (const table of TABLES) {
        const dbField = dbFieldFor(table, field);
        // Carrega ids candidatos
        const PAGE = 1000;
        let from = 0;
        const ids: string[] = [];
        while (true) {
          let q = supabase
            .from(table as any)
            .select(table === "supporter_accounts" ? "id, city, neighborhood" : "id, cidade, bairro")
            .eq("client_id", clientId)
            .in(dbField, oldNames)
            .range(from, from + PAGE - 1);
          const { data, error } = await q;
          if (error) throw error;
          if (!data || data.length === 0) break;
          for (const row of data as any[]) {
            // Para bairro: filtra os que pertencem à cidade pai (comparação canônica defensiva)
            if (field === "bairro" && parentCity) {
              const cityRaw = ((row.cidade ?? row.city)?.trim() || "");
              const cityClean = cityRaw.replace(/[\s,/-]+[A-Za-z]{2}\s*$/, "").trim() || cityRaw;
              if (canon(cityClean) !== parentCanon) continue;
            }
            ids.push(row.id);
          }
          if (data.length < PAGE) break;
          from += PAGE;
        }
        if (ids.length === 0) continue;
        // Update em lotes
        const CHUNK = 500;
        for (let i = 0; i < ids.length; i += CHUNK) {
          const slice = ids.slice(i, i + CHUNK);
          const { error } = await supabase
            .from(table as any)
            .update({ [dbField]: finalName })
            .in("id", slice);
          if (error) throw error;
          totalUpdated += slice.length;
        }
      }

      toast({
        title: "Mesclagem concluída",
        description: `${totalUpdated} registro${totalUpdated === 1 ? "" : "s"} atualizado${totalUpdated === 1 ? "" : "s"} para "${finalName}".`,
      });
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      console.error(err);
      toast({ title: "Erro ao mesclar", description: err.message || "Falha ao atualizar registros", variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !running && onOpenChange(v)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="w-5 h-5 text-primary" />
            Mesclar {field === "cidade" ? "cidades" : "bairros"} duplicados
          </DialogTitle>
          <DialogDescription>
            Você selecionou {variants.length} variantes. Escolha o nome correto — todos os registros das outras variantes serão renomeados.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border p-3 bg-muted/40">
            <p className="text-xs font-medium text-muted-foreground mb-2">Variantes selecionadas:</p>
            <ul className="space-y-1 text-sm">
              {variants.map((v) => (
                <li key={v.name} className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs">"{v.name}"</span>
                  <span className="text-xs text-muted-foreground shrink-0">{v.count}</span>
                </li>
              ))}
            </ul>
          </div>

          <RadioGroup value={mode} onValueChange={(v) => setMode(v as any)}>
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <RadioGroupItem value="pick" id="mode-pick" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="mode-pick" className="text-sm font-medium cursor-pointer">
                    Usar uma das variantes
                  </Label>
                  {mode === "pick" && (
                    <RadioGroup value={picked} onValueChange={setPicked} className="mt-2 ml-1 space-y-1.5">
                      {variants.map((v) => (
                        <div key={v.name} className="flex items-center gap-2">
                          <RadioGroupItem value={v.name} id={`pick-${v.name}`} />
                          <Label htmlFor={`pick-${v.name}`} className="text-sm font-normal cursor-pointer">
                            {v.name} <span className="text-xs text-muted-foreground">({v.count})</span>
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-2">
                <RadioGroupItem value="custom" id="mode-custom" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="mode-custom" className="text-sm font-medium cursor-pointer">
                    Digitar nome correto
                  </Label>
                  {mode === "custom" && (
                    <Input
                      value={custom}
                      onChange={(e) => setCustom(e.target.value)}
                      placeholder="Ex: Campo Grande"
                      className="mt-2"
                      autoFocus
                    />
                  )}
                </div>
              </div>
            </div>
          </RadioGroup>

          {finalName && totalAffected > 0 && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 flex gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs">
                <strong>{totalAffected}</strong> registro{totalAffected === 1 ? "" : "s"} ser{totalAffected === 1 ? "á" : "ão"} renomeado{totalAffected === 1 ? "" : "s"} para <strong>"{finalName}"</strong>.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>
            Cancelar
          </Button>
          <Button onClick={handleMerge} disabled={running || !finalName || totalAffected === 0}>
            {running ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Mesclando…</> : <><Merge className="w-4 h-4 mr-2" />Mesclar</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}