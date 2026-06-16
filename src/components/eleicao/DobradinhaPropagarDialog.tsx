import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Users, Handshake } from "lucide-react";
import type { CandidatoParceiro } from "@/hooks/useCandidatosParceiros";

interface MiniPessoa {
  id: string;
  tipo: string;
  parent_id: string | null;
}

interface Props {
  open: boolean;
  raizNome: string;
  raizId: string | null;
  parceiro: CandidatoParceiro | null;
  rateioEstadual: number;
  rateioParceiro: number;
  pessoas: MiniPessoa[];
  onChoose: (propagar: boolean) => void;
  onCancel: () => void;
  loading?: boolean;
}

function descendentesDe(raizId: string, pessoas: MiniPessoa[]) {
  const childrenMap: Record<string, MiniPessoa[]> = {};
  pessoas.forEach((p) => {
    if (p.parent_id) (childrenMap[p.parent_id] ??= []).push(p);
  });
  const out: MiniPessoa[] = [];
  const stack = [raizId];
  while (stack.length) {
    const id = stack.pop()!;
    const children = childrenMap[id] || [];
    for (const c of children) {
      out.push(c);
      stack.push(c.id);
    }
  }
  return out;
}

export default function DobradinhaPropagarDialog(props: Props) {
  const descs = useMemo(
    () => (props.raizId ? descendentesDe(props.raizId, props.pessoas) : []),
    [props.raizId, props.pessoas]
  );
  const lideres = descs.filter((d) => d.tipo === "lider").length;
  const cabos = descs.filter((d) => d.tipo === "cabo").length;

  return (
    <Dialog open={props.open} onOpenChange={(o) => !o && props.onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Handshake className="w-5 h-5 text-primary" />
            Aplicar dobradinha ao time?
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <p>
            O time de <strong>{props.raizNome}</strong> tem{" "}
            <strong className="text-primary">{lideres} líder(es) e {cabos} cabo(s)</strong>{" "}
            abaixo. Como deseja aplicar a nova dobradinha?
          </p>

          <div className="rounded-md border bg-muted/30 p-3 space-y-1.5">
            <div className="flex items-center gap-2 text-xs">
              <Users className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Nova dobradinha:</span>
              {props.parceiro ? (
                <span className="font-medium inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: props.parceiro.cor }} />
                  {props.parceiro.nome}
                </span>
              ) : (
                <span className="italic text-muted-foreground">Sem parceiro (100% estadual)</span>
              )}
            </div>
            {props.parceiro && (
              <div className="text-xs text-muted-foreground">
                Rateio: <strong>{props.rateioEstadual}%</strong> estadual ·{" "}
                <strong>{props.rateioParceiro}%</strong> federal
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="ghost" onClick={props.onCancel} disabled={props.loading}>
            Cancelar
          </Button>
          <Button variant="outline" onClick={() => props.onChoose(false)} disabled={props.loading}>
            Só este coordenador
          </Button>
          <Button onClick={() => props.onChoose(true)} disabled={props.loading}>
            Sim, aplicar ao time todo ({1 + lideres + cabos})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
