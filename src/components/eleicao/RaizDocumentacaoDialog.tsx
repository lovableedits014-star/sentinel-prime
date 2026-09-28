import { useEffect, useMemo, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  gerarReciboDocumentacaoPdf,
  resumirDocumentacao,
  type NivelDocumentacao,
  type ReciboDocumentacaoPessoa,
} from "@/lib/eleicao-recibo-documentacao-pdf";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  raiz: ReciboDocumentacaoPessoa;
  pessoas: ReciboDocumentacaoPessoa[];
};

const ROTULOS: Record<NivelDocumentacao, string> = {
  coordenador: "Coordenador",
  lider: "Líderes",
  cabo: "Cabos",
};

export default function RaizDocumentacaoDialog({ open, onOpenChange, raiz, pessoas }: Props) {
  const niveisDisponiveis = useMemo<NivelDocumentacao[]>(
    () => (raiz.tipo === "coordenador" ? ["coordenador", "lider", "cabo"] : ["lider", "cabo"]),
    [raiz.tipo],
  );
  const [niveis, setNiveis] = useState<NivelDocumentacao[]>(niveisDisponiveis);
  const [gerando, setGerando] = useState(false);

  useEffect(() => {
    if (open) setNiveis(niveisDisponiveis);
  }, [open, niveisDisponiveis]);

  const resumo = useMemo(
    () => resumirDocumentacao(raiz, pessoas, { niveis }),
    [raiz, pessoas, niveis],
  );

  const alternarNivel = (nivel: NivelDocumentacao, marcado: boolean) =>
    setNiveis((atuais) =>
      marcado ? Array.from(new Set([...atuais, nivel])) : atuais.filter((item) => item !== nivel),
    );

  const gerar = async () => {
    setGerando(true);
    try {
      const resultado = await gerarReciboDocumentacaoPdf(raiz, pessoas, { niveis });
      toast.success(`Raiz de documentação gerada para ${resultado.contratados} contratado(s).`);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao gerar a raiz de documentação.");
    } finally {
      setGerando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !gerando && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Gerar raiz de documentação</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Escolha quem deve receber uma linha para assinatura na raiz de <strong>{raiz.nome}</strong>.
        </p>

        <div className="space-y-4 pt-2">
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Quem incluir</h3>
            <div className="grid gap-2 sm:grid-cols-3">
              {niveisDisponiveis.map((nivel) => (
                <label
                  key={nivel}
                  className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border p-3 text-sm"
                >
                  {ROTULOS[nivel]}
                  <Switch
                    checked={niveis.includes(nivel)}
                    onCheckedChange={(marcado) => alternarNivel(nivel, marcado)}
                    aria-label={`Incluir ${ROTULOS[nivel]}`}
                  />
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-lg border bg-muted/40 p-4" aria-live="polite">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Prévia do documento
            </p>
            <p className="mt-1 text-sm">
              {resumo.pessoas.length} pessoa(s) para assinatura: {resumo.porNivel.coordenador}{" "}
              coordenador, {resumo.porNivel.lider} líder(es) e {resumo.porNivel.cabo} cabo(s).
            </p>
            {resumo.linhas > resumo.pessoas.length && (
              <p className="mt-1 text-xs text-muted-foreground">
                + {resumo.linhas - resumo.pessoas.length} líder(es) apenas como referência da equipe.
              </p>
            )}
          </section>

          <Button
            className="w-full gap-2"
            disabled={gerando || resumo.pessoas.length === 0}
            onClick={gerar}
          >
            {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {gerando ? "Gerando PDF..." : "Gerar documento"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
