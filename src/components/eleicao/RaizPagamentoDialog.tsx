import { useEffect, useMemo, useState } from "react";
import { Banknote, ContactRound, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  gerarListaContatosPdf,
  gerarRaizPagamentoPdf,
  listarLocaisContatos,
  listarValoresRaizPagamento,
  resumirListaContatos,
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
  modoGeral?: boolean;
};

const dinheiro = (valor: number) =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const ROTULOS: Record<NivelRaizPagamento, string> = {
  coordenador: "Coordenadores",
  lider: "Líderes",
  cabo: "Cabos",
};

export default function RaizPagamentoDialog({
  open,
  onOpenChange,
  raiz,
  pessoas,
  todasPessoas,
  modoGeral = false,
}: Props) {
  const [todasRegioes, setTodasRegioes] = useState(modoGeral);
  const [incluirInterior, setIncluirInterior] = useState(false);
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
    () => listarValoresRaizPagamento(raiz, pessoasDisponiveis, todasRegioes, incluirInterior),
    [raiz, pessoasDisponiveis, todasRegioes, incluirInterior],
  );
  const locaisDisponiveis = useMemo(
    () => listarLocaisContatos(todasPessoas || pessoas, incluirInterior),
    [todasPessoas, pessoas, incluirInterior],
  );
  const [niveis, setNiveis] = useState<NivelRaizPagamento[]>(niveisDisponiveis);
  const [valores, setValores] = useState<number[]>(valoresDisponiveis);
  const [locais, setLocais] = useState<string[]>([]);
  const [exibirValor, setExibirValor] = useState(true);
  const [incluirAssinatura, setIncluirAssinatura] = useState(false);
  const [gerando, setGerando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNiveis(modoGeral ? ["coordenador", "lider", "cabo"] : niveisDaRaiz);
    setExibirValor(true);
    setIncluirAssinatura(false);
    setTodasRegioes(modoGeral);
    setIncluirInterior(false);
  }, [open, niveisDaRaiz, modoGeral]);

  useEffect(() => {
    if (open) setValores(valoresDisponiveis);
  }, [open, valoresDisponiveis]);

  useEffect(() => {
    if (open && modoGeral) setLocais(locaisDisponiveis);
  }, [open, modoGeral, locaisDisponiveis]);

  const resumo = useMemo(
    () =>
      resumirRaizPagamento(raiz, pessoasDisponiveis, {
        niveis,
        valores,
        todasRegioes,
        incluirInterior,
      }),
    [raiz, pessoasDisponiveis, niveis, valores, todasRegioes, incluirInterior],
  );
  const gruposContatos = useMemo(
    () =>
      resumirListaContatos(todasPessoas || pessoas, {
        niveis,
        incluirInterior,
        locais,
      }),
    [todasPessoas, pessoas, niveis, incluirInterior, locais],
  );
  const totalContatos = gruposContatos.reduce((total, grupo) => total + grupo.pessoas.length, 0);

  const alternarNivel = (nivel: NivelRaizPagamento, marcado: boolean) =>
    setNiveis((atuais) =>
      marcado ? Array.from(new Set([...atuais, nivel])) : atuais.filter((item) => item !== nivel),
    );
  const alternarValor = (valor: number, marcado: boolean) =>
    setValores((atuais) =>
      marcado ? Array.from(new Set([...atuais, valor])) : atuais.filter((item) => item !== valor),
    );

  const gerar = async () => {
    setGerando(true);
    try {
      if (modoGeral) {
        const result = await gerarListaContatosPdf(todasPessoas || pessoas, {
          niveis,
          incluirInterior,
          locais,
        });
        toast.success(`Lista gerada com ${result.contatos} contato(s).`);
      } else {
        const result = await gerarRaizPagamentoPdf(raiz, pessoasDisponiveis, {
          niveis,
          valores,
          exibirValor,
          incluirAssinatura,
          todasRegioes,
          incluirInterior,
        });
        toast.success(`PDF gerado com ${result.contratados} contratado(s) para pagamento.`);
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao gerar PDF.");
    } finally {
      setGerando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !gerando && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {modoGeral ? "Lista de contatos por região" : "Gerar raiz de pagamento"}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {modoGeral ? (
            "Exporte nome, telefone, endereço e cargo, organizado por região ou cidade."
          ) : (
            <>
              Escolha quem e quais valores deseja exportar da raiz de <strong>{raiz.nome}</strong>.
            </>
          )}
        </p>

        <div className="space-y-4 pt-2">
          {modoGeral && (
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
              <span>
                <strong>Incluir cidades do Interior</strong>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Desligado: somente Campo Grande. Ligado: Campo Grande e Interior.
                </span>
              </span>
              <Switch checked={incluirInterior} onCheckedChange={setIncluirInterior} />
            </label>
          )}

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
                  />
                </label>
              ))}
            </div>
          </section>

          {modoGeral && (
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">Regiões e cidades</h3>
                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:underline"
                  onClick={() =>
                    setLocais(locais.length === locaisDisponiveis.length ? [] : locaisDisponiveis)
                  }
                >
                  {locais.length === locaisDisponiveis.length
                    ? "Desmarcar todas"
                    : "Selecionar todas"}
                </button>
              </div>
              <div className="grid max-h-48 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                {locaisDisponiveis.map((local) => (
                  <label
                    key={local}
                    className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border p-3 text-sm"
                  >
                    {local}
                    <Switch
                      checked={locais.includes(local)}
                      onCheckedChange={(marcado) =>
                        setLocais((atuais) =>
                          marcado
                            ? Array.from(new Set([...atuais, local]))
                            : atuais.filter((item) => item !== local),
                        )
                      }
                    />
                  </label>
                ))}
              </div>
            </section>
          )}

          {!modoGeral && (
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
          )}

          {!modoGeral && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Campos do PDF</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                  Exibir valores
                  <Switch checked={exibirValor} onCheckedChange={setExibirValor} />
                </label>
                <label className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                  Campo de assinatura
                  <Switch checked={incluirAssinatura} onCheckedChange={setIncluirAssinatura} />
                </label>
              </div>
            </section>
          )}

          <section className="rounded-lg border bg-muted/40 p-4" aria-live="polite">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Prévia do relatório
                </p>
                <p className="mt-1 text-sm">
                  {modoGeral ? (
                    <>
                      {totalContatos} contato(s) em {gruposContatos.length} região(ões)/cidade(s)
                    </>
                  ) : (
                    <>
                      {resumo.pessoas.length} pessoa(s): {resumo.porNivel.coordenador} coordenador,{" "}
                      {resumo.porNivel.lider} líder(es) e {resumo.porNivel.cabo} cabo(s)
                    </>
                  )}
                </p>
              </div>
              {!modoGeral && (
                <p className="shrink-0 font-semibold text-emerald-700 dark:text-emerald-400">
                  {dinheiro(resumo.total)}
                </p>
              )}
            </div>
          </section>

          <Button
            className="w-full gap-2"
            disabled={gerando || (modoGeral ? totalContatos === 0 : resumo.pessoas.length === 0)}
            onClick={gerar}
          >
            {gerando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : modoGeral ? (
              <ContactRound className="h-4 w-4" />
            ) : (
              <Banknote className="h-4 w-4" />
            )}
            {gerando
              ? "Gerando PDF..."
              : modoGeral
                ? "Exportar lista de contatos"
                : "Gerar relatório"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
