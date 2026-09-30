import { useEffect, useMemo, useState } from "react";
import { Banknote, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  gerarRaizPagamentoPdf,
  listarValoresRaizPagamento,
  resumirRaizPagamento,
  type NivelRaizPagamento,
  type PessoaRaizPagamento,
} from "@/lib/eleicao-raiz-pagamento-pdf";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  raiz: PessoaRaizPagamento;
  pessoas: PessoaRaizPagamento[];
  todasPessoas?: PessoaRaizPagamento[];
};

const dinheiro = (valor: number) =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const ROTULOS: Record<NivelRaizPagamento, string> = {
  coordenador: "Coordenador",
  lider: "Líderes",
  cabo: "Cabos",
};

export default function RaizPagamentoDialog({
  open,
  onOpenChange,
  raiz,
  pessoas,
  todasPessoas,
}: Props) {
  const [todasRegioes, setTodasRegioes] = useState(false);
  const pessoasDisponiveis = todasRegioes ? todasPessoas || pessoas : pessoas;
  const niveisDaRaiz = useMemo<NivelRaizPagamento[]>(
    () => (raiz.tipo === "coordenador" ? ["coordenador", "lider", "cabo"] : ["lider", "cabo"]),
    [raiz.tipo],
  );
  const niveisDisponiveis = useMemo<NivelRaizPagamento[]>(
    () => (todasRegioes ? ["coordenador", "lider", "cabo"] : niveisDaRaiz),
    [niveisDaRaiz, todasRegioes],
  );
  const valoresDisponiveis = useMemo(
    () => listarValoresRaizPagamento(raiz, pessoasDisponiveis, todasRegioes),
    [raiz, pessoasDisponiveis, todasRegioes],
  );
  const [niveis, setNiveis] = useState<NivelRaizPagamento[]>(niveisDisponiveis);
  const [valores, setValores] = useState<number[]>(valoresDisponiveis);
  const [exibirValor, setExibirValor] = useState(true);
  const [incluirAssinatura, setIncluirAssinatura] = useState(false);
  const [gerando, setGerando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNiveis(niveisDaRaiz);
    setExibirValor(true);
    setIncluirAssinatura(false);
    setTodasRegioes(false);
  }, [open, niveisDaRaiz]);

  useEffect(() => {
    if (open) setValores(valoresDisponiveis);
  }, [open, valoresDisponiveis]);

  const resumo = useMemo(
    () => resumirRaizPagamento(raiz, pessoasDisponiveis, { niveis, valores, todasRegioes }),
    [raiz, pessoasDisponiveis, niveis, valores, todasRegioes],
  );

  const alternarNivel = (nivel: NivelRaizPagamento, marcado: boolean) =>
    setNiveis((atuais) =>
      marcado ? Array.from(new Set([...atuais, nivel])) : atuais.filter((item) => item !== nivel),
    );

  const alternarValor = (valor: number, marcado: boolean) =>
    setValores((atuais) =>
      marcado ? Array.from(new Set([...atuais, valor])) : atuais.filter((item) => item !== valor),
    );

  const alternarTodasRegioes = (marcado: boolean) => {
    setTodasRegioes(marcado);
    setNiveis(marcado ? ["coordenador", "lider", "cabo"] : niveisDaRaiz);
  };

  const gerar = async () => {
    setGerando(true);
    try {
      const result = await gerarRaizPagamentoPdf(raiz, pessoasDisponiveis, {
        niveis,
        valores,
        exibirValor,
        incluirAssinatura,
        todasRegioes,
      });
      toast.success(`PDF gerado com ${result.contratados} contratado(s) para pagamento.`);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao gerar PDF da raiz.");
    } finally {
      setGerando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !gerando && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Gerar raiz de pagamento</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Escolha quem e quais valores deseja exportar da raiz de <strong>{raiz.nome}</strong>.
        </p>

        <div className="space-y-4 pt-2">
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
            <span>
              <strong>Todas as regiões</strong>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Gera um único arquivo com todos os contratados do sistema.
              </span>
            </span>
            <Switch
              checked={todasRegioes}
              onCheckedChange={alternarTodasRegioes}
              aria-label="Incluir todas as regiões"
            />
          </label>

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

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Valores dos contratos</h3>
            {valoresDisponiveis.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {valoresDisponiveis.map((valor) => (
                  <label
                    key={valor}
                    className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border p-3 text-sm"
                  >
                    {dinheiro(valor)}
                    <Switch
                      checked={valores.includes(valor)}
                      onCheckedChange={(marcado) => alternarValor(valor, marcado)}
                      aria-label={`Incluir contratos de ${dinheiro(valor)}`}
                    />
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Não há contratos remunerados nesta raiz.
              </p>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Campos do PDF</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                Exibir valores
                <Switch
                  checked={exibirValor}
                  onCheckedChange={setExibirValor}
                  aria-label="Exibir valores no PDF"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                Campo de assinatura
                <Switch
                  checked={incluirAssinatura}
                  onCheckedChange={setIncluirAssinatura}
                  aria-label="Adicionar campo de assinatura"
                />
              </label>
            </div>
          </section>

          <section className="rounded-lg border bg-muted/40 p-4" aria-live="polite">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Prévia do relatório
                </p>
                <p className="mt-1 text-sm">
                  {resumo.pessoas.length} pessoa(s): {resumo.porNivel.coordenador} coordenador,{" "}
                  {resumo.porNivel.lider} líder(es) e {resumo.porNivel.cabo} cabo(s)
                </p>
              </div>
              <p className="shrink-0 font-semibold text-emerald-700 dark:text-emerald-400">
                {dinheiro(resumo.total)}
              </p>
            </div>
          </section>

          <Button
            className="w-full gap-2"
            disabled={gerando || resumo.pessoas.length === 0}
            onClick={gerar}
          >
            {gerando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Banknote className="h-4 w-4" />
            )}
            {gerando ? "Gerando PDF..." : "Gerar relatório"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
