import { useState } from "react";
import { Banknote, Loader2, MonitorSmartphone, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  gerarRaizPagamentoPdf,
  type PessoaRaizPagamento,
  type TipoRaizPagamento,
} from "@/lib/eleicao-raiz-pagamento-pdf";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  raiz: PessoaRaizPagamento;
  pessoas: PessoaRaizPagamento[];
};

const OPCOES: Array<{
  tipo: TipoRaizPagamento;
  titulo: string;
  descricao: string;
  icon: typeof Users;
}> = [
  {
    tipo: "cabo_eleitoral",
    titulo: "Cabos eleitorais — R$ 150,00",
    descricao: "Gera somente os cabos desta raiz cujo valor contratado é R$ 150,00.",
    icon: Users,
  },
  {
    tipo: "cabo_virtual",
    titulo: "Cabos virtuais — R$ 100,00",
    descricao: "Gera somente os cabos desta raiz cujo valor contratado é R$ 100,00.",
    icon: MonitorSmartphone,
  },
  {
    tipo: "completa",
    titulo: "Toda a raiz de pagamento",
    descricao: "Inclui coordenador, líderes e todos os cabos remunerados da raiz.",
    icon: Banknote,
  },
];

export default function RaizPagamentoDialog({ open, onOpenChange, raiz, pessoas }: Props) {
  const [gerando, setGerando] = useState<TipoRaizPagamento | null>(null);

  const gerar = async (tipo: TipoRaizPagamento) => {
    setGerando(tipo);
    try {
      const result = await gerarRaizPagamentoPdf(raiz, pessoas, tipo);
      toast.success(`PDF gerado com ${result.contratados} contratado(s) para pagamento.`);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao gerar PDF da raiz.");
    } finally {
      setGerando(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !gerando && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Gerar raiz de pagamento</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Escolha a lista de <strong>{raiz.nome}</strong> que deseja gerar.
        </p>
        <div className="grid gap-2 pt-2">
          {OPCOES.map((opcao) => {
            const Icon = opcao.icon;
            const carregando = gerando === opcao.tipo;
            return (
              <Button
                key={opcao.tipo}
                type="button"
                variant="outline"
                className="h-auto justify-start gap-3 p-4 text-left whitespace-normal"
                disabled={gerando !== null}
                onClick={() => gerar(opcao.tipo)}
              >
                {carregando ? (
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
                ) : (
                  <Icon className="h-5 w-5 shrink-0 text-primary" />
                )}
                <span>
                  <span className="block font-semibold">{opcao.titulo}</span>
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    {opcao.descricao}
                  </span>
                </span>
              </Button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
